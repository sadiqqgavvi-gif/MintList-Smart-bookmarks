/* Command palette: smart search with scope filters, exact match, #tag
   filters and ">" commands. */

const palette = { scope: "all", exact: false, results: [], active: 0, counts: {} };

const PALETTE_SCOPES = [
  { id: "all", label: "All" },
  { id: "page", label: "This page" },
  { id: "links", label: "Links" },
  { id: "boards", label: "Boards" },
  { id: "pages", label: "Pages" },
  { id: "tags", label: "Tags" },
  { id: "tabs", label: "Open tabs" }
];

function paletteCommands() {
  const dark = resolvedScheme() === "dark";
  return [
    { id: "new-board", title: "New board", icon: "plus", keys: "N", run: () => { if (ui.view.type !== "page") setView({ type: "page" }); createBoard(); } },
    { id: "add-link", title: "Add link", icon: "link", keys: "A", run: () => openLinkDialog({}) },
    { id: "new-page", title: "New page", icon: "folder", keys: "P", run: () => openPageDialog() },
    { id: "import", title: "Import bookmarks", icon: "download", keys: "I", run: () => openImport() },
    chromeApi ? { id: "save-tabs", title: "Save all open tabs as a board", icon: "layers", run: () => saveAllTabs() } : null,
    { id: "tabs-panel", title: state.settings.tabsPanelOpen ? "Hide open tabs panel" : "Show open tabs panel", icon: "tabsPanel", keys: "]", run: () => setTabsPanel(!state.settings.tabsPanelOpen) },
    { id: "select", title: "Select links", icon: "checkSquare", keys: "S", run: () => { if (ui.view.type === "trash") setView({ type: "page" }); setSelectMode(true); } },
    { id: "starred", title: "Go to Starred", icon: "star", run: () => setView({ type: "starred" }) },
    { id: "recent", title: "Go to Recent", icon: "clock", run: () => setView({ type: "recent" }) },
    { id: "trash", title: "Go to Trash", icon: "trash", run: () => setView({ type: "trash" }) },
    { id: "toggle-theme", title: dark ? "Switch to light theme" : "Switch to dark theme", icon: dark ? "sun" : "moon", run: () => { state.settings.theme = dark ? "light" : "dark"; commit(); } },
    { id: "privacy", title: state.settings.privacy ? "Turn off privacy blur" : "Turn on privacy blur", icon: state.settings.privacy ? "eye" : "eyeOff", run: () => { state.settings.privacy = !state.settings.privacy; commit(); toast(state.settings.privacy ? "Privacy blur on" : "Privacy blur off"); } },
    { id: "wallpaper", title: "Change wallpaper", icon: "image", run: () => openSettings("wallpaper") },
    { id: "appearance", title: "Appearance & theme", icon: "palette", run: () => openSettings("appearance") },
    { id: "settings", title: "Open settings", icon: "settings", run: () => openSettings("general") },
    { id: "sync", title: "Sync & backup", icon: "cloud", run: () => openSettings("data") },
    { id: "export", title: "Export backup", icon: "upload", run: () => exportBackup() },
    { id: "duplicates", title: "Find duplicate links", icon: "duplicate", run: () => openDuplicates() },
    { id: "shortcuts", title: "Keyboard shortcuts", icon: "keyboard", keys: "?", run: () => openSettings("shortcuts") }
  ].filter(Boolean);
}

function openPalette(query = "") {
  closeMenu();
  const dialog = $("#paletteDialog");
  const input = $("#paletteInput");
  input.value = query;
  palette.scope = "all";
  if (!dialog.open) dialog.showModal();
  updatePalette();
  input.focus();
  input.select();
  if (chromeApi && !ui.tabs?.length) refreshTabs().then(() => { if (dialog.open) updatePalette(); });
}

function parsePaletteQuery(raw) {
  let text = String(raw || "").trim();
  let mode = "search";
  if (text.startsWith(">")) {
    mode = "command";
    text = text.slice(1).trim();
  }
  const tagFilters = [];
  text = text.replace(/(^|\s)#([^\s#]+)/g, (_match, _space, tag) => {
    tagFilters.push(tag.toLowerCase());
    return " ";
  }).replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  return { mode, text, lower, terms: lower.split(" ").filter(Boolean), tagFilters };
}

// Fuzzy match ("gml" → "Gmail"): the first letter must start a word and the
// letters must sit close together, so short queries don't match everything.
function isFuzzyMatch(haystack, needle) {
  if (!needle) return true;
  for (let start = haystack.indexOf(needle[0]); start >= 0; start = haystack.indexOf(needle[0], start + 1)) {
    if (start > 0 && !/[\s\-_./:]/.test(haystack[start - 1])) continue;
    let index = 1;
    let position = start + 1;
    while (index < needle.length && position < haystack.length && position - start < needle.length * 3) {
      if (haystack[position] === needle[index]) index += 1;
      position += 1;
    }
    if (index === needle.length) return true;
  }
  return false;
}

// Score one field. Returns -1 when the field does not satisfy the query.
function fieldScore(value, query) {
  const text = String(value || "").toLowerCase();
  if (!text) return -1;
  if (palette.exact) {
    const index = text.indexOf(query.lower);
    if (index < 0) return -1;
    return index === 0 ? 100 : /[\s\-_./:]/.test(text[index - 1]) ? 70 : 40;
  }
  let score = 0;
  for (const term of query.terms) {
    const index = text.indexOf(term);
    if (index < 0) return -1;
    score += index === 0 ? 30 : /[\s\-_./:#]/.test(text[index - 1]) ? 20 : 8;
  }
  return score;
}

function matchEntity(fields, query) {
  if (!query.terms.length) return 1;
  let best = -1;
  fields.forEach(([value, weight]) => {
    const score = fieldScore(value, query);
    if (score >= 0) best = Math.max(best, score * weight);
  });
  if (best >= 0) return best;
  if (palette.exact) return -1;
  // All terms must appear somewhere in the combined text.
  const combined = fields.map(([value]) => String(value || "").toLowerCase()).join(" ");
  if (query.terms.every((term) => combined.includes(term))) return 6;
  // Last resort: fuzzy subsequence on the primary field ("gml" → Gmail).
  const primary = String(fields[0][0] || "").toLowerCase();
  if (query.lower.length >= 2 && isFuzzyMatch(primary, query.lower.replace(/\s/g, ""))) return 3;
  return -1;
}

function searchLinks(query, scopePage = null) {
  const entries = S.allLinks(state).filter(({ page }) => !scopePage || page.id === scopePage.id);
  const results = [];
  entries.forEach(({ page, board, link }) => {
    if (query.tagFilters.length && !query.tagFilters.every((tag) => link.tags.some((own) => own.startsWith(tag)))) return;
    const score = matchEntity([
      [link.title, 3],
      [S.hostLabel(link.url), 2],
      [link.tags.join(" "), 2],
      [link.url, 1],
      [link.note, 1],
      [board.title, 0.6]
    ], query);
    if (score < 0) return;
    const boost = (link.starred ? 4 : 0) + Math.min(10, Math.log2((link.visits || 0) + 1) * 2) + (link.lastVisited ? 2 : 0);
    results.push({
      kind: "link",
      id: link.id,
      score: score + boost,
      sortTime: Math.max(link.lastVisited || 0, link.createdAt || 0),
      title: link.title,
      url: link.url,
      sub: `${page.name} › ${board.title}`,
      lead: () => faviconEl(link.url, link.title),
      run: (mode) => openLinkById(link.id, mode)
    });
  });
  if (!query.terms.length) return results.sort((a, b) => b.sortTime - a.sortTime);
  return results.sort((a, b) => b.score - a.score || b.sortTime - a.sortTime);
}

function searchBoards(query) {
  if (query.tagFilters.length) return [];
  const results = [];
  state.pages.forEach((page) => {
    page.boards.forEach((board) => {
      const score = matchEntity([[board.title, 3], [page.name, 1]], query);
      if (score < 0) return;
      results.push({
        kind: "board",
        id: board.id,
        score,
        title: board.title,
        sub: `${page.icon ? `${page.icon} ` : ""}${page.name} · ${pluralize(board.links.length, "link")}`,
        lead: () => h("span", { class: "result-icon", style: board.color ? { color: boardColorValue(board) } : null }, icon("layout")),
        run: () => gotoBoard(board.id)
      });
    });
  });
  return results.sort((a, b) => b.score - a.score);
}

function searchPages(query) {
  if (query.tagFilters.length) return [];
  return state.pages
    .map((page) => ({ page, score: matchEntity([[page.name, 3]], query) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score)
    .map(({ page, score }) => ({
      kind: "page",
      id: page.id,
      score,
      title: page.name,
      sub: `${pluralize(page.boards.length, "board")} · ${pluralize(linkCount(page), "link")}`,
      lead: () => h("span", { class: "result-icon" }, page.icon || icon("folder")),
      run: () => setView({ type: "page", id: page.id })
    }));
}

function searchTags(query) {
  const tags = S.allTags(state);
  const filters = query.tagFilters;
  return tags
    .map(({ tag, count }) => {
      let score = matchEntity([[tag, 3]], query);
      if (filters.length) score = filters.some((filter) => tag.startsWith(filter)) ? 50 : -1;
      return { tag, count, score };
    })
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score || b.count - a.count)
    .map(({ tag, count, score }) => ({
      kind: "tag",
      id: tag,
      score,
      title: `#${tag}`,
      sub: pluralize(count, "link"),
      lead: () => h("span", { class: "result-icon" }, icon("hash")),
      run: () => setView({ type: "tag", tag })
    }));
}

function searchTabs(query) {
  if (!ui.tabs || query.tagFilters.length) return [];
  return ui.tabs
    .map((tab) => ({ tab, score: matchEntity([[tab.title, 3], [S.hostLabel(tab.url), 2], [tab.url, 1]], query) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score)
    .map(({ tab, score }) => ({
      kind: "tab",
      id: String(tab.id),
      score,
      title: tab.title || tab.url,
      url: tab.url,
      sub: "Open tab",
      lead: () => faviconEl(tab.url, tab.title, /^https?:|^data:image/.test(tab.favIconUrl || "") ? tab.favIconUrl : null),
      run: async () => {
        try {
          await chromeApi.tabs.update(tab.id, { active: true });
          await chromeApi.windows.update(tab.windowId, { focused: true });
        } catch {
          toast("That tab is no longer open.", { tone: "error" });
        }
      }
    }));
}

function searchCommands(query) {
  return paletteCommands()
    .map((command) => ({ command, score: matchEntity([[command.title, 3], [command.id, 1]], query) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score)
    .map(({ command, score }) => ({
      kind: "command",
      id: command.id,
      score,
      title: command.title,
      sub: command.keys ? `Shortcut: ${command.keys}` : "Command",
      lead: () => h("span", { class: "result-icon" }, icon(command.icon)),
      run: command.run
    }));
}

function collectScope(scope, query) {
  switch (scope) {
    case "page": return [{ label: `On ${activePage().name}`, items: searchLinks(query, activePage()) }];
    case "links": return [{ label: "Links", items: searchLinks(query) }];
    case "boards": return [{ label: "Boards", items: searchBoards(query) }];
    case "pages": return [{ label: "Pages", items: searchPages(query) }];
    case "tags": return [{ label: "Tags", items: searchTags(query) }];
    case "tabs": return [{ label: "Open tabs", items: searchTabs(query) }];
    default: {
      if (!query.terms.length && !query.tagFilters.length) {
        const recent = searchLinks(query).filter((item) => S.findLink(state, item.id)?.link.lastVisited).slice(0, 6);
        return [
          { label: "Recently opened", items: recent },
          { label: "Quick actions", items: searchCommands(query).slice(0, 8) }
        ];
      }
      return [
        { label: "Links", items: searchLinks(query).slice(0, 40) },
        { label: "Boards", items: searchBoards(query).slice(0, 6) },
        { label: "Pages", items: searchPages(query).slice(0, 5) },
        { label: "Tags", items: searchTags(query).slice(0, 6) },
        { label: "Open tabs", items: searchTabs(query).slice(0, 6) },
        { label: "Commands", items: query.terms.length ? searchCommands(query).slice(0, 3) : [] }
      ];
    }
  }
}

function updatePalette() {
  const raw = $("#paletteInput").value;
  const query = parsePaletteQuery(raw);

  let groups;
  if (query.mode === "command") {
    groups = [{ label: "Commands", items: searchCommands(query) }];
  } else {
    groups = collectScope(palette.scope, query);
  }
  groups = groups.filter((group) => group.items.length);

  // Per-scope match counts for the chips.
  palette.counts = {};
  if (query.mode === "search" && (query.terms.length || query.tagFilters.length)) {
    palette.counts = {
      page: searchLinks(query, activePage()).length,
      links: searchLinks(query).length,
      boards: searchBoards(query).length,
      pages: searchPages(query).length,
      tags: searchTags(query).length,
      tabs: searchTabs(query).length
    };
  }

  palette.results = groups.flatMap((group) => group.items);
  palette.active = palette.results.length ? Math.min(palette.active, palette.results.length - 1) : -1;
  if (palette.active < 0 && palette.results.length) palette.active = 0;
  renderPaletteScopes(query);
  renderPaletteResults(groups, query);
}

function renderPaletteScopes(query) {
  const container = $("#paletteScopes");
  container.hidden = query.mode === "command";
  container.replaceChildren(...PALETTE_SCOPES.filter((scope) => scope.id !== "tabs" || chromeApi).map((scope) => {
    const count = palette.counts[scope.id];
    return h("button", {
      class: `scope-chip${palette.scope === scope.id ? " active" : ""}`,
      type: "button",
      role: "tab",
      "aria-selected": String(palette.scope === scope.id),
      onclick: () => {
        palette.scope = scope.id;
        palette.active = 0;
        updatePalette();
        $("#paletteInput").focus();
      }
    }, scope.label, count !== undefined && scope.id !== "all" ? h("small", { text: String(count) }) : null);
  }));
}

function renderPaletteResults(groups, query) {
  const container = $("#paletteResults");
  container.replaceChildren();
  if (!palette.results.length) {
    const hint = query.mode === "command"
      ? "Try “theme”, “import” or “board”."
      : palette.exact ? "Exact match is on — try turning it off for a looser search." : "Try fewer words, another scope, or #tag.";
    container.append(h("div", { class: "palette-empty" },
      icon("search"),
      h("strong", { text: query.text || query.tagFilters.length ? "No results" : "Nothing here yet" }),
      h("span", { text: hint })
    ));
    return;
  }
  const highlightTerms = palette.exact ? [query.lower] : query.terms;
  let index = 0;
  groups.forEach((group) => {
    container.append(h("div", { class: "palette-group", text: group.label }));
    group.items.forEach((item) => {
      const position = index;
      const title = h("span", { class: "result-title" });
      title.append(highlightText(item.title, highlightTerms));
      const sub = h("span", { class: "result-sub" });
      if (item.url) {
        const url = h("span", { class: "result-url" });
        url.append(highlightText(S.hostLabel(item.url), highlightTerms));
        sub.append(url, h("span", { text: "·" }));
      }
      sub.append(h("span", { text: item.sub }));
      const kindLabel = { link: "Open", board: "Go to board", page: "Go to page", tag: "Show tag", tab: "Switch to tab", command: "Run" }[item.kind];
      container.append(h("button", {
        class: `palette-result${position === palette.active ? " active" : ""}`,
        type: "button",
        role: "option",
        "aria-selected": String(position === palette.active),
        dataset: { index: position },
        onmousemove: () => {
          if (palette.active === position) return;
          palette.active = position;
          $$(".palette-result", container).forEach((element) => {
            const isActive = Number(element.dataset.index) === position;
            element.classList.toggle("active", isActive);
            element.setAttribute("aria-selected", String(isActive));
          });
        },
        onclick: (event) => runPaletteResult(position, event.ctrlKey || event.metaKey ? "background" : event.shiftKey ? "new-window" : "default")
      }, item.lead(), h("span", { class: "result-text" }, title, sub), h("span", { class: "result-kind", text: `${kindLabel} ↵` })));
      index += 1;
    });
  });
  container.querySelector(".palette-result.active")?.scrollIntoView({ block: "nearest" });
}

function runPaletteResult(index, mode = "default") {
  const item = palette.results[index];
  if (!item) return;
  $("#paletteDialog").close();
  item.run(mode);
}

function movePaletteSelection(delta) {
  if (!palette.results.length) return;
  palette.active = (palette.active + delta + palette.results.length) % palette.results.length;
  const container = $("#paletteResults");
  $$(".palette-result", container).forEach((element) => {
    const isActive = Number(element.dataset.index) === palette.active;
    element.classList.toggle("active", isActive);
    element.setAttribute("aria-selected", String(isActive));
    if (isActive) element.scrollIntoView({ block: "nearest" });
  });
}

function initPalette() {
  const input = $("#paletteInput");
  const exact = $("#exactToggle");
  input.addEventListener("input", () => {
    palette.active = 0;
    updatePalette();
  });
  exact.addEventListener("click", () => {
    palette.exact = !palette.exact;
    exact.setAttribute("aria-pressed", String(palette.exact));
    palette.active = 0;
    updatePalette();
    input.focus();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      movePaletteSelection(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      movePaletteSelection(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      runPaletteResult(palette.active, event.ctrlKey || event.metaKey ? "background" : event.shiftKey ? "new-window" : "default");
    } else if (event.key === "Tab") {
      event.preventDefault();
      const scopes = PALETTE_SCOPES.filter((scope) => scope.id !== "tabs" || chromeApi);
      const index = scopes.findIndex((scope) => scope.id === palette.scope);
      palette.scope = scopes[(index + (event.shiftKey ? -1 : 1) + scopes.length) % scopes.length].id;
      palette.active = 0;
      updatePalette();
    } else if (event.altKey && event.key.toLowerCase() === "e") {
      event.preventDefault();
      exact.click();
    }
  });
}
