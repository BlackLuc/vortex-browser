"use strict";

/*
 * Vortex renderer.
 *
 * Requires an Electron host with webviewTag enabled.
 * Do not enable Node integration inside guest webviews.
 *
 * Optional window.vortex preload bridge:
 *
 * isIncognito: boolean
 * newWindow({ incognito: boolean })
 * setBlocker(enabled) -> Promise<boolean>
 * getPrivacyStats() -> Promise<{ ads: number, trackers: number }>
 * getPermissions() -> Promise<Array<{ origin, type, allowed }>>
 * setPermission({ origin, type, allowed }) -> Promise
 * clearBrowsingData() -> Promise
 * onPermissionRequest(callback)
 *   callback receives { origin, type, reply(boolean) }
 * onDownload(callback)
 *   callback receives { id, name, state, receivedBytes, totalBytes }
 * downloadAction({ id, action })
 *   actions: pause, resume, cancel, open, show
 * setDownloadDirectory(path) -> Promise
 *
 * The host must enforce permissions, blocking and incognito partitions.
 * UI flags are not security boundaries.
 */

const $ = id => document.getElementById(id);

const bridge = window.vortex || {};
const INCOGNITO = bridge.isIncognito === true;
const STORAGE_KEY = "vortex-browser-v2";

const DEFAULT_SETTINGS = {
  homepage: "",
  searchEngine: "google",
  customSearch: "",
  theme: "dark",
  accentColor: "indigo",
  showBookmarksBar: true,
  restoreSession: true,
  defaultZoom: 1,
  downloadDirectory: "",
  autoSleep: true,
  autoSleepMinutes: 10
};

const SEARCH_ENGINES = {
  google: "https://www.google.com/search?q=",
  bing: "https://www.bing.com/search?q=",
  duckduckgo: "https://duckduckgo.com/?q=",
  yahoo: "https://search.yahoo.com/search?p="
};

const QUICK_LINKS = [
  { title: "YouTube", url: "https://www.youtube.com", icon: "▶" },
  { title: "GitHub", url: "https://github.com", icon: "⌘" },
  { title: "Wikipedia", url: "https://www.wikipedia.org", icon: "W" },
  { title: "Reddit", url: "https://www.reddit.com", icon: "◎" }
];

const state = {
  tabs: [],
  activeTabId: null,
  splitTabId: null,
  closedTabs: [],
  bookmarks: [],
  history: [],
  downloads: [],
  workspaces: ["Default"],
  activeWorkspace: "Default",
  settings: { ...DEFAULT_SETTINGS },
  currentPanel: null,
  blockerEnabled: null,
  privacyStats: null,
  permissions: []
};

let sequence = 0;
let toastTimer;
let suggestionIndex = -1;
let suggestionItems = [];
let cpIndex = 0;
let cpItems = [];
let panelVersion = 0;
let adminDevEnabled = false;

const permissionQueue = [];
let activePermission = null;

/* Helpers */

function id() {
  return `${Date.now().toString(36)}-${++sequence}`;
}

function node(tag, className = "", text) {
  const el = document.createElement(tag);

  if (className) el.className = className;
  if (text !== undefined) el.textContent = String(text);

  return el;
}

function button(text, run, className = "text-btn", title = "") {
  const el = node("button", className, text);
  el.type = "button";

  if (title) {
    el.title = title;
    el.setAttribute("aria-label", title);
  }

  el.addEventListener("click", run);
  return el;
}

function toast(message) {
  $("vx-toast").textContent = message;
  $("vx-toast").classList.remove("hidden");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("vx-toast").classList.add("hidden");
  }, 4000);
}

async function attempt(run, message = "That action could not be completed.") {
  try {
    return await run();
  } catch (error) {
    console.warn("[Vortex]", error);
    toast(message);
    return undefined;
  }
}

function nativeRequired(feature) {
  toast(`${feature} needs support from the desktop host.`);
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "New Tab";
  }
}

function validUrl(value) {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value);
    return ["http:", "https:", "file:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function validSearchTemplate(value) {
  if (typeof value !== "string" || !value.includes("{query}")) return false;
  return Boolean(validUrl(value.replaceAll("{query}", "test")));
}

function toUrl(raw) {
  const value = String(raw || "").trim();

  if (!value) return null;

  if (/^localhost(?::\d+)?(?:\/.*)?$/i.test(value)) {
    return validUrl(`http://${value}`);
  }

  // Reject script/data/file and other privileged URL schemes.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return validUrl(value);
  }

  if (/^[^\s/]+\.[^\s]+$/.test(value)) {
    return validUrl(`https://${value}`);
  }

  const query = encodeURIComponent(value);

  if (
    state.settings.searchEngine === "custom" &&
    validSearchTemplate(state.settings.customSearch)
  ) {
    return validUrl(state.settings.customSearch.replaceAll("{query}", query));
  }

  const prefix =
    SEARCH_ENGINES[state.settings.searchEngine] || SEARCH_ENGINES.google;

  return prefix + query;
}

function activeTab() {
  return state.tabs.find(tab => tab.id === state.activeTabId) || null;
}

function workspaceTabs(includeSnoozed = false) {
  return state.tabs
    .filter(tab => {
      return tab.workspace === state.activeWorkspace &&
        (includeSnoozed || !tab.snoozedUntil);
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));
}

function ensureActive() {
  const tabs = workspaceTabs();

  if (!tabs.some(tab => tab.id === state.activeTabId)) {
    state.activeTabId = tabs[0]?.id || null;
  }

  if (!state.activeTabId) {
    const tab = makeTab("");
    state.tabs.push(tab);
    state.activeTabId = tab.id;
  }

  const secondary = state.tabs.find(tab => {
    return tab.id === state.splitTabId &&
      tab.workspace === state.activeWorkspace &&
      !tab.snoozedUntil &&
      tab.id !== state.activeTabId;
  });

  if (!secondary) state.splitTabId = null;
}

/* Persistence */

function serializableTab(tab) {
  return {
    id: tab.id,
    url: tab.url,
    title: tab.title,
    workspace: tab.workspace,
    pinned: tab.pinned,
    muted: tab.muted,
    zoom: tab.zoom,
    snoozedUntil: tab.snoozedUntil,
    lastActiveAt: tab.lastActiveAt || 0
  };
}

function save() {
  if (INCOGNITO) return;

  const session = state.settings.restoreSession
    ? state.tabs.map(serializableTab)
    : [];

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: state.settings,
      bookmarks: state.bookmarks,
      history: state.history.slice(0, 5000),
      workspaces: state.workspaces,
      activeWorkspace: state.activeWorkspace,
      activeTabId: state.settings.restoreSession ? state.activeTabId : null,
      session
    }));
  } catch {
    toast("Vortex could not save your changes.");
  }
}

function loadEntries(entries) {
  if (!Array.isArray(entries)) return [];

  return entries.flatMap(entry => {
    if (!entry || typeof entry !== "object") return [];

    const url = validUrl(entry.url);
    if (!url) return [];

    return [{
      id: typeof entry.id === "string" ? entry.id : id(),
      url,
      title: typeof entry.title === "string"
        ? entry.title.slice(0, 300) : hostOf(url),
      time: Number.isFinite(entry.time) ? entry.time : Date.now()
    }];
  }).slice(0, 5000);
}

function load() {
  if (INCOGNITO) return;

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object") return;

    const settings = saved.settings || {};

    state.settings = {
      ...DEFAULT_SETTINGS,
      homepage: validUrl(settings.homepage) || "",
      searchEngine: (
        Object.hasOwn(SEARCH_ENGINES, settings.searchEngine) ||
        settings.searchEngine === "custom"
      ) ? settings.searchEngine : DEFAULT_SETTINGS.searchEngine,
      customSearch: validSearchTemplate(settings.customSearch)
        ? settings.customSearch : "",
      theme: settings.theme === "light" ? "light" : "dark",
      accentColor: ["indigo", "emerald", "rose", "amber", "cyan"]
        .includes(settings.accentColor) ? settings.accentColor : "indigo",
      showBookmarksBar: settings.showBookmarksBar !== false,
      restoreSession: settings.restoreSession !== false,
      defaultZoom: Number.isFinite(settings.defaultZoom)
        ? Math.max(0.5, Math.min(3, settings.defaultZoom)) : 1,
      downloadDirectory: typeof settings.downloadDirectory === "string"
        ? settings.downloadDirectory : "",
      autoSleep: settings.autoSleep !== false,
      autoSleepMinutes: Number.isFinite(Number(settings.autoSleepMinutes))
        && Number(settings.autoSleepMinutes) > 0
        ? Math.min(240, Math.max(1, Number(settings.autoSleepMinutes)))
        : DEFAULT_SETTINGS.autoSleepMinutes
    };

    state.bookmarks = loadEntries(saved.bookmarks);
    state.history = loadEntries(saved.history);

    if (Array.isArray(saved.workspaces)) {
      state.workspaces = [...new Set(
        saved.workspaces
          .filter(name => typeof name === "string" && name.trim())
          .map(name => name.trim().slice(0, 50))
      )].slice(0, 50);

      if (!state.workspaces.length) state.workspaces = ["Default"];
    }

    state.activeWorkspace = state.workspaces.includes(saved.activeWorkspace)
      ? saved.activeWorkspace : state.workspaces[0];

    if (state.settings.restoreSession && Array.isArray(saved.session)) {
      for (const savedTab of saved.session.slice(0, 200)) {
        if (!savedTab || typeof savedTab !== "object") continue;

        const url = savedTab.url === "" ? "" : validUrl(savedTab.url);
        if (url === null) continue;

        const tab = makeTab(url);

        if (
          typeof savedTab.id === "string" &&
          !state.tabs.some(item => item.id === savedTab.id)
        ) {
          tab.id = savedTab.id;
        }

        tab.workspace = state.workspaces.includes(savedTab.workspace)
          ? savedTab.workspace : state.activeWorkspace;

        tab.pinned = savedTab.pinned === true;
        tab.muted = savedTab.muted === true;
        tab.zoom = Number.isFinite(savedTab.zoom)
          ? Math.max(0.5, Math.min(3, savedTab.zoom)) : 1;

        tab.snoozedUntil = Number.isFinite(savedTab.snoozedUntil) &&
          savedTab.snoozedUntil > Date.now()
          ? savedTab.snoozedUntil : 0;

        tab.lastActiveAt = Number.isFinite(savedTab.lastActiveAt) &&
          savedTab.lastActiveAt > 0
          ? savedTab.lastActiveAt
          : 0;

        if (typeof savedTab.title === "string" && savedTab.title.trim()) {
          tab.title = savedTab.title.slice(0, 300);
        }

        state.tabs.push(tab);
      }

      state.activeTabId = saved.activeTabId;
    }
  } catch {
    console.warn("[Vortex] Saved state was invalid; starting fresh.");
  }
}

/* Appearance */

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme;
  document.documentElement.dataset.accent = state.settings.accentColor;
}

/* Tab creation */

function makeTab(url = "") {
  return {
    id: id(),
    url,
    title: url ? hostOf(url) : "New Tab",
    workspace: state.activeWorkspace,
    pinned: false,
    muted: false,
    loading: false,
    snoozedUntil: 0,
    lastActiveAt: 0,
    readerMode: false,
    zoom: state.settings.defaultZoom,
    pane: null,
    webview: null,
    ready: false,
    newtab: null,
    paneAddress: null
  };
}

function createTab(raw = "", options = {}) {
  const url = raw ? toUrl(raw) : "";

  if (raw && !url) {
    toast("Enter a valid HTTP/HTTPS URL or search.");
    return null;
  }

  const tab = makeTab(url || "");
  state.tabs.push(tab);

  if (options.active !== false) {
    state.activeTabId = tab.id;
  }

  render();
  save();
  return tab.id;
}

function switchTab(tabId) {
  const tab = state.tabs.find(item => item.id === tabId);
  if (!tab) return;

  tab.lastActiveAt = Date.now();
  state.activeWorkspace = tab.workspace;
  state.activeTabId = tab.id;
  tab.snoozedUntil = 0;

  if (state.splitTabId === tab.id) state.splitTabId = null;

  closeFind();
  window.speechSynthesis?.cancel();
  render();
  save();
  // cache preview for the newly active tab
  captureTabPreview(tab).catch(() => {});
}

function destroyGuest(tab) {
  tab.webview?.remove();
  tab.pane?.remove();

  tab.webview = null;
  tab.pane = null;
  tab.newtab = null;
  tab.paneAddress = null;
  tab.ready = false;
}

function closeTab(tabId) {
  const index = state.tabs.findIndex(tab => tab.id === tabId);
  if (index < 0) return;
  hideTabPreview();
  invalidateTabPreview(tabId);

  const [tab] = state.tabs.splice(index, 1);

  state.closedTabs.push(serializableTab(tab));
  state.closedTabs = state.closedTabs.slice(-30);

  destroyGuest(tab);

  if (state.splitTabId === tabId) state.splitTabId = null;

  render();
  save();
}

function reopenClosedTab() {
  const savedTab = state.closedTabs.pop();
  if (!savedTab) return toast("No recently closed tabs.");

  const tab = makeTab(savedTab.url);
  tab.workspace = state.activeWorkspace;
  tab.pinned = savedTab.pinned;
  tab.muted = savedTab.muted;
  tab.zoom = savedTab.zoom;

  state.tabs.push(tab);
  state.activeTabId = tab.id;

  render();
  save();
}

function cycleTab(direction) {
  const tabs = workspaceTabs();
  if (!tabs.length) return;

  const index = tabs.findIndex(tab => tab.id === state.activeTabId);
  const next = (index + direction + tabs.length) % tabs.length;

  switchTab(tabs[next].id);
}

function snoozeTab(tabId, minutes = 30) {
  const tab = state.tabs.find(item => item.id === tabId);
  if (!tab) return;

  tab.snoozedUntil = Date.now() + minutes * 60 * 1000;
  destroyGuest(tab);

  if (state.splitTabId === tab.id) state.splitTabId = null;

  render();
  save();
  toast(`Tab snoozed for ${minutes} minutes.`);
}

function wakeTab(tabId) {
  const tab = state.tabs.find(item => item.id === tabId);
  if (!tab) return;

  tab.snoozedUntil = 0;
  switchTab(tab.id);
}

function wakeDueTabs() {
  let changed = false;

  for (const tab of state.tabs) {
    if (tab.snoozedUntil && tab.snoozedUntil <= Date.now()) {
      tab.snoozedUntil = 0;
      changed = true;
    }
  }

  if (changed) {
    render();
    save();
    toast("A snoozed tab is ready.");
  }
}

function autoSleepIdleTabs() {
  if (!state.settings.autoSleep) return;

  const idleMs = Math.max(
    60,
    (Number(state.settings.autoSleepMinutes) || DEFAULT_SETTINGS.autoSleepMinutes) * 60 * 1000
  );
  const now = Date.now();
  let slept = false;

  for (const tab of state.tabs) {
    if (tab.snoozedUntil) continue;
    if (tab.id === state.activeTabId) continue;
    if (state.splitTabId === tab.id) continue;
    if (tab.pinned) continue;
    if (!tab.lastActiveAt) continue;
    if (now - tab.lastActiveAt < idleMs) continue;

    tab.snoozedUntil = now + idleMs;
    destroyGuest(tab);
    slept = true;
  }

  if (slept) {
    render();
    save();
  }
}

async function toggleMute(tab) {
  if (tab.webview && tab.ready) {
    if (typeof tab.webview.setAudioMuted !== "function") {
      return nativeRequired("Tab muting");
    }

    const next = !tab.muted;

    try {
      tab.webview.setAudioMuted(next);
      tab.muted = next;
    } catch {
      return toast("This tab could not be muted.");
    }
  } else {
    // Apply the preference when its guest becomes ready.
    tab.muted = !tab.muted;
  }

  renderTabs();
  save();
}

function openTabMenu(tab) {
  const items = $("tab-menu-items");
  items.replaceChildren();

  const actions = [
    [tab.pinned ? "Unpin tab" : "Pin tab", () => {
      tab.pinned = !tab.pinned;
      renderTabs();
      save();
    }],
    [tab.muted ? "Unmute tab" : "Mute tab", () => toggleMute(tab)],
    ["Duplicate tab", () => createTab(tab.url)],
    ["Snooze for 5 minutes", () => snoozeTab(tab.id, 5)],
    ["Snooze for 30 minutes", () => snoozeTab(tab.id, 30)],
    ["Snooze for 1 hour", () => snoozeTab(tab.id, 60)],
    ["Close tab", () => closeTab(tab.id)]
  ];

  for (const [label, run] of actions) {
    items.append(button(label, () => {
      $("tab-menu").close();
      run();
    }, "menu-item"));
  }

  $("tab-menu").showModal();
}

/* Webviews */

function recordHistory(url, title) {
  if (INCOGNITO || !validUrl(url)) return;
  if (state.history[0]?.url === url) return;

  state.history.unshift({
    id: id(),
    url,
    title: title || hostOf(url),
    time: Date.now()
  });

  state.history = state.history.slice(0, 5000);
  save();
}

function attachWebview(tab) {
  if (!tab.pane || !tab.url || tab.webview) return;

  const view = document.createElement("webview");

  view.className = "tab-view";
  view.setAttribute(
    "webpreferences",
    "contextIsolation=yes,sandbox=yes,nodeIntegration=no"
  );

  /*
   * No allowpopups attribute.
   * The host should handle window.open using setWindowOpenHandler.
   * The host must override/enforce the guest session for private windows.
   */

  tab.webview = view;

  view.addEventListener("dom-ready", () => {
    tab.ready = true;
    tab.loading = false;

    attempt(() => {
      view.setZoomFactor(tab.zoom);
      view.setAudioMuted(tab.muted);
    });

    if (tab.readerMode) applyReader(tab, true);

    invalidateTabPreview(tab.id);
    if (tab.id === state.activeTabId) captureTabPreview(tab).catch(() => {});

    updateToolbar();
    renderTabs();
  });

  view.addEventListener("did-start-loading", () => {
    tab.loading = true;
    renderTabs();
  });

  view.addEventListener("did-stop-loading", () => {
    tab.loading = false;
    renderTabs();
    updateToolbar();
  });

  view.addEventListener("page-title-updated", event => {
    tab.title = event.title || hostOf(tab.url);

    const entry = state.history.find(item => item.url === tab.url);
    if (entry) entry.title = tab.title;

    renderTabs();
    updateToolbar();
    save();
  });

  const navigated = event => {
    if (event.isMainFrame === false || !validUrl(event.url)) return;

    tab.url = event.url;

    invalidateTabPreview(tab.id);

    if (tab.paneAddress) tab.paneAddress.value = tab.url;

    recordHistory(tab.url, tab.title);
    invalidateTabPreview(tab.id);
    updateToolbar();
    renderTabs();
    save();
    if (tab.id === state.activeTabId) captureTabPreview(tab).catch(() => {});
  };

  view.addEventListener("did-navigate", navigated);
  view.addEventListener("did-navigate-in-page", navigated);

  view.addEventListener("found-in-page", event => {
    if (tab.id !== state.activeTabId) return;

    const result = event.result;
    $("find-count").textContent = result?.matches
      ? `${result.activeMatchOrdinal}/${result.matches}` : "0/0";
  });

  view.addEventListener("did-fail-load", event => {
    if (event.errorCode === -3 || event.isMainFrame === false) return;

    tab.loading = false;
    renderTabs();
    toast(event.errorDescription || "This page could not be loaded.");
  });

  // Supported by older Electron hosts; modern hosts handle this natively.
  view.addEventListener("new-window", event => {
    event.preventDefault?.();

    if (validUrl(event.url)) createTab(event.url);
  });

  view.setAttribute("src", tab.url);
  tab.pane.append(view);
}

async function withView(run, tab = activeTab()) {
  if (!tab?.url || !tab.webview || !tab.ready) {
    return toast("Open a page and wait for it to finish loading.");
  }

  return attempt(() => run(tab.webview, tab));
}

async function navigate(raw, tab = activeTab()) {
  const url = toUrl(raw);
  if (!url) return toast("Enter a valid HTTP/HTTPS URL or search.");

  if (!tab) {
    createTab(url);
    return;
  }

  tab.url = url;
  tab.title = hostOf(url);

  if (!tab.pane) createPane(tab);

  tab.newtab?.classList.add("hidden");

  if (!tab.webview) {
    attachWebview(tab);
  } else {
    await attempt(() => {
      if (tab.ready && typeof tab.webview.loadURL === "function") {
        return tab.webview.loadURL(url);
      }

      tab.webview.setAttribute("src", url);
    }, "This address could not be opened.");
  }

  hideSuggestions();
  renderViews();
  renderTabs();
  updateToolbar();
  save();
}

/* New tab page */

function createNewTabPage(tab) {
  const page = node("section", "newtab-page");
  const inner = node("div", "nt-inner");

  inner.append(node("h1", "", "Vortex"));

  const hour = new Date().getHours();
  const greeting = hour < 12
    ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  inner.append(node("p", "nt-greeting", greeting));

  const form = node("form", "nt-search-form");
  const input = node("input", "nt-search");

  input.placeholder = "Search the web";
  input.setAttribute("aria-label", "Search the web");

  const submit = node("button", "btn-primary", "→");
  submit.type = "submit";
  submit.setAttribute("aria-label", "Search");

  form.append(input, submit);

  form.addEventListener("submit", event => {
    event.preventDefault();
    navigate(input.value, tab);
  });

  inner.append(form);

  function links(items) {
    const grid = node("div", "nt-links");

    for (const site of items) {
      const tile = button("", () => navigate(site.url, tab), "nt-tile");

      tile.append(
        node("span", "nt-icon", site.icon || "↗"),
        node("span", "", site.title)
      );

      grid.append(tile);
    }

    return grid;
  }

  inner.append(links(QUICK_LINKS));

  const counts = new Map();

  for (const entry of state.history) {
    const hostname = hostOf(entry.url);
    const item = counts.get(hostname) || {
      title: hostname,
      url: entry.url,
      count: 0
    };

    item.count++;
    counts.set(hostname, item);
  }

  const top = [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  if (top.length) {
    inner.append(node("h2", "nt-section", "Top sites"), links(top));
  }

  page.append(inner);
  return page;
}

function createPane(tab) {
  const pane = node("section", "tab-pane");
  pane.dataset.tabId = tab.id;

  const toolbar = node("form", "pane-toolbar hidden");
  const address = node("input", "pane-address");

  address.placeholder = "Search or enter URL";
  address.value = tab.url;
  address.setAttribute("aria-label", "Split view address");

  toolbar.append(
    address,
    button("×", () => {
      state.splitTabId = null;
      renderViews();
      updateToolbar();
    }, "icon-btn", "Close split view")
  );

  toolbar.addEventListener("submit", event => {
    event.preventDefault();
    navigate(address.value, tab);
  });

  pane.append(toolbar);

  tab.pane = pane;
  tab.paneAddress = address;
  tab.newtab = createNewTabPage(tab);

  pane.append(tab.newtab);
  $("views").append(pane);

  if (tab.url) {
    tab.newtab.classList.add("hidden");
    attachWebview(tab);
  }

  return pane;
}

/* Rendering */

function renderTabs() {
  $("tabs").replaceChildren();

  for (const tab of workspaceTabs()) {
    const el = node(
      "div",
      "tab" +
      (tab.id === state.activeTabId ? " active" : "") +
      (tab.pinned ? " pinned" : "") +
      (tab.loading ? " loading" : "")
    );

    const prefix = `${tab.pinned ? "◆ " : ""}${tab.muted ? "◌ " : ""}`;

    const label = button(
      prefix + tab.title,
      () => switchTab(tab.id),
      "tab-label",
      tab.title
    );

    label.setAttribute("role", "tab");
    label.setAttribute(
      "aria-selected",
      String(tab.id === state.activeTabId)
    );

    el.append(
      label,
      button("×", () => closeTab(tab.id), "icon-btn tab-close", "Close tab")
    );

    el.addEventListener("contextmenu", event => {
      event.preventDefault();
      openTabMenu(tab);
    });

    el.addEventListener("auxclick", event => {
      if (event.button === 1) {
        event.preventDefault();
        closeTab(tab.id);
      }
    });

    el.addEventListener("mouseenter", () => {
      clearTimeout(tabPreviewHideTimer);
      tabPreviewTimer = setTimeout(() => showTabPreview(tab, el), 300);
    });
    el.addEventListener("mouseleave", () => {
      clearTimeout(tabPreviewTimer);
      tabPreviewHideTimer = setTimeout(hideTabPreview, 120);
    });

    $("tabs").append(el);
  }
}

function renderViews() {
  const visibleIds = [state.activeTabId, state.splitTabId].filter(Boolean);

  for (const tab of state.tabs) {
    const visible = visibleIds.includes(tab.id) && !tab.snoozedUntil;

    if (visible && !tab.pane) createPane(tab);
    if (!tab.pane) continue;

    tab.pane.classList.toggle("hidden", !visible);
    tab.pane.classList.toggle("secondary", tab.id === state.splitTabId);

    const toolbar = tab.pane.querySelector(".pane-toolbar");
    toolbar?.classList.toggle("hidden", tab.id !== state.splitTabId);

    tab.pane.style.order = tab.id === state.splitTabId ? "1" : "0";
  }

  $("views").classList.toggle("split", Boolean(state.splitTabId));

  const tab = activeTab();

  $("reader-toolbar").classList.toggle(
    "hidden",
    !tab?.readerMode
  );
}

function renderWorkspaces() {
  $("ws-select").replaceChildren();

  for (const name of state.workspaces) {
    const option = node("option", "", name);
    option.value = name;
    $("ws-select").append(option);
  }

  $("ws-select").value = state.activeWorkspace;
}

function renderBookmarksBar() {
  const bar = $("bookmarks-bar");

  bar.classList.toggle("hidden", !state.settings.showBookmarksBar);
  bar.replaceChildren();

  for (const bookmark of state.bookmarks) {
    const item = button(
      bookmark.title,
      () => navigate(bookmark.url),
      "bm-item",
      bookmark.url
    );

    item.addEventListener("auxclick", event => {
      if (event.button === 1) {
        event.preventDefault();
        createTab(bookmark.url, { active: false });
      }
    });

    bar.append(item);
  }
}

function updateToolbar() {
  const tab = activeTab();

  if (document.activeElement !== $("address")) {
    $("address").value = tab?.url || "";
  }

  let canGoBack = false;
  let canGoForward = false;

  if (tab?.webview && tab.ready) {
    try {
      canGoBack = tab.webview.canGoBack();
      canGoForward = tab.webview.canGoForward();
    } catch {
      // Guest may be navigating or closing.
    }
  }

  $("btn-back").disabled = !canGoBack;
  $("btn-forward").disabled = !canGoForward;

  const bookmarked = Boolean(
    tab?.url && state.bookmarks.some(item => item.url === tab.url)
  );

  $("btn-star").textContent = bookmarked ? "★" : "☆";
  $("btn-star").classList.toggle("active", bookmarked);

  $("btn-split").setAttribute(
    "aria-pressed",
    String(Boolean(state.splitTabId))
  );

  const zoom = Math.round((tab?.zoom || 1) * 100);
  $("zoom-label").textContent = `${zoom}%`;
  $("zoom-label").classList.toggle("hidden", zoom === 100);

  $("btn-site").title = tab?.url
    ? "Website permissions" : "Privacy dashboard";

  document.title =
    `${tab?.title || "New Tab"} — Vortex${INCOGNITO ? " Private" : ""}`;
}

function render() {
  ensureActive();
  applyTheme();
  renderWorkspaces();
  renderTabs();
  renderViews();
  renderBookmarksBar();
  updateToolbar();

  if (state.currentPanel) renderPanel(state.currentPanel);
}

/* Navigation suggestions */

function hideSuggestions() {
  $("suggestions").classList.add("hidden");
  suggestionIndex = -1;
}

function showSuggestions() {
  const query = $("address").value.trim().toLowerCase();

  if (!query) return hideSuggestions();

  const seen = new Set();

  suggestionItems = [...state.bookmarks, ...state.history]
    .filter(item => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);

      return `${item.title} ${item.url}`.toLowerCase().includes(query);
    })
    .slice(0, 7);

  suggestionIndex = -1;
  drawSuggestions();
}

function drawSuggestions() {
  const container = $("suggestions");
  container.replaceChildren();

  suggestionItems.forEach((item, index) => {
    const control = button(
      "",
      () => navigate(item.url),
      `suggestion${index === suggestionIndex ? " active" : ""}`
    );

    control.append(
      node("strong", "", item.title),
      node("small", "", item.url)
    );

    control.addEventListener("mousedown", event => event.preventDefault());
    container.append(control);
  });

  container.classList.toggle("hidden", !suggestionItems.length);
}

function moveSuggestion(direction) {
  if (!suggestionItems.length) return;

  suggestionIndex =
    (suggestionIndex + direction + suggestionItems.length) %
    suggestionItems.length;

  drawSuggestions();
}

/* Bookmarks */

function toggleBookmark() {
  const tab = activeTab();
  if (!tab?.url) return toast("Open a page first.");

  const existing = state.bookmarks.find(item => item.url === tab.url);

  if (existing) {
    state.bookmarks = state.bookmarks.filter(item => item.id !== existing.id);
  } else {
    state.bookmarks.push({
      id: id(),
      url: tab.url,
      title: tab.title,
      time: Date.now()
    });
  }

  renderBookmarksBar();
  updateToolbar();

  if (state.currentPanel === "bookmarks") renderPanel("bookmarks");

  save();
}

/* Find in page */

function openFind() {
  const tab = activeTab();

  if (!tab?.url) return toast("Open a page first.");

  $("findbar").classList.remove("hidden");
  $("find-input").focus();
  $("find-input").select();
}

function closeFind() {
  $("findbar").classList.add("hidden");
  $("find-count").textContent = "";

  const tab = activeTab();

  if (tab?.ready) {
    attempt(() => tab.webview.stopFindInPage("clearSelection"));
  }
}

function doFind(forward = true, findNext = true) {
  const query = $("find-input").value;

  withView(view => {
    if (!query) {
      $("find-count").textContent = "";
      view.stopFindInPage("clearSelection");
      return;
    }

    view.findInPage(query, { forward, findNext });
  });
}

/* Reader mode */

const READER_CSS = `
  body {
    max-width: 760px !important;
    margin: auto !important;
    padding: 36px 24px !important;
    background: #f7f8fb !important;
    color: #1c2028 !important;
    font-family: Georgia, serif !important;
    font-size: 20px !important;
    line-height: 1.75 !important;
  }

  nav, aside, footer, [role="navigation"], [role="banner"] {
    display: none !important;
  }

  img, video {
    max-width: 100% !important;
    height: auto !important;
  }
`;

async function applyReader(tab, enabled) {
  if (!tab.webview || !tab.ready) return;

  const script = enabled
    ? `(() => {
        if (document.getElementById("vortex-reader-style")) return;
        const style = document.createElement("style");
        style.id = "vortex-reader-style";
        style.textContent = ${JSON.stringify(READER_CSS)};
        document.head.append(style);
      })()`
    : `document.getElementById("vortex-reader-style")?.remove()`;

  return tab.webview.executeJavaScript(script);
}

async function toggleReader() {
  await withView(async (view, tab) => {
    const next = !tab.readerMode;

    await applyReader(tab, next);
    tab.readerMode = next;

    if (!next) window.speechSynthesis?.cancel();

    renderViews();
  });
}

async function readAloud() {
  await withView(async view => {
    const text = await view.executeJavaScript(
      "document.body.innerText"
    );

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(
      String(text || "").slice(0, 12000)
    );

    window.speechSynthesis.speak(utterance);
  });
}

/* Workspaces and split view */

function newWorkspace() {
  const name = (prompt("Workspace name:") || "").trim().slice(0, 50);

  if (!name) return;
  if (state.workspaces.includes(name)) {
    return toast("That workspace already exists.");
  }

  state.workspaces.push(name);
  state.activeWorkspace = name;
  state.activeTabId = null;
  state.splitTabId = null;

  render();
  save();
}

function switchWorkspace(name) {
  if (!state.workspaces.includes(name)) return;

  closeFind();
  window.speechSynthesis?.cancel();

  state.activeWorkspace = name;
  state.activeTabId = null;
  state.splitTabId = null;

  render();
  save();
}

function toggleSplit() {
  if (state.splitTabId) {
    state.splitTabId = null;
  } else {
    let other = workspaceTabs().find(tab => tab.id !== state.activeTabId);

    if (!other) {
      other = makeTab("");
      state.tabs.push(other);
    }

    state.splitTabId = other.id;
  }

  renderViews();
  updateToolbar();
  save();
}

/* Panels */

function openPanel(name) {
  if (state.currentPanel === name) {
    closePanel();
    return;
  }

  state.currentPanel = name;
  $("sidebar").classList.remove("hidden");
  renderPanel(name);
}

function closePanel() {
  state.currentPanel = null;
  panelVersion++;
  $("sidebar").classList.add("hidden");
}

function entryList(items, remove) {
  const container = node("div");

  if (!items.length) {
    container.append(node("p", "panel-empty", "Nothing here yet."));
  }

  for (const item of items) {
    const row = node("div", "panel-item");
    const open = button("", () => navigate(item.url), "panel-main");

    open.append(
      node("strong", "", item.title),
      node("small", "", item.url)
    );

    row.append(open);

    if (remove) {
      row.append(button("×", () => remove(item.id), "icon-btn", "Remove"));
    }

    container.append(row);
  }

  return container;
}

function settingRow(label, control, column = false) {
  const row = node("label", `setting-row${column ? " column" : ""}`);
  row.append(node("span", "", label), control);
  return row;
}

function selectControl(options, value, change) {
  const select = node("select");

  for (const [key, label] of options) {
    const option = node("option", "", label);
    option.value = String(key);
    select.append(option);
  }

  select.value = String(value);
  select.addEventListener("change", () => change(select.value));

  return select;
}

function checkbox(value, change) {
  const input = node("input");
  input.type = "checkbox";
  input.checked = Boolean(value);
  input.addEventListener("change", () => change(input.checked));
  return input;
}

function textInput(value, placeholder, change) {
  const input = node("input");
  input.type = "text";
  input.value = value;
  input.placeholder = placeholder;
  input.addEventListener("change", () => change(input));
  return input;
}

function updateSetting(key, value) {
  state.settings[key] = value;

  applyTheme();
  renderBookmarksBar();
  save();
}

function renderSettings(body) {
  body.append(
    node("h3", "panel-section", "Appearance"),

    settingRow("Theme", selectControl(
      [["dark", "Dark"], ["light", "Light"]],
      state.settings.theme,
      value => updateSetting("theme", value)
    )),

    settingRow("Accent", selectControl(
      ["indigo", "emerald", "rose", "amber", "cyan"].map(value => [
        value,
        value[0].toUpperCase() + value.slice(1)
      ]),
      state.settings.accentColor,
      value => updateSetting("accentColor", value)
    )),

    settingRow("Bookmarks bar", checkbox(
      state.settings.showBookmarksBar,
      value => updateSetting("showBookmarksBar", value)
    )),

    settingRow("Default zoom", selectControl(
      [0.75, 0.9, 1, 1.1, 1.25, 1.5, 2].map(value => [
        value,
        `${Math.round(value * 100)}%`
      ]),
      state.settings.defaultZoom,
      value => updateSetting("defaultZoom", Number(value))
    )),

    node("h3", "panel-section", "Search"),

    settingRow("Search engine", selectControl(
      [
        ["google", "Google"],
        ["bing", "Bing"],
        ["duckduckgo", "DuckDuckGo"],
        ["yahoo", "Yahoo"],
        ["custom", "Custom"]
      ],
      state.settings.searchEngine,
      value => updateSetting("searchEngine", value)
    )),

    settingRow("Custom search URL", textInput(
      state.settings.customSearch,
      "https://example.com/search?q={query}",
      input => {
        if (input.value && !validSearchTemplate(input.value)) {
          input.value = state.settings.customSearch;
          toast("Use an HTTP/HTTPS search URL containing {query}.");
          return;
        }

        updateSetting("customSearch", input.value);
      }
    ), true),

    node("h3", "panel-section", "Startup"),

    settingRow("Restore session", checkbox(
      state.settings.restoreSession,
      value => updateSetting("restoreSession", value)
    )),

    settingRow("Homepage", textInput(
      state.settings.homepage,
      "https://example.com",
      input => {
        const value = input.value.trim();
        const url = value ? validUrl(value) : "";

        if (value && !url) {
          input.value = state.settings.homepage;
          toast("Enter a complete HTTP/HTTPS homepage URL.");
          return;
        }

        updateSetting("homepage", url);
      }
    ), true),

    node("h3", "panel-section", "Tab sleeping"),

    settingRow("Auto sleep inactive tabs", checkbox(
      state.settings.autoSleep,
      value => updateSetting("autoSleep", value)
    )),

    settingRow("Sleep after idle", selectControl(
      [1, 5, 10, 30, 60].map(minutes => [
        String(minutes),
        `${minutes} min`
      ]),
      String(state.settings.autoSleepMinutes),
      value => updateSetting("autoSleepMinutes", Number(value))
    )),

    node("h3", "panel-section", "Downloads"),

    settingRow("Download folder", textInput(
      state.settings.downloadDirectory,
      "Desktop host download folder",
      async input => {
        if (typeof bridge.setDownloadDirectory !== "function") {
          input.value = state.settings.downloadDirectory;
          nativeRequired("Download folder selection");
          return;
        }

        try {
          await bridge.setDownloadDirectory(input.value);
          updateSetting("downloadDirectory", input.value);
        } catch {
          input.value = state.settings.downloadDirectory;
          toast("The download folder could not be changed.");
        }
      }
    ), true)
  );

  const actions = node("div", "panel-actions");

  actions.append(
    button("Privacy dashboard", () => openPanel("privacy")),
    button("Clear browsing data", clearBrowsingData, "btn-danger")
  );

  body.append(actions);
}

function renderDownloads(body) {
  if (!state.downloads.length) {
    body.append(node(
      "p",
      "panel-empty",
      typeof bridge.onDownload === "function"
        ? "No downloads yet."
        : "Download events require the desktop host."
    ));
    return;
  }

  for (const download of state.downloads) {
    const row = node("div", "panel-item");
    const text = node("div", "panel-main");

    const percentage = download.totalBytes > 0
      ? `${Math.min(100, Math.round(
          (download.receivedBytes || 0) / download.totalBytes * 100
        ))}%`
      : "";

    text.append(
      node("strong", "", download.name || "Download"),
      node("small", "", `${download.state || "Downloading"} ${percentage}`)
    );

    row.append(text);

    if (typeof bridge.downloadAction === "function") {
      const completed = download.state === "completed";
      const terminal = ["completed", "cancelled", "interrupted"]
        .includes(download.state);

      const actions = completed
        ? [["↗", "open", "Open file"], ["⌂", "show", "Show in folder"]]
        : terminal
          ? []
          : [
              [
                download.state === "paused" ? "▶" : "Ⅱ",
                download.state === "paused" ? "resume" : "pause",
                download.state === "paused" ? "Resume download" : "Pause download"
              ],
              ["×", "cancel", "Cancel download"]
            ];

      for (const [icon, action, title] of actions) {
        row.append(button(icon, () => attempt(() => {
          return bridge.downloadAction({ id: download.id, action });
        }), "icon-btn", title));
      }
    }

    body.append(row);
  }
}

async function renderPrivacy(body, version) {
  const stats = node("div");

  for (const [value, label] of [
    [state.history.length, "History entries"],
    [state.bookmarks.length, "Bookmarks"]
  ]) {
    const stat = node("div", "stat");
    stat.append(node("strong", "", value), node("span", "", label));
    stats.append(stat);
  }

  body.append(stats);

  if (typeof bridge.setBlocker === "function") {
    const control = checkbox(state.blockerEnabled === true, async value => {
      control.disabled = true;

      try {
        const actual = await bridge.setBlocker(value);

        if (typeof actual !== "boolean") {
          throw new Error("Host did not confirm blocker state.");
        }

        state.blockerEnabled = actual;
        control.checked = actual;
      } catch {
        control.checked = state.blockerEnabled === true;
        toast("The blocker state could not be confirmed.");
      } finally {
        control.disabled = false;
      }
    });

    body.append(settingRow(
      state.blockerEnabled === null
        ? "Ad / tracker blocker (unconfirmed)"
        : "Ad / tracker blocker",
      control
    ));
  } else {
    body.append(node(
      "p", "muted",
      "Ad and tracker blocking are not connected to the desktop host."
    ));
  }

  if (typeof bridge.getPrivacyStats === "function") {
    const result = await attempt(() => bridge.getPrivacyStats());

    if (version !== panelVersion || state.currentPanel !== "privacy") return;

    if (result) {
      state.privacyStats = result;

      for (const [value, label] of [
        [result.ads, "Ads blocked"],
        [result.trackers, "Trackers blocked"]
      ]) {
        if (!Number.isFinite(value)) continue;

        const stat = node("div", "stat");
        stat.append(node("strong", "", value), node("span", "", label));
        stats.append(stat);
      }
    }
  }

  body.append(node("h3", "panel-section", "Website permissions"));

  if (typeof bridge.getPermissions !== "function") {
    body.append(node(
      "p", "muted",
      "Camera, microphone and location permissions require the desktop host."
    ));
  } else {
    const permissions = await attempt(() => bridge.getPermissions());

    if (version !== panelVersion || state.currentPanel !== "privacy") return;

    state.permissions = Array.isArray(permissions) ? permissions : [];

    const currentOrigin = activeTab()?.url
      ? new URL(activeTab().url).origin : null;

    const ordered = [...state.permissions].sort((a, b) => {
      return Number(b.origin === currentOrigin) - Number(a.origin === currentOrigin);
    });

    if (!ordered.length) body.append(node("p", "muted", "No saved permissions."));

    for (const permission of ordered) {
      const row = node("div", "setting-row");
      const label = node("div");

      label.append(
        node("strong", "", permission.type),
        node("p", "muted", permission.origin)
      );

      row.append(label);

      if (typeof bridge.setPermission === "function") {
        const control = selectControl(
          [["allow", "Allow"], ["deny", "Deny"]],
          permission.allowed ? "allow" : "deny",
          async value => {
            control.disabled = true;

            try {
              await bridge.setPermission({
                origin: permission.origin,
                type: permission.type,
                allowed: value === "allow"
              });

              permission.allowed = value === "allow";
            } catch {
              control.value = permission.allowed ? "allow" : "deny";
              toast("The permission could not be changed.");
            } finally {
              control.disabled = false;
            }
          }
        );

        row.append(control);
      } else {
        row.append(node("span", "muted", permission.allowed ? "Allowed" : "Denied"));
      }

      body.append(row);
    }
  }

  const actions = node("div", "panel-actions");
  actions.append(button("Clear browsing data", clearBrowsingData, "btn-danger"));
  body.append(actions);
}

function renderPanel(name) {
  const version = ++panelVersion;

  const titles = {
    bookmarks: "Bookmarks",
    history: "History",
    downloads: "Downloads",
    settings: "Settings",
    privacy: "Privacy dashboard",
    snoozed: "Snoozed tabs"
  };

  $("sidebar-title").textContent = titles[name] || "Panel";
  const body = $("panel-content");
  body.replaceChildren();

  if (name === "bookmarks") {
    body.append(entryList(state.bookmarks, entryId => {
      state.bookmarks = state.bookmarks.filter(item => item.id !== entryId);
      renderBookmarksBar();
      updateToolbar();
      renderPanel("bookmarks");
      save();
    }));
  }

  if (name === "history") {
    body.append(button("Clear history", () => {
      if (!confirm("Clear browsing history?")) return;

      state.history = [];
      renderPanel("history");
      save();
    }, "btn-danger"));

    body.append(entryList(state.history.slice(0, 500), entryId => {
      state.history = state.history.filter(item => item.id !== entryId);
      renderPanel("history");
      save();
    }));
  }

  if (name === "settings") renderSettings(body);
  if (name === "downloads") renderDownloads(body);
  if (name === "privacy") attempt(() => renderPrivacy(body, version));

  if (name === "snoozed") {
    const tabs = state.tabs.filter(tab => tab.snoozedUntil);

    if (!tabs.length) body.append(node("p", "panel-empty", "No snoozed tabs."));

    for (const tab of tabs) {
      const row = node("div", "panel-item");
      const text = node("div", "panel-main");

      text.append(
        node("strong", "", tab.title),
        node("small", "", new Date(tab.snoozedUntil).toLocaleString())
      );

      row.append(text, button("Wake", () => wakeTab(tab.id)));
      body.append(row);
    }
  }
}

/* Permission request queue */

function queuePermission(request) {
  if (!request || typeof request.reply !== "function") return;

  permissionQueue.push(request);
  showNextPermission();
}

function showNextPermission() {
  if (activePermission || !permissionQueue.length) return;

  activePermission = permissionQueue.shift();

  $("perm-origin").textContent = String(activePermission.origin || "Website");
  $("perm-type").textContent = String(activePermission.type || "a permission");

  $("perm-prompt").showModal();
}

function answerPermission(allowed) {
  const request = activePermission;
  if (!request) return;

  activePermission = null;

  if ($("perm-prompt").open) $("perm-prompt").close();

  attempt(() => request.reply(Boolean(allowed)));
  showNextPermission();
}

/* Browser tools */

async function newWindow(incognito = false) {
  if (typeof bridge.newWindow !== "function") {
    return nativeRequired(incognito ? "Incognito windows" : "New browser windows");
  }

  await attempt(() => bridge.newWindow({ incognito }));
}

function setZoom(delta, reset = false) {
  const tab = activeTab();
  if (!tab) return;

  const zoom = reset
    ? 1
    : Math.max(0.5, Math.min(3, Number((tab.zoom + delta).toFixed(2))));

  if (tab.webview && tab.ready) {
    try {
      tab.webview.setZoomFactor(zoom);
    } catch {
      return toast("This page's zoom could not be changed.");
    }
  }

  tab.zoom = zoom;
  updateToolbar();
  save();
}

async function screenshot() {
  await withView(async view => {
    const image = await view.capturePage();

    if (!image || typeof image.toDataURL !== "function") {
      throw new Error("Guest screenshot was unavailable.");
    }

    const link = document.createElement("a");
    link.href = image.toDataURL();
    link.download = `vortex-${Date.now()}.png`;
    link.click();

    toast("Screenshot captured.");
  });
}

async function printPage() {
  await withView(view => new Promise((resolve, reject) => {
    view.print({}, (success, failureReason) => {
      if (success) resolve();
      else reject(new Error(failureReason || "Printing failed."));
    });
  }));
}

async function toggleDevTools() {
  await withView(view => {
    if (view.isDevToolsOpened()) view.closeDevTools();
    else view.openDevTools();
  });
}

async function toggleFullscreen() {
  await attempt(async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }, "Fullscreen is unavailable.");
}

async function clearBrowsingData() {
  const includesWebsiteData = typeof bridge.clearBrowsingData === "function";

  const message = includesWebsiteData
    ? "Clear Vortex history, bookmarks and website data? Open tabs will be closed."
    : "Clear Vortex history and bookmarks? Website cookies cannot be cleared without the desktop host.";

  if (!confirm(message)) return;

  if (includesWebsiteData) {
    try {
      await bridge.clearBrowsingData();
    } catch {
      return toast("Website data could not be cleared.");
    }
  }

  state.history = [];
  state.bookmarks = [];
  state.closedTabs = [];

  if (includesWebsiteData) {
    for (const tab of state.tabs) destroyGuest(tab);

    state.tabs = [];
    state.activeTabId = null;
    state.splitTabId = null;
  }

  render();
  save();

  toast(includesWebsiteData
    ? "Browsing data cleared."
    : "Vortex history and bookmarks cleared. Website cookies were not removed.");
}

/* Command palette */

function commands() {
  return [
    ["New tab", () => createTab()],
    ["New window", () => newWindow(false)],
    ["New incognito window", () => newWindow(true)],
    ["Close tab", () => closeTab(state.activeTabId)],
    ["Reopen closed tab", reopenClosedTab],
    ["New workspace", newWorkspace],
    ["Toggle split view", toggleSplit],
    ["Toggle reader mode", toggleReader],
    ["Toggle auto tab sleep", () => updateSetting("autoSleep", !state.settings.autoSleep)],
    ["Open privacy dashboard", () => {
      state.currentPanel = "privacy";
      $("sidebar").classList.remove("hidden");
      renderPanel("privacy");
    }],
    ["Manage bookmarks", () => {
      state.currentPanel = "bookmarks";
      $("sidebar").classList.remove("hidden");
      renderPanel("bookmarks");
    }],
    ["Open downloads", () => {
      state.currentPanel = "downloads";
      $("sidebar").classList.remove("hidden");
      renderPanel("downloads");
    }],
    ["Open history", () => {
      state.currentPanel = "history";
      $("sidebar").classList.remove("hidden");
      renderPanel("history");
    }],
    ["Change browser settings", () => {
      state.currentPanel = "settings";
      $("sidebar").classList.remove("hidden");
      renderPanel("settings");
    }],
    ["Snoozed tabs", () => {
      state.currentPanel = "snoozed";
      $("sidebar").classList.remove("hidden");
      renderPanel("snoozed");
    }],
    ["Toggle bookmarks bar", () => {
      updateSetting("showBookmarksBar", !state.settings.showBookmarksBar);
    }],
    ["Find in page", openFind],
    ["Take screenshot", screenshot],
    ["Print webpage", printPage],
    ["Toggle DevTools", toggleDevTools],
    ["Toggle fullscreen", toggleFullscreen],
    ["Zoom in", () => setZoom(0.1)],
    ["Zoom out", () => setZoom(-0.1)],
    ["Reset zoom", () => setZoom(0, true)],
    ["Clear browsing data", clearBrowsingData],
    ...(adminDevEnabled ? [["Open admin panel", openAdminPanel]] : [])
  ];
}

function openPalette() {
  $("cp-input").value = "";
  cpIndex = 0;
  renderPalette();
  $("command-palette").showModal();
  $("cp-input").focus();
}

function renderPalette() {
  const query = $("cp-input").value.trim().toLowerCase();
  const matches = value => String(value).toLowerCase().includes(query);

  cpItems = [
    ...commands()
      .filter(([label]) => matches(label))
      .map(([label, run]) => ({ label, run, kind: "Command" })),

    ...state.tabs
      .filter(tab => matches(`${tab.title} ${tab.workspace}`))
      .map(tab => ({
        label: `${tab.title} · ${tab.workspace}${tab.snoozedUntil ? " · snoozed" : ""}`,
        run: () => switchTab(tab.id),
        kind: "Tab"
      })),

    ...state.bookmarks
      .filter(item => query && matches(`${item.title} ${item.url}`))
      .map(item => ({
        label: item.title,
        run: () => navigate(item.url),
        kind: "Bookmark"
      })),

    ...state.history
      .filter(item => query && matches(`${item.title} ${item.url}`))
      .slice(0, 8)
      .map(item => ({
        label: item.title,
        run: () => navigate(item.url),
        kind: "History"
      }))
  ].slice(0, 40);

  if (query && !cpItems.length) {
    cpItems.push({
      label: `Search “${query}”`,
      kind: "Web",
      run: () => navigate(query)
    });
  }

  cpIndex = Math.max(0, Math.min(cpIndex, cpItems.length - 1));
  drawPalette();
}

function drawPalette() {
  $("cp-results").replaceChildren();

  cpItems.forEach((item, index) => {
    const control = button(
      "",
      () => runPalette(index),
      `cp-item${index === cpIndex ? " active" : ""}`
    );

    control.append(
      node("span", "", item.label),
      node("small", "", item.kind)
    );

    $("cp-results").append(control);
  });
}

function runPalette(index) {
  const item = cpItems[index];
  if (!item) return;

  $("command-palette").close();
  attempt(item.run);
}

function openAdminPanel() {
  if (!adminDevEnabled) return;
  $("admin-status").textContent = "Ready.";
  $("admin-panel").showModal();
}

let adminReleasing = false;

async function runReleaseNow() {
  if (adminReleasing) return;
  adminReleasing = true;
  const releaseBtn = $("admin-release");
  releaseBtn.disabled = true;
  $("admin-status").textContent = "Releasing… bump + build + publish";
  try {
    const result = await window.browserAPI.adminReleaseNow();
    $("admin-status").textContent = result && result.ok
      ? `Released version ${result.version} successfully.`
      : `Release failed: ${(result && result.error) || "unknown error"}`;
  } catch (error) {
    $("admin-status").textContent = "Release failed: " + ((error && error.message) || "unknown error");
  } finally {
    adminReleasing = false;
    releaseBtn.disabled = false;
  }
}

function openMenu() {
  $("menu-items").replaceChildren();

  for (const [label, run] of commands()) {
    $("menu-items").append(button(label, () => {
      $("menu").close();
      attempt(run);
    }, "menu-item"));
  }

  $("menu").showModal();
}

/* Bindings */

$("btn-newtab").addEventListener("click", () => createTab());

$("btn-back").addEventListener("click", () => {
  withView(view => {
    if (view.canGoBack()) view.goBack();
  });
});

$("btn-forward").addEventListener("click", () => {
  withView(view => {
    if (view.canGoForward()) view.goForward();
  });
});

$("btn-reload").addEventListener("click", () => {
  withView(view => view.reload());
});

$("btn-home").addEventListener("click", () => {
  if (state.settings.homepage) navigate(state.settings.homepage);
  else createTab();
});

$("btn-star").addEventListener("click", toggleBookmark);
$("btn-find").addEventListener("click", openFind);
$("btn-bookmarks").addEventListener("click", () => openPanel("bookmarks"));
$("btn-history").addEventListener("click", () => openPanel("history"));
$("btn-downloads").addEventListener("click", () => openPanel("downloads"));
$("btn-settings").addEventListener("click", () => openPanel("settings"));
$("btn-site").addEventListener("click", () => openPanel("privacy"));
$("btn-commands").addEventListener("click", openPalette);
$("btn-menu").addEventListener("click", openMenu);
$("admin-release").addEventListener("click", runReleaseNow);
$("sidebar-close").addEventListener("click", closePanel);

$("btn-ws-new").addEventListener("click", newWorkspace);
$("btn-split").addEventListener("click", toggleSplit);

$("ws-select").addEventListener("change", event => {
  switchWorkspace(event.target.value);
});

$("address").addEventListener("focus", () => $("address").select());
$("address").addEventListener("input", showSuggestions);

$("address").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();

    const selected = suggestionItems[suggestionIndex];
    navigate(selected?.url || $("address").value);

    $("address").blur();
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    moveSuggestion(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSuggestion(-1);
  } else if (event.key === "Escape") {
    hideSuggestions();
    $("address").value = activeTab()?.url || "";
    $("address").blur();
  }
});

document.addEventListener("click", event => {
  if (!$("address-wrap").contains(event.target)) hideSuggestions();
});

$("find-input").addEventListener("input", () => doFind(true, false));

$("find-input").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    doFind(!event.shiftKey);
  }

  if (event.key === "Escape") closeFind();
});

$("find-prev").addEventListener("click", () => doFind(false));
$("find-next").addEventListener("click", () => doFind(true));
$("find-close").addEventListener("click", closeFind);

$("reader-play").addEventListener("click", readAloud);
$("reader-stop").addEventListener("click", () => window.speechSynthesis?.cancel());
$("reader-exit").addEventListener("click", toggleReader);

$("cp-input").addEventListener("input", () => {
  cpIndex = 0;
  renderPalette();
});

$("cp-input").addEventListener("keydown", event => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();

    cpIndex = Math.max(
      0,
      Math.min(
        cpItems.length - 1,
        cpIndex + (event.key === "ArrowDown" ? 1 : -1)
      )
    );

    drawPalette();
    $("cp-results").children[cpIndex]?.scrollIntoView({ block: "nearest" });
  } else if (event.key === "Enter") {
    event.preventDefault();
    runPalette(cpIndex);
  }
});

document.querySelectorAll("[data-close]").forEach(control => {
  control.addEventListener("click", () => {
    $(control.dataset.close).close();
  });
});

$("perm-allow").addEventListener("click", () => answerPermission(true));
$("perm-deny").addEventListener("click", () => answerPermission(false));

$("perm-prompt").addEventListener("cancel", event => {
  event.preventDefault();
  answerPermission(false);
});

/* Keyboard shortcuts */

function handleShortcut(event) {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();

  if (document.querySelector("dialog[open]")) return;

  let action = null;

  if (mod && event.shiftKey && key === "t") action = reopenClosedTab;
  else if (mod && event.shiftKey && key === "n") action = () => newWindow(true);
  else if (mod && event.shiftKey && key === "b") {
    action = () => updateSetting(
      "showBookmarksBar",
      !state.settings.showBookmarksBar
    );
  }
  else if (mod && key === "t") action = () => createTab();
  else if (mod && key === "n") action = () => newWindow(false);
  else if (mod && key === "w") action = () => closeTab(state.activeTabId);
  else if (mod && key === "tab") action = () => cycleTab(event.shiftKey ? -1 : 1);
  else if ((mod && key === "r") || event.key === "F5") {
    action = () => withView(view => view.reload());
  }
  else if (mod && key === "l") {
    action = () => {
      $("address").focus();
      $("address").select();
    };
  }
  else if (mod && key === "f") action = openFind;
  else if (mod && key === "b") action = () => openPanel("bookmarks");
  else if (mod && key === "h") action = () => openPanel("history");
  else if (mod && key === "j") action = () => openPanel("downloads");
  else if (mod && key === ",") action = () => openPanel("settings");
  else if (mod && key === "d") action = toggleBookmark;
  else if (mod && key === "k") action = openPalette;
  else if (mod && key === "p") action = printPage;
  else if (mod && ["=", "+"].includes(key)) action = () => setZoom(0.1);
  else if (mod && key === "-") action = () => setZoom(-0.1);
  else if (mod && key === "0") action = () => setZoom(0, true);
  else if (event.key === "F11") action = toggleFullscreen;
  else if (event.key === "F12") action = toggleDevTools;
  else if (mod && /^[1-9]$/.test(key)) {
    action = () => {
      const tabs = workspaceTabs();
      const tab = key === "9" ? tabs.at(-1) : tabs[Number(key) - 1];
      if (tab) switchTab(tab.id);
    };
  }
  else if (event.altKey && event.key === "ArrowLeft") {
    action = () => withView(view => {
      if (view.canGoBack()) view.goBack();
    });
  }
  else if (event.altKey && event.key === "ArrowRight") {
    action = () => withView(view => {
      if (view.canGoForward()) view.goForward();
    });
  }
  else if (event.key === "Escape") {
    action = () => {
      hideSuggestions();
      closeFind();
    };
  }

  if (action) {
    event.preventDefault();
    attempt(action);
  }
}

document.addEventListener("keydown", handleShortcut);

/*
 * Electron guests have separate keyboard focus.
 * The native host should also register/forward browser shortcuts from
 * guest webContents.before-input-event when focus is inside a webview.
 */

/* Native event subscriptions */

if (typeof bridge.onPermissionRequest === "function") {
  bridge.onPermissionRequest(queuePermission);
}

if (typeof bridge.onDownload === "function") {
  bridge.onDownload(download => {
    if (!download || download.id === undefined) return;

    const existing = state.downloads.find(item => item.id === download.id);

    if (existing) Object.assign(existing, download);
    else state.downloads.unshift({ ...download });

    if (state.currentPanel === "downloads") renderPanel("downloads");
  });
}

/* Initialize */

window.addEventListener("beforeunload", () => {
  save();

  if (activePermission) {
    try {
      activePermission.reply(false);
    } catch {
      // Window is closing.
    }
  }

  for (const request of permissionQueue) {
    try {
      request.reply(false);
    } catch {
      // Window is closing.
    }
  }
});

setInterval(() => { wakeDueTabs(); autoSleepIdleTabs(); }, 1000);

load();
applyTheme();

$("incognito-badge").classList.toggle("hidden", !INCOGNITO);

if (window.browserAPI?.onOpenHelpTab) {
  window.browserAPI.onOpenHelpTab(url => { if (url) createTab(url); });
}
if (window.browserAPI?.onCloseHelpTab) {
  window.browserAPI.onCloseHelpTab(() => {
    const tab = activeTab();
    if (tab && tab.url && tab.url.includes('help/index.html')) closeTab(tab.id);
  });
}
window.browserAPI?.isDev().then(info => { adminDevEnabled = Boolean(info && info.dev); }).catch(() => { adminDevEnabled = false; });

/* ---------- Tab hover previews ---------- */

const tabPreviewCache = new Map();
let tabPreviewEl = null;
let tabPreviewTimer = null;
let tabPreviewHideTimer = null;

function ensureTabPreview() {
  if (tabPreviewEl) return tabPreviewEl;
  tabPreviewEl = document.createElement('div');
  tabPreviewEl.className = 'tab-preview';
  tabPreviewEl.innerHTML = '<div class="tp-thumb"><span class="tp-placeholder">Loading preview…</span></div><div class="tp-info"><div class="tp-title"></div><div class="tp-url"></div><div class="tp-status"><span class="dot"></span><span class="tp-status-text">Ready</span></div></div>';
  document.body.append(tabPreviewEl);
  return tabPreviewEl;
}

async function captureTabPreview(tab, force = false) {
  if (!force && tabPreviewCache.has(tab.id)) return tabPreviewCache.get(tab.id);
  if (!tab || !tab.webview) return null;
  try {
    const img = await tab.webview.capturePage();
    const size = img.getSize();
    if (!size.width || !size.height) return null;
    const dataUrl = img.toDataURL();
    tabPreviewCache.set(tab.id, dataUrl);
    return dataUrl;
  } catch (e) {
    return null;
  }
}

function invalidateTabPreview(tabId) {
  tabPreviewCache.delete(tabId);
}

function showTabPreview(tab, anchor) {
  const el = ensureTabPreview();
  const rect = anchor.getBoundingClientRect();
  const thumb = el.querySelector('.tp-thumb');
  const titleEl = el.querySelector('.tp-title');
  const urlEl = el.querySelector('.tp-url');
  const statusDot = el.querySelector('.dot');
  const statusText = el.querySelector('.tp-status-text');

  titleEl.textContent = tab.title || 'New Tab';
  urlEl.textContent = tab.url || '';
  statusDot.className = 'dot' + (tab.loading ? ' loading' : '') + (tab.snoozedUntil ? ' sleeping' : '');
  statusText.textContent = tab.loading ? 'Loading…' : (tab.snoozedUntil ? 'Sleeping' : 'Ready');

  // clear thumbnail immediately to avoid stale previews
  thumb.innerHTML = '<span class="tp-placeholder">No preview</span>';

  // show cached preview immediately if available
  const cached = tabPreviewCache.get(tab.id);
  if (cached) {
    thumb.innerHTML = '';
    const img = document.createElement('img');
    img.src = cached;
    thumb.append(img);
    statusText.textContent = tab.loading ? 'Loading…' : (tab.snoozedUntil ? 'Sleeping' : 'Ready');
  } else if (!tab.webview || tab.snoozedUntil) {
    thumb.innerHTML = '<span class="tp-placeholder">No preview</span>';
    statusText.textContent = tab.snoozedUntil ? 'Sleeping' : 'Not loaded';
  }

  let left = rect.left;
  let top = rect.bottom + 8;
  if (left + 260 > window.innerWidth) left = window.innerWidth - 270;
  if (top + 200 > window.innerHeight) top = rect.top - 210;
  el.style.left = left + 'px';
  el.style.top = top + 'px';

  el.classList.add('visible');

  // capture fresh (force) and update thumbnail
  captureTabPreview(tab, true).then(dataUrl => {
    if (!dataUrl) {
      if (!tabPreviewCache.has(tab.id)) {
        thumb.innerHTML = '<span class="tp-placeholder">No preview</span>';
      }
      return;
    }
    if (titleEl.textContent !== (tab.title || 'New Tab')) return;
    thumb.innerHTML = '';
    const img = document.createElement('img');
    img.src = dataUrl;
    thumb.append(img);
  });
}

function hideTabPreview() {
  if (tabPreviewEl) tabPreviewEl.classList.remove('visible');
}

render();
save();
setInterval(() => {
  const tab = activeTab();
  if (tab && tab.webview) captureTabPreview(tab, true).catch(() => {});
}, 5000);

