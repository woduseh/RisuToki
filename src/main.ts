import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import '@xterm/xterm/css/xterm.css';
import './styles/app.css';
import { initMainRenderer } from './app/controller';
import { readAppSettingsSnapshot, syncBodyTheme } from './lib/app-settings';
import { applyTheme } from './lib/dark-mode';

const initialSettings = readAppSettingsSnapshot();
syncBodyTheme(document.body, initialSettings.themeId, initialSettings.customTheme);
applyTheme(initialSettings.themeId, initialSettings.customTheme);
const app = createApp(App);
app.use(createPinia());
app.mount('#app');
initMainRenderer().catch((err) => {
  console.error('[Toki] initMainRenderer failed:', err);
});
