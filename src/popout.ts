import '@xterm/xterm/css/xterm.css';
import './styles/app.css';
import { initPopoutRenderer } from './popout/controller';
import { readAppSettingsSnapshot, syncBodyDarkMode } from './lib/app-settings';

syncBodyDarkMode(document.body, readAppSettingsSnapshot().darkMode);
void initPopoutRenderer();
