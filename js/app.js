/* MintList new-tab app: state, rendering, actions and drag & drop. */

const S = MintStore;
const chromeApi = S.chromeApi;
const INSTANCE = `app:${Math.random().toString(36).slice(2, 10)}`;
const MIN_BOARD_WIDTH = 270;

let state = S.createSampleState();
let wallpapers = [];
let saveChain = Promise.resolve();
let undoAction = null;
let drag = null;
let dropTarget = null;

const ui = {
  view: { type: "page" },
  filter: "",
  selectMode: false,
  selected: new Set(),
  columns: 4,
  tabs: [],
  selfTabId: null,
  editingBoardId: null,
  inlineAddBoardId: null,
  narrow: false
};

const dropLine = h("div", { class: "drop-line", "aria-hidden": "true" });

// ================================================================= state

function activePage() {
  return S.findPage(state, state.activePageId) || state.pages[0];
}

function persist() {
  const snapshot = state;
  saveChain = saveChain
    .then(() => S.save(snapshot, INSTANCE))
    .catch((error) => {
      console.error(error);
      toast("Couldn't save your changes. Is storage full?", { tone: "error" });
    });
  return saveChain;
}

function commit({ render: shouldRender = true } = {}) {
  if (shouldRender) render();
  return persist();
}

function setUndo(label, run) {
  undoAction = { label, run };
  toast(label, {
    action: {
      label: "Undo",
      run: () => runUndo()
    }
  });
}

function runUndo() {
  const action = undoAction;
  undoAction = null;
  if (!action) return;
  action.run();
}

function setView(view) {
  ui.view = view;
  ui.filter = "";
  ui.selected.clear();
  $("#filterInput").value = "";
  $("#filterField").classList.remove("has-value");
  if (view.type === "page" && view.id && view.id !== state.activePageId) {
    state.activePageId = view.id;
    persist();
  }
  if (ui.narrow) setSidebarCollapsed(true, { save: false });
  render();
  $("#content").scrollTop = 0;
}

function validateView() {
  if (ui.view.type === "tag" && !S.allTags(state).some((entry) => entry.tag === ui.view.tag)) ui.view = { type: "page" };
  if (!S.findPage(state, state.activePageId)) state.activePageId = state.pages[0].id;
}

// ================================================================= theme

function currentWallpaper() {
  return S.WALLPAPERS.find((item) => item.id === state.settings.wallpaper)
    || wallpapers.find((item) => item.id === state.settings.wallpaper)
    || S.WALLPAPERS[1];
}

function resolvedScheme() {
  const mode = state.settings.theme;
  if (mode === "dark" || mode === "light") return mode;
  if (mode === "system") return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  return currentWallpaper().tone === "light" ? "light" : "dark";
}

function applyTheme() {
  const root = document.documentElement;
  const wallpaper = currentWallpaper();
  const scheme = resolvedScheme();
  const accent = S.ACCENTS.find((item) => item.id === state.settings.accent) || S.ACCENTS[0];
  root.dataset.theme = scheme;
  root.dataset.density = state.settings.density;
  root.dataset.glass = state.settings.glass ? "on" : "off";
  root.style.setProperty("--accent", accent.value);
  // A light theme over a dark wallpaper (or the reverse) needs a stronger
  // shade so text stays readable.
  const mismatch = (wallpaper.tone === "light" ? "light" : "dark") !== scheme;
  const dim = Math.max(state.settings.wallpaperDim, mismatch ? 64 : 0);
  root.style.setProperty("--dim", String(dim / 100));
  root.style.setProperty("--blur", `${state.settings.wallpaperBlur}px`);
  const colors = wallpaper.image
    ? (wallpaper.tone === "light" ? { a: "#eef1ef", b: "#dfe5e2", c: "#d4dcd8" } : { a: "#0b0e0d", b: "#151a19", c: "#1d2321" })
    : wallpaper;
  root.style.setProperty("--wp-a", colors.a);
  root.style.setProperty("--wp-b", colors.b);
  root.style.setProperty("--wp-c", colors.c);
  if (wallpaper.image) {
    root.style.setProperty("--wp-image", `url("${wallpaper.image}")`);
    root.dataset.wpImage = "on";
  } else {
    root.style.removeProperty("--wp-image");
    delete root.dataset.wpImage;
  }
  document.body.classList.toggle("privacy-on", state.settings.privacy);
  document.body.classList.toggle("hide-urls", !state.settings.showUrls);
  try {
    localStorage.setItem("mintlist-quick-theme", JSON.stringify({
      v: 2,
      scheme,
      accent: accent.value,
      a: colors.a,
      b: colors.b,
      c: colors.c,
      dim,
      blur: state.settings.wallpaperBlur,
      density: state.settings.density,
      glass: state.settings.glass,
      image: wallpaper.image && wallpaper.image.length < 1500000 ? wallpaper.image : null
    }));
  } catch {
    // Quota exceeded or storage blocked: the next load simply skips pre-paint.
  }
}

// ================================================================ render

function render() {
  validateView();
  applyTheme();
  renderSidebar();
  renderHeader();
  renderContent();
  renderBulkBar();
  renderLayoutState();
}

function renderLayoutState() {
  const app = $("#app");
  app.classList.toggle("sidebar-collapsed", Boolean(state.settings.sidebarCollapsed));
  app.classList.toggle("tabs-open", Boolean(state.settings.tabsPanelOpen));
  $("#tabsPanelButton").setAttribute("aria-pressed", String(Boolean(state.settings.tabsPanelOpen)));
  $("#selectModeButton").setAttribute("aria-pressed", String(ui.selectMode));
  $("#content").classList.toggle("select-mode", ui.selectMode);
}

// ------------------------------------------------------------- sidebar

function linkCount(page) {
  return page.boards.reduce((total, board) => total + board.links.length, 0);
}

function renderSidebar() {
  const pageList = $("#pageList");
  pageList.replaceChildren();
  state.pages.forEach((page) => {
    const active = ui.view.type === "page" && page.id === state.activePageId;
    const more = h("button", {
      class: "icon-btn xs nav-more",
      type: "button",
      title: "Page options",
      "aria-label": `Options for ${page.name}`,
      "aria-haspopup": "menu",
      onclick: (event) => {
        event.stopPropagation();
        openPageMenu(page.id, event.currentTarget);
      }
    }, icon("more"));
    const item = h("li", {},
      h("div", {
        class: `nav-item${active ? " active" : ""}`,
        role: "button",
        tabindex: "0",
        draggable: "true",
        dataset: { pageId: page.id },
        "aria-current": active ? "page" : null,
        onclick: () => setView({ type: "page", id: page.id }),
        onkeydown: (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setView({ type: "page", id: page.id });
          }
        },
        oncontextmenu: (event) => {
          event.preventDefault();
          openPageMenu(page.id, { x: event.clientX, y: event.clientY });
        }
      },
      h("span", { class: "nav-icon" }, page.icon || icon("folder")),
      h("span", { class: "nav-label", text: page.name }),
      h("span", { class: "nav-count", text: String(linkCount(page)) }),
      more)
    );
    pageList.append(item);
  });

  const starredCount = S.allLinks(state).filter(({ link }) => link.starred).length;
  const libraryList = $("#libraryList");
  libraryList.replaceChildren(
    libraryItem("starred", "star", "Starred", starredCount),
    libraryItem("recent", "clock", "Recent", null),
    libraryItem("trash", "trash", "Trash", state.trash.length || null)
  );

  const tags = S.allTags(state);
  const tagList = $("#tagList");
  tagList.replaceChildren();
  if (!tags.length) {
    tagList.append(h("p", { class: "nav-empty", text: "Add tags to links to group them here." }));
  } else {
    tags.slice(0, 40).forEach(({ tag, count }) => {
      tagList.append(h("button", {
        class: `tag-chip${ui.view.type === "tag" && ui.view.tag === tag ? " active" : ""}`,
        type: "button",
        onclick: () => setView({ type: "tag", tag })
      }, `#${tag}`, h("small", { text: String(count) })));
    });
  }

  const datalist = $("#tagSuggestions");
  datalist.replaceChildren(...tags.map(({ tag }) => h("option", { value: tag })));

  const syncDot = $("#syncDot");
  syncDot.hidden = !state.settings.sync;
  syncDot.classList.toggle("error", ui.syncStatus?.state === "error");
}

function libraryItem(type, iconName, label, count) {
  const active = ui.view.type === type;
  return h("li", {},
    h("button", {
      class: `nav-item${active ? " active" : ""}`,
      type: "button",
      dataset: { library: type },
      "aria-current": active ? "page" : null,
      onclick: () => setView({ type })
    },
    h("span", { class: "nav-icon" }, icon(iconName)),
    h("span", { class: "nav-label", text: label }),
    count ? h("span", { class: "nav-count", text: String(count) }) : null)
  );
}

// -------------------------------------------------------------- header

function greetingWord() {
  const hour = new Date().getHours();
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Good night";
}

function renderGreeting() {
  const element = $("#greeting");
  if (!state.settings.showGreeting) {
    element.hidden = true;
    return;
  }
  element.hidden = false;
  const now = new Date();
  const name = state.settings.userName ? `, ${state.settings.userName}` : "";
  const date = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const time = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  element.replaceChildren(`${greetingWord()}${name} · ${date} · `, h("span", { class: "clock", text: time }));
}

function renderHeader() {
  renderGreeting();
  const title = $("#viewTitle");
  const meta = $("#viewMeta");
  const viewIcon = $("#viewIcon");
  const isPage = ui.view.type === "page";
  const page = activePage();
  viewIcon.replaceChildren();
  viewIcon.disabled = !isPage;
  title.classList.toggle("editable", isPage);
  title.title = isPage ? "Double-click to rename" : "";

  if (isPage) {
    viewIcon.append(page.icon || icon("folder"));
    viewIcon.title = "Change name & icon";
    title.textContent = page.name;
    const links = linkCount(page);
    meta.textContent = `${pluralize(page.boards.length, "board")} · ${pluralize(links, "link")}`;
    document.title = `${page.name} · MintList`;
  } else {
    const views = {
      starred: ["star", "Starred", () => `${pluralize(viewEntries().length, "starred link")}`],
      recent: ["clock", "Recent", () => "Links you added or opened lately"],
      tag: ["hash", `#${ui.view.tag}`, () => `${pluralize(viewEntries().length, "link")} tagged #${ui.view.tag}`],
      trash: ["trash", "Trash", () => `Deleted items are removed forever after ${S.TRASH_DAYS} days`]
    };
    const [iconName, label, metaText] = views[ui.view.type];
    viewIcon.append(icon(iconName));
    viewIcon.title = "";
    title.textContent = label;
    meta.textContent = metaText();
    document.title = `${label} · MintList`;
  }

  $("#addBoardButton").hidden = !isPage;
  $("#selectModeButton").hidden = ui.view.type === "trash";
  $("#filterField").hidden = ui.view.type === "trash";
  $("#filterInput").placeholder = isPage ? "Filter this page" : "Filter these links";
}

// ------------------------------------------------------------- content

function filterTerms() {
  return ui.filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function linkMatches(link, terms) {
  if (!terms.length) return true;
  const haystack = `${link.title} ${link.url} ${link.note} ${link.tags.map((tag) => `#${tag}`).join(" ")}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function computeColumns() {
  const setting = state.settings.columns;
  if (setting !== "auto") return Number(setting);
  const content = $("#content");
  const styles = getComputedStyle(content);
  const width = content.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
  const gap = state.settings.density === "compact" ? 12 : 16;
  return Math.max(1, Math.min(6, Math.floor((width + gap) / (MIN_BOARD_WIDTH + gap))));
}

function effectiveCol(board) {
  return board.col < ui.columns ? board.col : board.col % ui.columns;
}

function renderContent() {
  const content = $("#content");
  ui.columns = computeColumns();
  content.replaceChildren();
  if (ui.view.type === "page") content.append(renderBoardsView(activePage()));
  else if (ui.view.type === "trash") content.append(renderTrashView());
  else content.append(renderLinksView());
}

function emptyState({ iconName, title, text, actions = [] }) {
  return h("div", { class: "empty" },
    h("span", { class: "empty-icon" }, icon(iconName)),
    h("h2", { text: title }),
    h("p", { text }),
    actions.length ? h("div", { class: "empty-actions" }, actions) : null
  );
}

function renderBoardsView(page) {
  if (!page.boards.length) {
    return emptyState({
      iconName: "layout",
      title: "This page is empty",
      text: "Boards group related links. Create one, import your Chrome bookmarks, or save the tabs you have open.",
      actions: [
        h("button", { class: "btn btn-primary", type: "button", onclick: () => createBoard() }, icon("plus"), "New board"),
        h("button", { class: "btn btn-secondary", type: "button", onclick: () => openImport() }, icon("download"), "Import"),
        chromeApi ? h("button", { class: "btn btn-secondary", type: "button", onclick: () => saveAllTabs() }, icon("layers"), "Save open tabs") : null
      ]
    });
  }

  const terms = filterTerms();
  const container = h("div", { class: "board-columns", style: { "--cols": ui.columns } });
  const columns = Array.from({ length: ui.columns }, (_, index) => h("div", { class: "board-column", dataset: { col: index } }));
  let visible = 0;
  page.boards.forEach((board) => {
    const element = renderBoard(board, terms);
    if (!element) return;
    visible += 1;
    columns[effectiveCol(board)].append(element);
  });
  container.append(...columns);

  if (terms.length && !visible) {
    return emptyState({
      iconName: "search",
      title: "No matches on this page",
      text: `Nothing here matches “${ui.filter.trim()}”. Search every page instead?`,
      actions: [h("button", { class: "btn btn-primary", type: "button", onclick: () => openPalette(ui.filter.trim()) }, icon("search"), "Search everywhere")]
    });
  }
  return container;
}

function boardColorValue(board) {
  return S.BOARD_COLORS.find((color) => color.id === board.color)?.value || "";
}

function renderBoard(board, terms) {
  const titleMatch = terms.length && terms.every((term) => board.title.toLowerCase().includes(term));
  const links = terms.length && !titleMatch ? board.links.filter((link) => linkMatches(link, terms)) : board.links;
  if (terms.length && !titleMatch && !links.length) return null;

  const color = boardColorValue(board);
  const collapsed = board.collapsed && !terms.length;
  const element = h("article", {
    class: `board${color ? " has-color" : ""}${collapsed ? " collapsed" : ""}`,
    dataset: { boardId: board.id },
    style: color ? { "--board-color": color } : null,
    "aria-label": board.title
  });

  const titleNode = ui.editingBoardId === board.id
    ? h("input", { class: "board-title-input", value: board.title, maxlength: "80", "aria-label": "Board name", dataset: { role: "board-title-input" } })
    : h("h3", { class: "board-title", text: board.title, title: "Double-click to rename" });

  element.append(
    h("header", { class: "board-header", draggable: ui.editingBoardId === board.id ? "false" : "true" },
      h("button", {
        class: "board-toggle",
        type: "button",
        dataset: { action: "toggle-board" },
        title: collapsed ? "Expand" : "Collapse",
        "aria-label": collapsed ? "Expand board" : "Collapse board",
        "aria-expanded": String(!collapsed)
      }, icon("chevronDown")),
      color ? h("span", { class: "board-dot" }) : null,
      titleNode,
      h("span", { class: "board-count", text: String(board.links.length) }),
      h("div", { class: "board-actions" },
        h("button", { class: "icon-btn", type: "button", dataset: { action: "open-board" }, title: "Open all links", "aria-label": "Open all links", disabled: board.links.length ? null : true }, icon("external")),
        h("button", { class: "icon-btn", type: "button", dataset: { action: "inline-add" }, title: "Add link", "aria-label": "Add link" }, icon("plus")),
        h("button", { class: "icon-btn", type: "button", dataset: { action: "board-menu" }, title: "Board options", "aria-label": "Board options", "aria-haspopup": "menu" }, icon("more"))
      )
    )
  );

  const list = h("div", { class: "link-list", dataset: { boardId: board.id } });
  links.forEach((link) => list.append(renderLink(link, terms)));
  if (!board.links.length && ui.inlineAddBoardId !== board.id) {
    list.append(h("div", { class: "board-empty", text: "Drop links or tabs here" }));
  }
  element.append(list);

  const footer = h("div", { class: "board-footer" });
  if (ui.inlineAddBoardId === board.id) {
    footer.append(renderInlineAdd(board));
  } else {
    footer.append(h("button", { class: "add-link-button", type: "button", dataset: { action: "inline-add" } }, icon("plus"), "Add link"));
  }
  element.append(footer);
  return element;
}

function renderInlineAdd(board) {
  const input = h("input", {
    class: "input",
    type: "text",
    placeholder: "Paste a URL — or Title | URL",
    autocomplete: "off",
    spellcheck: "false",
    "aria-label": `Add a link to ${board.title}`,
    dataset: { role: "inline-add-input" }
  });
  return h("form", { class: "inline-add", dataset: { boardId: board.id } },
    input,
    h("div", { class: "inline-add-hint" },
      h("span", { text: "Enter to save · Esc to close" }),
      h("button", { type: "button", dataset: { action: "inline-more" }, text: "More options" })
    )
  );
}

function renderLink(link, terms = [], { card = false } = {}) {
  const selected = ui.selected.has(link.id);
  const anchor = h("a", {
    class: `link${selected ? " selected" : ""}`,
    href: link.url,
    draggable: "true",
    rel: "noreferrer",
    dataset: { linkId: link.id },
    title: `${link.title}\n${link.url}${link.note ? `\n\n${link.note}` : ""}`
  });
  const title = h("span", { class: "link-title" });
  title.append(highlightText(link.title, terms));
  const url = h("span", { class: "link-url" });
  url.append(highlightText(S.hostLabel(link.url), terms));
  const sub = h("span", { class: "link-sub" }, url, link.tags.slice(0, card ? 4 : 2).map((tag) => h("span", { class: "link-tag", text: `#${tag}` })));
  appendChildren(anchor, [
    h("span", { class: "select-box", "aria-hidden": "true" }, icon("check")),
    faviconEl(link.url, link.title),
    h("span", { class: "link-text" }, title, sub),
    link.starred ? h("span", { class: "link-star", title: "Starred" }, icon("star")) : null,
    h("span", { class: "link-actions" },
      h("button", { class: `link-action${link.starred ? " starred" : ""}`, type: "button", dataset: { action: "star-link" }, title: link.starred ? "Unstar" : "Star", "aria-label": link.starred ? "Unstar" : "Star" }, icon("star")),
      h("button", { class: "link-action", type: "button", dataset: { action: "edit-link" }, title: "Edit", "aria-label": "Edit link" }, icon("edit")),
      h("button", { class: "link-action", type: "button", dataset: { action: "link-menu" }, title: "More", "aria-label": "More options", "aria-haspopup": "menu" }, icon("more"))
    )
  ]);
  return anchor;
}

// ------------------------------------------------------ smart views

function viewEntries() {
  const all = S.allLinks(state);
  if (ui.view.type === "starred") return all.filter(({ link }) => link.starred);
  if (ui.view.type === "tag") return all.filter(({ link }) => link.tags.includes(ui.view.tag));
  if (ui.view.type === "recent") {
    return all
      .map((entry) => ({ ...entry, when: Math.max(entry.link.createdAt || 0, entry.link.lastVisited || 0) }))
      .sort((a, b) => b.when - a.when)
      .slice(0, 60);
  }
  return [];
}

function renderLinksView() {
  const terms = filterTerms();
  const entries = viewEntries().filter(({ link }) => linkMatches(link, terms));
  if (!entries.length) {
    const copy = {
      starred: ["star", "No starred links yet", "Hover any link and click the star — your favourites will collect here."],
      recent: ["clock", "Nothing recent", "Links you add or open from MintList show up here."],
      tag: ["hash", "No links with this tag", "Edit a link to add tags."]
    }[ui.view.type];
    if (terms.length) return emptyState({ iconName: "search", title: "No matches", text: `Nothing matches “${ui.filter.trim()}”.` });
    return emptyState({ iconName: copy[0], title: copy[1], text: copy[2] });
  }
  const grid = h("div", { class: "link-grid" });
  entries.forEach(({ page, board, link }) => {
    const metaBits = [
      h("button", { type: "button", dataset: { action: "goto-board", boardId: board.id }, title: "Show on its page" }, `${page.icon ? `${page.icon} ` : ""}${page.name} › ${board.title}`)
    ];
    if (ui.view.type === "recent") {
      metaBits.push(h("span", { text: "·" }), h("span", { text: link.lastVisited && link.lastVisited >= link.createdAt ? `Opened ${relativeTime(link.lastVisited)}` : `Added ${relativeTime(link.createdAt)}` }));
    }
    grid.append(h("div", { class: "link-card" },
      renderLink(link, terms, { card: true }),
      link.note ? h("p", { class: "link-card-note", text: link.note }) : null,
      h("div", { class: "link-card-meta" }, metaBits)
    ));
  });
  return grid;
}

function renderTrashView() {
  if (!state.trash.length) {
    return emptyState({ iconName: "trash", title: "Trash is empty", text: "Deleted links, boards and pages wait here for 30 days so you can restore them." });
  }
  const wrap = h("div", {});
  wrap.append(h("div", { class: "view-toolbar" },
    h("span", { class: "view-meta", text: pluralize(state.trash.length, "item") }),
    h("button", { class: "btn btn-ghost sm", type: "button", dataset: { action: "empty-trash" } }, icon("trash"), "Empty trash")
  ));
  const list = h("div", { class: "trash-list" });
  state.trash.forEach((entry) => {
    const kind = { link: "Link", board: "Board", page: "Page" }[entry.type];
    let name = "";
    let detail = "";
    let lead;
    if (entry.type === "link") {
      name = entry.item.title;
      detail = S.hostLabel(entry.item.url);
      lead = faviconEl(entry.item.url, entry.item.title);
    } else if (entry.type === "board") {
      name = entry.item.title;
      detail = pluralize(entry.item.links.length, "link");
      lead = h("span", { class: "trash-type" }, icon("layout"));
    } else {
      name = entry.item.name;
      detail = `${pluralize(entry.item.boards.length, "board")} · ${pluralize(linkCount(entry.item), "link")}`;
      lead = h("span", { class: "trash-type" }, entry.item.icon || icon("folder"));
    }
    list.append(h("div", { class: "trash-item", dataset: { trashId: entry.id } },
      lead,
      h("span", { class: "trash-text" },
        h("strong", { text: name }),
        h("small", { text: `${kind} · ${detail}${entry.context ? ` · from ${entry.context}` : ""} · deleted ${relativeTime(entry.deletedAt)}` })
      ),
      h("button", { class: "btn btn-secondary sm", type: "button", dataset: { action: "restore" } }, icon("restore"), "Restore"),
      h("button", { class: "icon-btn sm", type: "button", dataset: { action: "purge" }, title: "Delete forever", "aria-label": "Delete forever" }, icon("close"))
    ));
  });
  wrap.append(list);
  return wrap;
}

// -------------------------------------------------------- bulk bar

function renderBulkBar() {
  const bar = $("#bulkBar");
  bar.hidden = !ui.selectMode;
  if (!ui.selectMode) return;
  const count = ui.selected.size;
  $("#bulkCount").textContent = count ? `${count} selected` : "Select links";
  $$(".bulk-action", bar).forEach((button) => {
    const type = button.dataset.bulk;
    if (!["all", "done"].includes(type)) button.disabled = !count;
  });
}

function setSelectMode(on) {
  ui.selectMode = on;
  if (!on) ui.selected.clear();
  closeInlineEditors();
  render();
}

function toggleSelected(linkId) {
  if (ui.selected.has(linkId)) ui.selected.delete(linkId);
  else ui.selected.add(linkId);
  $$(`.link[data-link-id="${CSS.escape(linkId)}"]`).forEach((element) => element.classList.toggle("selected", ui.selected.has(linkId)));
  renderBulkBar();
}

function closeInlineEditors() {
  ui.editingBoardId = null;
  ui.inlineAddBoardId = null;
}

// ============================================================ actions

function shortestColumn(page) {
  const weights = Array(ui.columns).fill(0);
  page.boards.forEach((board) => {
    weights[effectiveCol(board)] += (board.collapsed ? 1 : board.links.length + 2);
  });
  return weights.indexOf(Math.min(...weights));
}

function createBoard({ title = "New board", links = [], page = activePage(), rename = true, color = "" } = {}) {
  if (ui.view.type !== "page" || page.id !== state.activePageId) {
    state.activePageId = page.id;
    ui.view = { type: "page" };
  }
  const board = S.makeBoard({ title, links, col: shortestColumn(page), color });
  page.boards.push(board);
  ui.inlineAddBoardId = null;
  ui.editingBoardId = rename ? board.id : null;
  commit();
  focusBoard(board.id, { rename });
  return board;
}

function focusBoard(boardId, { rename = false, flash = false } = {}) {
  requestAnimationFrame(() => {
    const element = $(`.board[data-board-id="${CSS.escape(boardId)}"]`);
    if (!element) return;
    element.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (rename) {
      const input = element.querySelector(".board-title-input");
      input?.focus();
      input?.select();
    }
    if (flash) {
      element.classList.remove("flash");
      void element.offsetWidth;
      element.classList.add("flash");
    }
  });
}

function gotoBoard(boardId) {
  const found = S.findBoard(state, boardId);
  if (!found) return;
  if (found.board.collapsed) found.board.collapsed = false;
  setView({ type: "page", id: found.page.id });
  focusBoard(boardId, { flash: true });
}

function commitBoardTitle(input, { cancel = false } = {}) {
  const boardId = input.closest(".board")?.dataset.boardId;
  const found = S.findBoard(state, boardId);
  ui.editingBoardId = null;
  if (found && !cancel) {
    const value = S.clampText(input.value, 80);
    if (value && value !== found.board.title) {
      found.board.title = value;
      commit();
      return;
    }
  }
  render();
}

function toggleBoard(boardId) {
  const found = S.findBoard(state, boardId);
  if (!found) return;
  found.board.collapsed = !found.board.collapsed;
  commit();
}

function setBoardColor(boardId, color) {
  const found = S.findBoard(state, boardId);
  if (!found) return;
  found.board.color = color;
  commit();
}

function sortBoard(boardId, mode) {
  const found = S.findBoard(state, boardId);
  if (!found) return;
  const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  const sorters = {
    title: (a, b) => collator.compare(a.title, b.title),
    domain: (a, b) => collator.compare(S.hostLabel(a.url), S.hostLabel(b.url)) || collator.compare(a.title, b.title),
    newest: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    visits: (a, b) => (b.visits || 0) - (a.visits || 0)
  };
  const before = [...found.board.links];
  found.board.links.sort(sorters[mode]);
  commit();
  setUndo("Links sorted", () => {
    const again = S.findBoard(state, boardId);
    if (!again) return;
    again.board.links = before.filter((link) => again.board.links.some((item) => item.id === link.id));
    commit();
  });
}

function duplicateBoard(boardId) {
  const found = S.findBoard(state, boardId);
  if (!found) return;
  const copy = S.makeBoard({
    ...structuredClone(found.board),
    id: undefined,
    title: `${found.board.title} copy`,
    links: found.board.links.map((link) => ({ ...structuredClone(link), id: undefined }))
  });
  found.page.boards.splice(found.index + 1, 0, copy);
  commit();
  focusBoard(copy.id, { flash: true });
  toast("Board duplicated");
}

function duplicatePage(pageId) {
  const page = S.findPage(state, pageId);
  if (!page) return;
  const copy = S.makePage({
    name: `${page.name} copy`,
    icon: page.icon,
    boards: page.boards.map((board) => ({
      ...structuredClone(board),
      id: undefined,
      links: board.links.map((link) => ({ ...structuredClone(link), id: undefined }))
    }))
  });
  state.pages.splice(state.pages.indexOf(page) + 1, 0, copy);
  setView({ type: "page", id: copy.id });
  persist();
  toast("Page duplicated");
}

function toggleStar(linkId) {
  const found = S.findLink(state, linkId);
  if (!found) return;
  found.link.starred = !found.link.starred;
  found.link.updatedAt = Date.now();
  commit();
}

// ------------------------------------------------------- opening links

function isSavableTabUrl(url) {
  return /^(https?|file|ftp):/i.test(url || "") && !isOwnPage(url);
}

function isOwnPage(url) {
  if (!url) return false;
  if (url.startsWith("chrome://newtab") || url.startsWith("edge://newtab")) return true;
  return Boolean(chromeApi && url.startsWith(chromeApi.runtime.getURL("")));
}

async function openUrls(urls, mode = "default") {
  const list = urls.filter(Boolean);
  if (!list.length) return;
  let target = mode;
  if (target === "default") target = state.settings.incognito ? "incognito" : state.settings.openIn;

  if (!chromeApi) {
    if (target === "same-tab" && list.length === 1) {
      window.location.href = list[0];
      return;
    }
    list.forEach((url) => window.open(url, "_blank", "noopener"));
    return;
  }

  try {
    if (target === "incognito" || target === "new-window") {
      await chromeApi.windows.create({ url: list, incognito: target === "incognito" });
      return;
    }
    if (target === "same-tab" && list.length === 1) {
      const current = await chromeApi.tabs.getCurrent();
      if (current) {
        await chromeApi.tabs.update(current.id, { url: list[0] });
        return;
      }
    }
    const active = target !== "background" && list.length === 1;
    for (const url of list) {
      await chromeApi.tabs.create({ url, active });
    }
  } catch (error) {
    if (target === "incognito") {
      toast("Chrome blocked incognito. Turn on “Allow in Incognito” for MintList in chrome://extensions.", { tone: "error", duration: 8000 });
      for (const url of list) await chromeApi.tabs.create({ url, active: false });
    } else {
      toast("Couldn't open that link.", { tone: "error" });
    }
  }
}

async function openLinkById(linkId, mode = "default") {
  const found = S.findLink(state, linkId);
  if (!found) return;
  found.link.visits = (found.link.visits || 0) + 1;
  found.link.lastVisited = Date.now();
  await commit({ render: ui.view.type === "recent" });
  await openUrls([found.link.url], mode);
}

async function openBoard(boardId, mode = "background") {
  const found = S.findBoard(state, boardId);
  if (!found || !found.board.links.length) return;
  await openLinkSet(found.board.links, mode, found.board.title);
}

async function openLinkSet(links, mode, label) {
  if (links.length > 12) {
    const answer = await askConfirm({
      title: `Open ${links.length} tabs?`,
      message: `This opens every link in “${label}”.`,
      confirmLabel: `Open ${links.length} tabs`,
      tone: "info",
      iconName: "external"
    });
    if (answer !== "confirm") return;
  }
  const time = Date.now();
  links.forEach((link) => {
    link.visits = (link.visits || 0) + 1;
    link.lastVisited = time;
  });
  await commit({ render: false });
  const resolved = mode === "background" && state.settings.incognito ? "incognito" : mode;
  await openUrls(links.map((link) => link.url), resolved);
  if (resolved === "background") toast(`Opened ${pluralize(links.length, "tab")}`);
}

// ------------------------------------------------------- adding links

function titleForUrl(url) {
  const key = S.urlKey(url);
  const tab = (ui.tabs || []).find((item) => S.urlKey(item.url) === key);
  return tab?.title || S.titleFromUrl(url);
}

function addLinks(boardId, items, beforeId = null) {
  const found = S.findBoard(state, boardId);
  if (!found) return [];
  const links = items
    .filter((item) => S.isValidUrl(item.url))
    .map((item) => S.makeLink({ ...item, url: S.normalizeUrl(item.url), title: item.title || titleForUrl(S.normalizeUrl(item.url)) }));
  if (!links.length) return [];
  let index = beforeId ? found.board.links.findIndex((link) => link.id === beforeId) : -1;
  if (index < 0) index = found.board.links.length;
  found.board.links.splice(index, 0, ...links);
  found.board.collapsed = false;
  return links;
}

function submitInlineAdd(form) {
  const boardId = form.dataset.boardId;
  const input = form.querySelector("input");
  const raw = input.value.trim();
  if (!raw) {
    ui.inlineAddBoardId = null;
    render();
    return;
  }
  let items = [];
  const pipe = raw.split(/\s+\|\s+/);
  if (pipe.length === 2 && S.isValidUrl(pipe[1])) items = [{ title: pipe[0], url: pipe[1] }];
  else if (pipe.length === 2 && S.isValidUrl(pipe[0])) items = [{ title: pipe[1], url: pipe[0] }];
  else if (S.isValidUrl(raw) && !/\s/.test(raw)) items = [{ url: raw }];
  else items = S.parseLinkText(raw).flatMap((group) => group.links);

  if (!items.length) {
    input.classList.add("invalid");
    input.setAttribute("aria-invalid", "true");
    toast("That doesn't look like a web address.", { tone: "error" });
    return;
  }
  const added = addLinks(boardId, items);
  persist();
  render();
  focusInlineAdd(boardId);
  toast(added.length === 1 ? `Saved “${added[0].title}”` : `Saved ${pluralize(added.length, "link")}`);
}

function focusInlineAdd(boardId) {
  requestAnimationFrame(() => {
    const input = $(`.inline-add[data-board-id="${CSS.escape(boardId)}"] input`);
    input?.focus();
    input?.scrollIntoView({ block: "nearest" });
  });
}

function startInlineAdd(boardId) {
  const found = S.findBoard(state, boardId);
  if (!found) return;
  found.board.collapsed = false;
  ui.inlineAddBoardId = boardId;
  ui.editingBoardId = null;
  render();
  focusInlineAdd(boardId);
}

// ---------------------------------------------------------- move/trash

function moveLinksTo(linkIds, boardId, beforeId = null, { copy = false } = {}) {
  const target = S.findBoard(state, boardId);
  if (!target) return 0;
  const entries = linkIds.map((id) => S.findLink(state, id)).filter(Boolean);
  const moving = entries.map(({ board, link }) => {
    if (copy) return S.makeLink({ ...structuredClone(link), id: undefined });
    const index = board.links.indexOf(link);
    if (index >= 0) board.links.splice(index, 1);
    return link;
  });
  let index = beforeId ? target.board.links.findIndex((link) => link.id === beforeId) : -1;
  if (index < 0) index = target.board.links.length;
  target.board.links.splice(index, 0, ...moving);
  target.board.collapsed = false;
  return moving.length;
}

function moveBoardTo(boardId, col, beforeId) {
  const page = activePage();
  const index = page.boards.findIndex((board) => board.id === boardId);
  if (index < 0) return;
  const [board] = page.boards.splice(index, 1);
  board.col = col;
  if (beforeId) {
    const target = page.boards.findIndex((item) => item.id === beforeId);
    page.boards.splice(target < 0 ? page.boards.length : target, 0, board);
  } else {
    let last = -1;
    page.boards.forEach((item, itemIndex) => { if (effectiveCol(item) === col) last = itemIndex; });
    page.boards.splice(last + 1, 0, board);
  }
}

function moveBoardToPage(boardId, pageId, { copy = false } = {}) {
  const found = S.findBoard(state, boardId);
  const page = S.findPage(state, pageId);
  if (!found || !page) return null;
  let board = found.board;
  if (copy) {
    board = S.makeBoard({ ...structuredClone(found.board), id: undefined, links: found.board.links.map((link) => ({ ...structuredClone(link), id: undefined })) });
  } else {
    found.page.boards.splice(found.index, 1);
  }
  board.col = page.id === found.page.id ? board.col : 0;
  page.boards.push(board);
  return board;
}

function firstBoardOf(page) {
  if (!page.boards.length) page.boards.push(S.makeBoard({ title: "Inbox", color: "mint", col: 0 }));
  return page.boards[0];
}

function pushTrash(type, item, from, context) {
  const entry = { id: S.uid("trash"), type, item, from, context, deletedAt: Date.now() };
  state.trash.unshift(entry);
  state.trash = state.trash.slice(0, 500);
  return entry;
}

function trashLinks(linkIds) {
  const entries = [];
  linkIds.forEach((id) => {
    const found = S.findLink(state, id);
    if (!found) return;
    found.board.links.splice(found.index, 1);
    ui.selected.delete(id);
    entries.push(pushTrash("link", found.link, { pageId: found.page.id, boardId: found.board.id, index: found.index }, `${found.page.name} › ${found.board.title}`));
  });
  if (!entries.length) return;
  commit();
  const label = entries.length === 1 ? `Deleted “${entries[0].item.title}”` : `Deleted ${pluralize(entries.length, "link")}`;
  setUndo(label, () => restoreEntries(entries.map((entry) => entry.id).reverse()));
}

function trashBoard(boardId) {
  const found = S.findBoard(state, boardId);
  if (!found) return;
  found.page.boards.splice(found.index, 1);
  const entry = pushTrash("board", found.board, { pageId: found.page.id, index: found.index }, found.page.name);
  commit();
  setUndo(`Deleted board “${found.board.title}”`, () => restoreEntries([entry.id]));
}

async function trashPage(pageId) {
  const page = S.findPage(state, pageId);
  if (!page) return;
  if (state.pages.length === 1) {
    toast("You need at least one page. Create another page first.", { tone: "info" });
    return;
  }
  const links = linkCount(page);
  if (links > 0) {
    const answer = await askConfirm({
      title: `Delete “${page.name}”?`,
      message: `${pluralize(page.boards.length, "board")} and ${pluralize(links, "link")} will move to Trash. You can restore them for 30 days.`,
      confirmLabel: "Delete page"
    });
    if (answer !== "confirm") return;
  }
  const index = state.pages.indexOf(page);
  state.pages.splice(index, 1);
  const entry = pushTrash("page", page, { index }, "");
  if (state.activePageId === page.id) state.activePageId = state.pages[Math.max(0, index - 1)].id;
  if (ui.view.type === "page") ui.view = { type: "page" };
  commit();
  setUndo(`Deleted page “${page.name}”`, () => restoreEntries([entry.id]));
}

function uniqueIds(entity, type) {
  // Restored items keep their ids unless something else took them meanwhile.
  if (type === "link") {
    if (S.findLink(state, entity.id)) entity.id = S.uid("link");
    return entity;
  }
  if (type === "board") {
    if (S.findBoard(state, entity.id)) entity.id = S.uid("board");
    entity.links.forEach((link) => uniqueIds(link, "link"));
    return entity;
  }
  if (S.findPage(state, entity.id)) entity.id = S.uid("page");
  entity.boards.forEach((board) => uniqueIds(board, "board"));
  return entity;
}

function restoreEntries(ids, { silent = false } = {}) {
  let restored = 0;
  ids.forEach((id) => {
    const index = state.trash.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    const [entry] = state.trash.splice(index, 1);
    const item = uniqueIds(entry.item, entry.type);
    if (entry.type === "link") {
      let board = S.findBoard(state, entry.from?.boardId)?.board;
      if (!board) board = firstBoardOf(S.findPage(state, entry.from?.pageId) || activePage());
      board.links.splice(Math.min(entry.from?.index ?? board.links.length, board.links.length), 0, item);
    } else if (entry.type === "board") {
      const page = S.findPage(state, entry.from?.pageId) || activePage();
      page.boards.splice(Math.min(entry.from?.index ?? page.boards.length, page.boards.length), 0, item);
    } else {
      state.pages.splice(Math.min(entry.from?.index ?? state.pages.length, state.pages.length), 0, item);
    }
    restored += 1;
  });
  if (!restored) return;
  commit();
  if (!silent) toast(restored === 1 ? "Restored" : `Restored ${restored} items`);
}

async function purgeEntry(id) {
  state.trash = state.trash.filter((entry) => entry.id !== id);
  commit();
}

async function emptyTrash() {
  const answer = await askConfirm({
    title: "Empty Trash?",
    message: `${pluralize(state.trash.length, "item")} will be deleted forever. This can't be undone.`,
    confirmLabel: "Empty Trash"
  });
  if (answer !== "confirm") return;
  state.trash = [];
  commit();
  toast("Trash emptied");
}

// ---------------------------------------------------------- menus

function openLinkMenu(linkId, anchor) {
  const found = S.findLink(state, linkId);
  if (!found) return;
  const element = anchor instanceof Element ? anchor.closest(".link") : $(`.link[data-link-id="${CSS.escape(linkId)}"]`);
  element?.classList.add("menu-open");
  const { link } = found;
  openMenu(anchor, [
    { label: "Open", icon: "external", run: () => openLinkById(linkId) },
    { label: "Open in background tab", icon: "layers", hint: isMac ? "⌘-click" : "Ctrl-click", run: () => openLinkById(linkId, "background") },
    { label: "Open in new window", icon: "monitor", hint: "Shift-click", run: () => openLinkById(linkId, "new-window") },
    chromeApi ? { label: "Open in incognito", icon: "incognito", run: () => openLinkById(linkId, "incognito") } : null,
    "sep",
    { label: "Edit…", icon: "edit", run: () => openLinkDialog({ linkId }) },
    { label: link.starred ? "Remove star" : "Star", icon: "star", run: () => toggleStar(linkId) },
    { label: "Copy link", icon: "copy", run: async () => { await copyText(link.url); toast("Link copied"); } },
    { label: "Move to…", icon: "folderInput", run: () => openMoveDialog({ kind: "links", ids: [linkId] }) },
    { label: "Duplicate", icon: "duplicate", run: () => { moveLinksTo([linkId], found.board.id, found.board.links[found.index + 1]?.id || null, { copy: true }); commit(); toast("Link duplicated"); } },
    { label: "Select", icon: "checkSquare", run: () => { ui.selectMode = true; ui.selected.add(linkId); render(); } },
    "sep",
    { label: "Delete", icon: "trash", danger: true, hint: "Del", run: () => trashLinks([linkId]) }
  ], { label: "Link options", onClose: () => element?.classList.remove("menu-open") });
}

function openBoardMenu(boardId, anchor) {
  const found = S.findBoard(state, boardId);
  if (!found) return;
  const { board } = found;
  const hasLinks = board.links.length > 0;
  openMenu(anchor, [
    { label: "Add link", icon: "plus", run: () => startInlineAdd(boardId) },
    { label: "Rename", icon: "edit", run: () => { ui.editingBoardId = boardId; ui.inlineAddBoardId = null; render(); focusBoard(boardId, { rename: true }); } },
    { label: board.collapsed ? "Expand" : "Collapse", icon: board.collapsed ? "expand" : "collapse", run: () => toggleBoard(boardId) },
    { type: "label", label: "Colour" },
    { type: "colors", colors: S.BOARD_COLORS, active: board.color, pick: (color) => setBoardColor(boardId, color) },
    "sep",
    { label: "Open all", icon: "external", disabled: !hasLinks, run: () => openBoard(boardId, "background") },
    { label: "Open all in new window", icon: "monitor", disabled: !hasLinks, run: () => openBoard(boardId, "new-window") },
    chromeApi ? { label: "Open all in incognito", icon: "incognito", disabled: !hasLinks, run: () => openBoard(boardId, "incognito") } : null,
    "sep",
    { label: "Sort A → Z", icon: "sort", disabled: board.links.length < 2, run: () => sortBoard(boardId, "title") },
    { label: "Sort by website", icon: "globe", disabled: board.links.length < 2, run: () => sortBoard(boardId, "domain") },
    { label: "Sort newest first", icon: "clock", disabled: board.links.length < 2, run: () => sortBoard(boardId, "newest") },
    { label: "Sort most opened", icon: "zap", disabled: board.links.length < 2, run: () => sortBoard(boardId, "visits") },
    "sep",
    { label: "Move to page…", icon: "folderInput", run: () => openMoveDialog({ kind: "board", ids: [boardId] }) },
    { label: "Duplicate", icon: "duplicate", run: () => duplicateBoard(boardId) },
    { label: "Share & export…", icon: "share", run: () => openShareDialog({ kind: "board", id: boardId }) },
    "sep",
    { label: "Delete board", icon: "trash", danger: true, run: () => trashBoard(boardId) }
  ], { label: "Board options" });
}

function openPageMenu(pageId, anchor) {
  const page = S.findPage(state, pageId);
  if (!page) return;
  const index = state.pages.indexOf(page);
  openMenu(anchor, [
    { label: "Rename & icon…", icon: "edit", run: () => openPageDialog(pageId) },
    { label: "New board here", icon: "plus", run: () => createBoard({ page }) },
    { label: "Open every link", icon: "external", disabled: !linkCount(page), run: () => openLinkSet(page.boards.flatMap((board) => board.links), "background", page.name) },
    "sep",
    { label: "Move up", icon: "chevronLeft", disabled: index === 0, run: () => movePage(pageId, -1) },
    { label: "Move down", icon: "chevronRight", disabled: index === state.pages.length - 1, run: () => movePage(pageId, 1) },
    { label: "Duplicate", icon: "duplicate", run: () => duplicatePage(pageId) },
    { label: "Share & export…", icon: "share", run: () => openShareDialog({ kind: "page", id: pageId }) },
    "sep",
    { label: "Delete page", icon: "trash", danger: true, disabled: state.pages.length === 1, run: () => trashPage(pageId) }
  ], { label: "Page options", align: "left" });
}

function movePage(pageId, delta) {
  const index = state.pages.findIndex((page) => page.id === pageId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= state.pages.length) return;
  const [page] = state.pages.splice(index, 1);
  state.pages.splice(target, 0, page);
  commit();
}

// ------------------------------------------------------- page title

function startTitleEdit() {
  if (ui.view.type !== "page") return;
  const title = $("#viewTitle");
  const input = $("#viewTitleInput");
  input.value = activePage().name;
  title.hidden = true;
  input.hidden = false;
  input.focus();
  input.select();
}

function finishTitleEdit(save) {
  const title = $("#viewTitle");
  const input = $("#viewTitleInput");
  if (input.hidden) return;
  input.hidden = true;
  title.hidden = false;
  const value = S.clampText(input.value, 60);
  if (save && value && value !== activePage().name) {
    activePage().name = value;
    commit();
  }
}

// ------------------------------------------------------------ sidebar

function setSidebarCollapsed(collapsed, { save = true } = {}) {
  state.settings.sidebarCollapsed = collapsed;
  renderLayoutState();
  if (save) persist();
  // Board columns depend on the available width once the transition ends.
  setTimeout(() => relayout(), 300);
}

function setTabsPanel(open) {
  state.settings.tabsPanelOpen = open;
  renderLayoutState();
  persist();
  if (open) refreshTabs();
  setTimeout(() => relayout(), 300);
}

function relayout() {
  if (ui.view.type !== "page") return;
  const next = computeColumns();
  if (next !== ui.columns) renderContent();
}

// ============================================================= tabs panel

async function refreshTabs() {
  if (!chromeApi?.tabs) {
    ui.tabs = null;
    renderTabsPanel();
    return;
  }
  try {
    const current = await chromeApi.tabs.getCurrent();
    ui.selfTabId = current?.id ?? null;
    const tabs = await chromeApi.tabs.query(current ? { windowId: current.windowId } : { currentWindow: true });
    ui.tabs = tabs.filter((tab) => tab.id !== ui.selfTabId && isSavableTabUrl(tab.url));
  } catch {
    ui.tabs = [];
  }
  renderTabsPanel();
}

function renderTabsPanel() {
  const list = $("#tabsList");
  list.replaceChildren();
  if (ui.tabs === null) {
    $("#tabsCount").textContent = "Extension only";
    $("#saveAllTabsButton").disabled = true;
    list.append(h("li", { class: "tabs-empty", text: "Your open tabs appear here when MintList runs as a Chrome extension." }));
    return;
  }
  $("#tabsCount").textContent = `${pluralize(ui.tabs.length, "tab")} in this window`;
  $("#saveAllTabsButton").disabled = !ui.tabs.length;
  if (!ui.tabs.length) {
    list.append(h("li", { class: "tabs-empty", text: "No other tabs open in this window." }));
    return;
  }
  const saved = new Set(S.allLinks(state).map(({ link }) => S.urlKey(link.url)));
  ui.tabs.forEach((tab) => {
    const isSaved = saved.has(S.urlKey(tab.url));
    list.append(h("li", {
      class: `tab-item${isSaved ? " saved" : ""}`,
      draggable: "true",
      dataset: { tabId: tab.id },
      title: `${tab.title}\n${tab.url}${isSaved ? "\n\nAlready saved in MintList" : ""}`
    },
    faviconEl(tab.url, tab.title, /^https?:|^data:image/.test(tab.favIconUrl || "") ? tab.favIconUrl : null),
    h("span", { class: "link-text", dataset: { action: "focus-tab" } },
      h("span", { class: "link-title", text: tab.title || tab.url }),
      h("span", { class: "link-sub" }, h("span", { class: "link-url", text: S.hostLabel(tab.url) }))
    ),
    h("button", { class: "icon-btn sm", type: "button", dataset: { action: "save-tab" }, title: "Save to a board", "aria-label": "Save to a board" }, icon("bookmarkPlus"))));
  });
}

function tabById(id) {
  return (ui.tabs || []).find((tab) => String(tab.id) === String(id));
}

function openSaveTabMenu(tab, anchor) {
  const page = activePage();
  const items = [{ type: "label", label: `Save to ${page.name}` }];
  page.boards.slice(0, 12).forEach((board) => {
    items.push({ label: board.title, icon: "layout", run: () => saveTabTo(tab, board.id) });
  });
  if (!page.boards.length) items.push({ label: "New board “Inbox”", icon: "plus", run: () => saveTabTo(tab, firstBoardOf(page).id) });
  items.push("sep", { label: "Choose board…", icon: "folderInput", run: () => openLinkDialog({ prefill: { url: tab.url, title: tab.title } }) });
  openMenu(anchor, items, { label: "Save tab" });
}

function saveTabTo(tab, boardId) {
  const [link] = addLinks(boardId, [{ url: tab.url, title: tab.title }]);
  if (!link) {
    toast("This tab can't be saved.", { tone: "error" });
    return;
  }
  commit();
  renderTabsPanel();
  toast(`Saved “${link.title}”`);
}

async function saveAllTabs() {
  if (!chromeApi) return;
  if (!ui.tabs?.length) await refreshTabs();
  const tabs = (ui.tabs || []).filter((tab) => S.isValidUrl(tab.url));
  if (!tabs.length) {
    toast("No tabs to save in this window.", { tone: "info" });
    return;
  }
  const stamp = new Date().toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const board = createBoard({ title: `Tabs · ${stamp}`, links: tabs.map((tab) => ({ url: tab.url, title: tab.title })), rename: false, color: "sky" });
  renderTabsPanel();
  focusBoard(board.id, { flash: true });
  setUndo(`Saved ${pluralize(tabs.length, "tab")} as a new board`, () => {
    const found = S.findBoard(state, board.id);
    if (!found) return;
    found.page.boards.splice(found.index, 1);
    commit();
  });
}

// ============================================================== drag & drop

function dragKind(event) {
  if (drag) return drag.type;
  const types = event.dataTransfer?.types || [];
  if (types.includes("text/uri-list") || types.includes("text/plain")) return "external";
  return null;
}

function clearDropUi() {
  dropLine.remove();
  $$(".drop-target, .drop-before, .drop-after").forEach((element) => element.classList.remove("drop-target", "drop-before", "drop-after"));
  dropTarget = null;
}

function columnFromPoint(event) {
  const direct = event.target.closest?.(".board-column");
  if (direct) return direct;
  return $$(".board-column").find((column) => {
    const rect = column.getBoundingClientRect();
    return event.clientX >= rect.left && event.clientX <= rect.right;
  }) || null;
}

function externalLinkFromDrop(event) {
  const data = event.dataTransfer;
  const uriList = data.getData("text/uri-list").split(/\r?\n/).find((line) => line && !line.startsWith("#"));
  const plain = data.getData("text/plain").trim();
  const url = uriList || (S.isValidUrl(plain) && !/\s/.test(plain) ? plain : "");
  if (!url || !S.isValidUrl(url)) return null;
  let title = "";
  const html = data.getData("text/html");
  if (html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    title = doc.querySelector("a")?.textContent?.trim() || doc.querySelector("img")?.alt || "";
  }
  return { url, title: title && title !== url ? title : "" };
}

function initDragAndDrop() {
  const content = $("#content");

  content.addEventListener("dragstart", (event) => {
    const linkEl = event.target.closest?.(".link");
    if (linkEl && content.contains(linkEl)) {
      const found = S.findLink(state, linkEl.dataset.linkId);
      if (!found) return;
      const ids = ui.selectMode && ui.selected.has(found.link.id) ? [...ui.selected] : [found.link.id];
      drag = { type: "link", ids, fromBoardId: found.board.id };
      event.dataTransfer.effectAllowed = "copyMove";
      event.dataTransfer.setData("text/uri-list", found.link.url);
      event.dataTransfer.setData("text/plain", found.link.url);
      requestAnimationFrame(() => ids.forEach((id) => $(`.link[data-link-id="${CSS.escape(id)}"]`)?.classList.add("is-dragging")));
      closeMenu();
      return;
    }
    const header = event.target.closest?.(".board-header");
    if (header && ui.view.type === "page") {
      const boardEl = header.closest(".board");
      const found = S.findBoard(state, boardEl.dataset.boardId);
      if (!found) return;
      drag = { type: "board", boardId: found.board.id };
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", found.board.title);
      const rect = boardEl.getBoundingClientRect();
      event.dataTransfer.setDragImage(boardEl, event.clientX - rect.left, event.clientY - rect.top);
      requestAnimationFrame(() => boardEl.classList.add("is-dragging"));
      closeMenu();
    }
  });

  content.addEventListener("dragover", (event) => {
    const kind = dragKind(event);
    if (!kind || kind === "page" || ui.view.type !== "page") return;

    if (kind === "board") {
      const column = columnFromPoint(event);
      if (!column) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const boards = $$(":scope > .board", column).filter((board) => board.dataset.boardId !== drag.boardId);
      const before = boards.find((board) => {
        const rect = board.getBoundingClientRect();
        return event.clientY < rect.top + rect.height / 2;
      });
      if (dropLine.parentElement !== column || dropLine.nextElementSibling !== (before || null)) column.insertBefore(dropLine, before || null);
      dropTarget = { type: "board", col: Number(column.dataset.col), beforeId: before?.dataset.boardId || null };
      return;
    }

    const boardEl = event.target.closest?.(".board");
    if (!boardEl) {
      clearDropUi();
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = kind === "link" ? "move" : "copy";
    $$(".board.drop-target").forEach((element) => { if (element !== boardEl) element.classList.remove("drop-target"); });
    if (boardEl.classList.contains("collapsed")) {
      dropLine.remove();
      boardEl.classList.add("drop-target");
      dropTarget = { type: "link", boardId: boardEl.dataset.boardId, beforeId: null };
      return;
    }
    const list = boardEl.querySelector(".link-list");
    const moving = drag?.ids || [];
    const items = $$(":scope > .link", list).filter((element) => !moving.includes(element.dataset.linkId));
    const before = items.find((element) => {
      const rect = element.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    });
    if (!items.length) boardEl.classList.add("drop-target");
    else boardEl.classList.remove("drop-target");
    if (dropLine.parentElement !== list || dropLine.nextElementSibling !== (before || null)) list.insertBefore(dropLine, before || null);
    dropTarget = { type: "link", boardId: boardEl.dataset.boardId, beforeId: before?.dataset.linkId || null };
  });

  content.addEventListener("dragleave", (event) => {
    if (!event.relatedTarget || !content.contains(event.relatedTarget)) clearDropUi();
  });

  content.addEventListener("drop", (event) => {
    const target = dropTarget;
    clearDropUi();
    if (!target) return;
    event.preventDefault();
    if (target.type === "board" && drag?.type === "board") {
      moveBoardTo(drag.boardId, target.col, target.beforeId);
      commit();
    } else if (target.type === "link") {
      if (drag?.type === "link") {
        moveLinksTo(drag.ids, target.boardId, target.beforeId);
        if (drag.ids.length > 1) ui.selected.clear();
        commit();
      } else if (drag?.type === "tab") {
        const [link] = addLinks(target.boardId, [{ url: drag.tab.url, title: drag.tab.title }], target.beforeId);
        if (link) {
          commit();
          renderTabsPanel();
          toast(`Saved “${link.title}”`);
        }
      } else {
        const external = externalLinkFromDrop(event);
        if (!external) {
          toast("Drop a link or a URL to save it.", { tone: "info" });
        } else {
          const [link] = addLinks(target.boardId, [external], target.beforeId);
          if (link) {
            commit();
            toast(`Saved “${link.title}”`);
          }
        }
      }
    }
    drag = null;
  });

  document.addEventListener("dragend", () => {
    drag = null;
    clearDropUi();
    $$(".is-dragging").forEach((element) => element.classList.remove("is-dragging"));
  });

  // Sidebar: reorder pages, and drop links/boards/tabs onto a page, Starred or Trash.
  const sidebar = $("#sidebar");
  sidebar.addEventListener("dragstart", (event) => {
    const item = event.target.closest?.(".nav-item[data-page-id]");
    if (!item) return;
    drag = { type: "page", pageId: item.dataset.pageId };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.textContent);
    requestAnimationFrame(() => item.classList.add("is-dragging"));
  });

  sidebar.addEventListener("dragover", (event) => {
    const kind = dragKind(event);
    if (!kind) return;
    const pageItem = event.target.closest?.(".nav-item[data-page-id]");
    const libraryItemEl = event.target.closest?.(".nav-item[data-library]");
    $$(".nav-item.drop-target, .nav-item.drop-before, .nav-item.drop-after", sidebar).forEach((element) => {
      if (element !== pageItem && element !== libraryItemEl) element.classList.remove("drop-target", "drop-before", "drop-after");
    });
    if (pageItem) {
      if (kind === "page") {
        if (pageItem.dataset.pageId === drag.pageId) return;
        event.preventDefault();
        const rect = pageItem.getBoundingClientRect();
        const after = event.clientY > rect.top + rect.height / 2;
        pageItem.classList.toggle("drop-after", after);
        pageItem.classList.toggle("drop-before", !after);
        dropTarget = { type: "page-order", pageId: pageItem.dataset.pageId, after };
      } else {
        event.preventDefault();
        event.dataTransfer.dropEffect = kind === "link" || kind === "board" ? "move" : "copy";
        pageItem.classList.add("drop-target");
        dropTarget = { type: "page-drop", pageId: pageItem.dataset.pageId };
      }
      return;
    }
    if (libraryItemEl && (kind === "link" || (kind === "board" && libraryItemEl.dataset.library === "trash"))) {
      const library = libraryItemEl.dataset.library;
      if (library === "recent") return;
      event.preventDefault();
      libraryItemEl.classList.add("drop-target");
      dropTarget = { type: "library-drop", library };
    }
  });

  sidebar.addEventListener("dragleave", (event) => {
    if (!event.relatedTarget || !sidebar.contains(event.relatedTarget)) {
      $$(".nav-item", sidebar).forEach((element) => element.classList.remove("drop-target", "drop-before", "drop-after"));
    }
  });

  sidebar.addEventListener("drop", (event) => {
    const target = dropTarget;
    $$(".nav-item", sidebar).forEach((element) => element.classList.remove("drop-target", "drop-before", "drop-after"));
    dropTarget = null;
    if (!target) return;
    event.preventDefault();

    if (target.type === "page-order" && drag?.type === "page") {
      const from = state.pages.findIndex((page) => page.id === drag.pageId);
      const [page] = state.pages.splice(from, 1);
      let to = state.pages.findIndex((item) => item.id === target.pageId);
      if (target.after) to += 1;
      state.pages.splice(to, 0, page);
      commit();
    } else if (target.type === "page-drop") {
      const page = S.findPage(state, target.pageId);
      if (!page) return;
      if (drag?.type === "link") {
        const board = firstBoardOf(page);
        const moved = moveLinksTo(drag.ids, board.id);
        ui.selected.clear();
        commit();
        toast(`Moved ${moved === 1 ? "link" : pluralize(moved, "link")} to ${page.name} › ${board.title}`);
      } else if (drag?.type === "board") {
        if (page.id === state.activePageId) return;
        const board = moveBoardToPage(drag.boardId, page.id);
        commit();
        if (board) toast(`Moved “${board.title}” to ${page.name}`);
      } else {
        const item = drag?.type === "tab" ? { url: drag.tab.url, title: drag.tab.title } : externalLinkFromDrop(event);
        if (!item) return;
        const board = firstBoardOf(page);
        const [link] = addLinks(board.id, [item]);
        if (link) {
          commit();
          renderTabsPanel();
          toast(`Saved “${link.title}” to ${page.name}`);
        }
      }
    } else if (target.type === "library-drop") {
      if (target.library === "trash") {
        if (drag?.type === "link") trashLinks(drag.ids);
        else if (drag?.type === "board") trashBoard(drag.boardId);
      } else if (target.library === "starred" && drag?.type === "link") {
        drag.ids.forEach((id) => {
          const found = S.findLink(state, id);
          if (found) found.link.starred = true;
        });
        commit();
        toast(drag.ids.length === 1 ? "Starred" : `Starred ${drag.ids.length} links`);
      }
    }
    drag = null;
  });

  // Open tabs panel: tabs are drag sources.
  const tabsList = $("#tabsList");
  tabsList.addEventListener("dragstart", (event) => {
    const item = event.target.closest?.(".tab-item");
    const tab = item && tabById(item.dataset.tabId);
    if (!tab) return;
    drag = { type: "tab", tab: { url: tab.url, title: tab.title } };
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/uri-list", tab.url);
    event.dataTransfer.setData("text/plain", tab.url);
  });
}

// ============================================================ content events

function initContentEvents() {
  const content = $("#content");

  content.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (actionEl && content.contains(actionEl)) {
      event.preventDefault();
      event.stopPropagation();
      handleContentAction(actionEl.dataset.action, actionEl, event);
      return;
    }
    const linkEl = event.target.closest(".link");
    if (linkEl) {
      event.preventDefault();
      if (ui.selectMode) {
        toggleSelected(linkEl.dataset.linkId);
        return;
      }
      const mode = event.ctrlKey || event.metaKey ? "background" : event.shiftKey ? "new-window" : "default";
      openLinkById(linkEl.dataset.linkId, mode);
      return;
    }
    const title = event.target.closest(".board-title");
    if (title && ui.selectMode) return;
  });

  content.addEventListener("mousedown", (event) => {
    if (event.button === 1 && event.target.closest(".link")) event.preventDefault();
  });

  content.addEventListener("auxclick", (event) => {
    if (event.button !== 1) return;
    const linkEl = event.target.closest(".link");
    if (!linkEl || event.target.closest("[data-action]")) return;
    event.preventDefault();
    openLinkById(linkEl.dataset.linkId, "background");
  });

  content.addEventListener("contextmenu", (event) => {
    if (event.target.closest("input, textarea")) return;
    const linkEl = event.target.closest(".link");
    if (linkEl) {
      event.preventDefault();
      openLinkMenu(linkEl.dataset.linkId, { x: event.clientX, y: event.clientY });
      return;
    }
    const boardEl = event.target.closest(".board");
    if (boardEl && event.target.closest(".board-header")) {
      event.preventDefault();
      openBoardMenu(boardEl.dataset.boardId, { x: event.clientX, y: event.clientY });
    }
  });

  content.addEventListener("dblclick", (event) => {
    const title = event.target.closest(".board-title");
    if (!title) return;
    const boardId = title.closest(".board").dataset.boardId;
    ui.editingBoardId = boardId;
    ui.inlineAddBoardId = null;
    render();
    focusBoard(boardId, { rename: true });
  });

  content.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target.dataset?.role === "board-title-input") {
      if (event.key === "Enter") {
        event.preventDefault();
        commitBoardTitle(target);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        commitBoardTitle(target, { cancel: true });
      }
      return;
    }
    if (target.dataset?.role === "inline-add-input") {
      target.classList.remove("invalid");
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        ui.inlineAddBoardId = null;
        render();
      }
      return;
    }
    const linkEl = target.closest?.(".link");
    if (linkEl && target === linkEl) {
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        trashLinks([linkEl.dataset.linkId]);
      } else if (event.key === "e") {
        event.preventDefault();
        openLinkDialog({ linkId: linkEl.dataset.linkId });
      } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        openLinkMenu(linkEl.dataset.linkId, linkEl);
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const links = $$(".link", content);
        const index = links.indexOf(linkEl);
        links[index + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
      }
    }
  });

  content.addEventListener("focusout", (event) => {
    const target = event.target;
    if (target.dataset?.role === "board-title-input" && ui.editingBoardId) {
      commitBoardTitle(target);
    }
    if (target.dataset?.role === "inline-add-input") {
      setTimeout(() => {
        const form = target.closest(".inline-add");
        if (!form || !document.contains(form)) return;
        if (form.contains(document.activeElement)) return;
        if (!target.value.trim()) {
          ui.inlineAddBoardId = null;
          render();
        }
      }, 120);
    }
  });

  content.addEventListener("submit", (event) => {
    const form = event.target.closest(".inline-add");
    if (!form) return;
    event.preventDefault();
    submitInlineAdd(form);
  });

  content.addEventListener("paste", (event) => {
    const input = event.target;
    if (input.dataset?.role !== "inline-add-input") return;
    const text = event.clipboardData?.getData("text") || "";
    if (!/\n/.test(text.trim())) return;
    const items = S.parseLinkText(text).flatMap((group) => group.links);
    if (items.length < 2) return;
    event.preventDefault();
    const boardId = input.closest(".inline-add").dataset.boardId;
    const added = addLinks(boardId, items);
    commit();
    focusInlineAdd(boardId);
    toast(`Saved ${pluralize(added.length, "link")}`);
  });
}

function handleContentAction(action, element, event) {
  const boardId = element.closest(".board")?.dataset.boardId;
  const linkId = element.closest(".link")?.dataset.linkId;
  const trashId = element.closest(".trash-item")?.dataset.trashId;
  switch (action) {
    case "toggle-board":
      toggleBoard(boardId);
      break;
    case "open-board":
      openBoard(boardId, "background");
      break;
    case "inline-add":
      startInlineAdd(boardId);
      break;
    case "inline-more": {
      const value = element.closest(".inline-add")?.querySelector("input")?.value || "";
      ui.inlineAddBoardId = null;
      render();
      openLinkDialog({ boardId, prefill: { url: value } });
      break;
    }
    case "board-menu":
      openBoardMenu(boardId, element);
      break;
    case "star-link":
      toggleStar(linkId);
      break;
    case "edit-link":
      openLinkDialog({ linkId });
      break;
    case "link-menu":
      openLinkMenu(linkId, element);
      break;
    case "goto-board":
      gotoBoard(element.dataset.boardId);
      break;
    case "restore":
      restoreEntries([trashId]);
      break;
    case "purge":
      purgeEntry(trashId);
      break;
    case "empty-trash":
      emptyTrash();
      break;
    default:
      break;
  }
  void event;
}
