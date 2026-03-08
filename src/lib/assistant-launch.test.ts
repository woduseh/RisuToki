import { describe, expect, it } from 'vitest';
import {
  buildAssistantLaunchCommand,
  buildWindowsAssistantBootstrapCommand,
  detectRuntimePlatform
} from './assistant-launch';

describe('assistant launch helpers', () => {
  it('detects common renderer platforms', () => {
    expect(detectRuntimePlatform({ userAgentData: { platform: 'Windows' } })).toBe('win32');
    expect(detectRuntimePlatform({ platform: 'MacIntel' })).toBe('darwin');
    expect(detectRuntimePlatform({ platform: 'Linux x86_64' })).toBe('linux');
  });

  it('uses cmd shims for Windows assistant launches', () => {
    expect(buildAssistantLaunchCommand({ agent: 'copilot', platform: 'win32' })).toBe('copilot.ps1\r');
    expect(buildAssistantLaunchCommand({ agent: 'codex', platform: 'win32' })).toBe('codex.cmd\r');
    expect(buildAssistantLaunchCommand({ agent: 'claude', platform: 'win32' })).toBe('claude.cmd\r');
  });

  it('builds prompt-appending commands per shell platform', () => {
    expect(buildAssistantLaunchCommand({
      agent: 'claude',
      hasInitPrompt: true,
      platform: 'win32',
      systemPromptPath: 'C:\\temp\\prompt.txt'
    })).toBe("claude.cmd --append-system-prompt (Get-Content -Raw 'C:\\temp\\prompt.txt')\r");

    expect(buildAssistantLaunchCommand({
      agent: 'claude',
      hasInitPrompt: true,
      platform: 'linux',
      systemPromptPath: '/tmp/prompt.txt'
    })).toBe("claude --append-system-prompt \"$(cat '/tmp/prompt.txt')\"\r");
  });

  it('throws for unsupported agents or missing prompt paths', () => {
    expect(() => buildAssistantLaunchCommand({
      agent: 'unknown',
      platform: 'win32'
    })).toThrow('Unsupported assistant agent');

    expect(() => buildAssistantLaunchCommand({
      agent: 'claude',
      hasInitPrompt: true,
      platform: 'win32'
    })).toThrow('systemPromptPath is required');
  });

  it('builds a Windows bootstrap command that overrides bare assistant names', () => {
    const command = buildWindowsAssistantBootstrapCommand();

    expect(command).toContain("function global:copilot");
    expect(command).toContain("copilot.ps1");
    expect(command).toContain("function global:claude");
    expect(command).toContain("function global:codex");
    expect(command.endsWith('\r')).toBe(true);
  });
});
