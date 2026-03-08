export const AI_AGENT_LABELS = {
  claude: 'Claude Code',
  copilot: 'GitHub Copilot CLI',
  codex: 'Codex'
} as const;

export interface AiAgentLabels {
  claude: string;
  codex: string;
  copilot: string;
}

export interface AssistantWelcomeInfo {
  email: string | null;
  label: string;
  model: string | null;
  path: string | null;
}

export interface ChatChoice {
  label: string;
  value: string;
}

export interface ApplySelectedChoiceResult {
  applied: boolean;
  selectedLabel: string;
  text: string;
}

export interface DisplayChatMessage {
  text?: unknown;
  type?: string;
}

export function stripAnsi(text: unknown): string {
  return String(text ?? '')
    .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B\[[012]?C/g, ' ')
    .replace(/\x1B\[\d*[ABDEFGHJKSTfn]/g, '\n')
    .replace(/\x1B\[\d+;\d+[Hf]/g, '\n')
    .replace(/\x1B\[\d+C/g, '\n')
    .replace(/\x1B\[\d*[JK]/g, '\n')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B[@-_]/g, '')
    .replace(/\x1B[^a-zA-Z\n]*[a-zA-Z]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '');
}

export function isSpinnerNoise(text: unknown): boolean {
  const compact = String(text ?? '').replace(/[\s\n\r]/g, '');
  if (compact.length === 0) return true;

  const core = compact.replace(/[·✻✳✢✶✽✾✿*●○⊙❯❮►◄▶◀─━═╭╮╰╯│┃]/g, '');
  if (core.length === 0) return true;
  if (/^[A-Z][a-z]+…$/.test(core)) return true;
  if (/^[A-Z][a-z]+…?\s*\(thinking\)$/.test(core)) return true;
  if (/^\(thinking\)$/.test(core)) return true;
  if (/^[A-Za-z…]+$/.test(core) && core.length <= 8) return true;
  if (/^(esc|interrupt|Cursor)$/.test(core)) return true;
  return false;
}

export function isAssistantWelcomeBanner(text: unknown): boolean {
  return /^---\s*(Claude Code|GitHub Copilot CLI|Codex)\s*---/i.test(String(text ?? '').trim());
}

function detectAssistantWelcomeInfo(
  text: unknown,
  labels: AiAgentLabels = AI_AGENT_LABELS
): AssistantWelcomeInfo | null {
  const source = String(text ?? '');
  if (source.length < 80) return null;

  const pathMatch = source.match(/~[\/\\][^\s│╯╰\n]+|[A-Z]:\\[^\s│╯╰\n]+/);
  const emailMatch = source.match(/[\w.+-]+@[\w.-]+/);

  if ((source.includes('▟█▙') || source.includes('▛▜') || source.includes('█▙') || (source.includes('Welcome') && source.includes('Claude'))) && source.length > 120) {
    return {
      label: labels.claude,
      model: source.match(/(Opus|Sonnet|Haiku)\s*[\d.]+/i)?.[0] ?? null,
      path: pathMatch?.[0].trim() ?? null,
      email: emailMatch?.[0] ?? null
    };
  }

  if (/(GitHub Copilot CLI|Copilot CLI)/i.test(source) && (/(\/login|\/help|\/mcp|\/model|\/agent|\/tasks|\/theme)/i.test(source) || /What can you do\?/i.test(source))) {
    return {
      label: labels.copilot,
      model: source.match(/(Claude Sonnet 4\.5|Claude Sonnet 4|Claude Opus [\d.]+|GPT-[\w.-]+|Gemini[^\n]+)/i)?.[0] ?? null,
      path: pathMatch?.[0].trim() ?? null,
      email: emailMatch?.[0] ?? null
    };
  }

  if (/\bCodex\b/i.test(source) && (/\bWelcome\b/i.test(source) || /AGENTS\.md/i.test(source) || /approval/i.test(source) || /cwd/i.test(source))) {
    return {
      label: labels.codex,
      model: source.match(/\b(?:gpt-[\w.]+|o\d(?:-mini)?|codex[-\w.]*)\b/i)?.[0] ?? null,
      path: pathMatch?.[0].trim() ?? null,
      email: emailMatch?.[0] ?? null
    };
  }

  return null;
}

export function cleanTuiOutput(text: unknown, labels: AiAgentLabels = AI_AGENT_LABELS): string {
  const welcomeInfo = detectAssistantWelcomeInfo(text, labels);
  if (welcomeInfo) {
    let clean = `--- ${welcomeInfo.label} ---`;
    if (welcomeInfo.model) clean += `\n${welcomeInfo.model}`;
    if (welcomeInfo.email) clean += ` (${welcomeInfo.email})`;
    if (welcomeInfo.path) clean += `\n${welcomeInfo.path}`;
    clean += '\n준비 완료!';
    return clean;
  }

  let cleaned = String(text ?? '')
    .replace(/esc\s+to\s+interrupt/gi, '')
    .replace(/\(thinking\)/g, '')
    .replace(/[╭╮╰╯┌┐└┘├┤┬┴┼│─║═╔╗╚╝╠╣╦╩╬╟╢╤╧╪┃━┏┓┗┛┣┫┳┻╋⎿⎾⎡⎤⎣⎦]/g, '')
    .replace(/[▟▙▐▛▜▌▝█▘░▒▓▀▄▐▌✻✳⠀-⣿]/g, '')
    .replace(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏·✢✶✽✾✿○◉⊙*]/g, '')
    .replace(/[❯❮►◄▶◀]/g, '>')
    .replace(/ {3,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n');

  cleaned = cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter((line, index, lines) => {
      if (index === 0 && line === '') return false;
      if (line === '' && index > 0 && lines[index - 1] === '') return false;
      if (/^>?\s*$/.test(line)) return false;
      if (/^[a-zA-Z]{1,2}$/.test(line)) return false;
      if (/^[a-zA-Z\s]+$/.test(line) && line.replace(/\s/g, '').length <= 5) return false;
      if (/^[a-zA-Z]+(…|\.{2,})\s*>?\s*$/.test(line)) return false;
      if (/^(Billowing|Thinking|Processing|Warming|Spinning|Bouncing|Crystallizing|Pondering|Meditating|Coalescing|Germinating)[.…]*\s*$/i.test(line)) return false;
      if (/ctrl\+[a-z]/i.test(line) && line.length < 80) return false;
      if (/^\?.*shortcuts/i.test(line)) return false;
      if (/for shortcuts/.test(line)) return false;
      if (/Notepad\.exe/i.test(line)) return false;
      if (/^Try\s+"/.test(line)) return false;
      if (/^Tip:/i.test(line)) return false;
      if (/Tip:\s*You have/i.test(line)) return false;
      if (/\/passes\s*$/i.test(line)) return false;
      if (/\(MCP\)/i.test(line)) return false;
      if (/^risutoki\s*-\s*/i.test(line)) return false;
      if (/^[A-Z][a-z]+(ing|ling|ting|ring)(…|\.{2,})/i.test(line)) return false;
      if (/^[\[\]{},\s]*$/.test(line)) return false;
      if (/^"[^"]+"\s*:\s*(".*"|[\d\[\{])/.test(line) && line.length < 80) return false;
      if (/^"[^"]+"\s*:\s*\[?\s*$/.test(line)) return false;
      if (/Use\s+\/statusline/i.test(line)) return false;
      if (/^Run \/init/.test(line)) return false;
      if (/^Recent activity$/i.test(line)) return false;
      if (/^No recent activity$/i.test(line)) return false;
      if (/^Tips for getting started$/i.test(line)) return false;
      if (/fix lint errors/i.test(line) && line.length < 30) return false;
      if (/^0;/.test(line)) return false;
      if (/(Claude Code|GitHub Copilot CLI|Codex) has switched/i.test(line)) return false;
      if (/getting-started/i.test(line)) return false;
      if (/\/ide for/i.test(line)) return false;
      if (/^[-─━═~_.>*\s]+$/.test(line) && line.length > 0) return false;
      if (/^PS [A-Z]:\\/i.test(line)) return false;
      if (/aka\.ms\/PS/i.test(line)) return false;
      if (/^Windows PowerShell$/i.test(line)) return false;
      if (/^Copyright.*Microsoft/i.test(line)) return false;
      if (/Would you like to proceed/i.test(line)) return false;
      if (/written up a plan/i.test(line)) return false;
      if (/ready to execute/i.test(line)) return false;
      if (/auto-accept edits/i.test(line)) return false;
      if (/manually approve edits/i.test(line)) return false;
      if (/clear context and/i.test(line)) return false;
      if (/Type here to tell (Claude|Copilot)/i.test(line)) return false;
      if (/shift\+tab\)/i.test(line)) return false;
      if (/Enter to select/i.test(line)) return false;
      if (/Esc to cancel/i.test(line)) return false;
      if (/to navigate/i.test(line) && line.length < 50) return false;
      if (/^>\s*\d+\.\s*(Yes|No),?\s/i.test(line)) return false;
      if (/^>\s+\S/.test(line) && /\d\.\s+(Yes|Type|No)/i.test(line)) return false;
      if (/^\(thought\s+for\s/i.test(line)) return false;
      if (/^\(thinking\)/i.test(line)) return false;
      if (/^□\s/.test(line)) return false;
      if (/^esc\s+to\s+interrupt/i.test(line)) return false;
      if (/^\$[\d.]+\s+\d+k?\s+tokens?/i.test(line)) return false;
      if (/^Total cost/i.test(line)) return false;
      if (/^Total duration/i.test(line)) return false;
      if (/^Tool use$/i.test(line)) return false;
      if (/^Do you want to proceed/i.test(line)) return false;
      if (/^Yes,?\s+and\s+don't\s+ask/i.test(line)) return false;
      if (/^\d+\.\s*Yes,?\s+(and\s+don't|allow)/i.test(line)) return false;
      if (/^Running…$/i.test(line)) return false;
      if (/^Allowed\s/i.test(line)) return false;
      return true;
    })
    .join('\n')
    .trim();

  if (cleaned.includes('●')) {
    const extracted = cleaned.slice(cleaned.lastIndexOf('●') + 1).trim();
    if (extracted.length > 0) cleaned = extracted;
  }

  cleaned = cleaned.replace(/●/g, '').trim();

  const lines = cleaned.split('\n');
  while (lines.length > 0 && /^>\s+\S/.test(lines[lines.length - 1])) {
    lines.pop();
  }

  return lines.join('\n').trim();
}

export function extractChatChoices(text: unknown): ChatChoice[] {
  const choices: ChatChoice[] = [];

  for (const line of String(text ?? '').split('\n')) {
    const stripped = line.replace(/^\s*>\s*/, '').trim();
    const match = stripped.match(/^(\d+)\s*[.)]\s*(.+)/);
    if (match) {
      choices.push({ value: match[1], label: `${match[1]}. ${match[2].trim()}` });
    }
  }

  if (choices.length < 2) return [];

  const numbers = choices.map((choice) => Number.parseInt(choice.value, 10));
  if (numbers[0] !== 1) return [];

  for (let index = 1; index < numbers.length; index += 1) {
    if (numbers[index] !== numbers[index - 1] + 1) {
      return [];
    }
  }

  return choices;
}

export function applySelectedChoice(text: unknown, value: string): ApplySelectedChoiceResult {
  const choices = extractChatChoices(text);
  if (choices.length < 2) {
    return {
      applied: false,
      selectedLabel: String(value),
      text: String(text ?? '')
    };
  }

  const selected = choices.find((choice) => choice.value === value);
  const filtered = String(text ?? '')
    .split('\n')
    .filter((line) => {
      const stripped = line.replace(/^\s*>\s*/, '').trim();
      return !/^\d+\s*[.)]\s+/.test(stripped);
    })
    .join('\n')
    .trim();

  return {
    applied: true,
    selectedLabel: selected ? selected.label : String(value),
    text: filtered
      ? `${filtered}\n\n> ${selected ? selected.label : value}`
      : (selected ? selected.label : String(value))
  };
}

export function filterDisplayChatMessages<T extends DisplayChatMessage>(messages: T[]): T[] {
  return messages.filter((message) => {
    const text = String(message?.text ?? '').trim();
    if (!text) return false;
    if (message.type === 'user') return true;
    if (/[\uAC00-\uD7AF\u3130-\u318F\u4E00-\u9FFF]/.test(text)) return true;
    return text.split('\n').some((line) => line.trim().length >= 6);
  });
}

export function removeCommandEcho(text: unknown, lastSentCommand = ''): string {
  if (!lastSentCommand) return String(text ?? '');

  const normalizedCommand = lastSentCommand.replace(/\s+/g, '');
  return String(text ?? '')
    .split('\n')
    .filter((line) => {
      const normalizedLine = line.replace(/^[>❯]\s*/, '').replace(/\s+/g, '').trim();
      return normalizedLine !== normalizedCommand;
    })
    .join('\n');
}
