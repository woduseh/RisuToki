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
function global:__TokiJsonString([string]$value) {
  if ($null -eq $value) { return '""' }
  return ConvertTo-Json -Compress $value
}
function global:__TokiWriteCodexMcpConfig {
  if (-not $env:TOKI_PORT -or -not $env:TOKI_TOKEN -or -not $env:TOKI_MCP_SERVER_PATH) { return }

  $configDir = Join-Path (Get-Location) '.codex'
  $configPath = Join-Path $configDir 'config.toml'
  New-Item -ItemType Directory -Force -Path $configDir | Out-Null

  $existing = ''
  if (Test-Path -LiteralPath $configPath) {
    $existing = Get-Content -LiteralPath $configPath -Raw
  }

  $existing = [regex]::Replace($existing, '(?s)\\r?\\n?# --- RisuToki MCP \\(auto-generated, do not edit\\) ---.*?# --- /RisuToki MCP ---[^\\S\\r\\n]*(?:\\r?\\n)?', "\`n")
  $kept = New-Object System.Collections.Generic.List[string]
  $skip = $false
  foreach ($line in ($existing -split "\\r?\\n")) {
    if ($line -match '^\\s*\\[([^\\]]+)\\]\\s*(?:#.*)?$') {
      $table = $Matches[1].Trim()
      $skip = ($table -eq 'mcp_servers.risutoki' -or $table -eq 'mcp_servers.risutoki.env')
    }
    if (-not $skip) { $kept.Add($line) }
  }

  $serverPath = $env:TOKI_MCP_SERVER_PATH.Replace('\\', '/')
  $block = @(
    '# --- RisuToki MCP (auto-generated, do not edit) ---',
    '[mcp_servers.risutoki]',
    'command = "node"',
    ('args = [' + (__TokiJsonString $serverPath) + ']'),
    '',
    '[mcp_servers.risutoki.env]',
    ('TOKI_PORT = ' + (__TokiJsonString $env:TOKI_PORT)),
    ('TOKI_TOKEN = ' + (__TokiJsonString $env:TOKI_TOKEN)),
    '# --- /RisuToki MCP ---'
  ) -join "\`n"

  $preserved = (($kept -join "\`n") -replace "(\`r?\`n){3,}", "\`n\`n").TrimEnd()
  $content = if ($preserved) { $preserved + "\`n\`n" + $block + "\`n" } else { $block + "\`n" }
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($configPath, $content, $utf8NoBom)
}
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
function global:codex { param([Parameter(ValueFromRemainingArguments = $true)][object[]]$argv) __TokiWriteCodexMcpConfig; __TokiInvokeCommand 'codex.cmd' @('codex.exe', 'codex.bat') $argv }
function global:codex.cmd { param([Parameter(ValueFromRemainingArguments = $true)][object[]]$argv) __TokiWriteCodexMcpConfig; __TokiInvokeCommand 'codex.cmd' @('codex.exe', 'codex.bat') $argv }
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
        args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-EncodedCommand', bootstrap],
      },
      {
        label: 'PowerShell 7',
        shell: 'pwsh.exe',
        args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-EncodedCommand', bootstrap],
      },
      {
        label: '명령 프롬프트',
        shell: 'cmd.exe',
        args: ['/K', 'chcp 65001 >NUL'],
      },
    ];
  }

  const shells = [env.SHELL || 'bash', 'bash', 'sh'];
  const uniqueShells = [...new Set(shells.filter(Boolean))];
  return uniqueShells.map((shell) => ({
    label: shell,
    shell,
    args: [],
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
        isFallbackCwd: cwd !== options.cwd,
      });
    }
  }

  return attempts;
}
