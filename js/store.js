/*
 * MintList shared data layer.
 *
 * Loaded by the new-tab page, the toolbar popup and the background service
 * worker, so it must not touch the DOM. Everything is exposed on
 * `self.MintStore`.
 */
(function (global) {
  "use strict";

  // Chromium exposes a lightweight `chrome` object on normal web pages too, so
  // require the extension runtime id before treating this as the extension.
  const chromeApi = global.chrome?.runtime?.id ? global.chrome : null;
  const localArea = chromeApi?.storage?.local || null;

  const SCHEMA = 2;
  const STATE_KEY = "mintListState";
  const WALLPAPER_KEY = "mintListWallpapers";
  const LEGACY_STATE_KEYS = ["lumilistState"];
  const DEMO_STATE_KEY = "mintlist-state";
  const DEMO_WALLPAPER_KEY = "mintlist-wallpapers";
  const TRASH_DAYS = 30;

  const ACCENTS = [
    { id: "mint", name: "Mint", value: "#34d399" },
    { id: "ocean", name: "Ocean", value: "#38bdf8" },
    { id: "indigo", name: "Indigo", value: "#818cf8" },
    { id: "violet", name: "Violet", value: "#c084fc" },
    { id: "rose", name: "Rose", value: "#fb7185" },
    { id: "amber", name: "Amber", value: "#fbbf24" }
  ];

  const BOARD_COLORS = [
    { id: "", name: "Default", value: "" },
    { id: "mint", name: "Mint", value: "#34d399" },
    { id: "sky", name: "Sky", value: "#38bdf8" },
    { id: "indigo", name: "Indigo", value: "#818cf8" },
    { id: "violet", name: "Violet", value: "#c084fc" },
    { id: "rose", name: "Rose", value: "#fb7185" },
    { id: "orange", name: "Orange", value: "#fb923c" },
    { id: "amber", name: "Amber", value: "#fbbf24" },
    { id: "lime", name: "Lime", value: "#a3e635" },
    { id: "slate", name: "Slate", value: "#94a3b8" }
  ];

  const PAGE_ICONS = ["🏠", "💼", "📚", "🎨", "🛠️", "🎧", "🎮", "🛒", "✈️", "💡", "🧪", "📈", "📰", "🍳", "🏋️", "❤️", "⭐", "🔖", "🗂️", "🌿"];

  const WALLPAPERS = [
    { id: "none", name: "Plain", a: "#0d1110", b: "#141a18", c: "#1b2320", tone: "dark" },
    { id: "aurora-mint", name: "Aurora Mint", a: "#050806", b: "#245f4a", c: "#86c986", tone: "dark" },
    { id: "obsidian-wave", name: "Obsidian Wave", a: "#050609", b: "#132d28", c: "#55a36d", tone: "dark" },
    { id: "noir-canyon", name: "Noir Canyon", a: "#0b0c10", b: "#3a2632", c: "#b36b58", tone: "dark" },
    { id: "deep-ocean", name: "Deep Ocean", a: "#041014", b: "#0b5364", c: "#8db8c7", tone: "dark" },
    { id: "midnight-gold", name: "Midnight Gold", a: "#090b0f", b: "#3b3521", c: "#d1aa55", tone: "dark" },
    { id: "velvet-night", name: "Velvet Night", a: "#120812", b: "#552a4d", c: "#d07884", tone: "dark" },
    { id: "pine-shadow", name: "Pine Shadow", a: "#07110e", b: "#163f2f", c: "#75b58a", tone: "dark" },
    { id: "graphite-sky", name: "Graphite Sky", a: "#0e1117", b: "#364756", c: "#9aacba", tone: "dark" },
    { id: "ember-haze", name: "Ember Haze", a: "#100a08", b: "#673828", c: "#f0a15f", tone: "dark" },
    { id: "violet-arc", name: "Violet Arc", a: "#0a0714", b: "#3a2d74", c: "#a077d6", tone: "dark" },
    { id: "teal-grid", name: "Teal Grid", a: "#061113", b: "#12605f", c: "#90d4c2", tone: "dark" },
    { id: "redwood-dark", name: "Redwood Dark", a: "#110908", b: "#5b3025", c: "#c17760", tone: "dark" },
    { id: "plain-light", name: "Plain", a: "#f6f7f5", b: "#eceeea", c: "#e3e7e2", tone: "light" },
    { id: "foggy-light", name: "Foggy Light", a: "#f4f7f2", b: "#a9c5ba", c: "#7c9caa", tone: "light" },
    { id: "paper-mint", name: "Paper Mint", a: "#fbfbf2", b: "#9fcfb8", c: "#edca78", tone: "light" },
    { id: "rose-glass", name: "Rose Glass", a: "#fff6f4", b: "#e79b93", c: "#8fc6bd", tone: "light" },
    { id: "sunlit-desk", name: "Sunlit Desk", a: "#fff6d8", b: "#f0b65d", c: "#6eb4a6", tone: "light" },
    { id: "lilac-morning", name: "Lilac Morning", a: "#f7f2ff", b: "#b5a7e6", c: "#86b7c5", tone: "light" },
    { id: "coastal-paper", name: "Coastal Paper", a: "#f1fbff", b: "#9ed2df", c: "#f3cf8f", tone: "light" },
    { id: "sage-garden", name: "Sage Garden", a: "#f5faf1", b: "#b6d69c", c: "#7fb8a6", tone: "light" },
    { id: "peach-cloud", name: "Peach Cloud", a: "#fff4eb", b: "#f2b196", c: "#96bdd2", tone: "light" },
    { id: "clean-slate", name: "Clean Slate", a: "#f8fafb", b: "#b9c6d2", c: "#7eaaad", tone: "light" },
    { id: "buttercup", name: "Buttercup", a: "#fffbe8", b: "#eeca71", c: "#94c891", tone: "light" },
    { id: "orchid-paper", name: "Orchid Paper", a: "#fff5fb", b: "#dda2c8", c: "#9bbdde", tone: "light" },
    { id: "misty-lake", name: "Misty Lake", a: "#eff8f8", b: "#9bc8cb", c: "#d9c797", tone: "light" }
  ];

  // Settings that follow the user to other devices when Chrome Sync is on.
  // Everything else (wallpaper, sidebar state, the sync switch itself) is
  // specific to this browser.
  const SYNCED_SETTINGS = ["userName", "accent", "density", "columns", "openIn", "showUrls", "showClock", "showGreeting", "privacy", "glass", "theme"];

  function defaultSettings() {
    return {
      theme: "wallpaper",
      accent: "mint",
      density: "comfortable",
      columns: "auto",
      glass: true,
      wallpaper: "aurora-mint",
      wallpaperTone: "dark",
      wallpaperDim: 20,
      wallpaperBlur: 0,
      openIn: "new-tab",
      incognito: false,
      privacy: false,
      showUrls: true,
      showClock: true,
      showGreeting: true,
      userName: "",
      sidebarCollapsed: false,
      tabsPanelOpen: false,
      sync: false,
      quickSaveTarget: null,
      lastSaveTarget: null,
      onboarded: false
    };
  }

  // ---------------------------------------------------------------- helpers

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function clampText(value, max, fallback = "") {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    return (text || fallback).slice(0, max);
  }

  function normalizeUrl(input) {
    const trimmed = String(input ?? "").trim();
    if (!trimmed) return "";
    if (/^(javascript|data|vbscript):/i.test(trimmed)) return "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^[a-z0-9.-]+:\d+/i.test(trimmed)) {
      // Already has a scheme (https:, chrome:, mailto:, file:, ...).
      return trimmed;
    }
    return `https://${trimmed.replace(/^\/+/, "")}`;
  }

  function isValidUrl(input) {
    const url = normalizeUrl(input);
    if (!url) return false;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.hostname.includes(".") || parsed.hostname === "localhost";
      }
      return true;
    } catch {
      return false;
    }
  }

  function hostLabel(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, "") || parsed.protocol.replace(":", "");
    } catch {
      return String(url || "");
    }
  }

  function titleFromUrl(url) {
    const host = hostLabel(url);
    const base = host.split(".").slice(-2, -1)[0] || host;
    return base ? base.charAt(0).toUpperCase() + base.slice(1) : url;
  }

  // Comparable form of a URL for duplicate detection.
  function urlKey(url) {
    try {
      const parsed = new URL(url);
      const protocol = parsed.protocol === "http:" ? "https:" : parsed.protocol;
      const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
      const path = parsed.pathname.replace(/\/+$/, "");
      return `${protocol}//${host}${parsed.port ? `:${parsed.port}` : ""}${path}${parsed.search}`;
    } catch {
      return String(url || "").trim().toLowerCase();
    }
  }

  function normalizeTags(tags) {
    const list = Array.isArray(tags) ? tags : String(tags || "").split(",");
    const seen = new Set();
    const result = [];
    list.forEach((tag) => {
      const clean = String(tag || "").trim().replace(/^#+/, "").replace(/\s+/g, "-").toLowerCase().slice(0, 32);
      if (clean && !seen.has(clean)) {
        seen.add(clean);
        result.push(clean);
      }
    });
    return result.slice(0, 12);
  }

  function makeLink(data = {}) {
    const url = normalizeUrl(data.url);
    const time = Date.now();
    return {
      id: data.id || uid("link"),
      title: clampText(data.title, 200, titleFromUrl(url)),
      url,
      note: clampText(data.note, 600),
      tags: normalizeTags(data.tags),
      starred: Boolean(data.starred),
      createdAt: Number(data.createdAt) || time,
      updatedAt: Number(data.updatedAt) || Number(data.createdAt) || time,
      visits: Math.max(0, Number(data.visits) || 0),
      lastVisited: Number(data.lastVisited) || 0
    };
  }

  function makeBoard(data = {}) {
    return {
      id: data.id || uid("board"),
      title: clampText(data.title, 80, "Untitled board"),
      color: BOARD_COLORS.some((color) => color.id === data.color) ? data.color : "",
      collapsed: Boolean(data.collapsed),
      col: Number.isInteger(data.col) && data.col >= 0 ? Math.min(data.col, 11) : 0,
      createdAt: Number(data.createdAt) || Date.now(),
      links: Array.isArray(data.links)
        ? data.links.filter((link) => link && typeof link.url === "string" && normalizeUrl(link.url)).map(makeLink)
        : []
    };
  }

  function makePage(data = {}) {
    return {
      id: data.id || uid("page"),
      name: clampText(data.name, 60, "Untitled page"),
      icon: typeof data.icon === "string" ? data.icon.slice(0, 8) : "",
      createdAt: Number(data.createdAt) || Date.now(),
      boards: Array.isArray(data.boards) ? data.boards.filter((board) => board && typeof board === "object").map(makeBoard) : []
    };
  }

  // ------------------------------------------------------------ sample data

  function createSampleState() {
    const link = (title, url, extra = {}) => ({ title, url, ...extra });
    const pages = [
      {
        id: "home",
        name: "Home",
        icon: "🏠",
        boards: [
          {
            title: "Daily",
            color: "mint",
            col: 0,
            links: [
              link("Gmail", "https://mail.google.com", { starred: true, tags: ["daily"] }),
              link("Google Calendar", "https://calendar.google.com", { tags: ["daily"] }),
              link("YouTube", "https://www.youtube.com"),
              link("WhatsApp Web", "https://web.whatsapp.com", { starred: true })
            ]
          },
          {
            title: "AI Assistants",
            color: "violet",
            col: 1,
            links: [
              link("Claude", "https://claude.ai", { starred: true, tags: ["ai"] }),
              link("ChatGPT", "https://chatgpt.com", { tags: ["ai"] }),
              link("Perplexity", "https://www.perplexity.ai", { tags: ["ai", "research"] })
            ]
          },
          {
            title: "Work",
            color: "sky",
            col: 2,
            links: [
              link("GitHub", "https://github.com", { tags: ["dev"] }),
              link("Google Drive", "https://drive.google.com"),
              link("Notion", "https://www.notion.so"),
              link("Figma", "https://www.figma.com", { tags: ["design"] })
            ]
          },
          {
            title: "Learning",
            color: "amber",
            col: 3,
            links: [
              link("MDN Web Docs", "https://developer.mozilla.org", { tags: ["dev", "docs"] }),
              link("freeCodeCamp", "https://www.freecodecamp.org", { tags: ["dev"] }),
              link("Stack Overflow", "https://stackoverflow.com", { tags: ["dev"] })
            ]
          },
          {
            title: "Design Inspiration",
            color: "rose",
            col: 0,
            links: [
              link("Dribbble", "https://dribbble.com", { tags: ["design"] }),
              link("Mobbin", "https://mobbin.com", { tags: ["design"] }),
              link("Awwwards", "https://www.awwwards.com", { tags: ["design"] })
            ]
          }
        ]
      },
      {
        id: "reading",
        name: "Reading list",
        icon: "📚",
        boards: [
          {
            title: "Read later",
            color: "indigo",
            col: 0,
            links: [
              link("Hacker News", "https://news.ycombinator.com", { tags: ["news"] }),
              link("The Verge", "https://www.theverge.com", { tags: ["news"] })
            ]
          }
        ]
      }
    ];
    return normalizeState({ schema: SCHEMA, activePageId: "home", pages, trash: [], settings: defaultSettings() });
  }

  function createEmptyState() {
    return normalizeState({
      schema: SCHEMA,
      activePageId: "home",
      pages: [{ id: "home", name: "Home", icon: "🏠", boards: [{ title: "Inbox", col: 0, links: [] }] }],
      trash: [],
      settings: defaultSettings()
    });
  }

  // -------------------------------------------------------------- migration

  // Version 1 stored freeform x/y positions. Turn those into columns so the
  // user's rough arrangement survives the switch to the column layout.
  function migrateV1Boards(boards) {
    if (!Array.isArray(boards)) return [];
    const positioned = boards.filter((board) => board && typeof board === "object");
    const sorted = [...positioned].sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));
    // Rank the distinct horizontal positions: leftmost → column 0, next → 1, …
    const bucket = (board) => Math.round((Number(board.x) || 0) / 200);
    const lanes = [...new Set(positioned.map(bucket))].sort((a, b) => a - b);
    return sorted.map((board) => ({
      ...board,
      col: typeof board.col === "number" ? board.col : Math.min(5, Math.max(0, lanes.indexOf(bucket(board))))
    }));
  }

  function normalizeState(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    const isLegacy = !input.schema || input.schema < 2;
    const settings = { ...defaultSettings(), ...(input.settings && typeof input.settings === "object" ? input.settings : {}) };

    if (isLegacy) {
      // v1 used themeMode + an account gate. Carry over what still applies.
      if (input.settings?.themeMode) settings.theme = input.settings.themeMode;
      settings.onboarded = true;
    }
    delete settings.themeMode;
    delete settings.uploadedWallpapers;

    if (!["wallpaper", "system", "dark", "light"].includes(settings.theme)) settings.theme = "wallpaper";
    if (!ACCENTS.some((accent) => accent.id === settings.accent)) settings.accent = "mint";
    if (!["comfortable", "compact"].includes(settings.density)) settings.density = "comfortable";
    if (!["auto", 1, 2, 3, 4, 5, 6].includes(settings.columns)) settings.columns = "auto";
    if (!["new-tab", "same-tab", "background"].includes(settings.openIn)) settings.openIn = "new-tab";
    if (!["dark", "light"].includes(settings.wallpaperTone)) settings.wallpaperTone = "dark";
    settings.wallpaperDim = Math.max(0, Math.min(80, Number(settings.wallpaperDim) || 0));
    settings.wallpaperBlur = Math.max(0, Math.min(24, Number(settings.wallpaperBlur) || 0));
    settings.userName = clampText(settings.userName, 40);

    let pages = Array.isArray(input.pages) ? input.pages.filter((page) => page && typeof page === "object") : [];
    if (isLegacy) pages = pages.map((page) => ({ ...page, boards: migrateV1Boards(page.boards) }));
    pages = pages.map(makePage);
    if (!pages.length) pages = [makePage({ id: "home", name: "Home", icon: "🏠", boards: [{ title: "Inbox" }] })];

    const cutoff = Date.now() - TRASH_DAYS * 86400000;
    const trash = Array.isArray(input.trash)
      ? input.trash.filter((entry) => entry && entry.item && ["link", "board", "page"].includes(entry.type) && Number(entry.deletedAt) > cutoff)
      : [];

    const state = {
      schema: SCHEMA,
      rev: Number(input.rev) || 0,
      updatedAt: Number(input.updatedAt) || Date.now(),
      activePageId: input.activePageId,
      view: input.view && typeof input.view === "object" ? input.view : null,
      pages,
      trash: trash.slice(0, 500),
      settings
    };
    if (!state.pages.some((page) => page.id === state.activePageId)) state.activePageId = state.pages[0].id;
    return state;
  }

  // ---------------------------------------------------------------- storage

  async function readRaw() {
    if (!localArea) {
      try {
        return {
          state: JSON.parse(global.localStorage?.getItem(DEMO_STATE_KEY) || "null"),
          wallpapers: JSON.parse(global.localStorage?.getItem(DEMO_WALLPAPER_KEY) || "null")
        };
      } catch {
        return { state: null, wallpapers: null };
      }
    }
    const saved = await localArea.get([STATE_KEY, WALLPAPER_KEY, ...LEGACY_STATE_KEYS]);
    return {
      state: saved[STATE_KEY] || LEGACY_STATE_KEYS.map((key) => saved[key]).find(Boolean) || null,
      wallpapers: saved[WALLPAPER_KEY] || null
    };
  }

  // Returns { state, wallpapers, fresh } where `fresh` means nothing was saved yet.
  async function load() {
    const raw = await readRaw();
    let wallpapers = Array.isArray(raw.wallpapers) ? raw.wallpapers : [];
    // v1 kept uploaded wallpapers inside settings; move them to their own key.
    const legacyWallpapers = raw.state?.settings?.uploadedWallpapers;
    if (Array.isArray(legacyWallpapers) && legacyWallpapers.length) {
      wallpapers = [...legacyWallpapers.filter((item) => item?.image), ...wallpapers];
    }
    wallpapers = wallpapers
      .filter((item) => item && typeof item.image === "string")
      .map((item) => ({
        id: item.id || uid("wallpaper"),
        name: clampText(item.name, 40, "My wallpaper"),
        image: item.image,
        tone: item.tone === "light" || item.scheme === "light" ? "light" : "dark",
        custom: true
      }));

    if (!raw.state) {
      return { state: createSampleState(), wallpapers, fresh: true };
    }
    const state = normalizeState(raw.state);
    if (!WALLPAPERS.some((item) => item.id === state.settings.wallpaper) && !wallpapers.some((item) => item.id === state.settings.wallpaper)) {
      state.settings.wallpaper = state.settings.wallpaperTone === "light" ? "plain-light" : "aurora-mint";
    }
    if (Array.isArray(legacyWallpapers) && legacyWallpapers.length) {
      await saveWallpapers(wallpapers);
      await save(state, "migration");
    }
    return { state, wallpapers, fresh: false };
  }

  async function save(state, source = "app") {
    state.rev = (Number(state.rev) || 0) + 1;
    state.updatedAt = Date.now();
    state.savedBy = source;
    if (!localArea) {
      global.localStorage?.setItem(DEMO_STATE_KEY, JSON.stringify(state));
      return state;
    }
    await localArea.set({ [STATE_KEY]: state });
    return state;
  }

  async function saveWallpapers(wallpapers) {
    if (!localArea) {
      global.localStorage?.setItem(DEMO_WALLPAPER_KEY, JSON.stringify(wallpapers));
      return;
    }
    await localArea.set({ [WALLPAPER_KEY]: wallpapers });
  }

  // ---------------------------------------------------------------- queries

  function findPage(state, pageId) {
    return state.pages.find((page) => page.id === pageId) || null;
  }

  function findBoard(state, boardId) {
    for (const page of state.pages) {
      const index = page.boards.findIndex((board) => board.id === boardId);
      if (index >= 0) return { page, board: page.boards[index], index };
    }
    return null;
  }

  function findLink(state, linkId) {
    for (const page of state.pages) {
      for (const board of page.boards) {
        const index = board.links.findIndex((link) => link.id === linkId);
        if (index >= 0) return { page, board, link: board.links[index], index };
      }
    }
    return null;
  }

  function allLinks(state) {
    const results = [];
    state.pages.forEach((page) => {
      page.boards.forEach((board) => {
        board.links.forEach((link) => results.push({ page, board, link }));
      });
    });
    return results;
  }

  function findByUrl(state, url) {
    const key = urlKey(normalizeUrl(url));
    return allLinks(state).filter((entry) => urlKey(entry.link.url) === key);
  }

  function allTags(state) {
    const counts = new Map();
    allLinks(state).forEach(({ link }) => {
      link.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, count]) => ({ tag, count }));
  }

  // The board quick-save drops links into: the configured target, otherwise
  // a board called "Inbox" on the first page (created on demand).
  function resolveQuickSaveBoard(state, { create = true } = {}) {
    const target = state.settings.quickSaveTarget;
    if (target?.boardId) {
      const found = findBoard(state, target.boardId);
      if (found) return found;
    }
    for (const page of state.pages) {
      const inbox = page.boards.find((board) => board.title.toLowerCase() === "inbox");
      if (inbox) return { page, board: inbox, index: page.boards.indexOf(inbox) };
    }
    if (!create) return null;
    const page = findPage(state, state.activePageId) || state.pages[0];
    const board = makeBoard({ title: "Inbox", color: "mint", col: 0 });
    page.boards.unshift(board);
    return { page, board, index: 0 };
  }

  function addLinkToBoard(state, boardId, data, position = "end") {
    const found = findBoard(state, boardId);
    if (!found) return null;
    const link = makeLink(data);
    if (!link.url) return null;
    if (position === "start") found.board.links.unshift(link);
    else found.board.links.push(link);
    return link;
  }

  // ----------------------------------------------------------- import/export

  function utf8ToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return global.btoa(binary);
  }

  function base64ToUtf8(base64) {
    const binary = global.atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  const SHARE_PREFIX = "MINTLIST1:";

  // A share code is a portable copy of a page or board that can be pasted into
  // another MintList (Import → Paste). No server involved.
  function encodeShare(kind, item) {
    const strip = (link) => ({ title: link.title, url: link.url, note: link.note || undefined, tags: link.tags?.length ? link.tags : undefined });
    const payload = kind === "page"
      ? { kind, name: item.name, icon: item.icon, boards: item.boards.map((board) => ({ title: board.title, color: board.color, col: board.col, links: board.links.map(strip) })) }
      : { kind: "board", title: item.title, color: item.color, links: item.links.map(strip) };
    return SHARE_PREFIX + utf8ToBase64(JSON.stringify(payload));
  }

  function decodeShare(code) {
    const text = String(code || "").trim();
    const start = text.indexOf(SHARE_PREFIX);
    if (start < 0) return null;
    try {
      const payload = JSON.parse(base64ToUtf8(text.slice(start + SHARE_PREFIX.length).replace(/\s+/g, "")));
      if (payload?.kind === "page" && Array.isArray(payload.boards)) return payload;
      if (payload?.kind === "board" && Array.isArray(payload.links)) return payload;
    } catch {
      return null;
    }
    return null;
  }

  function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  // Netscape bookmark file: importable by Chrome, Edge, Firefox and Safari.
  function toBookmarksHtml(pages) {
    const time = Math.floor(Date.now() / 1000);
    const lines = [
      "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
      "<!-- This is an automatically generated file. It will be read and overwritten. DO NOT EDIT! -->",
      '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
      "<TITLE>Bookmarks</TITLE>",
      "<H1>Bookmarks</H1>",
      "<DL><p>",
      `    <DT><H3 ADD_DATE="${time}">MintList</H3>`,
      "    <DL><p>"
    ];
    pages.forEach((page) => {
      lines.push(`        <DT><H3 ADD_DATE="${time}">${escapeHtml(page.name)}</H3>`, "        <DL><p>");
      page.boards.forEach((board) => {
        lines.push(`            <DT><H3 ADD_DATE="${time}">${escapeHtml(board.title)}</H3>`, "            <DL><p>");
        board.links.forEach((link) => {
          const added = Math.floor((link.createdAt || Date.now()) / 1000);
          const tags = link.tags?.length ? ` TAGS="${escapeHtml(link.tags.join(","))}"` : "";
          lines.push(`                <DT><A HREF="${escapeHtml(link.url)}" ADD_DATE="${added}"${tags}>${escapeHtml(link.title)}</A>`);
          if (link.note) lines.push(`                <DD>${escapeHtml(link.note)}`);
        });
        lines.push("            </DL><p>");
      });
      lines.push("        </DL><p>");
    });
    lines.push("    </DL><p>", "</DL><p>");
    return lines.join("\n");
  }

  function toMarkdown(pages) {
    const out = [];
    pages.forEach((page) => {
      out.push(`# ${page.icon ? `${page.icon} ` : ""}${page.name}`, "");
      page.boards.forEach((board) => {
        out.push(`## ${board.title}`, "");
        board.links.forEach((link) => {
          const tags = link.tags?.length ? ` ${link.tags.map((tag) => `#${tag}`).join(" ")}` : "";
          out.push(`- [${link.title.replace(/[[\]]/g, "")}](${link.url})${tags}${link.note ? ` — ${link.note}` : ""}`);
        });
        out.push("");
      });
    });
    return out.join("\n").trim() + "\n";
  }

  // Parse loose text: one link per line as a URL, "Title | URL", "Title - URL"
  // or a Markdown link. Lines starting with "#" become new board names.
  function parseLinkText(text) {
    const groups = [];
    let current = { title: "Imported links", links: [] };
    const pushCurrent = () => { if (current.links.length) groups.push(current); };
    String(text || "").split(/\r?\n/).forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) return;
      const heading = line.match(/^#{1,6}\s+(.+)$/);
      if (heading) {
        pushCurrent();
        current = { title: clampText(heading[1], 80, "Imported links"), links: [] };
        return;
      }
      const markdown = line.match(/\[([^\]]*)\]\((\S+?)\)/);
      if (markdown && isValidUrl(markdown[2])) {
        current.links.push({ title: markdown[1], url: normalizeUrl(markdown[2]) });
        return;
      }
      const urlMatch = line.match(/((?:https?|ftp|chrome|file):\/\/\S+|www\.\S+)/i);
      if (urlMatch) {
        const url = normalizeUrl(urlMatch[1].replace(/[),.;]+$/, ""));
        const rest = line.replace(urlMatch[0], "").replace(/^[-*•\d.)\s]+/, "").replace(/[|\-–—:,\s]+$/, "").replace(/^[|\-–—:,\s]+/, "").trim();
        current.links.push({ title: rest || titleFromUrl(url), url });
        return;
      }
      const bare = line.replace(/^[-*•\d.)\s]+/, "");
      if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(bare)) {
        const url = normalizeUrl(bare);
        current.links.push({ title: titleFromUrl(url), url });
      }
    });
    pushCurrent();
    return groups;
  }

  // ------------------------------------------------------------------- sync

  function syncPayload(state) {
    const settings = {};
    SYNCED_SETTINGS.forEach((key) => { settings[key] = state.settings[key]; });
    return {
      schema: SCHEMA,
      pages: state.pages.map((page) => ({
        id: page.id,
        name: page.name,
        icon: page.icon,
        createdAt: page.createdAt,
        boards: page.boards.map((board) => ({
          id: board.id,
          title: board.title,
          color: board.color,
          collapsed: board.collapsed,
          col: board.col,
          createdAt: board.createdAt,
          links: board.links.map((link) => ({
            id: link.id,
            title: link.title,
            url: link.url,
            note: link.note || undefined,
            tags: link.tags.length ? link.tags : undefined,
            starred: link.starred || undefined,
            createdAt: link.createdAt
          }))
        }))
      })),
      settings
    };
  }

  function applySyncPayload(state, payload) {
    const local = new Map(allLinks(state).map(({ link }) => [link.id, link]));
    const next = normalizeState({
      ...state,
      pages: payload.pages,
      settings: { ...state.settings, ...pickSynced(payload.settings) }
    });
    // Keep this device's visit statistics.
    allLinks(next).forEach(({ link }) => {
      const before = local.get(link.id);
      if (before) {
        link.visits = before.visits;
        link.lastVisited = before.lastVisited;
      }
    });
    return next;
  }

  function pickSynced(settings) {
    const result = {};
    if (!settings || typeof settings !== "object") return result;
    SYNCED_SETTINGS.forEach((key) => { if (key in settings) result[key] = settings[key]; });
    return result;
  }

  function hashString(text) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  async function compressText(text) {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
    const buffer = new Uint8Array(await new Response(stream).arrayBuffer());
    let binary = "";
    for (let i = 0; i < buffer.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, buffer.subarray(i, i + 0x8000));
    }
    return global.btoa(binary);
  }

  async function decompressText(base64) {
    const bytes = Uint8Array.from(global.atob(base64), (char) => char.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
  }

  const SYNC_CHUNK = 7000;
  const SYNC_LIMIT = 96000;

  async function readSyncPayload() {
    const syncArea = chromeApi?.storage?.sync;
    if (!syncArea) return null;
    const all = await syncArea.get(null);
    const meta = all.meta;
    if (!meta || !meta.chunks) return null;
    let joined = "";
    for (let i = 0; i < meta.chunks; i += 1) {
      if (typeof all[`c${i}`] !== "string") return null;
      joined += all[`c${i}`];
    }
    try {
      const payload = JSON.parse(await decompressText(joined));
      return { meta, payload };
    } catch {
      return null;
    }
  }

  async function writeSyncPayload(payload, deviceId) {
    const syncArea = chromeApi?.storage?.sync;
    if (!syncArea) throw new Error("Chrome Sync is not available here.");
    const json = JSON.stringify(payload);
    const packed = await compressText(json);
    if (packed.length > SYNC_LIMIT) {
      const error = new Error("Your library is too large for Chrome Sync (about 1,500+ links). Use Export backup instead.");
      error.code = "too-large";
      error.bytes = packed.length;
      throw error;
    }
    const chunks = [];
    for (let i = 0; i < packed.length; i += SYNC_CHUNK) chunks.push(packed.slice(i, i + SYNC_CHUNK));
    const existing = await syncArea.get(null);
    const values = { meta: { v: 1, chunks: chunks.length, updatedAt: Date.now(), device: deviceId, hash: hashString(json), bytes: packed.length } };
    chunks.forEach((chunk, index) => { values[`c${index}`] = chunk; });
    // Skip chunks that did not change to save write quota.
    Object.keys(values).forEach((key) => {
      if (key !== "meta" && existing[key] === values[key]) delete values[key];
    });
    await syncArea.set(values);
    const stale = Object.keys(existing).filter((key) => /^c\d+$/.test(key) && Number(key.slice(1)) >= chunks.length);
    if (stale.length) await syncArea.remove(stale);
    return { bytes: packed.length, hash: hashString(json) };
  }

  global.MintStore = {
    SCHEMA,
    STATE_KEY,
    WALLPAPER_KEY,
    ACCENTS,
    BOARD_COLORS,
    PAGE_ICONS,
    WALLPAPERS,
    TRASH_DAYS,
    SYNC_LIMIT,
    isExtension: Boolean(chromeApi),
    chromeApi,
    defaultSettings,
    uid,
    clampText,
    normalizeUrl,
    isValidUrl,
    hostLabel,
    titleFromUrl,
    urlKey,
    normalizeTags,
    makeLink,
    makeBoard,
    makePage,
    createSampleState,
    createEmptyState,
    normalizeState,
    load,
    save,
    saveWallpapers,
    findPage,
    findBoard,
    findLink,
    allLinks,
    findByUrl,
    allTags,
    resolveQuickSaveBoard,
    addLinkToBoard,
    encodeShare,
    decodeShare,
    escapeHtml,
    toBookmarksHtml,
    toMarkdown,
    parseLinkText,
    syncPayload,
    applySyncPayload,
    hashString,
    readSyncPayload,
    writeSyncPayload
  };
})(typeof self !== "undefined" ? self : globalThis);
