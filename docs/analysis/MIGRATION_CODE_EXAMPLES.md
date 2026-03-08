# Vue 3 + Vite: Concrete Code Examples

## 1. Editor Store (src/stores/editor.ts)

import { defineStore } from 'pinia';

export const useEditorStore = defineStore('editor', {
  state: () => ({
    fileData: null,
    openTabs: [],
    activeTabId: null,
    dirtyFields: new Set(),
    backupStore: {}
  }),

  getters: {
    activeTab: (state) => 
      state.openTabs.find(t => t.id === state.activeTabId),
    isDirty: (state) => state.dirtyFields.size > 0
  },

  actions: {
    openTab(id, label, language, getValue, setValue) {
      let tab = this.openTabs.find(t => t.id === id);
      if (!tab) {
        tab = { id, label, language, getValue, setValue };
        this.openTabs.push(tab);
      }
      this.activeTabId = id;
    },

    closeTab(id) {
      const idx = this.openTabs.findIndex(t => t.id === id);
      if (idx === -1) return;
      this.openTabs.splice(idx, 1);
      this.dirtyFields.delete(id);
      if (this.activeTabId === id) {
        this.activeTabId = this.openTabs.length > 0 
          ? this.openTabs[Math.max(0, idx - 1)].id 
          : null;
      }
    },

    markDirty(id) { this.dirtyFields.add(id); },
    clearDirty() { this.dirtyFields.clear(); }
  }
});

---

## 2. Monaco Editor Composable (src/composables/useMonacoEditor.ts)

import { ref, onMounted, onBeforeUnmount } from 'vue';
import loader from '@monaco-editor/loader';

export const useMonacoEditor = (container) => {
  const editor = ref(null);

  onMounted(async () => {
    if (!container.value) return;
    const monaco = await loader.init();
    editor.value = monaco.editor.create(container.value, {
      value: '',
      language: 'javascript',
      fontSize: 14,
      minimap: { enabled: true }
    });
  });

  onBeforeUnmount(() => {
    if (editor.value) {
      editor.value.dispose();
      editor.value = null;
    }
  });

  return { editor };
};

---

## 3. Component Hierarchy (Target Architecture)

App.vue (root)
  ├─ MenuBar (if !isElectron)
  ├─ SlotLayout
  │  ├─ SidebarPanel
  │  │  └─ SidebarTree (recursive)
  │  │     └─ TreeItem/TreeFolder
  │  ├─ EditorPanel
  │  │  ├─ EditorTabs
  │  │  └─ MonacoEditor (or LoreEditor/RegexEditor)
  │  └─ TerminalPanel
  │     ├─ TerminalView (xterm)
  │     └─ ChatView (if chatMode)
  ├─ StatusBar
  └─ ContextMenu (teleport)

---

## 4. Critical Composables to Create

✅ useMonacoEditor(container) - Monaco lifecycle
✅ useTerminal(container) - xterm + ResizeObserver
✅ useLayout() - Slot visibility/sizing
✅ useDarkMode() - CSS var injection
✅ useKeyboardShortcuts() - Ctrl+S, Ctrl+O, etc.
✅ useLocalStorage(key) - localStorage binding
✅ useChatMode() - Chat buffer + finalize logic
✅ useContextMenu() - Position tracking + clicks

---

## 5. Store Structure

stores/
  ├─ editor.ts      (tabs, fileData, dirtyFields, backupStore)
  ├─ layout.ts      (itemsPos, terminalPos, slotSizes)
  ├─ ui.ts          (darkMode, rpMode, bgmEnabled, theme)
  ├─ terminal.ts    (terminalData, chatMessages, isRunning)
  ├─ file.ts        (filePath, isModified, autosaveDir)
  └─ notification.ts (statusMessage, duration)

---

## 6. Vite Config Key Changes

// vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: 'dist/renderer',
    rollupOptions: {
      input: 'src/index.html'
    }
  },
  server: {
    // For Electron dev with live reload
  }
});

---

## 7. TypeScript Electron Conversion (main.ts)

// Before: main.js
const { ipcMain, app, BrowserWindow } = require('electron');

// After: main.ts
import { ipcMain, app, BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';

// Type the handlers
const handlers: Record<string, Function> = {
  'new-file': async (event: IpcMainInvokeEvent) => {
    return await createNewFile();
  },
  'save-file': async (event: IpcMainInvokeEvent, data: CharxData) => {
    return await saveFile(data);
  },
  // ... more handlers
};

Object.entries(handlers).forEach(([channel, handler]) => {
  ipcMain.handle(channel, handler);
});

---

## 8. Package.json Essentials

{
  \"scripts\": {
    \"dev\": \"vite\",
    \"build:renderer\": \"vite build\",
    \"build:electron\": \"tsc --outDir dist/electron --module commonjs\",
    \"build\": \"npm run build:renderer && npm run build:electron\",
    \"test\": \"vitest run\",
    \"lint\": \"eslint src --ext .ts,.vue\",
    \"type-check\": \"vue-tsc --noEmit\"
  },
  \"devDependencies\": {
    \"@vitejs/plugin-vue\": \"^4.5.0\",
    \"typescript\": \"^5.3.0\",
    \"vite\": \"^4.5.0\",
    \"vitest\": \"^0.34.0\",
    \"vue\": \"^3.3.0\",
    \"eslint\": \"^8.0.0\",
    \"electron\": \"^33.0.0\"
  },
  \"dependencies\": {
    \"@monaco-editor/loader\": \"^1.3.0\",
    \"@xterm/xterm\": \"^5.5.0\",
    \"pinia\": \"^2.1.0\",
    \"vue-router\": \"^4.2.0\"
  }
}

---

## 9. ESLint Config (.eslintrc.cjs)

module.exports = {
  root: true,
  env: { browser: true, node: true, es2021: true },
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    sourceType: 'module'
  },
  rules: {
    'vue/multi-word-component-names': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
  }
};

---

## 10. First Unit Test Example (src/__tests__/unit/stores/editor.test.ts)

import { setActivePinia, createPinia } from 'pinia';
import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '@/stores/editor';

describe('Editor Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('should add and select tab', () => {
    const store = useEditorStore();
    store.openTab('lua', 'Lua', 'lua', () => 'code');
    
    expect(store.openTabs).toHaveLength(1);
    expect(store.activeTabId).toBe('lua');
  });

  it('should close tab and update active', () => {
    const store = useEditorStore();
    store.openTab('lua', 'Lua', 'lua', () => 'code');
    store.openTab('css', 'CSS', 'css', () => 'style');
    store.closeTab('lua');
    
    expect(store.openTabs).toHaveLength(1);
    expect(store.activeTabId).toBe('css');
  });

  it('should mark tab dirty', () => {
    const store = useEditorStore();
    store.openTab('lua', 'Lua', 'lua', () => 'code');
    store.markDirty('lua');
    
    expect(store.isDirty).toBe(true);
    expect(store.unsavedTabs).toHaveLength(1);
  });
});

