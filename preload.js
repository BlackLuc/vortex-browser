const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vortexHelp', Object.freeze({
  open: (mode) => ipcRenderer.invoke('vortex-help:open', mode === 'tutorial' ? 'tutorial' : 'help'),
  isComplete: () => ipcRenderer.invoke('vortex-help:is-complete'),
  complete: () => ipcRenderer.invoke('vortex-help:complete'),
  getInfo: () => ipcRenderer.invoke('vortex-help:info'),
  close: () => ipcRenderer.send('vortex-help:close'),
}));

const vortexApi = {
  // Help
  onOpenHelpTab: (cb) => ipcRenderer.on('open-help-tab', (_e, url) => cb(url)),
  onCloseHelpTab: (cb) => ipcRenderer.on('close-help-tab', (_e, url) => cb()),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  showItemInFolder: (p) => ipcRenderer.invoke('show-item-in-folder', p),
  openPath: (p) => ipcRenderer.invoke('open-path', p),

  // Downloads
  clearBrowsingData: (opts) => ipcRenderer.invoke('clear-browsing-data', opts),
  getDownloadsPath: () => ipcRenderer.invoke('get-downloads-path'),
  onDownloadStarted: (cb) => ipcRenderer.on('download-started', (_e, info) => cb(info)),
  onDownloadUpdated: (cb) => ipcRenderer.on('download-updated', (_e, info) => cb(info)),
  onDownloadDone: (cb) => ipcRenderer.on('download-done', (_e, info) => cb(info)),
  onDownload: (cb) => {
    ipcRenderer.on('download-started', (_e, info) => cb(info));
    ipcRenderer.on('download-updated', (_e, info) => cb(info));
    ipcRenderer.on('download-done', (_e, info) => cb(info));
  },
  downloadAction: ({ id, action }) => ipcRenderer.invoke('vortex:download-action', { id, action }),
  setDownloadDirectory: (dir) => ipcRenderer.invoke('vortex:set-download-directory', dir),

  // Permissions
  onPermissionRequest: (cb) => ipcRenderer.on('permission-request', (_e, data) => cb(data)),
  respondPermission: (id, allowed) => ipcRenderer.send('permission-response', id, allowed),
  getPermissions: () => ipcRenderer.invoke('get-permissions'),
  setPermission: ({ origin, type, allowed }) => ipcRenderer.invoke('set-permission', origin, type, allowed),

  // Privacy
  setBlocker: (enabled) => ipcRenderer.invoke('vortex:set-blocker', enabled),
  getPrivacyStats: () => ipcRenderer.invoke('vortex:get-privacy-stats'),

  // Incognito / windows
  isIncognito: false,
  newWindow: ({ incognito }) => ipcRenderer.invoke('vortex:new-window', { incognito }),

  // Admin
  adminReleaseNow: () => ipcRenderer.invoke('vortex-admin:release-current'),
  isDev: () => ipcRenderer.invoke('vortex-admin:is-dev'),
  onReleaseLog: (cb) => ipcRenderer.on('vortex-admin:log', (_e, line) => cb(line)),
  getVersionInfo: (version) => ipcRenderer.invoke('vortex:version-check', { version })
};

contextBridge.exposeInMainWorld('browserAPI', vortexApi);
contextBridge.exposeInMainWorld('vortex', vortexApi);
