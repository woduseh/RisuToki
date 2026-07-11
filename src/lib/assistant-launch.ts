export type RuntimePlatform = 'win32' | 'darwin' | 'linux' | string;
export type AssistantAgent = 'claude' | 'copilot' | 'codex' | 'antigravity';

interface NavigatorLike {
  platform?: string;
  userAgentData?: {
    platform?: string;
  };
}

export interface AssistantLaunchOptions {
  agent: AssistantAgent | string;
  hasInitPrompt?: boolean;
  platform?: RuntimePlatform;
  systemPromptPath?: string;
}

export function detectRuntimePlatform(navigatorLike: NavigatorLike = globalThis.navigator): RuntimePlatform {
  const userAgentPlatform = navigatorLike?.userAgentData?.platform;
  const legacyPlatform = navigatorLike?.platform;
  const source = String(userAgentPlatform || legacyPlatform || '').toLowerCase();

  if (source.includes('win')) return 'win32';
  if (source.includes('mac')) return 'darwin';
  if (source.includes('linux')) return 'linux';
  return source;
}

function getCliExecutable(agent: AssistantAgent | string, platform: RuntimePlatform): string {
  const executable = agent === 'antigravity' ? 'agy' : agent;
  if (platform === 'win32') {
    if (agent === 'antigravity') {
      return executable;
    }
    if (agent === 'copilot') {
      return 'copilot.ps1';
    }
    return `${executable}.cmd`;
  }

  return executable;
}

export function buildWindowsAssistantBootstrapCommand(): string {
  return [
    "$ErrorActionPreference='SilentlyContinue'",
    'function global:__TokiInvokeCommand([string]$primary,[string[]]$fallbacks,[object[]]$argv){ foreach ($candidate in @($primary) + $fallbacks) { $resolved = Get-Command $candidate -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1; if ($resolved) { & $resolved.Source @argv; return } }; & $primary @argv }',
    "function global:copilot { param([Parameter(ValueFromRemainingArguments = $true)][object[]]$argv) __TokiInvokeCommand 'copilot.ps1' @('copilot.bat', 'copilot.cmd', 'copilot.exe') $argv }",
    "function global:claude { param([Parameter(ValueFromRemainingArguments = $true)][object[]]$argv) __TokiInvokeCommand 'claude.cmd' @('claude.exe', 'claude.bat') $argv }",
    "function global:codex { param([Parameter(ValueFromRemainingArguments = $true)][object[]]$argv) __TokiInvokeCommand 'codex.cmd' @('codex.exe', 'codex.bat') $argv }",
    "function global:agy { param([Parameter(ValueFromRemainingArguments = $true)][object[]]$argv) __TokiInvokeCommand 'agy.cmd' @('agy.exe', 'agy.bat') $argv }",
    "$ErrorActionPreference='Continue'\r",
  ].join('; ');
}

export function buildAssistantLaunchCommand({
  agent,
  hasInitPrompt = false,
  platform,
  systemPromptPath = '',
}: AssistantLaunchOptions): string {
  const normalizedPlatform = platform || detectRuntimePlatform();
  const executable = getCliExecutable(agent, normalizedPlatform);

  if (agent === 'claude') {
    if (!hasInitPrompt) {
      return `${executable}\r`;
    }

    if (!systemPromptPath) {
      throw new Error('systemPromptPath is required when hasInitPrompt is true.');
    }

    if (normalizedPlatform === 'win32') {
      return `${executable} --append-system-prompt (Get-Content -Raw '${systemPromptPath}')\r`;
    }

    return `${executable} --append-system-prompt "$(cat '${systemPromptPath}')"\r`;
  }

  if (agent === 'copilot' || agent === 'codex' || agent === 'antigravity') {
    return `${executable}\r`;
  }

  throw new Error(`Unsupported assistant agent: ${agent}`);
}
