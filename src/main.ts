import { createApp } from 'vue';
import App from './App.vue';
import '@xterm/xterm/css/xterm.css';
import './styles/app.css';
import { initMainRenderer } from './app/controller';
import { readAppSettingsSnapshot, syncBodyDarkMode } from './lib/app-settings';

syncBodyDarkMode(document.body, readAppSettingsSnapshot().darkMode);
createApp(App).mount('#app');
void initMainRenderer();
