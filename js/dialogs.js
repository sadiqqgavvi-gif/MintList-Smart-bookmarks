/* Dialogs: add/edit link, page, move, share, prompt, settings, sync,
   duplicates, welcome — plus exports and bulk actions. */

// ============================================================ link dialog

let linkDialogState = null;

function fillBoardSelect(select, selectedId, { allowNew = true } = {}) {
  select.replaceChildren();
  state.pages.forEach((page) => {
    const group = h("optgroup", { label: `${page.icon ? `${page.icon} ` : ""}${page.name}` });
    page.boards.forEach((board) => group.append(h("option", { value: board.id, text: board.title })));
    if (!page.boards.length && allowNew) group.append(h("option", { value: `new:${page.id}`, text: "＋ New “Inbox” board" }));
    select.append(group);
  });
  if (selectedId && [...select.options].some((option) => option.value === selectedId)) select.value = selectedId;
}

function resolveBoardChoice(value) {
  if (value.startsWith("new:")) {
    const page = S.findPage(state, value.slice(4)) || activePage();
    return firstBoardOf(page).id;
  }
  return value;
}

function defaultTargetBoardId() {
  const page = activePage();
  if (ui.view.type === "page" && page.boards.length) {
    const last = state.settings.lastSaveTarget?.boardId;
    if (last && page.boards.some((board) => board.id === last)) return last;
    return page.boards[0].id;
  }
  const last = state.settings.lastSaveTarget?.boardId;
  if (last && S.findBoard(state, last)) return last;
  return page.boards[0]?.id || `new:${page.id}`;
}

function openLinkDialog({ linkId = null, boardId = null, prefill = {} } = {}) {
  closeMenu();
  const found = linkId ? S.findLink(state, linkId) : null;
  if (linkId && !found) return;
  linkDialogState = { linkId };
  const link = found?.link;
  $("#linkDialogTitle").textContent = link ? "Edit link" : "Add link";
  $("#linkDialogSub").textContent = link ? `In ${found.page.name} › ${found.board.title}` : "Save a page to one of your boards.";
  $("#saveLinkButton").textContent = link ? "Save changes" : "Save link";
  $("#linkUrlInput").value = link?.url || prefill.url || "";
  $("#linkTitleInput").value = link?.title || prefill.title || "";
  $("#linkTagsInput").value = (link?.tags || prefill.tags || []).join(", ");
  $("#linkNoteInput").value = link?.note || prefill.note || "";
  $("#linkStarInput").checked = Boolean(link?.starred);
  fillBoardSelect($("#linkBoardSelect"), found?.board.id || boardId || defaultTargetBoardId());
  setUrlMessage("");
  $("#linkUrlInput").classList.remove("invalid");
  updateLinkTitlePlaceholder();
  $("#linkDialog").showModal();
  (link || prefill.url ? $("#linkTitleInput") : $("#linkUrlInput")).focus();
}

function setUrlMessage(text, tone = "error") {
  const element = $("#linkUrlError");
  element.textContent = text;
  element.classList.toggle("info", tone === "info");
}

function updateLinkTitlePlaceholder() {
  const raw = $("#linkUrlInput").value.trim();
  const titleInput = $("#linkTitleInput");
  if (raw && S.isValidUrl(raw)) {
    titleInput.placeholder = titleForUrl(S.normalizeUrl(raw));
    const duplicates = S.findByUrl(state, raw).filter(({ link }) => link.id !== linkDialogState?.linkId);
    if (duplicates.length) {
      const where = duplicates.slice(0, 2).map(({ page, board }) => `${page.name} › ${board.title}`).join(", ");
      setUrlMessage(`Already saved in ${where}${duplicates.length > 2 ? ` and ${duplicates.length - 2} more` : ""}.`, "info");
    } else {
      setUrlMessage("");
    }
  } else {
    titleInput.placeholder = "Leave empty to use the site name";
  }
}

function saveLinkDialog() {
  const urlInput = $("#linkUrlInput");
  const raw = urlInput.value.trim();
  if (!raw || !S.isValidUrl(raw)) {
    urlInput.classList.add("invalid");
    setUrlMessage(raw ? "Enter a valid web address, like example.com" : "A URL is required.");
    urlInput.focus();
    return;
  }
  const url = S.normalizeUrl(raw);
  const boardId = resolveBoardChoice($("#linkBoardSelect").value);
  const data = {
    url,
    title: S.clampText($("#linkTitleInput").value, 200) || titleForUrl(url),
    tags: S.normalizeTags($("#linkTagsInput").value),
    note: S.clampText($("#linkNoteInput").value, 600),
    starred: $("#linkStarInput").checked
  };
  let saved;
  if (linkDialogState?.linkId) {
    const found = S.findLink(state, linkDialogState.linkId);
    if (!found) return;
    Object.assign(found.link, data, { updatedAt: Date.now() });
    if (found.board.id !== boardId) moveLinksTo([found.link.id], boardId);
    saved = found.link;
  } else {
    [saved] = addLinks(boardId, [data]);
  }
  state.settings.lastSaveTarget = { boardId };
  $("#linkDialog").close();
  commit();
  const target = S.findBoard(state, boardId);
  const elsewhere = target && (ui.view.type !== "page" || target.page.id !== state.activePageId);
  toast(linkDialogState?.linkId ? "Link updated" : `Saved “${saved?.title}”`, elsewhere ? { action: { label: "View", run: () => gotoBoard(boardId) } } : {});
}

function initLinkDialog() {
  $("#linkForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveLinkDialog();
  });
  $("#linkUrlInput").addEventListener("input", () => {
    $("#linkUrlInput").classList.remove("invalid");
    updateLinkTitlePlaceholder();
  });
  $("#linkUrlInput").addEventListener("paste", () => setTimeout(updateLinkTitlePlaceholder, 0));
}

// ============================================================ page dialog

let pageDialogState = null;

function openPageDialog(pageId = null) {
  closeMenu();
  const page = pageId ? S.findPage(state, pageId) : null;
  pageDialogState = { pageId, icon: page ? page.icon : S.PAGE_ICONS[state.pages.length % S.PAGE_ICONS.length] };
  $("#pageDialogTitle").textContent = page ? "Edit page" : "New page";
  $("#savePageButton").textContent = page ? "Save" : "Create page";
  $("#pageNameInput").value = page?.name || "";
  renderEmojiGrid();
  $("#pageDialog").showModal();
  $("#pageNameInput").focus();
}

function renderEmojiGrid() {
  const grid = $("#pageIconGrid");
  grid.replaceChildren(
    h("button", { class: `emoji-option none${pageDialogState.icon ? "" : " active"}`, type: "button", role: "radio", "aria-checked": String(!pageDialogState.icon), title: "No icon", onclick: () => { pageDialogState.icon = ""; renderEmojiGrid(); } }, "None"),
    ...S.PAGE_ICONS.map((emoji) => h("button", {
      class: `emoji-option${pageDialogState.icon === emoji ? " active" : ""}`,
      type: "button",
      role: "radio",
      "aria-checked": String(pageDialogState.icon === emoji),
      onclick: () => { pageDialogState.icon = emoji; renderEmojiGrid(); }
    }, emoji))
  );
}

function initPageDialog() {
  $("#pageForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = S.clampText($("#pageNameInput").value, 60);
    if (!name) {
      $("#pageNameInput").classList.add("invalid");
      $("#pageNameInput").focus();
      return;
    }
    $("#pageNameInput").classList.remove("invalid");
    if (pageDialogState.pageId) {
      const page = S.findPage(state, pageDialogState.pageId);
      if (page) {
        page.name = name;
        page.icon = pageDialogState.icon;
      }
      $("#pageDialog").close();
      commit();
    } else {
      const page = S.makePage({ name, icon: pageDialogState.icon, boards: [] });
      state.pages.push(page);
      $("#pageDialog").close();
      setView({ type: "page", id: page.id });
      persist();
      toast(`Created “${name}”`);
    }
  });
}

// ============================================================ move dialog

let moveState = null;

function openMoveDialog({ kind, ids }) {
  closeMenu();
  const items = kind === "board" ? ids.map((id) => S.findBoard(state, id)).filter(Boolean) : ids.map((id) => S.findLink(state, id)).filter(Boolean);
  if (!items.length) return;
  moveState = { kind, ids };
  const isBoard = kind === "board";
  $("#moveDialogTitle").textContent = isBoard ? "Move board to…" : items.length === 1 ? "Move link to…" : `Move ${items.length} links to…`;
  $("#moveDialogSub").textContent = isBoard ? items[0].board.title : items.length === 1 ? items[0].link.title : "Choose a destination board.";
  $("#moveBoardField").hidden = isBoard;
  $("#moveCopyInput").checked = false;
  $("#moveConfirmButton").textContent = "Move";
  const pageSelect = $("#movePageSelect");
  pageSelect.replaceChildren(...state.pages.map((page) => h("option", { value: page.id, text: `${page.icon ? `${page.icon} ` : ""}${page.name}` })));
  const currentPageId = items[0].page.id;
  const other = state.pages.find((page) => page.id !== currentPageId);
  pageSelect.value = isBoard && other ? other.id : currentPageId;
  fillMoveBoards();
  $("#moveDialog").showModal();
  pageSelect.focus();
}

function fillMoveBoards() {
  const page = S.findPage(state, $("#movePageSelect").value);
  const select = $("#moveBoardSelect");
  select.replaceChildren(...(page?.boards || []).map((board) => h("option", { value: board.id, text: board.title })), h("option", { value: "new", text: "＋ New board" }));
}

function initMoveDialog() {
  $("#movePageSelect").addEventListener("change", fillMoveBoards);
  $("#moveCopyInput").addEventListener("change", () => {
    $("#moveConfirmButton").textContent = $("#moveCopyInput").checked ? "Copy" : "Move";
  });
  $("#moveForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const copy = $("#moveCopyInput").checked;
    const page = S.findPage(state, $("#movePageSelect").value);
    if (!page || !moveState) return;
    $("#moveDialog").close();
    if (moveState.kind === "board") {
      const board = moveBoardToPage(moveState.ids[0], page.id, { copy });
      commit();
      if (board) toast(`${copy ? "Copied" : "Moved"} “${board.title}” to ${page.name}`, { action: { label: "View", run: () => gotoBoard(board.id) } });
      return;
    }
    let boardId = $("#moveBoardSelect").value;
    if (boardId === "new") {
      const board = S.makeBoard({ title: "Moved links", col: 0 });
      page.boards.push(board);
      boardId = board.id;
    }
    const count = moveLinksTo(moveState.ids, boardId, null, { copy });
    ui.selected.clear();
    commit();
    const board = S.findBoard(state, boardId)?.board;
    toast(`${copy ? "Copied" : "Moved"} ${count === 1 ? "link" : pluralize(count, "link")} to ${page.name} › ${board?.title}`, { action: { label: "View", run: () => gotoBoard(boardId) } });
  });
}

// ============================================================ share dialog

let shareState = null;

function shareTarget() {
  if (!shareState) return null;
  if (shareState.kind === "page") {
    const page = S.findPage(state, shareState.id);
    return page ? { kind: "page", item: page, name: page.name, pages: [page], links: page.boards.flatMap((board) => board.links) } : null;
  }
  const found = S.findBoard(state, shareState.id);
  return found ? { kind: "board", item: found.board, name: found.board.title, pages: [{ name: found.board.title, icon: "", boards: [found.board] }], links: found.board.links } : null;
}

function openShareDialog({ kind, id }) {
  closeMenu();
  shareState = { kind, id };
  const target = shareTarget();
  if (!target) return;
  $("#shareDialogTitle").textContent = `Share “${target.name}”`;
  $("#shareDialogSub").textContent = `${kind === "page" ? `${pluralize(target.item.boards.length, "board")} · ` : ""}${pluralize(target.links.length, "link")}`;
  $("#shareCodeOutput").value = S.encodeShare(kind, target.item);
  $("#shareDialog").showModal();
}

function plainLinkList(target) {
  return target.pages.flatMap((page) => page.boards.flatMap((board) => [
    target.kind === "page" ? `\n${board.title}` : null,
    ...board.links.map((link) => `${link.title}\n${link.url}\n`)
  ])).filter((line) => line !== null).join("\n").trim() + "\n";
}

function markdownFor(target) {
  if (target.kind === "board") {
    return `## ${target.name}\n\n${target.links.map((link) => `- [${link.title.replace(/[[\]]/g, "")}](${link.url})`).join("\n")}\n`;
  }
  return S.toMarkdown(target.pages);
}

function standaloneHtml(target) {
  const esc = S.escapeHtml;
  const boards = target.pages.flatMap((page) => page.boards);
  const sections = boards.map((board) => `
    <section>
      <h2>${esc(board.title)}</h2>
      <ul>${board.links.map((link) => `
        <li><a href="${esc(link.url)}" target="_blank" rel="noopener"><strong>${esc(link.title)}</strong><span>${esc(S.hostLabel(link.url))}</span></a>${link.note ? `<p>${esc(link.note)}</p>` : ""}</li>`).join("")}
      </ul>
    </section>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(target.name)}</title>
<style>
  :root { color-scheme: light dark; --bg: #f5f7f6; --card: #fff; --text: #111715; --muted: #6b7672; --line: #e3e8e6; --accent: #10b981; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0d1110; --card: #161b1a; --text: #eef2f0; --muted: #8b9692; --line: #252c2a; } }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 48px 20px; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 1100px; margin: 0 auto; }
  header { margin-bottom: 28px; }
  h1 { margin: 0 0 4px; font-size: 30px; letter-spacing: -0.02em; }
  header p { margin: 0; color: var(--muted); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; align-items: start; }
  section { padding: 16px; background: var(--card); border: 1px solid var(--line); border-radius: 16px; }
  h2 { margin: 0 0 10px; font-size: 15px; }
  ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 2px; }
  a { display: grid; padding: 8px 10px; border-radius: 10px; color: inherit; text-decoration: none; }
  a:hover { background: color-mix(in srgb, var(--accent), transparent 88%); }
  a span { color: var(--muted); font-size: 12.5px; }
  li p { margin: 0 10px 8px; color: var(--muted); font-size: 13px; }
  footer { margin-top: 32px; color: var(--muted); font-size: 12.5px; }
</style>
</head>
<body>
<main>
  <header><h1>${esc(target.name)}</h1><p>${target.links.length} links · shared from MintList</p></header>
  <div class="grid">${sections}
  </div>
  <footer>Exported ${esc(new Date().toLocaleDateString())}</footer>
</main>
</body>
</html>
`;
}

function initShareDialog() {
  $("#shareDialog").addEventListener("click", async (event) => {
    const option = event.target.closest("[data-share]");
    if (!option) return;
    const target = shareTarget();
    if (!target) return;
    const slug = slugify(target.name);
    switch (option.dataset.share) {
      case "code":
        await copyText($("#shareCodeOutput").value);
        toast("Share code copied — paste it in Import → Paste");
        break;
      case "markdown":
        await copyText(markdownFor(target));
        toast("Markdown copied");
        break;
      case "text":
        await copyText(plainLinkList(target));
        toast("Link list copied");
        break;
      case "html":
        downloadFile(`${slug}.html`, standaloneHtml(target), "text/html");
        toast("Web page downloaded");
        break;
      case "bookmarks":
        downloadFile(`${slug}-bookmarks.html`, S.toBookmarksHtml(target.pages), "text/html");
        toast("Bookmarks file downloaded");
        break;
      case "email": {
        let body = plainLinkList(target);
        if (body.length > 1800) body = `${body.slice(0, 1800)}\n…`;
        const href = `mailto:?subject=${encodeURIComponent(target.name)}&body=${encodeURIComponent(body)}`;
        h("a", { href }).click();
        break;
      }
      default:
        break;
    }
  });
  $("#shareCodeOutput").addEventListener("focus", (event) => event.target.select());
}

// ============================================================ prompt dialog

let promptResolver = null;

function askPrompt({ title, message = "", placeholder = "", value = "", confirmLabel = "Save" }) {
  const dialog = $("#promptDialog");
  $("#promptTitle").textContent = title;
  $("#promptMessage").textContent = message;
  const input = $("#promptInput");
  input.value = value;
  input.placeholder = placeholder;
  $("#promptOkButton").textContent = confirmLabel;
  dialog.returnValue = "";
  dialog.showModal();
  input.focus();
  input.select();
  return new Promise((resolve) => { promptResolver = resolve; });
}

function initPromptDialog() {
  const dialog = $("#promptDialog");
  $("#promptForm").addEventListener("submit", (event) => {
    event.preventDefault();
    dialog.close("ok");
  });
  dialog.addEventListener("close", () => {
    const resolve = promptResolver;
    promptResolver = null;
    resolve?.(dialog.returnValue === "ok" ? $("#promptInput").value : null);
  });
}

// ============================================================ bulk actions

async function handleBulk(type) {
  const ids = [...ui.selected].filter((id) => S.findLink(state, id));
  switch (type) {
    case "all": {
      const visible = $$("#content .link").map((element) => element.dataset.linkId);
      const allSelected = visible.length && visible.every((id) => ui.selected.has(id));
      visible.forEach((id) => (allSelected ? ui.selected.delete(id) : ui.selected.add(id)));
      render();
      break;
    }
    case "open":
      await openLinkSet(ids.map((id) => S.findLink(state, id).link), "background", "your selection");
      break;
    case "star": {
      const links = ids.map((id) => S.findLink(state, id).link);
      const value = !links.every((link) => link.starred);
      links.forEach((link) => { link.starred = value; });
      commit();
      toast(value ? `Starred ${pluralize(links.length, "link")}` : `Removed star from ${pluralize(links.length, "link")}`);
      break;
    }
    case "tag": {
      const answer = await askPrompt({ title: `Tag ${pluralize(ids.length, "link")}`, message: "Separate tags with commas. Existing tags are kept.", placeholder: "work, reading", confirmLabel: "Add tags" });
      const tags = S.normalizeTags(answer || "");
      if (!tags.length) return;
      ids.forEach((id) => {
        const { link } = S.findLink(state, id);
        link.tags = S.normalizeTags([...link.tags, ...tags]);
      });
      commit();
      toast(`Tagged ${pluralize(ids.length, "link")}`);
      break;
    }
    case "move":
      openMoveDialog({ kind: "links", ids });
      break;
    case "delete":
      trashLinks(ids);
      break;
    case "done":
      setSelectMode(false);
      break;
    default:
      break;
  }
}

// ============================================================ exports

function exportBackup() {
  const payload = {
    app: "MintList",
    exportedAt: new Date().toISOString(),
    ...structuredClone(state),
    wallpapers: structuredClone(wallpapers)
  };
  delete payload.savedBy;
  downloadFile(`mintlist-backup-${fileStamp()}.json`, JSON.stringify(payload, null, 2), "application/json");
  toast("Backup downloaded");
}

function exportHtml() {
  downloadFile(`mintlist-bookmarks-${fileStamp()}.html`, S.toBookmarksHtml(state.pages), "text/html");
  toast("Bookmarks file downloaded");
}

function exportMarkdown() {
  downloadFile(`mintlist-${fileStamp()}.md`, S.toMarkdown(state.pages), "text/markdown");
  toast("Markdown downloaded");
}

// ============================================================ settings

const SHORTCUTS = [
  ["Everywhere in Chrome", null],
  ["Quick-save the current tab", ["Ctrl", "Shift", "Y"]],
  ["Open the MintList popup", ["Alt", "Shift", "M"]],
  ["Search & navigate", null],
  ["Search everything", ["Ctrl", "K"]],
  ["Filter the current page", ["/"]],
  ["Switch to page 1–9", ["1", "…", "9"]],
  ["Toggle sidebar", ["["]],
  ["Toggle open-tabs panel", ["]"]],
  ["Create", null],
  ["New board", ["N"]],
  ["Add link", ["A"]],
  ["New page", ["P"]],
  ["Import bookmarks", ["I"]],
  ["Links", null],
  ["Open in background tab", ["Ctrl", "Click"]],
  ["Open in new window", ["Shift", "Click"]],
  ["Edit focused link", ["E"]],
  ["Delete focused link", ["Del"]],
  ["Select mode", ["S"]],
  ["Undo last delete", ["Ctrl", "Z"]],
  ["Show this list", ["?"]]
];

function renderShortcutTable() {
  const table = $("#shortcutTable");
  table.replaceChildren(...SHORTCUTS.map(([label, keys]) => {
    if (!keys) return h("div", { class: "shortcut-group", text: label });
    return h("div", { class: "shortcut-row" },
      h("span", { text: label }),
      h("span", {}, keys.map((key) => h("kbd", { class: "kbd-mod", text: key })))
    );
  }));
  applyModifierLabels(table);
}

function openSettings(tab = "general") {
  closeMenu();
  syncSettingsForm();
  switchSettingsTab(tab);
  const dialog = $("#settingsDialog");
  if (!dialog.open) dialog.showModal();
  updateStorageUsage();
  updateDuplicateHint();
  renderSyncStatus();
}

function switchSettingsTab(tab) {
  $$(".settings-tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  $$(".settings-panel").forEach((panel) => { panel.hidden = panel.dataset.panel !== tab; });
  $(".settings-main").scrollTop = 0;
}

function setRadio(name, value) {
  $$(`input[name="${name}"]`).forEach((input) => { input.checked = input.value === String(value); });
}

function syncSettingsForm() {
  const settings = state.settings;
  $("#settingName").value = settings.userName;
  $("#settingShowGreeting").checked = settings.showGreeting;
  $("#settingShowUrls").checked = settings.showUrls;
  $("#settingIncognito").checked = settings.incognito;
  $("#settingPrivacy").checked = settings.privacy;
  $("#settingGlass").checked = settings.glass;
  $("#settingSync").checked = settings.sync;
  setRadio("openIn", settings.openIn);
  setRadio("theme", settings.theme);
  setRadio("columns", settings.columns);
  setRadio("density", settings.density);
  setRadio("wallpaperTone", settings.wallpaperTone);
  $("#settingDim").value = settings.wallpaperDim;
  $("#settingDimValue").textContent = `${settings.wallpaperDim}%`;
  $("#settingBlur").value = settings.wallpaperBlur;
  $("#settingBlurValue").textContent = `${settings.wallpaperBlur}px`;

  const quick = $("#settingQuickSave");
  quick.replaceChildren(h("option", { value: "", text: "Inbox (created automatically)" }));
  state.pages.forEach((page) => {
    const group = h("optgroup", { label: page.name });
    page.boards.forEach((board) => group.append(h("option", { value: board.id, text: board.title })));
    if (page.boards.length) quick.append(group);
  });
  const target = settings.quickSaveTarget?.boardId;
  quick.value = target && S.findBoard(state, target) ? target : "";

  renderAccentOptions();
  renderWallpaperGrid();
}

function renderAccentOptions() {
  $("#accentOptions").replaceChildren(...S.ACCENTS.map((accent) => h("button", {
    class: `accent-option${state.settings.accent === accent.id ? " active" : ""}`,
    type: "button",
    role: "radio",
    "aria-checked": String(state.settings.accent === accent.id),
    style: { "--swatch": accent.value },
    onclick: () => {
      state.settings.accent = accent.id;
      commit();
      renderAccentOptions();
    }
  }, accent.name)));
}

function renderWallpaperGrid() {
  const tone = state.settings.wallpaperTone;
  const grid = $("#wallpaperGrid");
  const items = [...wallpapers.filter((item) => item.tone === tone), ...S.WALLPAPERS.filter((item) => item.tone === tone)];
  grid.replaceChildren(...items.map((wallpaper) => {
    const button = h("button", {
      class: `wallpaper-swatch${wallpaper.tone === "light" && !wallpaper.image ? " light-swatch" : ""}${state.settings.wallpaper === wallpaper.id ? " active" : ""}`,
      type: "button",
      title: wallpaper.name,
      "aria-pressed": String(state.settings.wallpaper === wallpaper.id),
      style: wallpaper.image
        ? { "background-image": `url("${wallpaper.image}")` }
        : { "--swatch-a": wallpaper.a, "--swatch-b": wallpaper.b, "--swatch-c": wallpaper.c },
      onclick: () => {
        state.settings.wallpaper = wallpaper.id;
        commit();
        renderWallpaperGrid();
      }
    }, h("span", { text: wallpaper.name }));
    if (wallpaper.custom) {
      button.append(h("span", {
        class: "wallpaper-remove",
        role: "button",
        tabindex: "0",
        title: "Remove wallpaper",
        "aria-label": `Remove ${wallpaper.name}`,
        onclick: (event) => {
          event.stopPropagation();
          removeWallpaper(wallpaper.id);
        }
      }, icon("close")));
    }
    return button;
  }));
}

async function removeWallpaper(id) {
  wallpapers = wallpapers.filter((item) => item.id !== id);
  await S.saveWallpapers(wallpapers);
  if (state.settings.wallpaper === id) state.settings.wallpaper = state.settings.wallpaperTone === "light" ? "foggy-light" : "aurora-mint";
  commit();
  renderWallpaperGrid();
  toast("Wallpaper removed");
}

// Downscale big photos and detect whether they are light or dark.
async function prepareWallpaper(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const maxWidth = 2560;
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const sample = document.createElement("canvas");
  sample.width = 24;
  sample.height = 24;
  const sampleContext = sample.getContext("2d", { willReadFrequently: true });
  sampleContext.drawImage(image, 0, 0, 24, 24);
  const pixels = sampleContext.getImageData(0, 0, 24, 24).data;
  let luminance = 0;
  for (let i = 0; i < pixels.length; i += 4) luminance += (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 255;
  luminance /= pixels.length / 4;
  const output = file.type === "image/png" && scale === 1 && file.size < 2_500_000 ? dataUrl : canvas.toDataURL("image/jpeg", 0.88);
  return { image: output, tone: luminance > 0.58 ? "light" : "dark" };
}

async function uploadWallpaper(file) {
  if (!file || !file.type.startsWith("image/")) {
    toast("Choose an image file.", { tone: "error" });
    return;
  }
  try {
    const { image, tone } = await prepareWallpaper(file);
    const wallpaper = { id: S.uid("wallpaper"), name: S.clampText(file.name.replace(/\.[^.]+$/, ""), 40, "My wallpaper"), image, tone, custom: true };
    wallpapers.unshift(wallpaper);
    await S.saveWallpapers(wallpapers);
    state.settings.wallpaper = wallpaper.id;
    state.settings.wallpaperTone = tone;
    commit();
    syncSettingsForm();
    toast(`Wallpaper added — ${tone} theme applied`);
  } catch (error) {
    console.error(error);
    wallpapers = wallpapers.filter((item) => item.image);
    toast("Couldn't use that image. Try a smaller JPG or PNG.", { tone: "error" });
  }
}

async function updateStorageUsage() {
  const element = $("#storageUsage");
  let bytes = 0;
  try {
    if (chromeApi?.storage?.local?.getBytesInUse) bytes = await chromeApi.storage.local.getBytesInUse(null);
    else bytes = (localStorage.getItem("mintlist-state") || "").length + (localStorage.getItem("mintlist-wallpapers") || "").length;
  } catch {
    bytes = 0;
  }
  const links = S.allLinks(state).length;
  element.textContent = `${pluralize(links, "link")} in ${pluralize(state.pages.length, "page")} · ${formatBytes(bytes)} used on this device`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function updateDuplicateHint() {
  const groups = findDuplicateGroups();
  const extra = groups.reduce((total, group) => total + group.length - 1, 0);
  $("#duplicateHint").textContent = extra ? `${pluralize(extra, "extra copy", "extra copies")} found across ${pluralize(groups.length, "link")}.` : "No duplicates right now.";
}

function renderSyncStatus() {
  const box = $("#syncStatus");
  const description = $("#syncDescription");
  if (!chromeApi?.storage?.sync) {
    $("#settingSync").disabled = true;
    description.textContent = "Available when MintList runs as a Chrome extension.";
    box.hidden = true;
    return;
  }
  if (!state.settings.sync) {
    box.hidden = true;
    return;
  }
  const status = ui.syncStatus || {};
  box.hidden = false;
  box.classList.toggle("error", status.state === "error");
  const text = status.state === "error"
    ? status.message || "Sync failed."
    : status.at
      ? `Synced ${relativeTime(status.at)}${status.bytes ? ` · ${formatBytes(status.bytes)} of ~${formatBytes(S.SYNC_LIMIT)} used` : ""}`
      : "Waiting for the first sync…";
  box.replaceChildren(
    icon(status.state === "error" ? "alert" : "cloud"),
    h("span", { text }),
    h("button", { class: "btn btn-secondary sm", type: "button", onclick: () => syncNow() }, icon("refresh"), "Sync now")
  );
  renderSidebar();
}

async function syncNow() {
  try {
    await chromeApi.runtime.sendMessage({ type: "sync-now" });
    toast("Sync requested");
  } catch {
    toast("Couldn't reach the background service. Try again.", { tone: "error" });
  }
}

async function toggleSync(enable) {
  const input = $("#settingSync");
  if (!chromeApi?.storage?.sync) {
    input.checked = false;
    return;
  }
  if (!enable) {
    state.settings.sync = false;
    commit();
    renderSyncStatus();
    toast("Sync turned off on this device");
    return;
  }
  input.disabled = true;
  try {
    const remote = await S.readSyncPayload();
    const remotePages = remote?.payload?.pages || [];
    if (remotePages.length) {
      const remoteLinks = remotePages.reduce((total, page) => total + (page.boards || []).reduce((sum, board) => sum + (board.links || []).length, 0), 0);
      const answer = await askConfirm({
        title: "A synced library already exists",
        message: `Your Chrome profile has a MintList library with ${pluralize(remotePages.length, "page")} and ${pluralize(remoteLinks, "link")} (updated ${relativeTime(remote.meta.updatedAt)}). Which library should this computer use?`,
        confirmLabel: "Use synced library",
        altLabel: "Keep this computer's",
        tone: "info",
        iconName: "cloud"
      });
      if (!answer) {
        input.checked = false;
        return;
      }
      if (answer === "confirm") {
        state.pages.forEach((page, index) => pushTrash("page", page, { index }, "replaced by synced library"));
        state = S.applySyncPayload(state, remote.payload);
      }
    }
    state.settings.sync = true;
    await commit();
    syncSettingsForm();
    syncNow();
    toast("Sync is on");
  } catch (error) {
    console.error(error);
    input.checked = false;
    toast("Couldn't turn on sync.", { tone: "error" });
  } finally {
    input.disabled = false;
    renderSyncStatus();
  }
}

async function resetEverything() {
  const answer = await askConfirm({
    title: "Reset MintList?",
    message: "Every page, link, setting and wallpaper on this device will be permanently deleted. Export a backup first if you might need it.",
    confirmLabel: "Reset everything"
  });
  if (answer !== "confirm") return;
  const sync = state.settings.sync;
  state = S.createEmptyState();
  state.settings.onboarded = true;
  state.settings.sync = sync;
  wallpapers = [];
  await S.saveWallpapers(wallpapers);
  ui.view = { type: "page" };
  $("#settingsDialog").close();
  commit();
  toast("MintList was reset");
}

function initSettings() {
  $$(".settings-tab").forEach((button) => button.addEventListener("click", () => switchSettingsTab(button.dataset.tab)));

  const bindSwitch = (id, key, after) => {
    $(id).addEventListener("change", (event) => {
      state.settings[key] = event.target.checked;
      commit();
      after?.();
    });
  };
  bindSwitch("#settingShowGreeting", "showGreeting");
  bindSwitch("#settingShowUrls", "showUrls");
  bindSwitch("#settingIncognito", "incognito", () => {
    if (state.settings.incognito) toast("Make sure “Allow in Incognito” is on for MintList in chrome://extensions.", { tone: "info", duration: 6000 });
  });
  bindSwitch("#settingPrivacy", "privacy");
  bindSwitch("#settingGlass", "glass");

  const saveName = debounce(() => persist(), 400);
  $("#settingName").addEventListener("input", (event) => {
    state.settings.userName = S.clampText(event.target.value, 40);
    renderGreeting();
    saveName();
  });

  const bindRadio = (name, key, transform = (value) => value, after) => {
    $$(`input[name="${name}"]`).forEach((input) => input.addEventListener("change", () => {
      if (!input.checked) return;
      state.settings[key] = transform(input.value);
      commit();
      after?.();
    }));
  };
  bindRadio("openIn", "openIn");
  bindRadio("theme", "theme");
  bindRadio("columns", "columns", (value) => (value === "auto" ? "auto" : Number(value)));
  bindRadio("density", "density");
  bindRadio("wallpaperTone", "wallpaperTone", (value) => value, () => renderWallpaperGrid());

  $("#settingQuickSave").addEventListener("change", (event) => {
    state.settings.quickSaveTarget = event.target.value ? { boardId: event.target.value } : null;
    persist();
    toast("Quick save destination updated");
  });

  const bindRange = (id, key, unit) => {
    const input = $(id);
    input.addEventListener("input", () => {
      state.settings[key] = Number(input.value);
      $(`${id}Value`).textContent = `${input.value}${unit}`;
      applyTheme();
    });
    input.addEventListener("change", () => persist());
  };
  bindRange("#settingDim", "wallpaperDim", "%");
  bindRange("#settingBlur", "wallpaperBlur", "px");

  $("#wallpaperUploadInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await uploadWallpaper(file);
  });

  $("#settingSync").addEventListener("change", (event) => toggleSync(event.target.checked));
  $("#settingsImportButton").addEventListener("click", () => {
    $("#settingsDialog").close();
    openImport();
  });
  $("#exportJsonButton").addEventListener("click", exportBackup);
  $("#exportHtmlButton").addEventListener("click", exportHtml);
  $("#exportMarkdownButton").addEventListener("click", exportMarkdown);
  $("#findDuplicatesButton").addEventListener("click", () => openDuplicates());
  $("#resetDataButton").addEventListener("click", resetEverything);
  $("#openShortcutSettings").addEventListener("click", () => {
    if (chromeApi?.tabs) chromeApi.tabs.create({ url: "chrome://extensions/shortcuts" });
    else toast("Open chrome://extensions/shortcuts in Chrome.", { tone: "info" });
  });
  $("#showWelcomeButton").addEventListener("click", () => {
    $("#settingsDialog").close();
    openWelcome();
  });
  $("#extensionVersion").textContent = chromeApi?.runtime?.getManifest?.().version || "2.0.0";
  renderShortcutTable();
}

// ============================================================ duplicates

function findDuplicateGroups() {
  const groups = new Map();
  S.allLinks(state).forEach((entry) => {
    const key = S.urlKey(entry.link.url);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  });
  return [...groups.values()].filter((group) => group.length > 1);
}

function openDuplicates() {
  closeMenu();
  renderDuplicates();
  const dialog = $("#duplicatesDialog");
  if (!dialog.open) dialog.showModal();
}

function renderDuplicates() {
  const groups = findDuplicateGroups();
  const extra = groups.reduce((total, group) => total + group.length - 1, 0);
  $("#duplicatesSub").textContent = groups.length ? `${pluralize(groups.length, "link")} saved more than once · ${pluralize(extra, "extra copy", "extra copies")}` : "Your library is tidy — no duplicates found.";
  $("#removeDuplicatesButton").hidden = !groups.length;
  const list = $("#duplicatesList");
  list.replaceChildren();
  if (!groups.length) {
    list.append(h("div", { class: "palette-empty" }, icon("check"), h("strong", { text: "No duplicates" }), h("span", { text: "Every link appears only once." })));
    return;
  }
  groups.forEach((group) => {
    const first = group[0].link;
    list.append(h("div", { class: "dup-group" },
      h("h4", {}, faviconEl(first.url, first.title), h("span", { text: first.title })),
      group.map((entry, index) => h("div", { class: "dup-row" },
        h("span", { text: `${entry.page.name} › ${entry.board.title}${entry.link.title !== first.title ? ` — “${entry.link.title}”` : ""}` }),
        index === 0
          ? h("span", { class: "dup-keep", text: "Keep" })
          : h("button", { class: "btn btn-ghost sm", type: "button", onclick: () => { trashLinks([entry.link.id]); renderDuplicates(); } }, "Remove")
      ))
    ));
  });
}

function initDuplicates() {
  $("#removeDuplicatesButton").addEventListener("click", () => {
    const ids = findDuplicateGroups().flatMap((group) => group.slice(1).map((entry) => entry.link.id));
    $("#duplicatesDialog").close();
    trashLinks(ids);
    updateDuplicateHint();
  });
}

// ============================================================ welcome

async function openWelcome() {
  const dialog = $("#welcomeDialog");
  const chromeOption = $('[data-start="chrome"]');
  chromeOption.disabled = !chromeApi?.bookmarks;
  chromeOption.title = chromeApi?.bookmarks ? "" : "Available when MintList runs as a Chrome extension";
  $("#welcomeSync").hidden = true;
  if (!dialog.open) dialog.showModal();
  if (chromeApi?.storage?.sync) {
    try {
      const remote = await S.readSyncPayload();
      if (remote?.payload?.pages?.length) {
        const links = remote.payload.pages.reduce((total, page) => total + (page.boards || []).reduce((sum, board) => sum + (board.links || []).length, 0), 0);
        $("#welcomeSyncMeta").textContent = `${pluralize(remote.payload.pages.length, "page")} · ${pluralize(links, "link")} · updated ${relativeTime(remote.meta.updatedAt)}`;
        $("#welcomeSync").hidden = false;
        $("#welcomeRestoreSync").onclick = () => finishWelcome("sync", remote);
      }
    } catch {
      // Sync storage unavailable — just skip the banner.
    }
  }
}

function freshState(kind) {
  const settings = { ...state.settings, onboarded: true };
  const next = kind === "sample" ? S.createSampleState() : S.createEmptyState();
  next.settings = { ...next.settings, ...settings };
  next.trash = state.trash;
  return next;
}

async function finishWelcome(choice, remote) {
  const dialog = $("#welcomeDialog");
  dialog.close("done");
  if (choice === "sync" && remote) {
    state = S.applySyncPayload(freshState("empty"), remote.payload);
    state.settings.sync = true;
    state.settings.onboarded = true;
    ui.view = { type: "page" };
    await commit();
    syncNow();
    toast("Your synced library is back");
    return;
  }
  const firstRun = !state.settings.onboarded;
  if (!firstRun || !ui.freshInstall) {
    // Re-running the tour from Settings — or links were already quick-saved
    // before the first new tab — must never silently wipe a library.
    state.settings.onboarded = true;
    if (choice === "chrome") {
      openImport("chrome");
      persist();
    } else if (choice === "sample") {
      const examples = S.createSampleState().pages.map((page) => uniqueIds(page, "page"));
      if (!firstRun) examples.forEach((page) => { page.name = `${page.name} (example)`; });
      state.pages.push(...examples);
      setView({ type: "page", id: examples[0].id });
      persist();
      toast(firstRun ? "Welcome to MintList!" : "Example pages added");
    } else if (choice === "empty" && firstRun) {
      commit();
      toast("All set — your saved links are in the Inbox");
    } else if (choice === "empty") {
      const answer = await askConfirm({
        title: "Start fresh?",
        message: "All current pages move to Trash (restorable for 30 days) and you get an empty Home page.",
        confirmLabel: "Start fresh"
      });
      if (answer !== "confirm") return;
      state.pages.forEach((page, index) => pushTrash("page", page, { index }, "start fresh"));
      const empty = S.createEmptyState().pages[0];
      state.pages = [uniqueIds(empty, "page")];
      state.activePageId = state.pages[0].id;
      ui.view = { type: "page" };
      commit();
      toast("Fresh start — your old pages are in Trash");
    }
    return;
  }
  state = freshState(choice === "sample" ? "sample" : "empty");
  ui.view = { type: "page" };
  // Request the bookmarks permission while the click still counts as a user gesture.
  if (choice === "chrome") openImport("chrome", { onboarding: true });
  await commit();
  if (choice === "empty") toast("All set — add your first link to the Inbox");
  else if (choice === "sample") toast("Welcome to MintList!");
}

function initWelcome() {
  const dialog = $("#welcomeDialog");
  $$("[data-start]", dialog).forEach((button) => button.addEventListener("click", () => finishWelcome(button.dataset.start)));
  dialog.addEventListener("close", () => {
    if (dialog.returnValue === "done" || state.settings.onboarded) return;
    // Closed with Esc / backdrop: keep the examples and don't ask again.
    state.settings.onboarded = true;
    persist();
  });
}
