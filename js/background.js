/* MintList background service worker: right-click menus, keyboard quick
   save, toolbar badge feedback and Chrome Sync. */

importScripts("store.js");

const S = self.MintStore;
const DEVICE_KEY = "mintListDeviceId";
const SYNC_CACHE_KEY = "mintListSyncCache";
const SYNC_STATUS_KEY = "mintListSyncStatus";
const ROOT_CONTEXTS = ["page", "link"];

// ------------------------------------------------------------ helpers

async function loadState() {
  const loaded = await S.load();
  // Saving before the new tab was ever opened: start from an empty library
  // so the welcome tour still runs and nothing the user saved is replaced.
  if (loaded.fresh) {
    const empty = S.createEmptyState();
    empty.settings.onboarded = false;
    return empty;
  }
  return loaded.state;
}

function isOwnUrl(url) {
  return !url || url.startsWith(chrome.runtime.getURL("")) || /^(chrome|edge):\/\/newtab/i.test(url);
}

async function deviceId() {
  const stored = await chrome.storage.local.get(DEVICE_KEY);
  if (stored[DEVICE_KEY]) return stored[DEVICE_KEY];
  const id = S.uid("device");
  await chrome.storage.local.set({ [DEVICE_KEY]: id });
  return id;
}

async function flash(tabId, text, color, title) {
  const scope = tabId ? { tabId } : {};
  try {
    await chrome.action.setBadgeBackgroundColor({ color, ...scope });
    if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: "#ffffff", ...scope });
    await chrome.action.setBadgeText({ text, ...scope });
    if (title) await chrome.action.setTitle({ title, ...scope });
  } catch {
    // The tab may have closed already.
  }
  setTimeout(() => {
    chrome.action.setBadgeText({ text: "", ...scope }).catch(() => {});
    chrome.action.setTitle({ title: "Save to MintList", ...scope }).catch(() => {});
  }, 2600);
}

function stamp() {
  return new Date().toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

// ------------------------------------------------------------ saving

async function saveLink({ url, title, boardId = null, newBoardPageId = null, tabId = null }) {
  if (!url || !S.isValidUrl(url) || isOwnUrl(url)) {
    await flash(tabId, "!", "#ef4444", "MintList can't save this page");
    return { ok: false };
  }
  const state = await loadState();
  let target = boardId ? S.findBoard(state, boardId) : null;
  if (!target && newBoardPageId) {
    const page = S.findPage(state, newBoardPageId);
    if (page) {
      const board = S.makeBoard({ title: "Inbox", color: "mint", col: 0 });
      page.boards.unshift(board);
      target = { page, board };
    }
  }
  if (!target) target = S.resolveQuickSaveBoard(state, { create: true });

  const key = S.urlKey(S.normalizeUrl(url));
  if (target.board.links.some((link) => S.urlKey(link.url) === key)) {
    await flash(tabId, "✓", "#0ea5e9", `Already in ${target.page.name} › ${target.board.title}`);
    return { ok: true, duplicate: true };
  }
  S.addLinkToBoard(state, target.board.id, { url, title: title || S.titleFromUrl(url) }, "start");
  target.board.collapsed = false;
  await S.save(state, "background");
  await flash(tabId, "✓", "#10b981", `Saved to ${target.page.name} › ${target.board.title}`);
  return { ok: true };
}

async function saveWindowTabs(windowId, activeTabId) {
  const tabs = await chrome.tabs.query(windowId ? { windowId } : { lastFocusedWindow: true });
  const links = tabs.filter((tab) => /^(https?|file|ftp):/i.test(tab.url || "") && !isOwnUrl(tab.url)).map((tab) => ({ url: tab.url, title: tab.title }));
  if (!links.length) {
    await flash(activeTabId, "!", "#ef4444", "No tabs to save");
    return;
  }
  const state = await loadState();
  const page = S.findPage(state, state.activePageId) || state.pages[0];
  page.boards.push(S.makeBoard({ title: `Tabs · ${stamp()}`, color: "sky", col: 0, links }));
  await S.save(state, "background");
  await flash(activeTabId, String(links.length), "#10b981", `Saved ${links.length} tabs to ${page.name}`);
}

function openDashboard(hash = "") {
  return chrome.tabs.create({ url: chrome.runtime.getURL(`index.html${hash}`) });
}

// ------------------------------------------------------------ context menus

let menuSignature = "";
let menuChain = Promise.resolve();

function menuTitle(text) {
  return String(text).replace(/&/g, "&&").slice(0, 80);
}

function createMenu(props) {
  chrome.contextMenus.create(props, () => void chrome.runtime.lastError);
}

function rebuildMenus(force = false) {
  menuChain = menuChain.then(async () => {
    const state = await loadState();
    const quick = S.resolveQuickSaveBoard(state, { create: false });
    const signature = JSON.stringify([
      state.pages.map((page) => [page.id, page.name, page.icon, page.boards.map((board) => [board.id, board.title])]),
      quick?.board.id,
      quick?.page.name
    ]);
    if (!force && signature === menuSignature) return;
    menuSignature = signature;
    await chrome.contextMenus.removeAll();
    createMenu({ id: "ml-root", title: "Save to MintList", contexts: ROOT_CONTEXTS });
    createMenu({
      id: "ml-quick",
      parentId: "ml-root",
      title: quick ? menuTitle(`Quick save → ${quick.page.name} › ${quick.board.title}`) : "Quick save → Inbox",
      contexts: ROOT_CONTEXTS
    });
    createMenu({ id: "ml-sep-1", parentId: "ml-root", type: "separator", contexts: ROOT_CONTEXTS });
    state.pages.slice(0, 40).forEach((page) => {
      const pageMenu = `ml-page|${page.id}`;
      createMenu({ id: pageMenu, parentId: "ml-root", title: menuTitle(`${page.icon ? `${page.icon} ` : ""}${page.name}`), contexts: ROOT_CONTEXTS });
      if (!page.boards.length) {
        createMenu({ id: `ml-newboard|${page.id}`, parentId: pageMenu, title: "New “Inbox” board", contexts: ROOT_CONTEXTS });
      }
      page.boards.slice(0, 60).forEach((board) => {
        createMenu({ id: `ml-board|${board.id}`, parentId: pageMenu, title: menuTitle(board.title), contexts: ROOT_CONTEXTS });
      });
    });
    createMenu({ id: "ml-sep-2", parentId: "ml-root", type: "separator", contexts: ["page"] });
    createMenu({ id: "ml-tabs", parentId: "ml-root", title: "Save all tabs in this window as a board", contexts: ["page"] });
    createMenu({ id: "ml-open", title: "Open MintList", contexts: ["action"] });
    createMenu({ id: "ml-action-tabs", title: "Save all tabs in this window", contexts: ["action"] });
    createMenu({ id: "ml-action-settings", title: "MintList settings", contexts: ["action"] });
  }).catch((error) => console.warn("MintList menus:", error));
  return menuChain;
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const id = String(info.menuItemId);
  if (id === "ml-open") return void openDashboard();
  if (id === "ml-action-settings") return void openDashboard("#settings");
  if (id === "ml-tabs" || id === "ml-action-tabs") return void saveWindowTabs(tab?.windowId, tab?.id);

  const isLink = Boolean(info.linkUrl);
  const url = info.linkUrl || info.pageUrl || tab?.url;
  const title = isLink ? (info.selectionText || "") : tab?.title;
  const [kind, ref] = id.split("|");
  saveLink({
    url,
    title,
    boardId: kind === "ml-board" ? ref : null,
    newBoardPageId: kind === "ml-newboard" ? ref : null,
    tabId: tab?.id
  });
});

// ------------------------------------------------------------ commands

chrome.commands.onCommand.addListener(async (command, tab) => {
  const active = tab || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (command === "quick-save" && active) {
    await saveLink({ url: active.url, title: active.title, tabId: active.id });
  } else if (command === "save-all-tabs") {
    await saveWindowTabs(active?.windowId, active?.id);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "sync-now") {
    syncPush(true).then(() => syncPull(true)).finally(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "rebuild-menus") {
    rebuildMenus(true).finally(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

// ------------------------------------------------------------ Chrome Sync

let pushTimer = null;

async function setSyncStatus(status) {
  await chrome.storage.local.set({ [SYNC_STATUS_KEY]: { ...status, at: status.at || Date.now() } });
}

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => syncPush(false), 2500);
}

async function syncPush(force) {
  const state = await loadState();
  if (!state.settings.sync) return;
  const payload = S.syncPayload(state);
  const hash = S.hashString(JSON.stringify(payload));
  const cache = (await chrome.storage.local.get(SYNC_CACHE_KEY))[SYNC_CACHE_KEY] || {};
  if (!force && cache.hash === hash) return;
  try {
    const result = await S.writeSyncPayload(payload, await deviceId());
    const now = Date.now();
    await chrome.storage.local.set({ [SYNC_CACHE_KEY]: { hash, at: now } });
    await setSyncStatus({ state: "ok", at: now, bytes: result.bytes });
  } catch (error) {
    const text = String(error?.message || error);
    let message = text;
    if (error?.code === "too-large") message = error.message;
    else if (/QUOTA_BYTES/i.test(text)) message = "Chrome Sync storage is full. Remove some links or use backups instead.";
    else if (/MAX_WRITE_OPERATIONS/i.test(text)) {
      message = "Syncing a lot of changes — retrying in a minute.";
      setTimeout(() => syncPush(true), 61000);
    }
    await setSyncStatus({ state: "error", message, at: Date.now() });
  }
}

async function syncPull(force) {
  const state = await loadState();
  if (!state.settings.sync) return;
  const remote = await S.readSyncPayload();
  if (!remote) return;
  const me = await deviceId();
  const cache = (await chrome.storage.local.get(SYNC_CACHE_KEY))[SYNC_CACHE_KEY] || {};
  if (remote.meta.hash && remote.meta.hash === cache.hash) return;
  if (!force && remote.meta.device === me) return;
  if (!force && cache.at && remote.meta.updatedAt <= cache.at) return;
  const next = S.applySyncPayload(state, remote.payload);
  const hash = S.hashString(JSON.stringify(S.syncPayload(next)));
  await chrome.storage.local.set({ [SYNC_CACHE_KEY]: { hash, at: Date.now() } });
  await S.save(next, "sync");
  await setSyncStatus({ state: "ok", at: Date.now(), bytes: remote.meta.bytes, pulled: true });
}

// ------------------------------------------------------------ lifecycle

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[S.STATE_KEY]) {
    rebuildMenus();
    if (changes[S.STATE_KEY].newValue?.savedBy !== "sync") schedulePush();
  }
  if (area === "sync" && changes.meta?.newValue) {
    deviceId().then((me) => {
      if (changes.meta.newValue.device !== me) syncPull(true);
    });
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  rebuildMenus(true);
  if (details.reason === "install") openDashboard();
});

chrome.runtime.onStartup.addListener(() => {
  rebuildMenus(true);
  syncPull(false).catch(() => {});
});
