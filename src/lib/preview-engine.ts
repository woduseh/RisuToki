/**
 * RisuToki Preview Engine
 * RisuAI 핵심 처리 파이프라인 포팅 — CBS, 정규식, 로어북, Lua
 * Source: https://github.com/kwaroran/RisuAI
 */
import type {
  PreviewEngine as PreviewEngineContract,
  PreviewLorebookEntry,
  PreviewLoreMatch,
  PreviewMessage,
  PreviewRegexScript
} from './preview-session';

// ==================== Wasmoon Types (broad, minimal surface) ====================
interface WasmoonGlobal {
  set(key: string, value: unknown): void;
  get(key: string): unknown;
  close(): void;
}
interface WasmoonEngine {
  global: WasmoonGlobal;
  doString(code: string): Promise<void>;
}
interface WasmoonFactory {
  createEngine(): Promise<WasmoonEngine>;
}
declare global {
  interface Window {
    wasmoon?: { LuaFactory: new () => WasmoonFactory };
  }
}

// ==================== Internal Types ====================
interface BlockState {
  isBlock: true;
  active: boolean;
  content: string;
  elseContent: string;
  _inElse: boolean;
  type: string;
}
interface LocalLorebookEntry {
  content: string;
  key?: string;
  secondKey?: string;
  alwaysActive?: boolean;
}
interface PreviewLorebookRuntimeEntry {
  alwaysActive?: boolean;
  comment?: string;
  content?: string;
  insertorder?: number;
  key?: string | string[];
  mode?: string;
  order?: number;
  secondkey?: string;
  selective?: boolean;
  useRegex?: boolean;
  [key: string]: unknown;
}
interface PreviewRegexRuntimeScript {
  ableFlag?: boolean;
  comment?: string;
  find?: string;
  flag?: string;
  flags?: string;
  in?: string;
  out?: string;
  replace?: string;
  replaceOrder?: number;
  type?: string;
  [key: string]: unknown;
}
interface PreviewEngineModule extends PreviewEngineContract {
  calcString(expr: string): number;
  clearTempVars(): void;
  consumeReloadRequest(): boolean;
  getChatVar(key: string): string;
  getGlobalChatVar(key: string): string;
  setGlobalChatVar(key: string, value: unknown): void;
}
interface InitLuaFn {
  (luaCode: string): Promise<boolean>;
  _getCaptured?: () => string;
  _resetCaptured?: () => void;
}
interface CBSArg {
  assets?: Array<[string, string]>;
  chatID?: number;
  lastInput?: string;
  lastMessage?: string;
  messageCount?: number;
  runVar?: boolean;
  [key: string]: unknown;
}
type CBSCallback = (p1: string, arg: CBSArg, args: string[]) => string | null;
type LoreMatchWithEntry = PreviewLoreMatch & { entry: PreviewLorebookRuntimeEntry };

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const PreviewEngine: PreviewEngineModule = (() => {
  // ==================== State ====================
  let chatVars: Record<string, string> = {};
  let globalVars: Record<string, string> = {};
  let tempVars: Record<string, string> = {};
  let defaultVarStr = '';
  let userName = 'User';
  let charName = 'Character';
  let charDescription = '';
  let charFirstMessage = '';
  let assetMap: Record<string, string> = {}; // name → data URI
  let lorebookEntries: PreviewLorebookRuntimeEntry[] = []; // for getLoreBooks search
  let localLorebooks: Record<string, LocalLorebookEntry> = {}; // loreBookId → { content, key, secondKey, alwaysActive }
  let _reloadDisplayRequested = false;
  let _onReloadDisplay: (() => void) | null = null; // callback set by app.js

  // ==================== Variable System ====================
  function parseKeyValue(str: string | undefined): [string, string][] {
    if (!str) return [];
    const results: [string, string][] = [];
    for (const raw of str.split('\n')) {
      const l = raw.trim();
      if (!l || l.startsWith('//') || l.startsWith('#') || l.startsWith('--')) continue;
      // Try '=' separator first, then ':'
      let idx = l.indexOf('=');
      if (idx <= 0) {
        idx = l.indexOf(':');
        if (idx <= 0) continue;
      }
      const key = l.slice(0, idx).trim();
      const val = l.slice(idx + 1).trim();
      if (!key || !/^[a-zA-Z_$]/.test(key)) continue;
      results.push([key, val]);
    }
    return results;
  }

  function getChatVar(key: string): string {
    // Check temp vars first
    const tv = tempVars[key];
    if (tv !== undefined) return String(tv);
    const v = chatVars['$' + key];
    if (v !== undefined) return String(v);
    const defaults = parseKeyValue(defaultVarStr);
    for (const [k, val] of defaults) {
      if (k === key) return val;
    }
    return 'null';
  }

  function setChatVar(key: string, value: unknown): void {
    chatVars['$' + key] = String(value);
  }

  function getGlobalChatVar(key: string): string {
    return globalVars[key] !== undefined ? String(globalVars[key]) : 'null';
  }

  function setGlobalChatVar(key: string, value: unknown): void {
    globalVars[key] = String(value);
  }

  // ==================== Math Evaluator ====================
  function calcString(expr: string): number {
    try {
      expr = expr.replace(/\$([a-zA-Z_]\w*)/g, (_, name: string) => {
        const v = getChatVar(name);
        return v === 'null' ? '0' : v;
      });
      const tokens: Array<number | string> = [];
      let i = 0;
      while (i < expr.length) {
        if (/\s/.test(expr[i])) { i++; continue; }
        if (/[\d.]/.test(expr[i]) || (expr[i] === '-' && (tokens.length === 0 || typeof tokens[tokens.length - 1] === 'string'))) {
          let num = '';
          if (expr[i] === '-') { num = '-'; i++; }
          while (i < expr.length && /[\d.]/.test(expr[i])) { num += expr[i]; i++; }
          tokens.push(parseFloat(num) || 0);
          continue;
        }
        if (i + 1 < expr.length) {
          const two = expr[i] + expr[i + 1];
          if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) {
            tokens.push(two); i += 2; continue;
          }
        }
        if ('+-*/%^<>|&()'.includes(expr[i])) {
          tokens.push(expr[i]); i++; continue;
        }
        i++;
      }
      const prec: Record<string, number> = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '^': 7 };
      const output: Array<number | string> = [];
      const ops: string[] = [];
      for (const t of tokens) {
        if (typeof t === 'number') { output.push(t); continue; }
        if (t === '(') { ops.push(t); continue; }
        if (t === ')') {
          while (ops.length && ops[ops.length - 1] !== '(') output.push(ops.pop()!);
          ops.pop(); continue;
        }
        while (ops.length && ops[ops.length - 1] !== '(' && (prec[ops[ops.length - 1]] || 0) >= (prec[t] || 0)) {
          output.push(ops.pop()!);
        }
        ops.push(t);
      }
      while (ops.length) output.push(ops.pop()!);
      const stack: number[] = [];
      for (const t of output) {
        if (typeof t === 'number') { stack.push(t); continue; }
        const b = stack.pop() ?? 0;
        const a = stack.pop() ?? 0;
        switch (t) {
          case '+': stack.push(a + b); break;
          case '-': stack.push(a - b); break;
          case '*': stack.push(a * b); break;
          case '/': stack.push(b !== 0 ? a / b : 0); break;
          case '%': stack.push(b !== 0 ? a % b : 0); break;
          case '^': stack.push(Math.pow(a, b)); break;
          case '<': stack.push(a < b ? 1 : 0); break;
          case '>': stack.push(a > b ? 1 : 0); break;
          case '<=': stack.push(a <= b ? 1 : 0); break;
          case '>=': stack.push(a >= b ? 1 : 0); break;
          case '==': stack.push(Math.abs(a - b) < 1e-9 ? 1 : 0); break;
          case '!=': stack.push(Math.abs(a - b) >= 1e-9 ? 1 : 0); break;
          case '&&': stack.push(a && b ? 1 : 0); break;
          case '||': stack.push(a || b ? 1 : 0); break;
          default: stack.push(0);
        }
      }
      const result = stack[0] || 0;
      return Math.round(result * 1000) / 1000;
    } catch (e) {
      return 0;
    }
  }

  // ==================== CBS Parser ====================
  const matcherMap = new Map<string, CBSCallback>();

  function registerCoreCBS(): void {
    const reg = (name: string, cb: CBSCallback, alias?: string[]): void => {
      matcherMap.set(name, cb);
      if (alias) for (const a of alias) matcherMap.set(a, cb);
    };

    // --- Variables ---
    reg('getvar', (_p1, arg, args) => getChatVar(args[0] || ''));
    reg('setvar', (_p1, arg, args) => {
      if (arg.runVar) setChatVar(args[0] || '', args[1] || '');
      return '';
    });
    reg('addvar', (_p1, arg, args) => {
      if (arg.runVar) {
        const cur = parseFloat(getChatVar(args[0] || '')) || 0;
        const add = parseFloat(args[1] || '0') || 0;
        setChatVar(args[0] || '', String(cur + add));
      }
      return '';
    });
    reg('setdefaultvar', (_p1, arg, args) => {
      if (arg.runVar && getChatVar(args[0] || '') === 'null') {
        setChatVar(args[0] || '', args[1] || '');
      }
      return '';
    });
    reg('getglobalvar', (_p1, _arg, args) => getGlobalChatVar(args[0] || ''));
    reg('setglobalvar', (_p1, arg, args) => {
      if (arg.runVar) setGlobalChatVar(args[0] || '', args[1] || '');
      return '';
    });
    // Temp vars (reset per message)
    reg('settempvar', (_p1, arg, args) => {
      if (arg.runVar) tempVars[args[0] || ''] = args[1] || '';
      return '';
    });
    reg('gettempvar', (_p1, _arg, args) => {
      const v = tempVars[args[0] || ''];
      return v !== undefined ? String(v) : 'null';
    });
    reg('button', (_p1, _arg, args) => {
      // RisuAI: {{button::label::triggerName}} → risu-trigger button
      const label = args[0] || 'Button';
      const trigName = args[1] || '';
      return `<button class="cbs-button" risu-trigger="${trigName}">${label}</button>`;
    });

    // --- Names ---
    reg('user', () => userName, ['username', 'persona']);
    reg('char', () => charName, ['charname', 'bot']);

    // --- Character Info ---
    reg('personality', () => charDescription, ['description', 'char_personality']);
    reg('scenario', () => '', ['world']);
    reg('firstmessage', () => charFirstMessage, ['first_message']);
    reg('mesexamples', () => '', ['mes_example', 'example_dialogue']);

    // --- Math ---
    reg('calc', (_p1, _arg, args) => String(calcString(args.join('::'))));

    // --- Random ---
    reg('random', (_p1, _arg, args) => {
      if (!args.length) return '';
      return args[Math.floor(Math.random() * args.length)];
    });
    reg('roll', (_p1, _arg, args) => {
      const max = parseInt(args[0] || '0', 10) || 6;
      return String(Math.floor(Math.random() * max) + 1);
    });
    reg('pick', (_p1, _arg, args) => {
      const n = parseInt(args[0] || '0', 10) || 1;
      const items = args.slice(1);
      const shuffled = [...items].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, n).join(', ');
    });

    // --- Print / Display ---
    reg('print', (_p1, _arg, args) => args.join('::'));
    reg('hidden', () => '');
    reg('comment', () => '', ['//']);
    reg('br', () => '\n', ['newline', 'nl']);

    // --- HTML helpers ---
    reg('img', (_p1, _arg, args) => `<img src="${args[0] || ''}" alt="${args[1] || ''}" style="max-width:100%;">`, ['image']);
    reg('video', (_p1, _arg, args) => `<video src="${args[0] || ''}" controls style="max-width:100%;"></video>`);
    reg('audio', (_p1, _arg, args) => `<audio src="${args[0] || ''}" controls></audio>`);
    reg('color', (_p1, _arg, args) => `<span style="color:${args[0] || '#fff'}">${args[1] || ''}</span>`);
    reg('fontsize', (_p1, _arg, args) => `<span style="font-size:${args[0] || '1em'}">${args[1] || ''}</span>`, ['size']);
    reg('bold', (_p1, _arg, args) => `<strong>${args[0] || ''}</strong>`, ['b']);
    reg('italic', (_p1, _arg, args) => `<em>${args[0] || ''}</em>`, ['i']);
    reg('strike', (_p1, _arg, args) => `<s>${args[0] || ''}</s>`, ['s', 'del']);
    reg('underline', (_p1, _arg, args) => `<u>${args[0] || ''}</u>`, ['u']);

    // --- Date/Time ---
    reg('date', () => new Date().toLocaleDateString('ko-KR'));
    reg('time', () => new Date().toLocaleTimeString('ko-KR'));
    reg('isotime', () => new Date().toISOString());
    reg('unixtime', () => String(Math.floor(Date.now() / 1000)));

    // --- String ops ---
    reg('length', (_p1, _arg, args) => String((args[0] || '').length));
    reg('upper', (_p1, _arg, args) => (args[0] || '').toUpperCase());
    reg('lower', (_p1, _arg, args) => (args[0] || '').toLowerCase());
    reg('trim', (_p1, _arg, args) => (args[0] || '').trim());
    reg('replace', (_p1, _arg, args) => (args[0] || '').replaceAll(args[1] || '', args[2] || ''));
    reg('substr', (_p1, _arg, args) => {
      const s = args[0] || '';
      const start = parseInt(args[1] || '0', 10) || 0;
      const len = args[2] ? parseInt(args[2], 10) : undefined;
      return s.substr(start, len);
    });
    reg('split', (_p1, _arg, args) => {
      const parts = (args[0] || '').split(args[1] || ',');
      const idx = parseInt(args[2] || '0', 10) || 0;
      return parts[idx] || '';
    });
    reg('reverse', (_p1, _arg, args) => (args[0] || '').split('').reverse().join(''));
    reg('contains', (_p1, _arg, args) => (args[0] || '').includes(args[1] || '') ? '1' : '0');
    reg('index', (_p1, _arg, args) => String((args[0] || '').indexOf(args[1] || '')));

    // --- Comparison helpers ---
    reg('equal', (_p1, _arg, args) => (args[0] || '') === (args[1] || '') ? '1' : '0');
    reg('notequal', (_p1, _arg, args) => (args[0] || '') !== (args[1] || '') ? '1' : '0');
    reg('greater', (_p1, _arg, args) => parseFloat(args[0] || '0') > parseFloat(args[1] || '0') ? '1' : '0');
    reg('less', (_p1, _arg, args) => parseFloat(args[0] || '0') < parseFloat(args[1] || '0') ? '1' : '0');
    reg('greaterorequal', (_p1, _arg, args) => parseFloat(args[0] || '0') >= parseFloat(args[1] || '0') ? '1' : '0');
    reg('lessorequal', (_p1, _arg, args) => parseFloat(args[0] || '0') <= parseFloat(args[1] || '0') ? '1' : '0');
    reg('and', (_p1, _arg, args) => (args[0] && args[0] !== '0' && args[0] !== '') && (args[1] && args[1] !== '0' && args[1] !== '') ? '1' : '0');
    reg('or', (_p1, _arg, args) => (args[0] && args[0] !== '0' && args[0] !== '') || (args[1] && args[1] !== '0' && args[1] !== '') ? '1' : '0');
    reg('not', (_p1, _arg, args) => (!args[0] || args[0] === '0' || args[0] === '') ? '1' : '0');
    reg('ifeq', (_p1, _arg, args) => args[0] === args[1] ? (args[2] || '') : (args[3] || ''));
    reg('ifneq', (_p1, _arg, args) => args[0] !== args[1] ? (args[2] || '') : (args[3] || ''));

    // --- Asset ---
    reg('asset', (_p1, arg, args) => {
      const name = args[0] || '';
      // Exact match first
      const dataUri = assetMap[name];
      if (dataUri) return `<img src="${dataUri}" alt="${name}" class="cbs-asset">`;
      // Case-insensitive fallback
      const nameLower = name.toLowerCase();
      for (const key of Object.keys(assetMap)) {
        if (key.toLowerCase() === nameLower) return `<img src="${assetMap[key]}" alt="${name}" class="cbs-asset">`;
      }
      if (arg.assets) {
        const assets = arg.assets as [string, string][];
        const asset = assets.find(a => a[0] === name || a[0].toLowerCase() === nameLower);
        if (asset) return `<img src="${asset[1]}" alt="${name}" class="cbs-asset">`;
      }
      return `[asset:${name}]`;
    });
    // {{raw::name}} — returns raw data URI (used in <img src="{{raw::name}}">)
    reg('raw', (_p1, arg, args) => {
      const name = args[0] || '';
      // Exact match first
      const dataUri = assetMap[name];
      if (dataUri) return dataUri;
      // Case-insensitive fallback
      const nameLower = name.toLowerCase();
      for (const key of Object.keys(assetMap)) {
        if (key.toLowerCase() === nameLower) return assetMap[key];
      }
      if (arg.assets) {
        const assets = arg.assets as [string, string][];
        const asset = assets.find(a => a[0] === name || a[0].toLowerCase() === nameLower);
        if (asset) return asset[1];
      }
      console.warn('[CBS raw] Asset not found:', name);
      return '';
    });

    // --- Misc ---
    reg('idle', () => '');
    reg('lastmessage', (_p1, arg) => (arg.lastMessage as string | undefined) || '');
    reg('lastinput', (_p1, arg) => (arg.lastInput as string | undefined) || '');
    reg('messagecount', (_p1, arg) => String((arg.messageCount as number | undefined) || 0));
    reg('lastmessageid', (_p1, arg) => String((arg.messageCount as number | undefined) ? (arg.messageCount as number) - 1 : 0), ['lastmessageindex']);
    reg('chatindex', (_p1, arg) => String((arg.chatID as number | undefined) ?? -1), ['chat_index']);
    reg('isfirstmsg', (_p1, arg) => ((arg.chatID as number | undefined) === 0 || (arg.chatID as number | undefined) === -1) ? '1' : '0', ['isfirstmessage']);
    reg('slot', () => '');
    reg('originalmessage', () => '', ['original_message']);
    reg('maxcontext', () => '8000');
    reg('lastcharamessage', () => '', ['lastchar']);
    reg('lastusermessage', () => '', ['lastuser']);
    reg('previousmessage', () => '');
    reg('history', () => '', ['chat']);
  }

  // --- CBS Block Parser (stack-based) ---
  function risuChatParser(text: string, arg?: CBSArg): string {
    if (!text || typeof text !== 'string') return text || '';
    const resolvedArg: CBSArg = arg ?? {};
    resolvedArg.runVar = resolvedArg.runVar !== false;
    const maxDepth = 20;
    let depth = 0;

    function parse(input: string): string {
      if (depth++ > maxDepth) return input;
      let result = '';
      let i = 0;
      const len = input.length;
      const stack: BlockState[] = [];

      while (i < len) {
        if (input[i] === '{' && i + 1 < len && input[i + 1] === '{') {
          i += 2;
          let inner = '';
          let nestLevel = 0;
          while (i < len) {
            if (input[i] === '{' && i + 1 < len && input[i + 1] === '{') {
              nestLevel++; inner += '{{'; i += 2; continue;
            }
            if (input[i] === '}' && i + 1 < len && input[i + 1] === '}') {
              if (nestLevel > 0) { nestLevel--; inner += '}}'; i += 2; continue; }
              i += 2; break;
            }
            inner += input[i]; i++;
          }

          const parsed = parse(inner);

          // Block start (#)
          if (parsed.startsWith('#')) {
            const blockResult = handleBlockStart(parsed.slice(1), resolvedArg);
            stack.push(blockResult);
            continue;
          }
          // Block end (/)
          if (parsed.startsWith('/')) {
            let blockData = null;
            for (let si = stack.length - 1; si >= 0; si--) {
              if (stack[si] && stack[si].isBlock) {
                blockData = stack.splice(si, 1)[0];
                break;
              }
            }
            if (blockData) {
              const output = blockData.active ? blockData.content : (blockData.elseContent || '');
              const activeBlock = stack.length > 0 ? stack[stack.length - 1] : null;
              if (activeBlock && activeBlock.isBlock) {
                if (activeBlock.active) activeBlock.content += output;
              } else {
                result += output;
              }
            }
            continue;
          }
          // {{else}} inside a block
          if (parsed.toLowerCase().trim() === 'else') {
            const activeBlock = stack.length > 0 ? stack[stack.length - 1] : null;
            if (activeBlock && activeBlock.isBlock) {
              activeBlock.elseContent = '';
              activeBlock._inElse = true;
              // Swap: content so far goes to the "if-true" side
              // From now on, content accumulates in elseContent
            }
            continue;
          }

          // Regular tag
          const tagResult = matcher(parsed, resolvedArg);
          if (tagResult !== null) {
            const activeBlock = stack.length > 0 ? stack[stack.length - 1] : null;
            if (activeBlock && activeBlock.isBlock) {
              if (activeBlock._inElse) {
                if (!activeBlock.active) activeBlock.elseContent = (activeBlock.elseContent || '') + tagResult;
              } else {
                if (activeBlock.active) activeBlock.content += tagResult;
              }
            } else {
              result += tagResult;
            }
            continue;
          }
          // Unknown tag — keep as-is
          const raw = '{{' + inner + '}}';
          const activeBlock2 = stack.length > 0 ? stack[stack.length - 1] : null;
          if (activeBlock2 && activeBlock2.isBlock) {
            if (activeBlock2._inElse) {
              if (!activeBlock2.active) activeBlock2.elseContent = (activeBlock2.elseContent || '') + raw;
            } else {
              if (activeBlock2.active) activeBlock2.content += raw;
            }
          } else {
            result += raw;
          }
          continue;
        }

        // Regular character
        const activeBlock = stack.length > 0 ? stack[stack.length - 1] : null;
        if (activeBlock && activeBlock.isBlock) {
          if (activeBlock._inElse) {
            if (!activeBlock.active) activeBlock.elseContent = (activeBlock.elseContent || '') + input[i];
          } else {
            if (activeBlock.active) activeBlock.content += input[i];
          }
        } else {
          result += input[i];
        }
        i++;
      }

      for (const b of stack) {
        if (b && b.isBlock) {
          result += b.active ? b.content : (b.elseContent || '');
        }
      }

      depth--;
      return result;
    }

    return parse(text);
  }

  function matcher(p1: string, arg: CBSArg): string | null {
    if (p1.startsWith('? ')) {
      return String(calcString(p1.substring(2)));
    }
    const parts = p1.split('::');
    const name = parts[0].toLowerCase().replace(/[\s_-]/g, '');
    const args = parts.slice(1);
    const cb = matcherMap.get(name);
    if (cb) return cb(p1, arg, args) ?? '';
    return null;
  }

  // FIX: Handle both {{#if::condition}} and {{#if condition}} syntax
  function handleBlockStart(content: string, _arg: CBSArg): BlockState {
    // Try :: split first
    const parts = content.split('::');
    let name: string;
    let args: string[];

    if (parts.length >= 2) {
      // Standard :: syntax: {{#if::$hp > 0}}
      name = parts[0].toLowerCase().replace(/[\s_-]/g, '');
      args = parts.slice(1);
    } else {
      // Space-separated: {{#if $hp > 0}}
      const spaceIdx = content.indexOf(' ');
      if (spaceIdx > 0) {
        name = content.substring(0, spaceIdx).toLowerCase().replace(/[\s_-]/g, '');
        args = [content.substring(spaceIdx + 1)];
      } else {
        name = content.toLowerCase().replace(/[\s_-]/g, '');
        args = [];
      }
    }

    if (name === 'if') {
      const cond = evaluateCondition(args.join('::'));
      return { isBlock: true, active: cond, content: '', elseContent: '', _inElse: false, type: 'if' };
    }
    if (name === 'when') {
      const active = evaluateWhen(args);
      return { isBlock: true, active, content: '', elseContent: '', _inElse: false, type: 'when' };
    }
    if (name === 'each') {
      return { isBlock: true, active: true, content: '', elseContent: '', _inElse: false, type: 'each' };
    }
    if (name === 'pure') {
      return { isBlock: true, active: true, content: '', elseContent: '', _inElse: false, type: 'pure' };
    }
    return { isBlock: true, active: true, content: '', elseContent: '', _inElse: false, type: name };
  }

  // FIX: Support string comparisons in #if
  function evaluateCondition(expr: string): boolean {
    if (!expr) return false;
    expr = expr.trim();
    if (expr === '1' || expr.toLowerCase() === 'true') return true;
    if (expr === '0' || expr === '' || expr.toLowerCase() === 'false' || expr === 'null') return false;

    // String comparison: var == "string" or var != "string"
    const strCmp = expr.match(/^(.+?)\s*(==|!=|is|isnot)\s*"([^"]*)"$/);
    if (strCmp) {
      let val = strCmp[1].trim();
      if (val.startsWith('$')) val = getChatVar(val.slice(1));
      else if (/^[a-zA-Z_]\w*$/.test(val)) val = getChatVar(val);
      const op = strCmp[2];
      const cmp = strCmp[3];
      if (op === '==' || op === 'is') return val === cmp;
      if (op === '!=' || op === 'isnot') return val !== cmp;
    }

    // Variable check: just a variable name
    if (/^[a-zA-Z_]\w*$/.test(expr)) {
      const v = getChatVar(expr);
      return v !== 'null' && v !== '0' && v !== '' && v !== 'false';
    }
    if (expr.startsWith('$') && /^\$[a-zA-Z_]\w*$/.test(expr)) {
      const v = getChatVar(expr.slice(1));
      return v !== 'null' && v !== '0' && v !== '' && v !== 'false';
    }

    const result = calcString(expr);
    return result !== 0;
  }

  // FIX: Correct or/and chain logic in when
  function evaluateWhen(args: string[]): boolean {
    if (args.length < 3) return false;
    const stack = [...args];

    function resolveVar(val: string): string {
      if (/^[a-zA-Z_]\w*$/.test(val)) {
        const v = getChatVar(val);
        if (v !== 'null') return v;
      }
      if (val.startsWith('$')) {
        const v = getChatVar(val.slice(1));
        if (v !== 'null') return v;
      }
      return val;
    }

    let val = resolveVar(stack.shift() ?? '');
    let result: boolean | null = null;
    let pendingLogic = 'and';

    while (stack.length >= 2) {
      const op = stack.shift()!.toLowerCase();
      const cmp = resolveVar(stack.shift()!);
      let cmpResult: boolean;
      switch (op) {
        case 'is': cmpResult = val === cmp; break;
        case 'isnot': cmpResult = val !== cmp; break;
        case '>': cmpResult = parseFloat(val) > parseFloat(cmp); break;
        case '<': cmpResult = parseFloat(val) < parseFloat(cmp); break;
        case '>=': cmpResult = parseFloat(val) >= parseFloat(cmp); break;
        case '<=': cmpResult = parseFloat(val) <= parseFloat(cmp); break;
        default: cmpResult = false;
      }

      if (result === null) result = cmpResult;
      else if (pendingLogic === 'and') result = result && cmpResult;
      else if (pendingLogic === 'or') result = result || cmpResult;

      if (stack.length >= 3) {
        pendingLogic = stack.shift()!.toLowerCase() === 'or' ? 'or' : 'and';
        val = resolveVar(stack.shift()!);
      }
    }
    return result ?? false;
  }

  // ==================== Regex Script Pipeline ====================
  // FIX: Case-insensitive type matching + support both find/in field names
  function processRegex(text: string, scripts: PreviewRegexScript[], mode: string): string {
    if (!scripts || !scripts.length) return text;
    const modeLower = mode.toLowerCase();
    const filtered = scripts.filter(s =>
      (s.type || '').toLowerCase() === modeLower &&
      s.ableFlag !== false &&
      (s.find || s.in)
    );
    filtered.sort((a, b) => {
      const orderA = (a.replaceOrder as number | undefined) ?? extractOrder(String(a['flag'] ?? a['flags'] ?? ''));
      const orderB = (b.replaceOrder as number | undefined) ?? extractOrder(String(b['flag'] ?? b['flags'] ?? ''));
      return orderA - orderB;
    });
    for (const script of filtered) {
      try {
        const find = script.find || script.in || '';
        const replace = script.replace || script.out || '';
        let flags = String(script['flag'] ?? script['flags'] ?? 'g').replace(/<[^>]*>/g, '').trim();
        if (!flags) flags = 'g';
        const regex = new RegExp(find, flags);
        text = text.replace(regex, replace);
      } catch (e) {
        console.warn('[PreviewEngine] Regex error:', (e as Error).message, script.comment);
      }
    }
    return text;
  }

  function extractOrder(flagStr: string): number {
    const m = flagStr.match(/<order\s+(\d+)>/i);
    return m ? parseInt(m[1], 10) : 0;
  }

  // ==================== Lorebook Matching ====================
  function matchLorebook(messages: PreviewMessage[], lorebook: PreviewLorebookEntry[], scanDepth = 10): PreviewLoreMatch[] {
    if (!lorebook || !lorebook.length) return [];
    const recentMsgs = messages.slice(-scanDepth);
    const searchText = recentMsgs.map(m => m.content).join(' ').toLowerCase();
    const activated: LoreMatchWithEntry[] = [];

    for (let i = 0; i < lorebook.length; i++) {
      const entry = lorebook[i];
      if (entry.mode === 'folder') continue;

      if (entry.alwaysActive) {
        activated.push({ index: i, entry, reason: 'alwaysActive' });
        continue;
      }

      const keys = (entry.key || '').split(',').map(k => k.trim()).filter(Boolean);
      if (!keys.length) continue;

      let keyMatch = false;
      for (const key of keys) {
        if (entry['useRegex'] as boolean | undefined) {
          try { if (new RegExp(key, 'i').test(searchText)) { keyMatch = true; break; } } catch (e) { console.warn('[preview] Invalid regex in lorebook key:', key, (e as Error).message); }
        } else {
          if (searchText.includes(key.toLowerCase())) { keyMatch = true; break; }
        }
      }

      const selective = entry['selective'] as boolean | undefined;
      const secondkey = entry['secondkey'] as string | undefined;
      if (selective && secondkey) {
        if (!keyMatch) continue;
        const secondKeys = secondkey.split(',').map(k => k.trim()).filter(Boolean);
        let secondMatch = false;
        for (const sk of secondKeys) {
          if (searchText.includes(sk.toLowerCase())) { secondMatch = true; break; }
        }
        if (!secondMatch) continue;
        activated.push({ index: i, entry, reason: 'key+secondkey' });
      } else if (keyMatch) {
        activated.push({ index: i, entry, reason: `key: ${keys.find(k => searchText.includes(k.toLowerCase()))}` });
      }
    }

    activated.sort((a, b) =>
      ((a.entry['insertorder'] as number | undefined) || (a.entry['order'] as number | undefined) || 100) -
      ((b.entry['insertorder'] as number | undefined) || (b.entry['order'] as number | undefined) || 100)
    );
    return activated;
  }

  // ==================== Lua Runtime ====================
  let luaFactory: WasmoonFactory | null = null;
  let luaEngine: WasmoonEngine | null = null;
  let luaOutput: string[] = [];

  async function initLua(luaCode: string): Promise<boolean> {
    if (!window.wasmoon) {
      console.warn('[PreviewEngine] wasmoon not loaded');
      return false;
    }
    try {
      if (!luaFactory) luaFactory = await new window.wasmoon.LuaFactory();
      if (luaEngine) { luaEngine.global.close(); luaEngine = null; }
      luaEngine = await luaFactory.createEngine();

      // wasmoon corrupts return values of JS-bound functions called from Lua.
      // Workaround: value-returning functions use _raw_ prefix and store result
      // in _jsRet Lua global via global.set. Lua wrappers read _jsRet instead.
      const _safeBind = (name: string, fn: (...args: unknown[]) => unknown): void => {
        luaEngine!.global.set('_raw_' + name, (...args: unknown[]) => {
          const result = fn(...args);
          const safe = (result != null) ? String(result) : '';
          try {
            luaEngine!.global.set('_jsRet', safe);
            // (debug log removed)
          } catch(e) { console.warn('[safeBind] ERROR', name, e); }
          return result;
        });
      };
      _safeBind('getChatVar', (_id: unknown, key: unknown) => getChatVar(String(key ?? '')) || '');
      luaEngine.global.set('setChatVar', (_id: unknown, key: unknown, val: unknown) => setChatVar(String(key ?? ''), String(val ?? '')));
      _safeBind('getGlobalVar', (_id: unknown, key: unknown) => getGlobalChatVar(String(key ?? '')) || '');
      luaEngine.global.set('setGlobalVar', (_id: unknown, key: unknown, val: unknown) => setGlobalChatVar(String(key ?? ''), String(val ?? '')));
      _safeBind('getName', () => charName || '');
      luaEngine.global.set('setName', (_id: unknown, name: unknown) => { charName = name != null ? String(name) : ''; });
      _safeBind('getPersonaName', () => userName || '');
      luaEngine.global.set('print', (...args: unknown[]) => {
        const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join('\t');
        luaOutput.push(msg);
      });

      let outputHTML = '';
      luaEngine.global.set('setOutput', (_id: unknown, html: unknown) => { outputHTML = html != null ? String(html) : ''; });
      _safeBind('getOutput', () => outputHTML || '');

      await luaEngine.doString(`
        json = {}
        function json.decode(str)
          local f = load("return " .. str:gsub('%[', '{'):gsub('%]', '}'):gsub('":', '"]='):gsub('null', 'nil'))
          if f then return f() end
          return nil
        end
        function json.encode(val)
          if type(val) == "table" then
            local isArray = #val > 0
            local parts = {}
            if isArray then
              for _, v in ipairs(val) do parts[#parts+1] = json.encode(v) end
              return "[" .. table.concat(parts, ",") .. "]"
            else
              for k, v in pairs(val) do parts[#parts+1] = '"' .. tostring(k) .. '":' .. json.encode(v) end
              return "{" .. table.concat(parts, ",") .. "}"
            end
          elseif type(val) == "string" then return '"' .. val:gsub('"', '\\\\"') .. '"'
          elseif type(val) == "number" then return tostring(val)
          elseif type(val) == "boolean" then return val and "true" or "false"
          else return "null" end
        end
        function log(val)
          if type(val) == "table" then print(json.encode(val)) else print(tostring(val)) end
        end
        -- RisuAI async compatibility (Lua has no async, wrap as coroutine)
        function async(fn)
          return function(...)
            local args = {...}
            local co = coroutine.create(fn)
            local ok, result = coroutine.resume(co, table.unpack(args))
            if not ok then print("[async error] " .. tostring(result)) end
            return result
          end
        end
        function await(val)
          return val
        end

        -- Listener system (listenEdit / callListenMain)
        local _listeners = {}
        local _outputListeners = {}
        local _inputListeners = {}

        function listenEdit(mode, fn)
          if not _listeners[mode] then _listeners[mode] = {} end
          table.insert(_listeners[mode], fn)
        end

        function listenOutput(fn)
          table.insert(_outputListeners, fn)
        end

        function listenInput(fn)
          table.insert(_inputListeners, fn)
        end

        -- wasmoon workaround: store results in globals (return values get corrupted)
        _callResult = ""
        _lastListenerResult = nil

        -- Chunk-based result storage to bypass wasmoon global.get truncation
        local CHUNK_SIZE = 7000
        function _storeResult(result, modified)
          _callResult_modified = modified and "1" or "0"
          _callResult_chunks = 0
          if modified and result then
            local len = #result
            local chunks = math.ceil(len / CHUNK_SIZE)
            _callResult_chunks = chunks
            for i = 1, chunks do
              _G["_cr_" .. i] = result:sub((i-1)*CHUNK_SIZE + 1, i*CHUNK_SIZE)
            end
          end
          _callResult = result
        end

        function callListenMain(mode, triggerId, content, arg)
          local fns = _listeners[mode]
          local nfns = fns and #fns or 0
          -- (debug print removed)
          if not fns or nfns == 0 then
            _storeResult(content, false)
            return content
          end
          local result = content
          local wasModified = false
          for i, fn in ipairs(fns) do
            _lastListenerResult = nil
            local ok, r = pcall(function()
              local ret = fn(mode, triggerId, result, arg or "{}")
              _lastListenerResult = ret
              return ret
            end)
            local actualResult = _lastListenerResult
            if ok and actualResult ~= nil then
              local s = tostring(actualResult)
              if s ~= triggerId then
                result = s
                wasModified = true
                -- (debug print removed)
              else
                -- (debug print removed)
              end
            elseif not ok then
              print("[Lua listener error] " .. tostring(r))
            end
          end
          _storeResult(result, wasModified)
          -- (debug print removed)
          return result
        end

        function callOutputListeners(triggerId, content)
          local result = content
          local wasModified = false
          for _, fn in ipairs(_outputListeners) do
            _lastListenerResult = nil
            local ok, r = pcall(function()
              local ret = fn(triggerId, result)
              _lastListenerResult = ret
              return ret
            end)
            local actualResult = _lastListenerResult
            if ok and actualResult ~= nil then
              local s = tostring(actualResult)
              if s ~= triggerId then result = s; wasModified = true end
            end
          end
          _storeResult(result, wasModified)
          return result
        end

        function callInputListeners(triggerId, content)
          local result = content
          local wasModified = false
          for _, fn in ipairs(_inputListeners) do
            _lastListenerResult = nil
            local ok, r = pcall(function()
              local ret = fn(triggerId, result)
              _lastListenerResult = ret
              return ret
            end)
            local actualResult = _lastListenerResult
            if ok and actualResult ~= nil then
              local s = tostring(actualResult)
              if s ~= triggerId then result = s; wasModified = true end
            end
          end
          _storeResult(result, wasModified)
          return result
        end

        function _debugListeners()
          -- (debug prints removed)
        end
      `);
      // JS callback for capturing Lua results (2-step workaround for wasmoon return value bug)
      let _luaCaptured = '';
      luaEngine.global.set('_capture', (val: unknown) => { _luaCaptured = (val != null) ? String(val) : ''; });
      Object.assign(initLua, {
        _getCaptured: (): string => _luaCaptured,
        _resetCaptured: (): void => { _luaCaptured = ''; }
      });

      _safeBind('callAxModel', () => '[Preview] AI model not available');
      // getLoreBooks: search lorebook entries (file + local) and set result as Lua table
      luaEngine.global.set('_raw_getLoreBooks', (_id: unknown, filter: unknown) => {
        const filterStr = (filter != null) ? String(filter).trim() : '';
        if (!filterStr) {
          try { luaEngine!.global.set('_lbResult', []); } catch (e) { console.warn('[preview] Lua _lbResult reset failed:', e); }
          return;
        }
        const f = filterStr.toLowerCase();
        // Search file lorebook entries
        const fileMatches = lorebookEntries.filter(e => {
          const comment = (e.comment || '').toLowerCase();
          if (comment.includes(f)) return true;
          const keys = Array.isArray(e.key) ? (e.key as string[]) : (e.key || '').split(',');
          return keys.some(k => k.trim().toLowerCase().includes(f));
        }).map(e => ({
          content: String(e['content'] ?? ''),
          comment: e.comment || '',
          key: Array.isArray(e.key) ? (e.key as string[]).join(',') : (e.key || ''),
        }));
        // Search local (Lua-created) lorebook entries
        const localMatches: Array<{ content: string; comment: string; key: string }> = [];
        for (const [lbId, entry] of Object.entries(localLorebooks)) {
          // alwaysActive entries always match
          if (entry.alwaysActive) {
            localMatches.push({ content: entry.content, comment: lbId, key: entry.key || '' });
            continue;
          }
          const keyStr = (entry.key || '').toLowerCase();
          const secKeyStr = (entry.secondKey || '').toLowerCase();
          const commentStr = lbId.toLowerCase();
          if (commentStr.includes(f) || keyStr.includes(f) || secKeyStr.includes(f)) {
            localMatches.push({ content: entry.content, comment: lbId, key: entry.key || '' });
          }
        }
        const matches = [...fileMatches, ...localMatches];
        // Store results as individual globals (wasmoon can't convert JS arrays to Lua tables)
        try {
          luaEngine!.global.set('_lbCount', matches.length);
          for (let i = 0; i < matches.length; i++) {
            luaEngine!.global.set('_lb_' + i + '_content', matches[i].content || '');
            luaEngine!.global.set('_lb_' + i + '_comment', matches[i].comment || '');
            luaEngine!.global.set('_lb_' + i + '_key', matches[i].key || '');
          }
        } catch (error) {
          console.warn('[getLoreBooks] set result error:', error);
          try { luaEngine!.global.set('_lbCount', 0); } catch (e) { console.warn('[preview] Lua _lbCount reset failed:', e); }
        }
      });
      luaEngine.global.set('upsertLocalLoreBook', (_id: unknown, lbId: unknown, content: unknown, opts: unknown) => {
        const lbIdStr = String(lbId ?? '');
        if (!lbIdStr) return;
        const entry: LocalLorebookEntry = { content: String(content ?? '') };
        if (opts && typeof opts === 'object') {
          const o = opts as Record<string, unknown>;
          if (o.key) entry.key = String(o.key);
          if (o.secondKey) entry.secondKey = String(o.secondKey);
          if (o.alwaysActive !== undefined) entry.alwaysActive = Boolean(o.alwaysActive);
        }
        localLorebooks[lbIdStr] = entry;
      });
      luaEngine.global.set('removeLocalLoreBook', (_id: unknown, lbId: unknown) => {
        delete localLorebooks[String(lbId ?? '')];
      });
      _safeBind('getChat', () => '[]');
      luaEngine.global.set('setChat', (_id: unknown, _chat: unknown) => { /* stub */ });
      _safeBind('getMemory', () => '');
      luaEngine.global.set('setMemory', (_id: unknown, _mem: unknown) => { /* stub */ });
      _safeBind('getCharacterName', () => charName || '');
      luaEngine.global.set('alertError', (msg: unknown) => { luaOutput.push('[Alert] ' + String(msg ?? '')); });
      _safeBind('requestInput', () => '');
      luaEngine.global.set('sleep', (_ms: unknown) => { /* stub */ });

      // Additional RisuAI Lua API stubs
      _safeBind('getCharacterLastMessage', () => charFirstMessage || '');
      _safeBind('getUserLastMessage', () => '');
      _safeBind('getChatLength', () => '1');
      _safeBind('getFullChat', () => '[]');
      _safeBind('getChatMessages', () => '[]');
      _safeBind('getLastMessage', () => charFirstMessage || '');
      _safeBind('getCurrentChatId', () => 'preview');
      _safeBind('getCharacterId', () => 'preview');
      luaEngine.global.set('setDescription', (_id: unknown, _desc: unknown) => { /* stub */ });
      luaEngine.global.set('setPersonality', (_id: unknown, _p: unknown) => { /* stub */ });
      luaEngine.global.set('setScenario', (_id: unknown, _s: unknown) => { /* stub */ });
      luaEngine.global.set('setFirstMessage', (_id: unknown, _m: unknown) => { /* stub */ });
      luaEngine.global.set('addChat', (_id: unknown, _role: unknown, _content: unknown) => { /* stub */ });
      luaEngine.global.set('removeChat', (_id: unknown, _idx: unknown) => { /* stub */ });
      luaEngine.global.set('reloadDisplay', (_id: unknown) => {
        _reloadDisplayRequested = true;
        if (_onReloadDisplay) _onReloadDisplay();
      });
      luaEngine.global.set('sendInput', (_id: unknown, _text: unknown) => { /* stub */ });

      // Lua wrappers: call raw JS function (side-effect: sets _jsRet), then return _jsRet
      await luaEngine.doString(`
        _jsRet = ""
        function getChatVar(id, key)
          _raw_getChatVar(id, key)
          return _jsRet
        end
        function getGlobalVar(id, key)
          _raw_getGlobalVar(id, key)
          return _jsRet
        end
        function getName() _raw_getName(); return _jsRet end
        function getPersonaName() _raw_getPersonaName(); return _jsRet end
        function getOutput() _raw_getOutput(); return _jsRet end
        function callAxModel(id, sys, usr, opts) _raw_callAxModel(id, sys, usr, opts); return _jsRet end
        function getLoreBooks(id, filter)
          _raw_getLoreBooks(id, filter or "")
          local count = _lbCount
          if count == nil or count == 0 then return {} end
          if type(count) == "string" then count = tonumber(count) or 0 end
          local result = {}
          for i = 0, count - 1 do
            result[i + 1] = {
              content = _G["_lb_" .. i .. "_content"] or "",
              comment = _G["_lb_" .. i .. "_comment"] or "",
              key = _G["_lb_" .. i .. "_key"] or "",
            }
          end
          return result
        end
        function getChat(id) _raw_getChat(id); return _jsRet end
        function getMemory(id) _raw_getMemory(id); return _jsRet end
        function getCharacterName() _raw_getCharacterName(); return _jsRet end
        function requestInput(id, prompt) _raw_requestInput(id, prompt); return _jsRet end
        function getCharacterLastMessage(id) _raw_getCharacterLastMessage(id); return _jsRet end
        function getUserLastMessage(id) _raw_getUserLastMessage(id); return _jsRet end
        function getChatLength(id) _raw_getChatLength(id); return _jsRet end
        function getFullChat(id) _raw_getFullChat(id); return _jsRet end
        function getChatMessages(id) _raw_getChatMessages(id); return _jsRet end
        function getLastMessage(id) _raw_getLastMessage(id); return _jsRet end
        function getCurrentChatId() _raw_getCurrentChatId(); return _jsRet end
        function getCharacterId() _raw_getCharacterId(); return _jsRet end
      `);

      if (luaCode) {
        const cleanCode = luaCode.replace(/^-- ===== .* =====$/gm, '');
        await luaEngine.doString(cleanCode);
      }
      return true;
    } catch (e) {
      console.error('[PreviewEngine] Lua init error:', e);
      luaOutput.push('[Lua Error] ' + (e as Error).message);
      return false;
    }
  }

  // Read _callResult from Lua using chunk-based approach to bypass wasmoon truncation
  function _readCallResult(data: string): string {
    if (!luaEngine) return data;
    const modified = luaEngine.global.get('_callResult_modified');
    if (modified !== '1') {
      return data; // no-op: return original data without reading truncated global
    }
    const chunks = luaEngine.global.get('_callResult_chunks') as number | undefined;
    if (chunks && chunks > 0) {
      let result = '';
      for (let i = 1; i <= chunks; i++) {
        const chunk = luaEngine.global.get('_cr_' + i);
        if (chunk != null) result += String(chunk);
      }
      // (debug log removed)
      return result.length > 0 ? result : data;
    }
    // Fallback: try direct read
    const r = luaEngine.global.get('_callResult');
    const rs = (r != null) ? String(r) : '';
    // (debug log removed)
    return (rs.length > 0 && rs !== 'nil') ? rs : data;
  }

  async function runLuaTrigger(mode: string, data: string | null): Promise<string | null> {
    if (!luaEngine) return data;
    try {
      if (mode === '_debug_listeners') {
        await luaEngine.doString(`_debugListeners()`);
        return data;
      }
      if (mode === 'start') {
        await luaEngine.doString(`
          _debugListeners()
          if onStart then onStart("preview") end
        `);
        return data;
      }
      if (mode === 'input') {
        await luaEngine.doString(`if onInput then onInput("preview") end`);
        const content = typeof data === 'string' ? data : JSON.stringify(data);
        luaEngine.global.set('_jsContent', content);
        await luaEngine.doString(`callInputListeners("preview", _jsContent)`);
        return _readCallResult(data ?? '');
      }
      if (mode === 'output') {
        await luaEngine.doString(`if onOutput then onOutput("preview") end`);
        const content = typeof data === 'string' ? data : JSON.stringify(data);
        luaEngine.global.set('_jsContent', content);
        await luaEngine.doString(`callOutputListeners("preview", _jsContent)`);
        return _readCallResult(data ?? '');
      }
      if (mode === 'editOutput') {
        await luaEngine.doString(`if onOutput then onOutput("preview") end`);
      }
      // editDisplay, editOutput, editInput, editRequest → callListenMain
      const content = typeof data === 'string' ? data : JSON.stringify(data);
      luaEngine.global.set('_jsContent', content);
      luaEngine.global.set('_jsMode', mode);
      await luaEngine.doString(`callListenMain(_jsMode, "preview", _jsContent, "{}")`);
      return _readCallResult(data ?? '');
    } catch (e) {
      luaOutput.push(`[Lua ${mode} Error] ${(e as Error).message}`);
      console.warn(`[Lua ${mode} Error]`, e);
      return data;
    }
  }

  // ==================== Initialize ====================
  registerCoreCBS();

  // ==================== Public API ====================
  return {
    setChatVar,
    getChatVar,
    setGlobalChatVar,
    getGlobalChatVar,
    setUserName: (n: string): void => { userName = n; },
    setCharName: (n: string): void => { charName = n; },
    setDefaultVars: (s: string): void => { defaultVarStr = s; },
    setCharDescription: (s: string): void => { charDescription = s; },
    setCharFirstMessage: (s: string): void => { charFirstMessage = s; },
    setAssets: (map: Record<string, string>): void => {
      assetMap = map || {};
    },
    setLorebook: (entries: PreviewLorebookEntry[]): void => { lorebookEntries = entries || []; },
    resetVars: (): void => { chatVars = {}; globalVars = {}; tempVars = {}; localLorebooks = {}; _reloadDisplayRequested = false; luaOutput = []; },
    clearTempVars: (): void => { tempVars = {}; },
    onReloadDisplay: (cb: () => void): void => { _onReloadDisplay = cb; },
    consumeReloadRequest: (): boolean => { const r = _reloadDisplayRequested; _reloadDisplayRequested = false; return r; },

    risuChatParser,
    processRegex,
    matchLorebook,
    calcString,
    // Replace img src with asset data URIs
    resolveAssetImages: (html: string): string => {
      if (!html || !assetMap || Object.keys(assetMap).length === 0) return html;
      const unresolved = new Set<string>();
      const result = html.replace(/<img\s([^>]*?)src="([^"]+)"([^>]*?)>/gi, (match, pre: string, src: string, post: string) => {
        // Skip if already a data URI or full URL
        if (src.startsWith('data:') || src.startsWith('http') || src.startsWith('blob:')) return match;
        // Try exact match
        if (assetMap[src]) return `<img ${pre}src="${assetMap[src]}"${post}>`;
        // Case-insensitive
        const srcLower = src.toLowerCase();
        for (const key of Object.keys(assetMap)) {
          if (key.toLowerCase() === srcLower) return `<img ${pre}src="${assetMap[key]}"${post}>`;
        }
        unresolved.add(src);
        return match;
      });
      // (debug warn removed)
      return result;
    },

    initLua,
    runLuaTrigger,
    runLuaButtonClick: async (chatId: number, data: string): Promise<void> => {
      if (!luaEngine) return;
      try {
        luaEngine.global.set('_btnChatId', String(chatId));
        luaEngine.global.set('_btnData', String(data));
        await luaEngine.doString(`
          if onButtonClick then
            onButtonClick(_btnChatId, _btnData)
          end
        `);
      } catch (e) { console.warn('[runLuaButtonClick]', e); }
    },
    runLuaTriggerByName: async (name: string): Promise<void> => {
      if (!luaEngine) return;
      try {
        luaEngine.global.set('_trigName', String(name));
        await luaEngine.doString(`
          if _triggers and _triggers[_trigName] then
            _triggers[_trigName]()
          end
        `);
      } catch (e) { console.warn('[runLuaTriggerByName]', e); }
    },

    getLuaOutput: (): string[] => [...luaOutput],
    getLuaOutputHTML: (): string => {
      if (!luaEngine) return '';
      const fn = luaEngine.global.get('getOutput');
      return typeof fn === 'function' ? ((fn as () => string)() || '') : '';
    },
    getVariables: (): Record<string, string> => {
      // Merge: defaults → chatVars (chatVars overrides defaults)
      const merged: Record<string, string> = {};
      for (const [k, v] of parseKeyValue(defaultVarStr)) {
        merged['$' + k] = v;
      }
      Object.assign(merged, chatVars);
      return merged;
    },
  };
})();


export default PreviewEngine;
