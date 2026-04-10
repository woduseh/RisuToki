// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseFormatingOrder, parsePromptTemplate } from './risup-prompt-model';
import { diffRisupFormatingOrders, diffRisupPromptData, summarizeTextLineDiff } from './risup-prompt-compare';

describe('risup prompt compare helpers', () => {
  it('summarizes changed text lines', () => {
    const result = summarizeTextLineDiff('alpha\nbeta', 'alpha\ngamma');
    expect(result.identical).toBe(false);
    expect(result.reordered).toBe(false);
    expect(result.linesAdded).toBe(1);
    expect(result.linesRemoved).toBe(1);
    expect(result.addedPreview).toEqual(['beta']);
    expect(result.removedPreview).toEqual(['gamma']);
  });

  it('detects reorder-only diffs', () => {
    const result = summarizeTextLineDiff('alpha\nbeta', 'beta\nalpha');
    expect(result.identical).toBe(false);
    expect(result.reordered).toBe(true);
    expect(result.linesAdded).toBe(0);
    expect(result.linesRemoved).toBe(0);
  });

  it('diffs promptTemplate serializer text and formatingOrder tokens together', () => {
    const currentPrompt = parsePromptTemplate(
      JSON.stringify([
        { type: 'plain', type2: 'normal', text: 'Current', role: 'system' },
        { type: 'chat', rangeStart: 0, rangeEnd: 'end' },
        { type: 'lorebook' },
      ]),
    );
    const currentOrder = parseFormatingOrder(JSON.stringify(['main', 'chats', 'lorebook']));
    const referencePrompt = parsePromptTemplate(
      JSON.stringify([
        { type: 'plain', type2: 'normal', text: 'Reference', role: 'system' },
        { type: 'chat', rangeStart: 0, rangeEnd: 'end' },
        { type: 'lorebook' },
      ]),
    );
    const referenceOrder = parseFormatingOrder(JSON.stringify(['main', 'lorebook', 'chats']));

    const result = diffRisupPromptData(currentPrompt, currentOrder, referencePrompt, referenceOrder);
    expect(result.identical).toBe(false);
    expect(result.changedSections).toEqual(['promptTemplate', 'formatingOrder']);
    expect(result.promptTemplate.linesAdded).toBeGreaterThan(0);
    expect(result.formatingOrder.reordered).toBe(true);
    expect(result.formatingOrder.currentWarnings).toHaveLength(0);
    expect(result.formatingOrder.referenceWarnings).toHaveLength(0);
  });

  it('collects added and removed formatingOrder tokens', () => {
    const prompt = parsePromptTemplate(
      JSON.stringify([{ type: 'plain', type2: 'normal', text: 'Hello', role: 'system' }]),
    );
    const currentOrder = parseFormatingOrder(JSON.stringify(['main', 'authorNote']));
    const referenceOrder = parseFormatingOrder(JSON.stringify(['main', 'chats']));

    const result = diffRisupFormatingOrders(prompt, currentOrder, prompt, referenceOrder);
    expect(result.identical).toBe(false);
    expect(result.reordered).toBe(false);
    expect(result.addedTokens).toEqual(['authorNote']);
    expect(result.removedTokens).toEqual(['chats']);
  });
});
