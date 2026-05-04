<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';

interface MenuItem {
  label: string;
  shortcut?: string;
  action: string;
  separator?: false;
  disabled?: boolean;
}

interface MenuSeparator {
  separator: true;
}

interface SubMenu {
  label: string;
  children: (MenuItem | MenuSeparator)[];
}

type MenuEntry = MenuItem | MenuSeparator | SubMenu;

const props = defineProps<{
  canPreviewCurrentFile?: boolean;
}>();

const emit = defineEmits<{
  action: [action: string];
}>();

const openMenu = ref<string | null>(null);
const hoveringMenu = ref(false);

function isSubMenu(entry: MenuEntry): entry is SubMenu {
  return 'children' in entry;
}

function isSeparator(entry: MenuEntry): entry is MenuSeparator {
  return 'separator' in entry && entry.separator === true;
}

const menus: { id: string; label: string; items: MenuEntry[] }[] = [
  {
    id: 'file',
    label: '파일',
    items: [
      { label: '새로 만들기', shortcut: 'Ctrl+N', action: 'new' },
      { label: '열기', shortcut: 'Ctrl+O', action: 'open' },
      { separator: true },
      { label: '저장', shortcut: 'Ctrl+S', action: 'save' },
      { label: '다른 이름 저장', shortcut: 'Ctrl+Shift+S', action: 'save-as' },
      { separator: true },
      { label: '탭 닫기', shortcut: 'Ctrl+W', action: 'close-tab' },
    ],
  },
  {
    id: 'edit',
    label: '편집',
    items: [
      { label: '실행 취소', shortcut: 'Ctrl+Z', action: 'undo' },
      { label: '다시 실행', shortcut: 'Ctrl+Y', action: 'redo' },
      { separator: true },
      { label: '잘라내기', shortcut: 'Ctrl+X', action: 'cut' },
      { label: '복사', shortcut: 'Ctrl+C', action: 'copy' },
      { label: '붙여넣기', shortcut: 'Ctrl+V', action: 'paste' },
      { separator: true },
      { label: '모두 선택', shortcut: 'Ctrl+A', action: 'select-all' },
      { separator: true },
      { label: '찾기', shortcut: 'Ctrl+F', action: 'find' },
      { label: '바꾸기', shortcut: 'Ctrl+H', action: 'replace' },
    ],
  },
  {
    id: 'view',
    label: '보기',
    items: [
      { label: '사이드바 토글', shortcut: 'Ctrl+B', action: 'toggle-sidebar' },
      { label: '터미널 토글', shortcut: 'Ctrl+`', action: 'toggle-terminal' },
      { label: '아바타 토글', action: 'toggle-avatar' },
      { separator: true },
      {
        label: '항목 배치',
        children: [
          { label: '좌측', action: 'items-left' },
          { label: '우측', action: 'items-right' },
          { label: '좌끝', action: 'items-far-left' },
          { label: '우끝', action: 'items-far-right' },
          { label: '상단', action: 'items-top' },
          { label: '하단', action: 'items-bottom' },
        ],
      },
      {
        label: '참고자료 배치',
        children: [
          { label: '사이드바', action: 'refs-sidebar' },
          { label: '좌측', action: 'refs-left' },
          { label: '우측', action: 'refs-right' },
          { label: '좌끝', action: 'refs-far-left' },
          { label: '우끝', action: 'refs-far-right' },
          { label: '상단', action: 'refs-top' },
          { label: '하단', action: 'refs-bottom' },
        ],
      },
      {
        label: '터미널 배치',
        children: [
          { label: '하단', action: 'terminal-bottom' },
          { label: '좌측', action: 'terminal-left' },
          { label: '우측', action: 'terminal-right' },
          { label: '좌끝', action: 'terminal-far-left' },
          { label: '우끝', action: 'terminal-far-right' },
          { label: '상단', action: 'terminal-top' },
        ],
      },
      { separator: true },
      { label: '레이아웃 초기화', action: 'layout-reset' },
      { separator: true },
      { label: '확대', shortcut: 'Ctrl++', action: 'zoom-in' },
      { label: '축소', shortcut: 'Ctrl+-', action: 'zoom-out' },
      { label: '기본 크기', shortcut: 'Ctrl+0', action: 'zoom-reset' },
      { separator: true },
      { label: '다크 모드 토글', action: 'toggle-dark' },
      { separator: true },
      { label: '프리뷰', shortcut: 'F5', action: 'preview-test' },
      { separator: true },
      { label: '개발자 도구', shortcut: 'F12', action: 'devtools' },
    ],
  },
  {
    id: 'terminal',
    label: '터미널',
    items: [
      { label: 'Claude Code 시작', action: 'claude-start' },
      { label: 'GitHub Copilot CLI 시작', action: 'copilot-start' },
      { label: 'Codex 시작', action: 'codex-start' },
      { label: 'Gemini 시작', action: 'gemini-start' },
      { separator: true },
      { label: '터미널 지우기', action: 'terminal-clear' },
      { label: '터미널 재시작', action: 'terminal-restart' },
    ],
  },
];

function toggleMenu(menuId: string) {
  openMenu.value = openMenu.value === menuId ? null : menuId;
}

async function openMenuAndFocusFirst(menuId: string) {
  openMenu.value = menuId;
  await nextTick();
  focusFirstMenuEntry(menuId);
}

function focusMenuButton(menuId: string) {
  const button = document.querySelector<HTMLButtonElement>(`[data-menu-button="${menuId}"]`);
  button?.focus();
}

function focusMenuByOffset(menuId: string, offset: number) {
  const currentIndex = menus.findIndex((menu) => menu.id === menuId);
  if (currentIndex < 0) return;
  const nextMenu = menus[(currentIndex + offset + menus.length) % menus.length];
  if (!nextMenu) return;
  if (openMenu.value !== null) {
    openMenu.value = nextMenu.id;
  }
  nextTick(() => focusMenuButton(nextMenu.id));
}

function getFocusableMenuEntries(menuRoot: Element): HTMLElement[] {
  return Array.from(menuRoot.querySelectorAll<HTMLElement>('[data-menu-entry]')).filter(
    (entry) => !entry.hasAttribute('disabled') && entry.getAttribute('aria-disabled') !== 'true',
  );
}

function focusFirstMenuEntry(menuId: string) {
  const menuRoot = document.querySelector<HTMLElement>(`[data-menu="${menuId}"]`);
  const firstEntry = menuRoot ? getFocusableMenuEntries(menuRoot)[0] : undefined;
  firstEntry?.focus();
}

function focusAdjacentMenuEntry(current: HTMLElement, offset: number) {
  const menuRoot = current.closest('[role="menu"]');
  if (!menuRoot) return;
  const entries = getFocusableMenuEntries(menuRoot);
  const currentIndex = entries.indexOf(current);
  if (currentIndex < 0) return;
  entries[(currentIndex + offset + entries.length) % entries.length]?.focus();
}

function focusSubmenuEntry(current: HTMLElement) {
  const submenu = current.parentElement?.querySelector<HTMLElement>(':scope > [role="menu"]');
  const firstEntry = submenu ? getFocusableMenuEntries(submenu)[0] : undefined;
  firstEntry?.focus();
}

function focusParentSubmenu(current: HTMLElement) {
  const parentSubmenu = current.closest('.menu-sub');
  const parentTrigger = parentSubmenu?.querySelector<HTMLElement>(':scope > [data-menu-entry]');
  parentTrigger?.focus();
}

function onMenuEnter(menuId: string) {
  if (openMenu.value !== null) {
    openMenu.value = menuId;
  }
  hoveringMenu.value = true;
}

function isItemDisabled(item: MenuItem): boolean {
  if (item.action === 'preview-test' && !props.canPreviewCurrentFile) return true;
  return item.disabled === true;
}

function handleAction(action: string, item?: MenuItem) {
  if (item && isItemDisabled(item)) return;
  openMenu.value = null;
  emit('action', action);
}

function closeMenus() {
  openMenu.value = null;
}

function closeMenusAndFocus(menuId: string) {
  openMenu.value = null;
  nextTick(() => focusMenuButton(menuId));
}

function onSettingsClick() {
  emit('action', 'settings');
}

function onMenuButtonKeydown(event: KeyboardEvent, menuId: string) {
  switch (event.key) {
    case 'Enter':
    case ' ':
    case 'ArrowDown':
      event.preventDefault();
      openMenuAndFocusFirst(menuId);
      break;
    case 'Escape':
      event.preventDefault();
      closeMenusAndFocus(menuId);
      break;
    case 'ArrowRight':
      event.preventDefault();
      focusMenuByOffset(menuId, 1);
      break;
    case 'ArrowLeft':
      event.preventDefault();
      focusMenuByOffset(menuId, -1);
      break;
  }
}

function onMenuEntryKeydown(event: KeyboardEvent, menuId: string) {
  const current = event.currentTarget as HTMLElement;
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      focusAdjacentMenuEntry(current, 1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      focusAdjacentMenuEntry(current, -1);
      break;
    case 'ArrowRight':
      event.preventDefault();
      focusSubmenuEntry(current);
      break;
    case 'ArrowLeft':
      event.preventDefault();
      focusParentSubmenu(current);
      break;
    case 'Escape':
      event.preventDefault();
      closeMenusAndFocus(menuId);
      break;
  }
}

function onClickOutside() {
  openMenu.value = null;
}

function onCloseMenusEvent() {
  openMenu.value = null;
}

onMounted(() => {
  document.addEventListener('click', onClickOutside);
  document.addEventListener('toki:close-menus', onCloseMenusEvent);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside);
  document.removeEventListener('toki:close-menus', onCloseMenusEvent);
});

defineExpose({ closeMenus });
</script>

<template>
  <div id="menubar" role="menubar" aria-label="주 메뉴" @mouseleave="hoveringMenu = false">
    <div
      v-for="menu in menus"
      :key="menu.id"
      class="menu-item"
      :class="{ open: openMenu === menu.id }"
      @click.stop="toggleMenu(menu.id)"
      @mouseenter="onMenuEnter(menu.id)"
    >
      <button
        :id="`menu-button-${menu.id}`"
        type="button"
        class="menu-label"
        role="menuitem"
        aria-haspopup="menu"
        :aria-expanded="openMenu === menu.id"
        :aria-controls="`menu-dropdown-${menu.id}`"
        :data-menu-button="menu.id"
        @click.stop="toggleMenu(menu.id)"
        @keydown="onMenuButtonKeydown($event, menu.id)"
      >
        {{ menu.label }}
      </button>
      <div
        v-if="openMenu === menu.id"
        :id="`menu-dropdown-${menu.id}`"
        class="menu-dropdown"
        role="menu"
        :aria-labelledby="`menu-button-${menu.id}`"
        :data-menu="menu.id"
        @click.stop
      >
        <template v-for="(item, i) in menu.items" :key="i">
          <div v-if="isSeparator(item)" class="menu-sep" role="separator"></div>
          <div v-else-if="isSubMenu(item)" class="menu-sub">
            <button
              type="button"
              class="menu-sub-trigger"
              role="menuitem"
              aria-haspopup="menu"
              data-menu-entry
              @keydown="onMenuEntryKeydown($event, menu.id)"
            >
              <span>{{ item.label }}</span>
              <span class="menu-arrow">▸</span>
            </button>
            <div class="menu-submenu" role="menu" :aria-label="item.label">
              <template v-for="(child, j) in item.children" :key="j">
                <div v-if="isSeparator(child)" class="menu-sep" role="separator"></div>
                <button
                  v-else
                  type="button"
                  class="menu-action"
                  role="menuitem"
                  data-menu-entry
                  @click="handleAction(child.action)"
                  @keydown="onMenuEntryKeydown($event, menu.id)"
                >
                  {{ child.label }}
                  <span v-if="child.shortcut" class="menu-shortcut">{{ child.shortcut }}</span>
                </button>
              </template>
            </div>
          </div>
          <button
            v-else
            type="button"
            class="menu-action"
            role="menuitem"
            :class="{ disabled: isItemDisabled(item) }"
            :disabled="isItemDisabled(item)"
            :aria-disabled="isItemDisabled(item)"
            data-menu-entry
            @click="handleAction(item.action, item)"
            @keydown="onMenuEntryKeydown($event, menu.id)"
          >
            {{ item.label }}
            <span v-if="item.shortcut" class="menu-shortcut">{{ item.shortcut }}</span>
          </button>
        </template>
      </div>
    </div>
    <div class="menu-item">
      <button type="button" class="menu-label" role="menuitem" @click="onSettingsClick">설정</button>
    </div>
    <span style="flex: 1; -webkit-app-region: drag"></span>
    <slot name="file-label"></slot>
  </div>
</template>
