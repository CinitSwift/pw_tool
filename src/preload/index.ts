import { contextBridge, ipcRenderer } from 'electron';
import { createPwToolApi } from './api';

contextBridge.exposeInMainWorld('pwTool', createPwToolApi(ipcRenderer));
