import '@xterm/xterm/css/xterm.css';
import './styles/app.css';
import { initPopoutRenderer } from './popout/controller';
import { readAppSettingsSnapshot, syncBodyTheme } from './lib/app-settings';
import { applyTheme } from './lib/dark-mode';

const initialSettings = readAppSettingsSnapshot();
syncBodyTheme(document.body, initialSettings.themeId, initialSettings.customTheme);
applyTheme(initialSettings.themeId, initialSettings.customTheme);
void initPopoutRenderer();
