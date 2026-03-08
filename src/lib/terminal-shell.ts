interface TerminalCandidate {
  label: string;
  shell: string;
  args: string[];
}

interface LaunchAttempt extends TerminalCandidate {
  cwd: string;
  isFallbackCwd: boolean;
}

interface LaunchOptions {
  platform?: string;
  env?: Record<string, string | undefined>;
  cwd?: string;
  fallbackCwd?: string;
}

function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

export function buildWindowsTerminalBootstrap(): string {
  return `
$ErrorActionPreference = 'SilentlyContinue'
function global:__TokiInvokeCommand([string]$primary, [string[]]$fallbacks, [object[]]$argv) {
  foreach ($candidate in @($primary) + $fallbacks) {
    $resolved = Get-Command $candidate -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($resolved) {
      & $resolved.Source @argv
      return
    }
  }

  & $primary @argv
}
function global:copilot { param([Parameter(ValueFromRemainingArguments = $true)][object[]]$argv) __TokiInvokeCommand 'copilot.ps1' @('copilot.bat', 'copilot.cmd', 'copilot.exe') $argv }
function global:claude { param([Parameter(ValueFromRemainingArguments = $true)][object[]]$argv) __TokiInvokeCommand 'claude.cmd' @('claude.exe', 'claude.bat') $argv }
function global:codex { param([Parameter(ValueFromRemainingArguments = $true)][object[]]$argv) __TokiInvokeCommand 'codex.cmd' @('codex.exe', 'codex.bat') $argv }
$ErrorActionPreference = 'Continue'
Clear-Host
`;
}

export function getTerminalLaunchCandidates(options: LaunchOptions = {}): TerminalCandidate[] {
  const platform = options.platform || process.platform;
  const env = options.env || process.env;

  if (platform === 'win32') {
    const bootstrap = encodePowerShellCommand(buildWindowsTerminalBootstrap());
    return [
      {
        label: 'Windows PowerShell',
        shell: 'powershell.exe',
        args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-EncodedCommand', bootstrap]
      },
      {
        label: 'PowerShell 7',
        shell: 'pwsh.exe',
        args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-EncodedCommand', bootstrap]
      },
      {
        label: '명령 프롬프트',
        shell: 'cmd.exe',
        args: ['/K', 'chcp 65001 >NUL']
      }
    ];
  }

  const shells = [env.SHELL || 'bash', 'bash', 'sh'];
  const uniqueShells = [...new Set(shells.filter(Boolean))];
  return uniqueShells.map((shell) => ({
    label: shell,
    shell,
    args: []
  }));
}

export function buildTerminalLaunchAttempts(options: LaunchOptions = {}): LaunchAttempt[] {
  const cwdCandidates = [...new Set([options.cwd, options.fallbackCwd].filter(Boolean))] as string[];
  const candidates = getTerminalLaunchCandidates(options);
  const attempts: LaunchAttempt[] = [];

  for (const candidate of candidates) {
    for (const cwd of cwdCandidates) {
      attempts.push({
        ...candidate,
        cwd,
        isFallbackCwd: cwd !== options.cwd
      });
    }
  }

  return attempts;
}
