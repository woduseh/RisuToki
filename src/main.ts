import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import '@xterm/xterm/css/xterm.css';
import './styles/app.css';
import { initMainRenderer } from './app/controller';
import { readAppSettingsSnapshot, syncBodyDarkMode } from './lib/app-settings';

syncBodyDarkMode(document.body, readAppSettingsSnapshot().darkMode);
const app = createApp(App);
app.use(createPinia());
app.mount('#app');
initMainRenderer().catch((err) => {
  console.error('[Toki] initMainRenderer failed:', err);
});
