<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';

interface MenuItem {
  label: string;
  shortcut?: string;
  action: string;
  separator?: false;
}

interface MenuSeparator {
  separator: true;
}

interface SubMenu {
  label: string;
  children: (MenuItem | MenuSeparator)[];
}

type MenuEntry = MenuItem | MenuSeparator | SubMenu;

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
      { label: '항목 토글', shortcut: 'Ctrl+B', action: 'toggle-sidebar' },
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
      { label: '프리뷰 테스트', shortcut: 'F5', action: 'preview-test' },
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
      { separator: true },
      { label: '터미널 지우기', action: 'terminal-clear' },
      { label: '터미널 재시작', action: 'terminal-restart' },
    ],
  },
];

function toggleMenu(menuId: string) {
  openMenu.value = openMenu.value === menuId ? null : menuId;
}

function onMenuEnter(menuId: string) {
  if (openMenu.value !== null) {
    openMenu.value = menuId;
  }
  hoveringMenu.value = true;
}

function handleAction(action: string) {
  openMenu.value = null;
  emit('action', action);
}

function closeMenus() {
  openMenu.value = null;
}

function onSettingsClick() {
  emit('action', 'settings');
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
  <div id="menubar" @mouseleave="hoveringMenu = false">
    <div
      v-for="menu in menus"
      :key="menu.id"
      class="menu-item"
      :class="{ open: openMenu === menu.id }"
      @click.stop="toggleMenu(menu.id)"
      @mouseenter="onMenuEnter(menu.id)"
    >
      <span class="menu-label">{{ menu.label }}</span>
      <div v-if="openMenu === menu.id" class="menu-dropdown" @click.stop>
        <template v-for="(item, i) in menu.items" :key="i">
          <div v-if="isSeparator(item)" class="menu-sep"></div>
          <div v-else-if="isSubMenu(item)" class="menu-sub">
            <span>{{ item.label }}</span
            ><span class="menu-arrow">▸</span>
            <div class="menu-submenu">
              <template v-for="(child, j) in item.children" :key="j">
                <div v-if="isSeparator(child)" class="menu-sep"></div>
                <div v-else class="menu-action" @click="handleAction(child.action)">
                  {{ child.label }}
                  <span v-if="child.shortcut" class="menu-shortcut">{{ child.shortcut }}</span>
                </div>
              </template>
            </div>
          </div>
          <div v-else class="menu-action" @click="handleAction(item.action)">
            {{ item.label }}
            <span v-if="item.shortcut" class="menu-shortcut">{{ item.shortcut }}</span>
          </div>
        </template>
      </div>
    </div>
    <div class="menu-item" @click="onSettingsClick">
      <span class="menu-label">설정</span>
    </div>
    <span style="flex: 1; -webkit-app-region: drag"></span>
    <slot name="file-label"></slot>
  </div>
</template>
