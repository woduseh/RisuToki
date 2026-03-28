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
    // Pluni persona fields (TDD: will be added to AssistantDeps)
    pluniCategory: 'solo',
    syncCopilotAgentProfiles: vi.fn(async () => {}),
    ...overrides,
  } as AssistantDeps;
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

  // ── Pluni persona integration (TDD: implementation pending) ──

  it('builds dynamic persona for pluni mode without calling readPersona', async () => {
    const readPersona = vi.fn(async () => 'static pluni file');
    const result = await loadRpPersona({
      rpMode: 'pluni',
      rpCustomText: '',
      readPersona,
      pluniCategory: 'solo',
    });

    // Must NOT fall back to reading static persona file
    expect(readPersona).not.toHaveBeenCalled();

    // Must contain all three advisor names
    expect(result).toContain('Pluni');
    expect(result).toContain('Kotone');
    expect(result).toContain('Sophia');

    // Must contain the 1:1:1 seat hint
    expect(result).toContain('1:1:1');
  });

  it('includes category-specific focus when pluniCategory is world-sim', async () => {
    const result = await loadRpPersona({
      rpMode: 'pluni',
      rpCustomText: '',
      readPersona: vi.fn(async () => ''),
      pluniCategory: 'world-sim',
    });

    // Should reference the world-sim category focus
    expect(result).toContain('world-sim');
    expect(result).not.toContain('Focus (solo)');
  });

  it('defaults to solo category when pluniCategory is omitted', async () => {
    const readPersona = vi.fn(async () => '');
    const result = await loadRpPersona({
      rpMode: 'pluni',
      rpCustomText: '',
      readPersona,
    });

    expect(readPersona).not.toHaveBeenCalled();
    expect(result).toContain('Pluni');
    expect(result).toContain('solo');
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

  // ── Pluni persona in prompt (TDD: implementation pending) ──

  it('includes multi-advisor content with seat hint when rpMode is pluni (copilot context)', async () => {
    const deps = createMockDeps({ rpMode: 'pluni' });
    const result = await buildAssistantPrompt(samplePromptInfo, true, deps);

    // Prompt must contain all three advisor summaries
    expect(result).toContain('Pluni');
    expect(result).toContain('Kotone');
    expect(result).toContain('Sophia');
    // Must contain the seat ratio hint
    expect(result).toContain('1:1:1');
  });

  it('includes single-session synthesis guidance for pluni without copilot context', async () => {
    const deps = createMockDeps({
      rpMode: 'pluni',
      syncCopilotAgentProfiles: undefined,
    });
    const result = await buildAssistantPrompt(samplePromptInfo, false, deps);

    // Must still contain all three advisor names
    expect(result).toContain('Pluni');
    expect(result).toContain('Kotone');
    expect(result).toContain('Sophia');
    // Seat hint should still be present
    expect(result).toContain('1:1:1');
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

  // ── Pluni persona integration (TDD: implementation pending) ──

  it('calls syncCopilotAgentProfiles when copilot + pluni mode', async () => {
    const syncFn = vi.fn(async () => {});
    const deps = createMockDeps({
      rpMode: 'pluni',
      pluniCategory: 'solo',
      syncCopilotAgentProfiles: syncFn,
    });
    await startAssistantCli('copilot', deps);

    expect(syncFn).toHaveBeenCalledWith('solo', undefined);
    expect(deps.writeAgentsMd).toHaveBeenCalled();
  });

  it('forwards projectRoot to writeAgentsMd when set in deps', async () => {
    const writeAgentsMd = vi.fn(async () => {});
    const deps = createMockDeps({
      projectRoot: '/my/terminal/cwd',
      writeAgentsMd,
    });
    await startAssistantCli('copilot', deps);

    // writeAgentsMd should receive the projectRoot as second argument
    expect(writeAgentsMd).toHaveBeenCalledWith(expect.any(String), '/my/terminal/cwd');
  });

  it('forwards projectRoot to syncCopilotAgentProfiles when set in deps', async () => {
    const syncFn = vi.fn(async () => {});
    const deps = createMockDeps({
      rpMode: 'pluni',
      pluniCategory: 'solo',
      syncCopilotAgentProfiles: syncFn,
      projectRoot: '/my/terminal/cwd',
    });
    await startAssistantCli('copilot', deps);

    expect(syncFn).toHaveBeenCalledWith('solo', '/my/terminal/cwd');
  });

  it('passes undefined projectRoot when not set in deps', async () => {
    const writeAgentsMd = vi.fn(async () => {});
    const deps = createMockDeps({ writeAgentsMd });
    // projectRoot is not set (undefined)
    await startAssistantCli('copilot', deps);

    expect(writeAgentsMd).toHaveBeenCalledWith(expect.any(String), undefined);
  });

  it('sets status mentioning 플루니 연구소 when copilot + pluni', async () => {
    const deps = createMockDeps({
      rpMode: 'pluni',
      pluniCategory: 'solo',
    });
    await startAssistantCli('copilot', deps);

    expect(deps.setStatus).toHaveBeenCalledWith(expect.stringContaining('플루니 연구소'));
  });

  it('does not call syncCopilotAgentProfiles for non-copilot agent + pluni', async () => {
    const syncFn = vi.fn(async () => {});
    const deps = createMockDeps({
      rpMode: 'pluni',
      pluniCategory: 'multi-char',
      syncCopilotAgentProfiles: syncFn,
    });
    await startAssistantCli('claude', deps);

    expect(syncFn).not.toHaveBeenCalled();
  });

  it('does not call syncCopilotAgentProfiles for copilot + non-pluni mode', async () => {
    const syncFn = vi.fn(async () => {});
    const deps = createMockDeps({
      rpMode: 'toki',
      syncCopilotAgentProfiles: syncFn,
    });
    await startAssistantCli('copilot', deps);

    expect(syncFn).not.toHaveBeenCalled();
  });

  it('calls cleanupAgentsMd for AGENTS.md agents when rpMode is not pluni', async () => {
    const deps = createMockDeps({ rpMode: 'toki' });
    await startAssistantCli('copilot', deps);

    expect(deps.cleanupAgentsMd).toHaveBeenCalled();
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
