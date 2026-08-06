import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('pwTool', {
  version: '0.0.0',
});
