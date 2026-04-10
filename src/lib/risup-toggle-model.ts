import { normalizeLF } from './shared-utils';

export type ToggleTemplateItemType =
  | 'group'
  | 'groupEnd'
  | 'divider'
  | 'caption'
  | 'select'
  | 'text'
  | 'textarea'
  | 'toggle';

export type ToggleTemplateState = 'empty' | 'valid' | 'invalid';

export interface ToggleTemplateGroupItem {
  type: 'group';
  value: string | undefined;
}

export interface ToggleTemplateGroupEndItem {
  type: 'groupEnd';
}

export interface ToggleTemplateDividerItem {
  type: 'divider';
  value: string | undefined;
}

export interface ToggleTemplateCaptionItem {
  type: 'caption';
  value: string | undefined;
}

export interface ToggleTemplateSelectItem {
  type: 'select';
  key: string;
  value: string;
  options: string[];
}

export interface ToggleTemplateTextItem {
  type: 'text' | 'textarea' | 'toggle';
  key: string;
  value: string;
}

export type ToggleTemplateItem =
  | ToggleTemplateGroupItem
  | ToggleTemplateGroupEndItem
  | ToggleTemplateDividerItem
  | ToggleTemplateCaptionItem
  | ToggleTemplateSelectItem
  | ToggleTemplateTextItem;

export interface ToggleTemplateModel {
  state: ToggleTemplateState;
  items: ToggleTemplateItem[];
  rawText: string;
  parseError?: string;
}

export const TOGGLE_TEMPLATE_ITEM_TYPES: readonly ToggleTemplateItemType[] = [
  'toggle',
  'select',
  'text',
  'textarea',
  'divider',
  'caption',
  'group',
  'groupEnd',
];

function parseStructuralValue(line: string, suffix: '=group' | '=divider' | '=caption'): string | undefined {
  const value = line.slice(1, -suffix.length);
  return value || undefined;
}

function parseToggleTemplateLine(line: string): ToggleTemplateItem | null {
  if (line === '==groupEnd') {
    return { type: 'groupEnd' };
  }

  if (line.startsWith('=')) {
    if (line.endsWith('=group')) {
      return { type: 'group', value: parseStructuralValue(line, '=group') };
    }
    if (line.endsWith('=divider')) {
      return { type: 'divider', value: parseStructuralValue(line, '=divider') };
    }
    if (line.endsWith('=caption')) {
      return { type: 'caption', value: parseStructuralValue(line, '=caption') };
    }
    return null;
  }

  const firstEquals = line.indexOf('=');
  if (firstEquals <= 0) return null;

  const key = line.slice(0, firstEquals);
  const rest = line.slice(firstEquals + 1);
  if (!key) return null;

  if (rest.endsWith('=textarea')) {
    return { type: 'textarea', key, value: rest.slice(0, -'=textarea'.length) };
  }
  if (rest.endsWith('=text')) {
    return { type: 'text', key, value: rest.slice(0, -'=text'.length) };
  }

  const selectMarker = '=select';
  const selectIndex = rest.lastIndexOf(selectMarker);
  if (selectIndex >= 0) {
    const optionsStart = selectIndex + selectMarker.length;
    if (optionsStart === rest.length || rest.charAt(optionsStart) === '=') {
      const optionsText = optionsStart === rest.length ? '' : rest.slice(optionsStart + 1);
      return {
        type: 'select',
        key,
        value: rest.slice(0, selectIndex),
        options: optionsText
          ? optionsText
              .split(',')
              .map((option) => option.trim())
              .filter((option) => option.length > 0)
          : [],
      };
    }
  }

  return { type: 'toggle', key, value: rest };
}

export function parseCustomPromptTemplateToggle(text: string): ToggleTemplateModel {
  const rawText = normalizeLF(typeof text === 'string' ? text : '');
  if (!rawText.trim()) {
    return { state: 'empty', items: [], rawText };
  }

  const items: ToggleTemplateItem[] = [];
  const lines = rawText.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) continue;
    const item = parseToggleTemplateLine(line);
    if (!item) {
      return {
        state: 'invalid',
        items: [],
        rawText,
        parseError: `Line ${index + 1}: unsupported customPromptTemplateToggle syntax.`,
      };
    }
    items.push(item);
  }

  if (items.length === 0) {
    return { state: 'empty', items: [], rawText };
  }

  return { state: 'valid', items, rawText };
}

function serializeToggleTemplateLine(item: ToggleTemplateItem): string {
  switch (item.type) {
    case 'group':
      return `=${item.value ?? ''}=group`;
    case 'groupEnd':
      return '==groupEnd';
    case 'divider':
      return `=${item.value ?? ''}=divider`;
    case 'caption':
      return `=${item.value ?? ''}=caption`;
    case 'select':
      return item.options.length > 0
        ? `${item.key}=${item.value}=select=${item.options.join(',')}`
        : `${item.key}=${item.value}=select`;
    case 'text':
    case 'textarea':
      return `${item.key}=${item.value}=${item.type}`;
    case 'toggle':
      return `${item.key}=${item.value}`;
  }
}

export function serializeCustomPromptTemplateToggle(model: Pick<ToggleTemplateModel, 'items'>): string {
  if (!model || !Array.isArray(model.items) || model.items.length === 0) {
    return '';
  }
  return model.items.map(serializeToggleTemplateLine).join('\n');
}

export function createToggleTemplateItem(type: ToggleTemplateItemType = 'toggle'): ToggleTemplateItem {
  switch (type) {
    case 'group':
      return { type: 'group', value: 'New Group' };
    case 'groupEnd':
      return { type: 'groupEnd' };
    case 'divider':
      return { type: 'divider', value: 'Section' };
    case 'caption':
      return { type: 'caption', value: 'Caption text' };
    case 'select':
      return { type: 'select', key: 'key', value: 'Label', options: ['opt1', 'opt2'] };
    case 'text':
      return { type: 'text', key: 'key', value: 'Label' };
    case 'textarea':
      return { type: 'textarea', key: 'key', value: 'Label' };
    case 'toggle':
      return { type: 'toggle', key: 'key', value: 'Label' };
  }
}
