import { describe, expect, it, vi } from 'vitest';
import type { AssistantDeps, PromptInfo } from './assistant-prompt';
import {
  loadRpPersona,
  buildAssistantPrompt,
  startAssistantCli,
  handleClaudeStart,
  handleCopilotStart,
  handleCodexStart,
  handleGeminiStart,
} from './assistant-prompt';

function createMockDeps(overrides: Partial<AssistantDeps> = {}): AssistantDeps {
  return {
    rpMode: 'off',
    rpCustomText: '',
    hasTerminal: true,
    readPersona: vi.fn(async () => ''),
    getClaudePrompt: vi.fn(async () => ({ fileName: 'test.charx', name: 'TestChar', stats: '3 fields' })),
    writeMcpConfig: vi.fn(async () => 'ok'),
    writeCopilotMcpConfig: vi.fn(async () => 'ok'),
    writeCodexMcpConfig: vi.fn(async () => 'ok'),
    writeGeminiMcpConfig: vi.fn(async () => 'ok'),
    cleanupAgentsMd: vi.fn(async () => {}),
    writeSystemPrompt: vi.fn(async () => ({ filePath: '/tmp/prompt.txt' })),
    writeAgentsMd: vi.fn(async () => {}),
    terminalInput: vi.fn(),
    setStatus: vi.fn(),
    navigatorLike: { platform: 'Linux x86_64' },
    ...overrides,
  };
}

const samplePromptInfo: PromptInfo = { fileName: 'char.charx', name: 'Alice', stats: '5 lorebook, 3 regex' };

describe('loadRpPersona', () => {
  it('returns empty string when rpMode is off', async () => {
    expect(await loadRpPersona({ rpMode: 'off', rpCustomText: '', readPersona: async () => 'x' })).toBe('');
  });

  it('returns custom text when rpMode is custom', async () => {
    expect(await loadRpPersona({ rpMode: 'custom', rpCustomText: 'My persona', readPersona: async () => '' })).toBe(
      'My persona',
    );
  });

  it('calls readPersona for named modes like toki', async () => {
    const readPersona = vi.fn(async () => 'toki text');
    const result = await loadRpPersona({ rpMode: 'toki', rpCustomText: '', readPersona });
    expect(readPersona).toHaveBeenCalledWith('toki');
    expect(result).toBe('toki text');
  });

  it('returns empty string when readPersona returns empty', async () => {
    expect(await loadRpPersona({ rpMode: 'aris', rpCustomText: '', readPersona: async () => '' })).toBe('');
  });
});

describe('buildAssistantPrompt', () => {
  it('returns empty when no promptInfo and rpMode is off', async () => {
    const deps = createMockDeps();
    expect(await buildAssistantPrompt(null, false, deps)).toBe('');
  });

  it('returns RP persona when no promptInfo but rpMode is on', async () => {
    const deps = createMockDeps({ rpMode: 'custom', rpCustomText: 'Be friendly' });
    expect(await buildAssistantPrompt(null, false, deps)).toBe('Be friendly');
  });

  it('builds full prompt with file info', async () => {
    const deps = createMockDeps();
    const result = await buildAssistantPrompt(samplePromptInfo, false, deps);
    expect(result).toContain('AI 어시스턴트');
    expect(result).toContain('char.charx');
    expect(result).toContain('Alice');
    expect(result).toContain('.charx 파일 구조');
    expect(result).toContain('편집 중인 항목의 내용을 알려주면');
  });

  it('includes MCP tool docs when connected', async () => {
    const deps = createMockDeps();
    const result = await buildAssistantPrompt(samplePromptInfo, true, deps);
    expect(result).toContain('RisuToki MCP 도구');
    expect(result).toContain('list_fields');
    expect(result).toContain('replace_in_lua');
    expect(result).toContain('replace_in_css');
    expect(result).toContain('list_greetings');
    expect(result).toContain('read_greeting');
    expect(result).toContain('list_triggers');
    expect(result).toContain('read_trigger');
    expect(result).toContain('list_reference_lorebook');
    expect(result).toContain('read_reference_lorebook');
    expect(result).toContain('list_skills');
    expect(result).toContain('읽기 규칙');
    expect(result).toContain('사용 금지');
    expect(result).not.toContain('편집 중인 항목의 내용을 알려주면');
  });

  it('appends RP persona section when rpMode is on', async () => {
    const deps = createMockDeps({ rpMode: 'toki', readPersona: vi.fn(async () => 'persona text') });
    const result = await buildAssistantPrompt(samplePromptInfo, false, deps);
    expect(result).toContain('== Response Persona ==');
    expect(result).toContain('persona text');
  });
});

describe('startAssistantCli', () => {
  it('shows error when terminal is not available', async () => {
    const deps = createMockDeps({ hasTerminal: false });
    await startAssistantCli('claude', deps);
    expect(deps.setStatus).toHaveBeenCalledWith('터미널이 준비되지 않았습니다');
    expect(deps.terminalInput).not.toHaveBeenCalled();
  });

  it('configures MCP and launches claude with system prompt', async () => {
    const deps = createMockDeps();
    await startAssistantCli('claude', deps);
    expect(deps.writeMcpConfig).toHaveBeenCalled();
    expect(deps.cleanupAgentsMd).toHaveBeenCalled();
    expect(deps.writeSystemPrompt).toHaveBeenCalled();
    expect(deps.terminalInput).toHaveBeenCalled();
    expect(deps.setStatus).toHaveBeenCalledWith(expect.stringContaining('Claude Code'));
  });

  it('launches claude without system prompt when prompt is empty', async () => {
    const deps = createMockDeps({
      getClaudePrompt: vi.fn(async () => null),
      writeMcpConfig: vi.fn(async () => null),
    });
    await startAssistantCli('claude', deps);
    expect(deps.writeSystemPrompt).not.toHaveBeenCalled();
    expect(deps.terminalInput).toHaveBeenCalled();
  });

  it('writes agents.md for copilot', async () => {
    const deps = createMockDeps();
    await startAssistantCli('copilot', deps);
    expect(deps.writeCopilotMcpConfig).toHaveBeenCalled();
    expect(deps.writeAgentsMd).toHaveBeenCalled();
    expect(deps.setStatus).toHaveBeenCalledWith(expect.stringContaining('Copilot'));
  });

  it('writes agents.md for codex', async () => {
    const deps = createMockDeps();
    await startAssistantCli('codex', deps);
    expect(deps.writeCodexMcpConfig).toHaveBeenCalled();
    expect(deps.writeAgentsMd).toHaveBeenCalled();
    expect(deps.setStatus).toHaveBeenCalledWith(expect.stringContaining('Codex'));
  });

  it('writes agents.md for gemini', async () => {
    const deps = createMockDeps();
    await startAssistantCli('gemini', deps);
    expect(deps.writeGeminiMcpConfig).toHaveBeenCalled();
    expect(deps.writeAgentsMd).toHaveBeenCalled();
    expect(deps.setStatus).toHaveBeenCalledWith(expect.stringContaining('Gemini'));
  });

  it('sends bootstrap command on win32', async () => {
    const deps = createMockDeps({ navigatorLike: { userAgentData: { platform: 'Windows' } } });
    await startAssistantCli('copilot', deps);
    const calls = (deps.terminalInput as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls.some((c: string) => c.includes('function global:copilot'))).toBe(true);
  });
});

describe('handle* convenience wrappers', () => {
  it('handleClaudeStart delegates to startAssistantCli with claude', async () => {
    const deps = createMockDeps();
    await handleClaudeStart(deps);
    expect(deps.writeMcpConfig).toHaveBeenCalled();
  });

  it('handleCopilotStart delegates to startAssistantCli with copilot', async () => {
    const deps = createMockDeps();
    await handleCopilotStart(deps);
    expect(deps.writeCopilotMcpConfig).toHaveBeenCalled();
  });

  it('handleCodexStart delegates to startAssistantCli with codex', async () => {
    const deps = createMockDeps();
    await handleCodexStart(deps);
    expect(deps.writeCodexMcpConfig).toHaveBeenCalled();
  });

  it('handleGeminiStart delegates to startAssistantCli with gemini', async () => {
    const deps = createMockDeps();
    await handleGeminiStart(deps);
    expect(deps.writeGeminiMcpConfig).toHaveBeenCalled();
  });
});
