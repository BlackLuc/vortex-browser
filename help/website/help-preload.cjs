'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('vortexHelp', Object.freeze({
  isComplete: () => ipcRenderer.invoke('vortex-help:is-complete'),
  complete: () => ipcRenderer.invoke('vortex-help:complete'),
  getInfo: () => ipcRenderer.invoke('vortex-help:info'),
  close: () => ipcRenderer.send('vortex-help:close')
}));
