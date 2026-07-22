import { beforeEach, describe, expect, it, vi } from 'vitest';

const sortableCreate = vi.hoisted(() => vi.fn());
vi.mock('sortablejs', () => ({ default: { create: sortableCreate } }));

import type { CharxData } from '../stores/app-store';
import { initPromptManagerPanel, renderPromptManagerPanel } from './risup-prompt-manager-panel';

describe('risup prompt manager drag reorder', () => {
  beforeEach(() => {
    sortableCreate.mockReset();
    sortableCreate.mockImplementation(() => ({ destroy: vi.fn() }));
    document.body.innerHTML = '<div id="prompt-manager-panel"></div>';
  });

  it('writes the actual promptTemplate in the dropped order', () => {
    const data = {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([
        { type: 'plain', type2: 'normal', role: 'system', name: 'First', text: 'first' },
        { type: 'plain', type2: 'normal', role: 'system', name: 'Second', text: 'second' },
        { type: 'plain', type2: 'normal', role: 'system', name: 'Third', text: 'third' },
      ]),
    } as CharxData;
    const setPromptTemplate = vi.fn((value: string) => {
      data.promptTemplate = value;
    });
    initPromptManagerPanel({
      getFileData: () => data,
      openPromptItem: vi.fn(),
      setPromptTemplate,
      confirm: vi.fn().mockResolvedValue(true),
      setStatus: vi.fn(),
      refresh: vi.fn(),
    });
    renderPromptManagerPanel();

    const list = document.querySelector<HTMLElement>('.prompt-manager-list-sortable')!;
    const first = list.querySelector<HTMLElement>('[data-dnd-idx="0"]')!;
    list.appendChild(first);
    const sortableCall = sortableCreate.mock.calls.find(([element]) => element === list)!;
    const options = sortableCall[1] as { onEnd: (event: unknown) => void };

    options.onEnd({ oldIndex: 0, newIndex: 2, item: first, from: list, to: list });

    expect(setPromptTemplate).toHaveBeenCalledOnce();
    expect(JSON.parse(data.promptTemplate || '[]').map((item: { name: string }) => item.name)).toEqual([
      'Second',
      'Third',
      'First',
    ]);
    expect([...list.querySelectorAll<HTMLElement>('[data-dnd-idx]')].map((row) => row.dataset.dndIdx)).toEqual([
      '0',
      '1',
      '2',
    ]);
  });
});
