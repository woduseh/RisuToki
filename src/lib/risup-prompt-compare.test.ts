// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseFormatingOrder, parsePromptTemplate, serializePromptTemplateToText } from './risup-prompt-model';
import {
  diffRisupFormatingOrders,
  diffRisupPromptData,
  diffRisupPromptWithText,
  summarizeTextLineDiff,
} from './risup-prompt-compare';

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

describe('diffRisupPromptWithText (import verification)', () => {
  const ITEMS = [
    { type: 'plain', type2: 'normal', text: 'hello', role: 'system' },
    { type: 'jailbreak', type2: 'normal', text: 'bypass', role: 'user' },
  ];

  it('reports all items as matching when content is identical', () => {
    const model = parsePromptTemplate(JSON.stringify(ITEMS));
    const text = serializePromptTemplateToText(model);
    const result = diffRisupPromptWithText(model, text);

    expect(result.error).toBeUndefined();
    expect(result.summary.total).toBe(2);
    expect(result.summary.matched).toBe(2);
    expect(result.summary.mismatched).toBe(0);
    expect(result.items.every((i) => i.match)).toBe(true);
  });

  it('detects content mismatch', () => {
    const model = parsePromptTemplate(JSON.stringify(ITEMS));
    const altItems = [
      { type: 'plain', type2: 'normal', text: 'DIFFERENT', role: 'system' },
      { type: 'jailbreak', type2: 'normal', text: 'bypass', role: 'user' },
    ];
    const altModel = parsePromptTemplate(JSON.stringify(altItems));
    const text = serializePromptTemplateToText(altModel);
    const result = diffRisupPromptWithText(model, text);

    expect(result.summary.mismatched).toBe(1);
    expect(result.items[0].match).toBe(false);
    expect(result.items[1].match).toBe(true);
  });

  it('reports extra items in current', () => {
    const model = parsePromptTemplate(JSON.stringify(ITEMS));
    const singleItem = [{ type: 'plain', type2: 'normal', text: 'hello', role: 'system' }];
    const singleModel = parsePromptTemplate(JSON.stringify(singleItem));
    const text = serializePromptTemplateToText(singleModel);
    const result = diffRisupPromptWithText(model, text);

    expect(result.summary.total).toBe(2);
    expect(result.summary.mismatched).toBe(1);
    expect(result.items[1].diff?.reason).toBe('extra in current');
  });

  it('reports missing items in current', () => {
    const singleItem = [{ type: 'plain', type2: 'normal', text: 'hello', role: 'system' }];
    const model = parsePromptTemplate(JSON.stringify(singleItem));
    const fullModel = parsePromptTemplate(JSON.stringify(ITEMS));
    const text = serializePromptTemplateToText(fullModel);
    const result = diffRisupPromptWithText(model, text);

    expect(result.summary.total).toBe(2);
    expect(result.summary.mismatched).toBe(1);
    expect(result.items[1].diff?.reason).toBe('missing in current');
  });

  it('matches items even when IDs differ (post-import)', () => {
    const model = parsePromptTemplate(JSON.stringify(ITEMS));
    const text = serializePromptTemplateToText(model);
    // Re-parse (will generate new IDs) and verify still matches
    const reimportedModel = parsePromptTemplate(JSON.stringify(ITEMS));
    const result = diffRisupPromptWithText(reimportedModel, text);

    expect(result.summary.matched).toBe(2);
    expect(result.summary.mismatched).toBe(0);
  });

  it('returns error for invalid source text', () => {
    const model = parsePromptTemplate(JSON.stringify(ITEMS));
    const result = diffRisupPromptWithText(model, '### [invalid-block ###');

    expect(result.error).toBeDefined();
    expect(result.summary.total).toBe(0);
  });
});
