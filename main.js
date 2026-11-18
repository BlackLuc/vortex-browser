
const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  session
} = require('electron');

const path = require('path');
const os = require('os');
const fs = require('fs');

let mainWindow = null;
let isQuitting = false;

const permCallbacks = new Map();
let permCounter = 0;
let permFile = null;

let blockerEnabled = true;
const privacyStats = { ads: 0, trackers: 0 };
const downloadItems = new Map();

const DATA_DIR = path.join(
  os.homedir(),
  'AppData',
  'Local',
  'VortexBrowser2'
);

const CACHE_DIR = path.join(DATA_DIR, 'Cache');

// --------------------------------------------------
// STORAGE
// --------------------------------------------------

function ensureDataDirectory() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    return true;
  } catch (error) {
    console.error('[Storage] Failed to create directories:', error);
    return false;
  }
}

function loadPerms() {
  if (!permFile) return {};

  try {
    if (!fs.existsSync(permFile)) return {};

    const data = JSON.parse(fs.readFileSync(permFile, 'utf8'));

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return {};
    }

    return data;
  } catch (error) {
    console.error('[Storage] Failed to load permissions:', error);
    return {};
  }
}

function savePerms(data) {
  if (!permFile) return false;

  try {
    const tempFile = permFile + '.tmp';

    fs.writeFileSync(
      tempFile,
      JSON.stringify(data, null, 2),
      'utf8'
    );

    fs.renameSync(tempFile, permFile);

    return true;
  } catch (error) {
    console.error('[Storage] Failed to save permissions:', error);
    return false;
  }
}

// --------------------------------------------------
// APPLICATION PATHS
// --------------------------------------------------

ensureDataDirectory();

app.setPath('userData', DATA_DIR);
app.setPath('cache', CACHE_DIR);

permFile = path.join(DATA_DIR, 'permissions.json');

app.commandLine.appendSwitch(
  'disk-cache-dir',
  path.join(DATA_DIR, 'DiskCache')
);

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// --------------------------------------------------
// SECURITY HELPERS
// --------------------------------------------------

function isTrustedSender(event) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;

  return event.sender === mainWindow.webContents;
}

function getSafeOrigin(value) {
  try {
    const url = new URL(value);

    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function isValidPermission(permission) {
  return typeof permission === 'string' &&
    permission.length > 0 &&
    permission.length <= 100;
}

function sendToRenderer(channel, data) {
  if (
    mainWindow &&
    !mainWindow.isDestroyed() &&
    !mainWindow.webContents.isDestroyed()
  ) {
    mainWindow.webContents.send(channel, data);
  }
}

// --------------------------------------------------
// AD BLOCKER
// --------------------------------------------------

const BLOCKED_HOSTS = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',
  'analytics.google.com',
  'googletagmanager.com',
  'googletagservices.com',
  'amazon-adsystem.com',
  'outbrain.com',
  'taboola.com',
  'criteo.com',
  'ads.yahoo.com',
  'scorecardresearch.com',
  'quantserve.com',
  'moatads.com',
  'adnxs.com',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'casalemedia.com',
  'indexexchange.com',
  'smartadserver.com'
];

const BLOCKED_URL_PATTERNS = [
  /^\/tr(?:\/|$)/i
];

function installAdBlocker() {
  const filter = {
    urls: ['*://*/*']
  };

  session.defaultSession.webRequest.onBeforeRequest(
    filter,
    (details, callback) => {
      if (!blockerEnabled) {
        return callback({});
      }

      try {
        const url = new URL(details.url);
        const hostname = url.hostname.toLowerCase();

        const blockedHost = BLOCKED_HOSTS.some(domain =>
          hostname === domain ||
          hostname.endsWith('.' + domain)
        );

        const blockedPath =
          hostname === 'facebook.com' ||
          hostname.endsWith('.facebook.com')
            ? BLOCKED_URL_PATTERNS.some(pattern =>
                pattern.test(url.pathname)
              )
            : false;

        if (blockedHost || blockedPath) {
          const isTrackerHost = /tracker|telemetry|metrics|beacon|analytics/i.test(hostname);
          if (isTrackerHost) privacyStats.trackers += 1;
          else privacyStats.ads += 1;

          return callback({ cancel: true });
        }
      } catch (error) {
        console.error('[AdBlocker] URL error:', error);
      }

      callback({});
    }
  );
}

// --------------------------------------------------
// WINDOW
// --------------------------------------------------

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 720,
    minHeight: 480,

    title: 'Vortex',

    backgroundColor: '#1e1e1e',

    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),

      contextIsolation: true,
      nodeIntegration: false,

      webviewTag: true,
      sandbox: false
    }
  });

  mainWindow.loadFile(
    path.join(__dirname, 'renderer', 'index.html')
  ).catch(error => {
    console.error('[Window] Failed to load:', error);
  });

  mainWindow.webContents.on(
    'console-message',
    (_event, level, message) => {
      console.log('[renderer]', message);
    }
  );

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Window] Renderer process exited:', details);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --------------------------------------------------
// PERMISSIONS
// --------------------------------------------------

function installPermissionHandlers() {
  const defaultSession = session.defaultSession;

  defaultSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin) => {
      let origin = getSafeOrigin(requestingOrigin);

      if (!origin && webContents) {
        origin = getSafeOrigin(webContents.getURL());
      }

      if (!origin || !isValidPermission(permission)) {
        return false;
      }

      const perms = loadPerms();

      if (
        perms[origin] &&
        perms[origin][permission] === true
      ) {
        return true;
      }

      return false;
    }
  );

  defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const origin = getSafeOrigin(
        details?.securityOrigin ||
        webContents?.getURL() ||
        ''
      );

      if (
        !origin ||
        !isValidPermission(permission) ||
        !webContents ||
        webContents.isDestroyed()
      ) {
        callback(false);
        return;
      }

      const id = 'perm-' + (++permCounter);

      permCallbacks.set(id, {
        callback,
        origin,
        permission
      });

      sendToRenderer('permission-request', {
        id,
        origin,
        permission
      });

      setTimeout(() => {
        const entry = permCallbacks.get(id);

        if (entry) {
          permCallbacks.delete(id);

          try {
            entry.callback(false);
          } catch (error) {
            console.error('[Permissions] Callback error:', error);
          }
        }
      }, 30000);
    }
  );
}

// --------------------------------------------------
// DOWNLOADS
// --------------------------------------------------

function installDownloadHandler() {
  session.defaultSession.on(
    'will-download',
    (_event, item) => {
      const id =
        'dl-' +
        Date.now() +
        '-' +
        Math.random().toString(36).slice(2, 8);

      const info = {
        id,
        filename: item.getFilename(),
        url: item.getURL(),
        path: null,
        total: item.getTotalBytes(),
        received: 0,
        state: 'progressing',
        startTime: Date.now()
      };

      sendToRenderer('download-started', info);
      downloadItems.set(id, item);

      item.on('updated', () => {
        info.received = item.getReceivedBytes();
        info.total = item.getTotalBytes();

        info.state = item.isPaused()
          ? 'paused'
          : 'progressing';

        sendToRenderer('download-updated', { ...info });
      });

      item.on('done', (_event, state) => {
        info.state = state;
        info.path = item.getSavePath();

        sendToRenderer('download-done', { ...info });
        downloadItems.delete(id);
      });
    }
  );
}

// --------------------------------------------------
// IPC SECURITY
// --------------------------------------------------

function registerIPC() {

  // Open external URLs

  ipcMain.handle('open-external', async (event, url) => {
    if (!isTrustedSender(event)) return false;

    if (typeof url !== 'string') return false;

    try {
      const parsed = new URL(url);

      if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
        return false;
      }

      await shell.openExternal(parsed.href);

      return true;
    } catch (error) {
      console.error('[IPC] Open external error:', error);
      return false;
    }
  });

  // Show file in folder

  ipcMain.handle('show-item-in-folder', (event, filePath) => {
    if (!isTrustedSender(event)) return false;

    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
      return false;
    }

    try {
      shell.showItemInFolder(filePath);
      return true;
    } catch (error) {
      console.error('[IPC] Show item error:', error);
      return false;
    }
  });

  // Open file path

  ipcMain.handle('open-path', async (event, filePath) => {
    if (!isTrustedSender(event)) return null;

    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
      return null;
    }

    try {
      return await shell.openPath(filePath);
    } catch (error) {
      console.error('[IPC] Open path error:', error);
      return error.message;
    }
  });

  // Clear browsing data

  ipcMain.handle('clear-browsing-data', async (event, opts) => {
    if (!isTrustedSender(event)) return false;

    try {
      const allowedOptions = {};

      if (opts && typeof opts === 'object' && !Array.isArray(opts)) {
        if (Array.isArray(opts.origin)) {
          allowedOptions.origin = opts.origin.filter(
            value => typeof value === 'string'
          );
        }

        if (Array.isArray(opts.origins)) {
          allowedOptions.origins = opts.origins.filter(
            value => typeof value === 'string'
          );
        }

        if (Array.isArray(opts.excludeOrigins)) {
          allowedOptions.excludeOrigins = opts.excludeOrigins.filter(
            value => typeof value === 'string'
          );
        }

        if (Array.isArray(opts.storageTypes)) {
          allowedOptions.storageTypes = opts.storageTypes.filter(
            value => typeof value === 'string'
          );
        }
      }

      await session.defaultSession.clearStorageData(allowedOptions);
      await session.defaultSession.clearCache();

      return true;
    } catch (error) {
      console.error('[IPC] Clear data error:', error);
      return false;
    }
  });

  // Downloads directory

  ipcMain.handle('get-downloads-path', event => {
    if (!isTrustedSender(event)) return null;

    return app.getPath('downloads');
  });

  // Permission responses

  ipcMain.on('permission-response', (event, id, allowed) => {
    if (!isTrustedSender(event)) return;

    if (
      typeof id !== 'string' ||
      typeof allowed !== 'boolean'
    ) {
      return;
    }

    const entry = permCallbacks.get(id);

    if (!entry) return;

    permCallbacks.delete(id);

    try {
      entry.callback(allowed);
    } catch (error) {
      console.error('[Permissions] Response error:', error);
    }

    const perms = loadPerms();

    if (!perms[entry.origin]) {
      perms[entry.origin] = {};
    }

    perms[entry.origin][entry.permission] = allowed;

    savePerms(perms);
  });

  // Get permissions

  ipcMain.handle('get-permissions', event => {
    if (!isTrustedSender(event)) return {};

    return loadPerms();
  });

  // Set permissions

  ipcMain.handle(
    'set-permission',
    (event, origin, permission, allowed) => {
      if (!isTrustedSender(event)) return false;

      const safeOrigin = getSafeOrigin(origin);

      if (
        !safeOrigin ||
        !isValidPermission(permission) ||
        (allowed !== null && typeof allowed !== 'boolean')
      ) {
        return false;
      }

      const perms = loadPerms();

      if (!perms[safeOrigin]) {
        perms[safeOrigin] = {};
      }

      if (allowed === null) {
        delete perms[safeOrigin][permission];
      } else {
        perms[safeOrigin][permission] = allowed;
      }

      if (Object.keys(perms[safeOrigin]).length === 0) {
        delete perms[safeOrigin];
      }

      return savePerms(perms);
    }
  );

  // Ad blocker toggle

  ipcMain.handle('vortex:set-blocker', async (event, enabled) => {
    if (!isTrustedSender(event)) return blockerEnabled;

    blockerEnabled = enabled === true;
    return blockerEnabled;
  });

  ipcMain.handle('vortex:get-privacy-stats', async (event) => {
    if (!isTrustedSender(event)) return { ads: 0, trackers: 0 };

    return { ads: privacyStats.ads, trackers: privacyStats.trackers };
  });

  // Download directory

  ipcMain.handle('vortex:set-download-directory', async (event, dir) => {
    if (!isTrustedSender(event)) return false;

    if (typeof dir !== 'string' || !dir) return false;

    try {
      return await session.defaultSession.setDownloadPath(dir);
    } catch (error) {
      console.error('[IPC] Download dir error:', error);
      return false;
    }
  });

  // Download actions

  ipcMain.handle('vortex:download-action', async (event, payload) => {
    if (!isTrustedSender(event)) return false;

    const id = payload && typeof payload === 'object' ? payload.id : undefined;
    const action = payload && typeof payload === 'object' ? payload.action : undefined;
    const item = downloadItems.get(id);

    if (!item) return false;

    try {
      if (action === 'pause') { item.pause(); return true; }
      if (action === 'resume') { item.resume(); return true; }
      if (action === 'cancel') { item.cancel(); return true; }
      if (action === 'open') { const p = item.getSavePath(); if (p) return await shell.openPath(p); return false; }
      if (action === 'show') { const p = item.getSavePath(); if (p) shell.showItemInFolder(p); return true; }
      return false;
    } catch (error) {
      console.error('[IPC] Download action error:', error);
      return false;
    }
  });

  // New window

  ipcMain.handle('vortex:new-window', async (event, payload) => {
    if (!isTrustedSender(event)) return false;

    const incognito = Boolean(payload && typeof payload === 'object' && payload.incognito);

    const win = new BrowserWindow({
      width: 1360,
      height: 860,
      minWidth: 720,
      minHeight: 480,
      title: 'Vortex',
      backgroundColor: '#1e1e1e',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: true,
        sandbox: false,
        ...(incognito ? { session: session.defaultSession.createIncognitoSession() } : {})
      }
    });

    mainWindow = win;

    win.loadFile(
      path.join(__dirname, 'renderer', 'index.html')
    ).catch(error => {
      console.error('[Window] Failed to load:', error);
    });

    win.webContents.on(
      'console-message',
      (_event, level, message) => {
        console.log('[renderer]', message);
      }
    );

    win.webContents.on('render-process-gone', (_event, details) => {
      console.error('[Window] Renderer process exited:', details);
    });

    win.on('closed', () => {
      if (mainWindow === win) mainWindow = null;
    });

    return true;
  });
}

// --------------------------------------------------
// APPLICATION LIFECYCLE
// --------------------------------------------------

app.whenReady().then(() => {
  ensureDataDirectory();

  installAdBlocker();
  installPermissionHandlers();
  installDownloadHandler();

  registerIPC();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch(error => {
  console.error('[Application] Startup failed:', error);
  app.quit();
});

// --------------------------------------------------
// APPLICATION EXIT
// --------------------------------------------------

app.on('before-quit', () => {
  isQuitting = true;

  for (const [id, entry] of permCallbacks) {
    try {
      entry.callback(false);
    } catch (error) {
      console.error('[Permissions] Cleanup error:', error);
    }

    permCallbacks.delete(id);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || isQuitting) {
    app.quit();
  }
});
