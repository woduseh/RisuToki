import {
  collectFormatingOrderWarnings,
  parseFormatingOrder,
  parsePromptTemplate,
  serializePromptTemplateToText,
} from './risup-prompt-model';

export interface TextLineDiffSummary {
  identical: boolean;
  reordered: boolean;
  currentLength: number;
  referenceLength: number;
  currentLineCount: number;
  referenceLineCount: number;
  linesAdded: number;
  linesRemoved: number;
  addedPreview: string[];
  removedPreview: string[];
}

export interface RisupPromptTemplateDiffSummary extends TextLineDiffSummary {
  currentCount: number;
  referenceCount: number;
  hasUnsupportedCurrent: boolean;
  hasUnsupportedReference: boolean;
}

export interface RisupFormatingOrderDiffSummary {
  identical: boolean;
  reordered: boolean;
  currentCount: number;
  referenceCount: number;
  currentTokens: string[];
  referenceTokens: string[];
  addedTokens: string[];
  removedTokens: string[];
  currentWarnings: string[];
  referenceWarnings: string[];
}

export interface RisupPromptDiffSummary {
  identical: boolean;
  changedSections: string[];
  promptTemplate: RisupPromptTemplateDiffSummary;
  formatingOrder: RisupFormatingOrderDiffSummary;
}

function buildPreviewLines(lines: string[], previewLimit: number, maxPreviewChars: number): string[] {
  return lines.slice(0, previewLimit).map((line) => {
    if (line.length <= maxPreviewChars) return line;
    return `${line.slice(0, maxPreviewChars)}…`;
  });
}

export function summarizeTextLineDiff(
  currentText: string,
  referenceText: string,
  options?: { previewLimit?: number; maxPreviewChars?: number },
): TextLineDiffSummary {
  const previewLimit = options?.previewLimit ?? 10;
  const maxPreviewChars = options?.maxPreviewChars ?? 120;
  const normalizedCurrent = currentText.replace(/\r\n/g, '\n');
  const normalizedReference = referenceText.replace(/\r\n/g, '\n');
  const currentLines = normalizedCurrent.split('\n');
  const referenceLines = normalizedReference.split('\n');
  const referenceSet = new Set(referenceLines);
  const currentSet = new Set(currentLines);
  const addedLines = currentLines.filter((line) => !referenceSet.has(line));
  const removedLines = referenceLines.filter((line) => !currentSet.has(line));

  return {
    identical: normalizedCurrent === normalizedReference,
    reordered: normalizedCurrent !== normalizedReference && addedLines.length === 0 && removedLines.length === 0,
    currentLength: normalizedCurrent.length,
    referenceLength: normalizedReference.length,
    currentLineCount: currentLines.length,
    referenceLineCount: referenceLines.length,
    linesAdded: addedLines.length,
    linesRemoved: removedLines.length,
    addedPreview: buildPreviewLines(addedLines, previewLimit, maxPreviewChars),
    removedPreview: buildPreviewLines(removedLines, previewLimit, maxPreviewChars),
  };
}

export function diffRisupPromptTemplates(
  currentModel: ReturnType<typeof parsePromptTemplate>,
  referenceModel: ReturnType<typeof parsePromptTemplate>,
): RisupPromptTemplateDiffSummary {
  const lineDiff = summarizeTextLineDiff(
    serializePromptTemplateToText(currentModel),
    serializePromptTemplateToText(referenceModel),
  );
  return {
    ...lineDiff,
    currentCount: currentModel.items.length,
    referenceCount: referenceModel.items.length,
    hasUnsupportedCurrent: currentModel.hasUnsupportedContent,
    hasUnsupportedReference: referenceModel.hasUnsupportedContent,
  };
}

export function diffRisupFormatingOrders(
  currentPromptModel: ReturnType<typeof parsePromptTemplate>,
  currentOrderModel: ReturnType<typeof parseFormatingOrder>,
  referencePromptModel: ReturnType<typeof parsePromptTemplate>,
  referenceOrderModel: ReturnType<typeof parseFormatingOrder>,
): RisupFormatingOrderDiffSummary {
  const currentTokens = currentOrderModel.items.map((item) => item.token);
  const referenceTokens = referenceOrderModel.items.map((item) => item.token);
  const referenceSet = new Set(referenceTokens);
  const currentSet = new Set(currentTokens);
  const addedTokens = currentTokens.filter((token) => !referenceSet.has(token));
  const removedTokens = referenceTokens.filter((token) => !currentSet.has(token));

  return {
    identical: JSON.stringify(currentTokens) === JSON.stringify(referenceTokens),
    reordered:
      JSON.stringify(currentTokens) !== JSON.stringify(referenceTokens) &&
      addedTokens.length === 0 &&
      removedTokens.length === 0,
    currentCount: currentTokens.length,
    referenceCount: referenceTokens.length,
    currentTokens,
    referenceTokens,
    addedTokens,
    removedTokens,
    currentWarnings: collectFormatingOrderWarnings(currentPromptModel, currentOrderModel),
    referenceWarnings: collectFormatingOrderWarnings(referencePromptModel, referenceOrderModel),
  };
}

export function diffRisupPromptData(
  currentPromptModel: ReturnType<typeof parsePromptTemplate>,
  currentOrderModel: ReturnType<typeof parseFormatingOrder>,
  referencePromptModel: ReturnType<typeof parsePromptTemplate>,
  referenceOrderModel: ReturnType<typeof parseFormatingOrder>,
): RisupPromptDiffSummary {
  const promptTemplate = diffRisupPromptTemplates(currentPromptModel, referencePromptModel);
  const formatingOrder = diffRisupFormatingOrders(
    currentPromptModel,
    currentOrderModel,
    referencePromptModel,
    referenceOrderModel,
  );
  const changedSections: string[] = [];
  if (!promptTemplate.identical) changedSections.push('promptTemplate');
  if (!formatingOrder.identical) changedSections.push('formatingOrder');

  return {
    identical: changedSections.length === 0,
    changedSections,
    promptTemplate,
    formatingOrder,
  };
}
