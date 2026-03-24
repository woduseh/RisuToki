import { contextBridge, ipcRenderer } from 'electron';
import { createTokiApi } from './src/lib/preload-api';

type TokiApi = Window['tokiAPI'];
const tokiAPI: TokiApi = createTokiApi(ipcRenderer);

contextBridge.exposeInMainWorld('tokiAPI', tokiAPI);
