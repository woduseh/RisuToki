export type RuntimePlatform = 'win32' | 'darwin' | 'linux' | string;
export type AssistantAgent = 'claude' | 'copilot' | 'codex';

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
  if (platform === 'win32') {
    if (agent === 'copilot') {
      return 'copilot.bat';
    }
    return `${agent}.cmd`;
  }

  return agent;
}

export function buildWindowsAssistantBootstrapCommand(): string {
  return [
    "$ErrorActionPreference='SilentlyContinue'",
    "function global:__TokiInvokeCommand([string]$primary,[string[]]$fallbacks,[object[]]$argv){ foreach ($candidate in @($primary) + $fallbacks) { $resolved = Get-Command $candidate -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1; if ($resolved) { & $resolved.Source @argv; return } }; & $primary @argv }",
    "function global:copilot { param([Parameter(ValueFromRemainingArguments = $true)][object[]]$argv) __TokiInvokeCommand 'copilot.bat' @('copilot.cmd', 'copilot.exe') $argv }",
    "function global:claude { param([Parameter(ValueFromRemainingArguments = $true)][object[]]$argv) __TokiInvokeCommand 'claude.cmd' @('claude.exe', 'claude.bat') $argv }",
    "function global:codex { param([Parameter(ValueFromRemainingArguments = $true)][object[]]$argv) __TokiInvokeCommand 'codex.cmd' @('codex.exe', 'codex.bat') $argv }",
    "$ErrorActionPreference='Continue'\r"
  ].join('; ');
}

export function buildAssistantLaunchCommand({
  agent,
  hasInitPrompt = false,
  platform,
  systemPromptPath = ''
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

  if (agent === 'copilot' || agent === 'codex') {
    return `${executable}\r`;
  }

  throw new Error(`Unsupported assistant agent: ${agent}`);
}
