/* Toolbar popup: save the current tab (or every tab) to a board. */

const S = MintStore;
const api = S.chromeApi;
const isMacPopup = /Mac/i.test(navigator.userAgentData?.platform || navigator.platform || "");

const el = (id) => document.getElementById(id);
let state = null;
let currentTab = null;
let windowTabs = [];
let lastSaved = null;
let closeTimer = null;

function make(tag, props = {}, text = "") {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (value !== undefined && value !== null) node.setAttribute(key, value);
  });
  if (text) node.textContent = text;
  return node;
}

function iconNode(name) {
  const span = make("span");
  span.innerHTML = iconSvg(name);
  return span.firstElementChild;
}

function isOwnUrl(url) {
  return !url || url.startsWith(api.runtime.getURL("")) || /^(chrome|edge):\/\/newtab/i.test(url);
}

function applyPopupTheme(wallpapers) {
  const settings = state.settings;
  let scheme = settings.theme;
  if (scheme === "system") scheme = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  if (scheme === "wallpaper") {
    const wallpaper = [...S.WALLPAPERS, ...wallpapers].find((item) => item.id === settings.wallpaper);
    scheme = wallpaper?.tone === "light" ? "light" : "dark";
  }
  document.documentElement.dataset.theme = scheme;
  const accent = S.ACCENTS.find((item) => item.id === settings.accent) || S.ACCENTS[0];
  document.documentElement.style.setProperty("--accent", accent.value);
}

function fillBoards(selectedId) {
  const select = el("ppBoard");
  select.replaceChildren();
  state.pages.forEach((page) => {
    const group = make("optgroup", { label: `${page.icon ? `${page.icon} ` : ""}${page.name}` });
    page.boards.forEach((board) => group.append(make("option", { value: board.id }, board.title)));
    group.append(make("option", { value: `new:${page.id}` }, `＋ New board in ${page.name}`));
    select.append(group);
  });
  if (selectedId && [...select.options].some((option) => option.value === selectedId)) select.value = selectedId;
  toggleNewBoardField();
}

function toggleNewBoardField() {
  const isNew = el("ppBoard").value.startsWith("new:");
  el("ppNewBoardField").hidden = !isNew;
  if (isNew) el("ppNewBoard").focus();
}

function defaultBoardId() {
  const last = state.settings.lastSaveTarget?.boardId;
  if (last && S.findBoard(state, last)) return last;
  const quick = S.resolveQuickSaveBoard(state, { create: false });
  if (quick) return quick.board.id;
  const page = S.findPage(state, state.activePageId) || state.pages[0];
  return page.boards[0]?.id || `new:${page.id}`;
}

function showNotice(text, tone = "info") {
  const notice = el("ppNotice");
  notice.hidden = false;
  notice.className = `pp-notice${tone === "warn" ? " warn" : ""}`;
  notice.replaceChildren(iconNode(tone === "warn" ? "alert" : "info"), document.createTextNode(text));
}

async function freshState() {
  const loaded = await S.load();
  if (!loaded.fresh) return loaded.state;
  const empty = S.createEmptyState();
  empty.settings.onboarded = false;
  return empty;
}

// Resolve the chosen board in `target` (a freshly loaded state).
function resolveBoard(target) {
  const value = el("ppBoard").value;
  if (value.startsWith("new:")) {
    const page = S.findPage(target, value.slice(4)) || target.pages[0];
    const board = S.makeBoard({ title: S.clampText(el("ppNewBoard").value, 80, "New board"), col: 0 });
    page.boards.push(board);
    return { page, board };
  }
  return S.findBoard(target, value) || S.resolveQuickSaveBoard(target, { create: true });
}

async function saveCurrent() {
  if (!currentTab) return;
  const target = await freshState();
  const destination = resolveBoard(target);
  const link = S.addLinkToBoard(target, destination.board.id, {
    url: currentTab.url,
    title: S.clampText(el("ppTitle").value, 200) || currentTab.title,
    tags: el("ppTags").value,
    note: el("ppNote").value,
    starred: el("ppStar").checked
  });
  if (!link) return;
  destination.board.collapsed = false;
  target.settings.lastSaveTarget = { boardId: destination.board.id };
  await S.save(target, "popup");
  lastSaved = { linkIds: [link.id], boardId: null };
  showDone("Saved!", `${destination.page.name} › ${destination.board.title}`);
}

async function saveAllTabs() {
  const links = windowTabs.map((tab) => ({ url: tab.url, title: tab.title }));
  if (!links.length) return;
  const target = await freshState();
  const value = el("ppBoard").value;
  const page = value.startsWith("new:")
    ? S.findPage(target, value.slice(4))
    : S.findBoard(target, value)?.page;
  const destinationPage = page || S.findPage(target, target.activePageId) || target.pages[0];
  const name = new Date().toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const board = S.makeBoard({ title: `Tabs · ${name}`, color: "sky", col: 0, links });
  destinationPage.boards.push(board);
  await S.save(target, "popup");
  lastSaved = { linkIds: [], boardId: board.id };
  showDone(`Saved ${links.length} tabs`, `New board in ${destinationPage.name}`);
}

function showDone(title, text) {
  el("ppForm").hidden = true;
  el("ppDone").hidden = false;
  el("ppDoneTitle").textContent = title;
  el("ppDoneText").textContent = text;
  el("ppView").focus();
  closeTimer = setTimeout(() => window.close(), 3500);
  document.body.addEventListener("pointerenter", () => clearTimeout(closeTimer), { once: true });
}

async function undo() {
  clearTimeout(closeTimer);
  if (!lastSaved) return;
  const target = await freshState();
  if (lastSaved.boardId) {
    const found = S.findBoard(target, lastSaved.boardId);
    if (found) found.page.boards.splice(found.index, 1);
  }
  lastSaved.linkIds.forEach((id) => {
    const found = S.findLink(target, id);
    if (found) found.board.links.splice(found.index, 1);
  });
  await S.save(target, "popup");
  lastSaved = null;
  el("ppDoneTitle").textContent = "Removed";
  el("ppDoneText").textContent = "Nothing was saved.";
  el("ppUndo").disabled = true;
  closeTimer = setTimeout(() => window.close(), 1200);
}

function openDashboard(hash = "") {
  api.tabs.create({ url: api.runtime.getURL(`index.html${hash}`) });
  window.close();
}

(async function init() {
  renderMintIcons();
  if (isMacPopup) {
    document.querySelectorAll(".kbd-mod").forEach((node) => {
      node.textContent = node.textContent.replace("Ctrl", "⌘").replace("Shift", "⇧");
    });
  }
  if (!api) {
    document.body.textContent = "Load MintList as a Chrome extension to use the popup.";
    return;
  }
  const loaded = await S.load();
  state = loaded.fresh ? await freshState() : loaded.state;
  applyPopupTheme(loaded.wallpapers);

  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  const tabs = await api.tabs.query({ currentWindow: true });
  windowTabs = tabs.filter((item) => /^(https?|file|ftp):/i.test(item.url || "") && !isOwnUrl(item.url));
  el("ppSaveAllLabel").textContent = windowTabs.length > 1 ? `Save all ${windowTabs.length} tabs as a board` : "Save all tabs as a board";
  el("ppSaveAll").disabled = !windowTabs.length;

  fillBoards(defaultBoardId());

  const favicon = el("ppFavicon");
  if (tab && S.isValidUrl(tab.url) && !isOwnUrl(tab.url)) {
    currentTab = tab;
    el("ppTitle").value = tab.title || S.titleFromUrl(tab.url);
    el("ppUrl").textContent = tab.url.replace(/^https?:\/\/(www\.)?/, "");
    el("ppUrl").title = tab.url;
    const src = /^(https?:|data:image)/.test(tab.favIconUrl || "")
      ? tab.favIconUrl
      : /^https?:/.test(tab.url) ? api.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(tab.url)}&size=32`) : null;
    if (src) favicon.append(make("img", { src, alt: "" }));
    const existing = S.findByUrl(state, tab.url);
    if (existing.length) {
      const where = existing.slice(0, 2).map(({ page, board }) => `${page.name} › ${board.title}`).join(", ");
      showNotice(`Already saved in ${where}. You can save another copy.`);
      el("ppSaveLabel").textContent = "Save again";
    }
    el("ppTitle").focus();
    el("ppTitle").select();
  } else {
    el("ppTitle").value = tab?.title || "This page";
    el("ppTitle").disabled = true;
    el("ppUrl").textContent = "Browser pages can't be bookmarked";
    favicon.append(iconNode("globe"));
    showNotice("This page can't be saved — but you can still save your other tabs.", "warn");
    el("ppSave").disabled = true;
  }

  el("ppBoard").addEventListener("change", toggleNewBoardField);
  el("ppForm").addEventListener("submit", (event) => {
    event.preventDefault();
    el("ppSave").disabled = true;
    saveCurrent().catch(() => { el("ppSave").disabled = false; });
  });
  el("ppSaveAll").addEventListener("click", () => {
    el("ppSaveAll").disabled = true;
    saveAllTabs().catch(() => { el("ppSaveAll").disabled = false; });
  });
  el("ppUndo").addEventListener("click", undo);
  el("ppView").addEventListener("click", () => openDashboard());
  el("ppOpen").addEventListener("click", () => openDashboard());
  el("ppSearch").addEventListener("click", () => openDashboard("#search"));
  el("ppShortcuts").addEventListener("click", () => {
    api.tabs.create({ url: "chrome://extensions/shortcuts" });
    window.close();
  });
})();
