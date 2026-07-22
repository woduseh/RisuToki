import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import '@xterm/xterm/css/xterm.css';
import './styles/app.css';
import './styles/workspace.css';
import { readAppSettingsSnapshot, syncBodyTheme } from './lib/app-settings';
import { applyTheme } from './lib/dark-mode';

const initialSettings = readAppSettingsSnapshot();
syncBodyTheme(document.body, initialSettings.themeId, initialSettings.customTheme);
applyTheme(initialSettings.themeId, initialSettings.customTheme);
const app = createApp(App);
app.use(createPinia());
app.mount('#app');

// Keep the Vue shell independently renderable for visual tests and static previews.
// Electron capabilities are attached only when the preload bridge is present.
if (window.tokiAPI) {
  import('./app/controller')
    .then(({ initMainRenderer }) => initMainRenderer())
    .catch((err) => {
      console.error('[Toki] initMainRenderer failed:', err);
    });
}
