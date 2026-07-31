const chromeApi = globalThis.chrome;
const storage = chromeApi?.storage?.local;
const tabsApi = chromeApi?.tabs;
const windowsApi = chromeApi?.windows;
const identityApi = chromeApi?.identity;

const defaultState = {
  activePageId: "personal",
  settings: {
    privacy: false,
    incognito: false,
    sidebarCollapsed: false,
    wallpaper: "aurora-mint",
    wallpaperTone: "dark",
    uploadedWallpapers: []
  },
  account: {
    signedIn: false,
    name: "",
    email: ""
  },
  pages: [
    {
      id: "personal",
      name: "Personal",
      boards: [
        {
          id: "daily",
          title: "Daily",
          x: 24,
          y: 24,
          links: [
            { id: "openai", title: "OpenAI", url: "https://openai.com" },
            { id: "gmail", title: "Gmail", url: "https://mail.google.com" }
          ]
        },
        {
          id: "learn",
          title: "Learning",
          x: 324,
          y: 24,
          links: [
            { id: "mdn", title: "MDN Web Docs", url: "https://developer.mozilla.org" },
            { id: "github", title: "GitHub", url: "https://github.com" }
          ]
        }
      ]
    }
  ]
};

const wallpapers = [
  { id: "aurora-mint", name: "Aurora Mint", a: "#050806", b: "#245f4a", c: "#86c986", scheme: "dark", tone: "dark" },
  { id: "obsidian-wave", name: "Obsidian Wave", a: "#050609", b: "#132d28", c: "#55a36d", scheme: "dark", tone: "dark" },
  { id: "noir-canyon", name: "Noir Canyon", a: "#0b0c10", b: "#3a2632", c: "#b36b58", scheme: "dark", tone: "dark" },
  { id: "deep-ocean", name: "Deep Ocean", a: "#041014", b: "#0b5364", c: "#8db8c7", scheme: "dark", tone: "dark" },
  { id: "midnight-gold", name: "Midnight Gold", a: "#090b0f", b: "#3b3521", c: "#d1aa55", scheme: "dark", tone: "dark" },
  { id: "velvet-night", name: "Velvet Night", a: "#120812", b: "#552a4d", c: "#d07884", scheme: "dark", tone: "dark" },
  { id: "pine-shadow", name: "Pine Shadow", a: "#07110e", b: "#163f2f", c: "#75b58a", scheme: "dark", tone: "dark" },
  { id: "graphite-sky", name: "Graphite Sky", a: "#0e1117", b: "#364756", c: "#9aacba", scheme: "dark", tone: "dark" },
  { id: "ember-haze", name: "Ember Haze", a: "#100a08", b: "#673828", c: "#f0a15f", scheme: "dark", tone: "dark" },
  { id: "violet-arc", name: "Violet Arc", a: "#0a0714", b: "#3a2d74", c: "#a077d6", scheme: "dark", tone: "dark" },
  { id: "teal-grid", name: "Teal Grid", a: "#061113", b: "#12605f", c: "#90d4c2", scheme: "dark", tone: "dark" },
  { id: "redwood-dark", name: "Redwood Dark", a: "#110908", b: "#5b3025", c: "#c17760", scheme: "dark", tone: "dark" },
  { id: "foggy-light", name: "Foggy Light", a: "#f4f7f2", b: "#a9c5ba", c: "#7c9caa", scheme: "light", tone: "light" },
  { id: "paper-mint", name: "Paper Mint", a: "#fbfbf2", b: "#9fcfb8", c: "#edca78", scheme: "light", tone: "light" },
  { id: "rose-glass", name: "Rose Glass", a: "#fff6f4", b: "#e79b93", c: "#8fc6bd", scheme: "light", tone: "light" },
  { id: "sunlit-desk", name: "Sunlit Desk", a: "#fff6d8", b: "#f0b65d", c: "#6eb4a6", scheme: "light", tone: "light" },
  { id: "lilac-morning", name: "Lilac Morning", a: "#f7f2ff", b: "#b5a7e6", c: "#86b7c5", scheme: "light", tone: "light" },
  { id: "coastal-paper", name: "Coastal Paper", a: "#f1fbff", b: "#9ed2df", c: "#f3cf8f", scheme: "light", tone: "light" },
  { id: "sage-garden", name: "Sage Garden", a: "#f5faf1", b: "#b6d69c", c: "#7fb8a6", scheme: "light", tone: "light" },
  { id: "peach-cloud", name: "Peach Cloud", a: "#fff4eb", b: "#f2b196", c: "#96bdd2", scheme: "light", tone: "light" },
  { id: "clean-slate", name: "Clean Slate", a: "#f8fafb", b: "#b9c6d2", c: "#7eaaad", scheme: "light", tone: "light" },
  { id: "buttercup", name: "Buttercup", a: "#fffbe8", b: "#eeca71", c: "#94c891", scheme: "light", tone: "light" },
  { id: "orchid-paper", name: "Orchid Paper", a: "#fff5fb", b: "#dda2c8", c: "#9bbdde", scheme: "light", tone: "light" },
  { id: "misty-lake", name: "Misty Lake", a: "#eff8f8", b: "#9bc8cb", c: "#d9c797", scheme: "light", tone: "light" }
];

let state = structuredClone(defaultState);
let dragData = null;
let editingLink = null;
let paletteResultsData = [];
let paletteActiveIndex = -1;

const els = {
  body: document.body,
  appShell: document.getElementById("appShell"),
  sidebarToggleButton: document.getElementById("sidebarToggleButton"),
  sidebarToggleIcon: document.getElementById("sidebarToggleIcon"),
  pageList: document.getElementById("pageList"),
  addPageButton: document.getElementById("addPageButton"),
  pageTitle: document.getElementById("pageTitle"),
  boards: document.getElementById("boards"),
  addBoardButton: document.getElementById("addBoardButton"),
  resetLayoutButton: document.getElementById("resetLayoutButton"),
  privacyToggle: document.getElementById("privacyToggle"),
  incognitoToggle: document.getElementById("incognitoToggle"),
  wallpaperGrid: document.getElementById("wallpaperGrid"),
  darkWallpapersButton: document.getElementById("darkWallpapersButton"),
  lightWallpapersButton: document.getElementById("lightWallpapersButton"),
  wallpaperUploadInput: document.getElementById("wallpaperUploadInput"),
  exportDataButton: document.getElementById("exportDataButton"),
  importDataInput: document.getElementById("importDataInput"),
  accountPanel: document.getElementById("accountPanel"),
  accountName: document.getElementById("accountName"),
  accountEmail: document.getElementById("accountEmail"),
  signOutButton: document.getElementById("signOutButton"),
  authDialog: document.getElementById("authDialog"),
  authStatus: document.getElementById("authStatus"),
  googleSignInButton: document.getElementById("googleSignInButton"),
  linkDialog: document.getElementById("linkDialog"),
  linkForm: document.getElementById("linkForm"),
  linkDialogTitle: document.getElementById("linkDialogTitle"),
  linkTitleInput: document.getElementById("linkTitleInput"),
  linkUrlInput: document.getElementById("linkUrlInput"),
  paletteButton: document.getElementById("paletteButton"),
  paletteDialog: document.getElementById("paletteDialog"),
  paletteInput: document.getElementById("paletteInput"),
  paletteResults: document.getElementById("paletteResults"),
  closePaletteButton: document.getElementById("closePaletteButton"),
  boardTemplate: document.getElementById("boardTemplate"),
  linkTemplate: document.getElementById("linkTemplate")
};

async function loadState() {
  if (!storage) {
    const savedState = localStorage.getItem("mintlist-state") || localStorage.getItem("lumilist-free-state");
    state = JSON.parse(savedState || "null") || structuredClone(defaultState);
    normalizeState();
    return;
  }

  const saved = await storage.get(["mintListState", "lumilistState"]);
  state = saved.mintListState || saved.lumilistState || structuredClone(defaultState);
  normalizeState();
}

async function saveState() {
  if (!storage) {
    localStorage.setItem("mintlist-state", JSON.stringify(state));
    return;
  }
  await storage.set({ mintListState: state });
}

function normalizeState() {
  state.settings = {
    ...structuredClone(defaultState.settings),
    ...(state.settings || {})
  };
  state.account = {
    ...structuredClone(defaultState.account),
    ...(state.account || {})
  };
  if (!Array.isArray(state.settings.uploadedWallpapers)) {
    state.settings.uploadedWallpapers = [];
  }
  if (!wallpapers.some((wallpaper) => wallpaper.id === state.settings.wallpaper) && !state.settings.uploadedWallpapers.some((wallpaper) => wallpaper.id === state.settings.wallpaper)) {
    state.settings.wallpaper = defaultState.settings.wallpaper;
  }
  if (!state.pages?.length) {
    state.pages = structuredClone(defaultState.pages);
    state.activePageId = defaultState.activePageId;
  }
  state.pages.forEach((page) => {
    page.boards.forEach((board, index) => {
      if (typeof board.x !== "number" || typeof board.y !== "number") {
        board.x = 24 + (index % 4) * 300;
        board.y = 24 + Math.floor(index / 4) * 240;
      }
    });
  });
}

function activePage() {
  return state.pages.find((page) => page.id === state.activePageId) || state.pages[0];
}

async function renamePage(page) {
  const newName = window.prompt("Rename page", page.name)?.trim();
  if (!newName || newName === page.name) return;
  page.name = newName;
  await saveState();
  render();
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function iconLetter(title, url) {
  const source = title || hostLabel(url);
  return source.slice(0, 1).toUpperCase() || "L";
}

function faviconUrl(url) {
  if (!chromeApi?.runtime?.getURL) return null;
  try {
    return chromeApi.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`);
  } catch {
    return null;
  }
}

function applyFavicon(faviconEl, title, url) {
  faviconEl.replaceChildren();
  const src = faviconUrl(url);
  if (!src) {
    faviconEl.textContent = iconLetter(title, url);
    return;
  }
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  img.addEventListener("error", () => {
    faviconEl.replaceChildren();
    faviconEl.textContent = iconLetter(title, url);
  });
  faviconEl.append(img);
}

function render() {
  applyWallpaper();
  renderAccount();
  renderPages();
  renderBoards();
  renderSidebarToggle();
  els.privacyToggle.checked = state.settings.privacy;
  els.incognitoToggle.checked = state.settings.incognito;
  els.body.classList.toggle("privacy-on", state.settings.privacy);
  maybeShowAuthDialog();
}

function renderSidebarToggle() {
  const collapsed = state.settings.sidebarCollapsed;
  els.appShell.classList.toggle("sidebar-collapsed", collapsed);
  els.sidebarToggleIcon.textContent = collapsed ? "\u203a" : "\u2039";
  const label = collapsed ? "Show sidebar" : "Hide sidebar";
  els.sidebarToggleButton.title = label;
  els.sidebarToggleButton.setAttribute("aria-label", label);
}

function applyWallpaper() {
  const current = [...wallpapers, ...state.settings.uploadedWallpapers].find((wallpaper) => wallpaper.id === state.settings.wallpaper) || wallpapers[0];
  document.documentElement.style.setProperty("--wallpaper-a", current.a);
  document.documentElement.style.setProperty("--wallpaper-b", current.b);
  document.documentElement.style.setProperty("--wallpaper-c", current.c);
  document.documentElement.style.setProperty("color-scheme", current.scheme);
  document.documentElement.style.setProperty("--text", current.scheme === "light" ? "#1e2429" : "#f6f2e8");
  document.documentElement.style.setProperty("--muted", current.scheme === "light" ? "#58636b" : "#b8bdc9");
  document.documentElement.style.setProperty("--panel", current.scheme === "light" ? "rgba(255, 255, 255, 0.72)" : "rgba(20, 23, 31, 0.82)");
  document.documentElement.style.setProperty("--panel-strong", current.scheme === "light" ? "rgba(255, 255, 255, 0.92)" : "rgba(28, 32, 42, 0.94)");
  document.documentElement.style.setProperty("--line", current.scheme === "light" ? "rgba(30, 36, 41, 0.16)" : "rgba(255, 255, 255, 0.14)");
  try {
    localStorage.setItem(
      "mintlist-quick-theme",
      JSON.stringify({ a: current.a, b: current.b, c: current.c, scheme: current.scheme })
    );
  } catch (error) {
    // Storage unavailable (e.g. private context) - the next load just skips the fast-paint step.
  }
  if (current.image) {
    const overlay = current.scheme === "light" ? "rgba(255, 255, 255, 0.20)" : "rgba(0, 0, 0, 0.18)";
    document.body.style.backgroundImage = `linear-gradient(${overlay}, ${overlay}), url("${current.image}")`;
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundPosition = "center";
    document.body.style.backgroundRepeat = "no-repeat";
    document.body.style.backgroundAttachment = "fixed";
  } else {
    document.body.style.backgroundImage = "";
    document.body.style.backgroundSize = "";
    document.body.style.backgroundPosition = "";
    document.body.style.backgroundRepeat = "";
    document.body.style.backgroundAttachment = "";
  }
}

function renderAccount() {
  const name = state.account.name || "Google profile";
  els.accountName.textContent = state.account.signedIn ? name : "Not signed in";
  els.accountEmail.textContent = state.account.signedIn ? state.account.email || "Signed in with Google" : "Google profile required";
  els.signOutButton.hidden = !state.account.signedIn;
}

function maybeShowAuthDialog() {
  // Outside a real Chrome extension (e.g. this page running as a plain website/demo),
  // there's no Chrome Google profile to sign into, so don't gate the UI behind it.
  if (!chromeApi) return;
  if (state.account.signedIn || els.authDialog.open) return;
  els.authStatus.textContent = "";
  els.authDialog.showModal();
}

function renderPages() {
  const page = activePage();
  els.pageList.replaceChildren();
  els.pageTitle.textContent = page.name;

  state.pages.forEach((item) => {
    const button = document.createElement("button");
    button.className = `page-button${item.id === page.id ? " active" : ""}`;
    button.type = "button";
    button.dataset.pageId = item.id;

    const name = document.createElement("span");
    name.className = "page-name";
    name.textContent = item.name;
    name.title = "Double-click to rename";
    name.addEventListener("dblclick", async (event) => {
      event.stopPropagation();
      await renamePage(item);
    });

    const renameButton = document.createElement("button");
    renameButton.className = "page-rename";
    renameButton.type = "button";
    renameButton.textContent = "\u270e";
    renameButton.title = "Rename page";
    renameButton.setAttribute("aria-label", "Rename page");
    renameButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      await renamePage(item);
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "page-delete";
    deleteButton.type = "button";
    deleteButton.textContent = "x";
    deleteButton.title = "Delete page";
    deleteButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (state.pages.length === 1) return;
      state.pages = state.pages.filter((pageItem) => pageItem.id !== item.id);
      state.activePageId = state.pages[0].id;
      await saveState();
      render();
    });

    button.append(name, renameButton, deleteButton);
    button.addEventListener("click", async () => {
      state.activePageId = item.id;
      await saveState();
      render();
    });

    els.pageList.append(button);
  });
}

function renderBoards() {
  const page = activePage();
  els.boards.replaceChildren();

  if (!page.boards.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Create a board to start collecting links.";
    els.boards.append(empty);
    return;
  }

  page.boards.forEach((board) => {
    const boardEl = els.boardTemplate.content.firstElementChild.cloneNode(true);
    const titleInput = boardEl.querySelector(".board-title-input");
    const list = boardEl.querySelector(".link-list");
    const openBoardButton = boardEl.querySelector(".open-board");
    const addLinkButton = boardEl.querySelector(".add-link");
    const deleteBoardButton = boardEl.querySelector(".delete-board");

    boardEl.dataset.boardId = board.id;
    boardEl.style.left = `${board.x ?? 24}px`;
    boardEl.style.top = `${board.y ?? 24}px`;
    titleInput.value = board.title;
    titleInput.addEventListener("change", async () => {
      board.title = titleInput.value.trim() || "Untitled board";
      await saveState();
      render();
    });

    openBoardButton.disabled = !board.links.length;
    openBoardButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      for (const link of board.links) {
        await openBookmark(link.url);
      }
    });

    addLinkButton.addEventListener("click", () => openLinkDialog(board.id));
    deleteBoardButton.addEventListener("click", async () => {
      page.boards = page.boards.filter((item) => item.id !== board.id);
      await saveState();
      render();
    });

    boardEl.addEventListener("dragstart", (event) => {
      if (event.target.closest(".bookmark-link") || event.target.closest("input") || event.target.closest("button")) return;
      const rect = boardEl.getBoundingClientRect();
      dragData = {
        type: "board",
        boardId: board.id,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top
      };
      boardEl.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
    });
    boardEl.addEventListener("dragend", () => {
      dragData = null;
      boardEl.classList.remove("dragging");
      clearDragHighlights();
    });

    list.dataset.boardId = board.id;
    list.addEventListener("dragover", (event) => {
      if (dragData?.type !== "link") return;
      event.preventDefault();
      list.classList.add("drag-over");
    });
    list.addEventListener("dragleave", () => list.classList.remove("drag-over"));
    list.addEventListener("drop", async (event) => {
      event.preventDefault();
      if (dragData?.type === "link") {
        moveLink(page, dragData.linkId, dragData.fromBoardId, board.id);
        await saveState();
        render();
      }
    });

    board.links.forEach((link) => list.append(renderLink(page, board, link)));

    els.boards.append(boardEl);
  });

  if (page.boards.length) {
    const maxX = Math.max(...page.boards.map((item) => (item.x ?? 24) + 270));
    const maxY = Math.max(...page.boards.map((item) => (item.y ?? 24) + 200));
    const spacer = document.createElement("div");
    spacer.className = "canvas-spacer";
    spacer.setAttribute("aria-hidden", "true");
    spacer.style.left = `${maxX}px`;
    spacer.style.top = `${maxY}px`;
    els.boards.append(spacer);
  }
}

function renderLink(page, board, link) {
  const linkEl = els.linkTemplate.content.firstElementChild.cloneNode(true);
  linkEl.href = link.url;
  linkEl.dataset.linkId = link.id;
  applyFavicon(linkEl.querySelector(".favicon"), link.title, link.url);
  linkEl.querySelector("strong").textContent = link.title;
  linkEl.querySelector("small").textContent = hostLabel(link.url);

  linkEl.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    event.preventDefault();
    openBookmark(link.url);
  });

  linkEl.addEventListener("dblclick", (event) => {
    event.preventDefault();
    openLinkDialog(board.id, link.id);
  });

  linkEl.addEventListener("dragstart", (event) => {
    dragData = { type: "link", linkId: link.id, fromBoardId: board.id };
    linkEl.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
  });
  linkEl.addEventListener("dragend", () => {
    dragData = null;
    linkEl.classList.remove("dragging");
    clearDragHighlights();
  });
  linkEl.addEventListener("dragover", (event) => {
    if (dragData?.type !== "link" || dragData.linkId === link.id) return;
    event.preventDefault();
    linkEl.classList.add("drag-over");
  });
  linkEl.addEventListener("dragleave", () => linkEl.classList.remove("drag-over"));
  linkEl.addEventListener("drop", async (event) => {
    if (dragData?.type !== "link") return;
    event.preventDefault();
    event.stopPropagation();
    moveLink(page, dragData.linkId, dragData.fromBoardId, board.id, link.id);
    await saveState();
    render();
  });

  linkEl.querySelector(".link-delete").addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    board.links = board.links.filter((item) => item.id !== link.id);
    await saveState();
    render();
  });

  return linkEl;
}

function clearDragHighlights() {
  document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
}

function moveLink(page, linkId, fromBoardId, toBoardId, targetLinkId = null) {
  const fromBoard = page.boards.find((board) => board.id === fromBoardId);
  const toBoard = page.boards.find((board) => board.id === toBoardId);
  if (!fromBoard || !toBoard) return;
  const fromIndex = fromBoard.links.findIndex((link) => link.id === linkId);
  if (fromIndex < 0) return;
  const [moved] = fromBoard.links.splice(fromIndex, 1);
  const targetIndex = targetLinkId ? toBoard.links.findIndex((link) => link.id === targetLinkId) : -1;
  if (targetIndex < 0) {
    toBoard.links.push(moved);
  } else {
    toBoard.links.splice(targetIndex, 0, moved);
  }
}

async function openBookmark(url) {
  if (state.settings.incognito && windowsApi) {
    try {
      await windowsApi.create({ url, incognito: true });
      return;
    } catch (error) {
      window.alert("Chrome blocked incognito opening. Enable this extension in incognito from chrome://extensions, then try again.");
    }
  }

  if (tabsApi) {
    await tabsApi.create({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function openLinkDialog(boardId, linkId = null) {
  const page = activePage();
  const board = page.boards.find((item) => item.id === boardId);
  const link = linkId ? board?.links.find((item) => item.id === linkId) : null;
  editingLink = { boardId, linkId };
  els.linkDialogTitle.textContent = link ? "Edit link" : "Add link";
  els.linkTitleInput.value = link?.title || "";
  els.linkUrlInput.value = link?.url || "";
  els.linkDialog.showModal();
  els.linkTitleInput.focus();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function currentWallpaperScheme() {
  return state.settings.wallpaperTone === "light" ? "light" : "dark";
}

async function uploadWallpaper(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const image = await fileToDataUrl(file);
  const scheme = currentWallpaperScheme();
  const wallpaper = {
    id: uid("wallpaper"),
    name: file.name.replace(/\.[^.]+$/, "").slice(0, 28) || "Uploaded wallpaper",
    a: scheme === "light" ? "#f7f7f2" : "#070908",
    b: scheme === "light" ? "#bfd5cf" : "#163c31",
    c: scheme === "light" ? "#e1c079" : "#6bbd88",
    scheme,
    tone: state.settings.wallpaperTone || "dark",
    image
  };
  state.settings.uploadedWallpapers.unshift(wallpaper);
  state.settings.wallpaper = wallpaper.id;
  await saveState();
  render();
  renderWallpaperChoices();
}

async function signInWithGoogle() {
  els.authStatus.textContent = "Checking your Chrome Google profile...";

  if (!identityApi?.getProfileUserInfo) {
    els.authStatus.textContent = "Google sign-in works after loading this folder as a Chrome extension.";
    return;
  }

  const profile = await new Promise((resolve) => {
    identityApi.getProfileUserInfo({ accountStatus: "ANY" }, (info) => resolve(info || {}));
  });
  if (!profile?.email) {
    els.authStatus.textContent = "Please sign into Chrome with your Google account, then click this button again.";
    if (tabsApi) {
      try {
        await tabsApi.create({ url: "chrome://settings/people" });
      } catch {
        // Some Chrome channels block opening settings pages from extensions.
      }
    }
    return;
  }

  state.account = {
    signedIn: true,
    name: profile.email.split("@")[0],
    email: profile.email
  };
  await saveState();
  els.authDialog.close();
  render();
}

function renderWallpaperChoices() {
  els.wallpaperGrid.replaceChildren();
  const tone = state.settings.wallpaperTone || "dark";
  els.darkWallpapersButton.classList.toggle("active", tone === "dark");
  els.lightWallpapersButton.classList.toggle("active", tone === "light");

  const choices = [
    ...wallpapers.filter((wallpaper) => wallpaper.tone === tone),
    ...state.settings.uploadedWallpapers.filter((wallpaper) => wallpaper.tone === tone)
  ];

  choices.forEach((wallpaper) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `wallpaper-swatch${wallpaper.image ? " image-swatch" : ""}${state.settings.wallpaper === wallpaper.id ? " active" : ""}`;
    button.title = wallpaper.name;
    button.style.setProperty("--swatch-a", wallpaper.a);
    button.style.setProperty("--swatch-b", wallpaper.b);
    button.style.setProperty("--swatch-c", wallpaper.c);
    if (wallpaper.image) {
      button.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.18), rgba(0, 0, 0, 0.18)), url("${wallpaper.image}")`;
    }

    const label = document.createElement("span");
    label.textContent = wallpaper.name;
    button.append(label);

    button.addEventListener("click", async () => {
      state.settings.wallpaper = wallpaper.id;
      await saveState();
      render();
      renderWallpaperChoices();
    });
    els.wallpaperGrid.append(button);
  });
}

function collectAllLinks() {
  const results = [];
  state.pages.forEach((page) => {
    page.boards.forEach((board) => {
      board.links.forEach((link) => {
        results.push({ page, board, link });
      });
    });
  });
  return results;
}

function openPalette() {
  els.paletteInput.value = "";
  renderPaletteResults("");
  els.paletteDialog.showModal();
  els.paletteInput.focus();
}

function renderPaletteResults(query) {
  const trimmed = query.trim().toLowerCase();
  const all = collectAllLinks();
  const filtered = trimmed
    ? all.filter(({ link }) => `${link.title} ${link.url}`.toLowerCase().includes(trimmed))
    : all;
  paletteResultsData = filtered.slice(0, 40);
  paletteActiveIndex = paletteResultsData.length ? 0 : -1;
  drawPaletteResults();
}

function drawPaletteResults() {
  els.paletteResults.replaceChildren();

  if (!paletteResultsData.length) {
    const empty = document.createElement("p");
    empty.className = "status-text";
    empty.textContent = "No bookmarks match your search.";
    els.paletteResults.append(empty);
    return;
  }

  paletteResultsData.forEach((entry, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `palette-result${index === paletteActiveIndex ? " active" : ""}`;

    const icon = document.createElement("span");
    icon.className = "favicon";
    applyFavicon(icon, entry.link.title, entry.link.url);

    const copy = document.createElement("span");
    copy.className = "link-copy";
    const title = document.createElement("strong");
    title.textContent = entry.link.title;
    const meta = document.createElement("small");
    meta.textContent = `${entry.page.name} \u2022 ${entry.board.title} \u2022 ${hostLabel(entry.link.url)}`;
    copy.append(title, meta);

    item.append(icon, copy);
    item.addEventListener("click", () => {
      els.paletteDialog.close();
      openBookmark(entry.link.url);
    });

    els.paletteResults.append(item);
  });
}

function bindEvents() {
  els.sidebarToggleButton.addEventListener("click", async () => {
    state.settings.sidebarCollapsed = !state.settings.sidebarCollapsed;
    await saveState();
    render();
  });

  els.addPageButton.addEventListener("click", async () => {
    const name = window.prompt("Page name", "New page")?.trim();
    if (!name) return;
    const page = { id: uid("page"), name, boards: [] };
    state.pages.push(page);
    state.activePageId = page.id;
    await saveState();
    render();
  });

  els.addBoardButton.addEventListener("click", async () => {
    const page = activePage();
    const cascade = page.boards.length % 6;
    page.boards.push({
      id: uid("board"),
      title: "New board",
      x: 24 + cascade * 36,
      y: 24 + cascade * 36,
      links: []
    });
    await saveState();
    render();
  });

  els.resetLayoutButton.addEventListener("click", async () => {
    const page = activePage();
    const columnWidth = 290;
    const columns = Math.max(1, Math.floor((els.boards.clientWidth || 900) / columnWidth));
    page.boards.forEach((board, index) => {
      board.x = 20 + (index % columns) * columnWidth;
      board.y = 20 + Math.floor(index / columns) * 240;
    });
    await saveState();
    render();
  });

  els.boards.addEventListener("dragover", (event) => {
    if (dragData?.type !== "board") return;
    event.preventDefault();
  });

  els.boards.addEventListener("drop", async (event) => {
    if (dragData?.type !== "board") return;
    event.preventDefault();
    const page = activePage();
    const boardIndex = page.boards.findIndex((item) => item.id === dragData.boardId);
    if (boardIndex < 0) return;
    const canvasRect = els.boards.getBoundingClientRect();
    const x = Math.max(0, Math.round(event.clientX - canvasRect.left + els.boards.scrollLeft - dragData.offsetX));
    const y = Math.max(0, Math.round(event.clientY - canvasRect.top + els.boards.scrollTop - dragData.offsetY));
    const [board] = page.boards.splice(boardIndex, 1);
    board.x = x;
    board.y = y;
    page.boards.push(board);
    await saveState();
    render();
  });

  els.paletteButton.addEventListener("click", openPalette);

  els.closePaletteButton.addEventListener("click", () => els.paletteDialog.close());

  document.addEventListener("keydown", (event) => {
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openPalette();
    }
  });

  els.paletteInput.addEventListener("input", () => renderPaletteResults(els.paletteInput.value));

  els.paletteInput.addEventListener("keydown", (event) => {
    if (!paletteResultsData.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      paletteActiveIndex = Math.min(paletteActiveIndex + 1, paletteResultsData.length - 1);
      drawPaletteResults();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      paletteActiveIndex = Math.max(paletteActiveIndex - 1, 0);
      drawPaletteResults();
    } else if (event.key === "Enter") {
      event.preventDefault();
      const entry = paletteResultsData[paletteActiveIndex];
      if (entry) {
        els.paletteDialog.close();
        openBookmark(entry.link.url);
      }
    }
  });

  els.privacyToggle.addEventListener("change", async () => {
    state.settings.privacy = els.privacyToggle.checked;
    await saveState();
    render();
  });

  els.incognitoToggle.addEventListener("change", async () => {
    state.settings.incognito = els.incognitoToggle.checked;
    await saveState();
    render();
  });

  els.darkWallpapersButton.addEventListener("click", async () => {
    state.settings.wallpaperTone = "dark";
    await saveState();
    renderWallpaperChoices();
  });

  els.lightWallpapersButton.addEventListener("click", async () => {
    state.settings.wallpaperTone = "light";
    await saveState();
    renderWallpaperChoices();
  });

  els.wallpaperUploadInput.addEventListener("change", async () => {
    const file = els.wallpaperUploadInput.files?.[0];
    if (!file) return;
    await uploadWallpaper(file);
    els.wallpaperUploadInput.value = "";
  });

  els.exportDataButton.addEventListener("click", () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mintlist-backup-${stamp}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  els.importDataInput.addEventListener("change", async () => {
    const file = els.importDataInput.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !Array.isArray(parsed.pages)) throw new Error("Not a MintList backup");
      const confirmed = window.confirm("Import this backup? It replaces all current pages, boards, and settings on this device.");
      if (!confirmed) return;
      state = parsed;
      normalizeState();
      await saveState();
      render();
      renderWallpaperChoices();
    } catch (error) {
      window.alert("That file doesn't look like a valid MintList backup.");
    } finally {
      els.importDataInput.value = "";
    }
  });

  els.googleSignInButton.addEventListener("click", signInWithGoogle);

  els.authDialog.addEventListener("cancel", (event) => {
    if (!state.account.signedIn) event.preventDefault();
  });

  els.signOutButton.addEventListener("click", async () => {
    state.account = structuredClone(defaultState.account);
    await saveState();
    render();
  });

  els.linkForm.addEventListener("submit", async (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    const page = activePage();
    const board = page.boards.find((item) => item.id === editingLink?.boardId);
    if (!board) return;

    const title = els.linkTitleInput.value.trim();
    const url = normalizeUrl(els.linkUrlInput.value);
    if (!title || !url) return;

    if (editingLink.linkId) {
      const link = board.links.find((item) => item.id === editingLink.linkId);
      if (link) Object.assign(link, { title, url });
    } else {
      board.links.push({ id: uid("link"), title, url });
    }

    await saveState();
    els.linkDialog.close();
    render();
  });

  document.querySelectorAll(".close-link-dialog").forEach((button) => {
    button.addEventListener("click", () => {
      els.linkForm.reset();
      editingLink = null;
      els.linkDialog.close();
    });
  });
}

window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    loadState().then(render);
  }
});

(async function init() {
  await loadState();
  bindEvents();
  renderWallpaperChoices();
  render();
})();