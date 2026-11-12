/* Import flow: Chrome bookmarks, bookmark HTML files, MintList backups,
   other JSON exports, share codes and pasted link lists. */

const IMPORT_COLORS = ["mint", "sky", "violet", "amber", "rose", "indigo", "orange", "lime"];

const importState = {
  step: "source",
  kind: null, // "tree" | "backup"
  tree: null,
  backup: null,
  label: "",
  icon: "🔖",
  onboarding: false
};

function openImport(source = null, options = {}) {
  closeMenu();
  importState.onboarding = Boolean(options.onboarding);
  importState.kind = null;
  importState.tree = null;
  importState.backup = null;
  $("#importPasteInput").value = "";
  $("#importChromeButton").disabled = !chromeApi?.permissions;
  $("#importChromeButton").title = chromeApi?.permissions ? "" : "Available when MintList runs as a Chrome extension";
  showImportStep("source");
  const dialog = $("#importDialog");
  if (!dialog.open) dialog.showModal();
  if (source === "chrome") loadChromeBookmarks();
}

function showImportStep(step) {
  importState.step = step;
  $("#importStepSource").hidden = step !== "source";
  $("#importStepPaste").hidden = step !== "paste";
  $("#importStepReview").hidden = step !== "review";
  $("#importBackButton").hidden = step === "source";
  const next = $("#importNextButton");
  next.hidden = step === "source";
  next.textContent = step === "paste" ? "Continue" : "Import";
  next.disabled = false;
  $("#importDialogSub").textContent = {
    source: "Bring your links in from Chrome, a file, or a share code.",
    paste: "Paste a share code, Markdown links, or one URL per line. Lines starting with # become board names.",
    review: "Choose what to bring in and where it goes."
  }[step];
}

// ------------------------------------------------------------ tree model

function folderNode(title, depth = 0) {
  return { id: S.uid("node"), title: S.clampText(title, 80, "Untitled folder"), links: [], children: [], checked: true, depth };
}

function pruneTree(node) {
  node.children = node.children.map(pruneTree).filter(Boolean);
  return node.links.length || node.children.length ? node : null;
}

function countTree(node, onlyChecked = true) {
  const own = !onlyChecked || node.checked ? node.links.length : 0;
  return own + node.children.reduce((total, child) => total + countTree(child, onlyChecked), 0);
}

function countFolders(node) {
  const own = node.checked && node.links.length ? 1 : 0;
  return own + node.children.reduce((total, child) => total + countFolders(child), 0);
}

function setTreeChecked(node, value) {
  node.checked = value;
  node.children.forEach((child) => setTreeChecked(child, value));
}

function finishTree(tree, label, iconChar = "🔖") {
  const pruned = pruneTree(tree);
  if (!pruned) {
    toast("No links found to import.", { tone: "error" });
    return;
  }
  importState.kind = "tree";
  importState.tree = pruned;
  importState.label = label;
  importState.icon = iconChar;
  showReview();
}

// ------------------------------------------------------------ sources

async function loadChromeBookmarks() {
  if (!chromeApi?.permissions) return;
  try {
    if (!chromeApi.bookmarks) {
      const granted = await chromeApi.permissions.request({ permissions: ["bookmarks"] });
      if (!granted || !chromeApi.bookmarks) {
        toast("MintList needs permission to read your bookmarks to import them.", { tone: "info" });
        return;
      }
    }
    const [root] = await chromeApi.bookmarks.getTree();
    const convert = (node, depth) => {
      const folder = folderNode(node.title || "Chrome bookmarks", depth);
      (node.children || []).forEach((child) => {
        if (child.url) {
          if (S.isValidUrl(child.url)) folder.links.push({ title: child.title, url: child.url, createdAt: child.dateAdded });
        } else {
          folder.children.push(convert(child, depth + 1));
        }
      });
      return folder;
    };
    const tree = convert(root, 0);
    tree.title = "Chrome bookmarks";
    finishTree(tree, "Chrome bookmarks", "🔖");
  } catch (error) {
    console.error(error);
    toast("Couldn't read Chrome bookmarks.", { tone: "error" });
  }
}

function parseBookmarksHtml(html, fallbackTitle) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rootList = doc.querySelector("dl");
  const walk = (dl, title, depth) => {
    const folder = folderNode(title, depth);
    [...dl.children].forEach((child) => {
      if (child.tagName !== "DT") return;
      const anchor = child.querySelector(":scope > a");
      const heading = child.querySelector(":scope > h3");
      if (anchor) {
        const url = anchor.getAttribute("href") || "";
        if (!S.isValidUrl(url)) return;
        const next = child.nextElementSibling;
        folder.links.push({
          title: anchor.textContent.trim(),
          url,
          tags: (anchor.getAttribute("tags") || "").split(","),
          note: next?.tagName === "DD" ? next.textContent.trim() : "",
          createdAt: Number(anchor.getAttribute("add_date")) * 1000 || undefined
        });
      } else if (heading) {
        const sub = child.querySelector(":scope > dl") || (child.nextElementSibling?.tagName === "DL" ? child.nextElementSibling : null);
        if (sub) folder.children.push(walk(sub, heading.textContent.trim(), depth + 1));
      }
    });
    return folder;
  };
  if (rootList) return walk(rootList, fallbackTitle, 0);
  // Not a Netscape file: collect every anchor on the page.
  const folder = folderNode(fallbackTitle, 0);
  doc.querySelectorAll("a[href]").forEach((anchor) => {
    const url = anchor.getAttribute("href");
    if (S.isValidUrl(url) && /^https?:/i.test(url)) folder.links.push({ title: anchor.textContent.trim(), url });
  });
  return folder;
}

// Generic JSON: MintList backups, Toby-style { lists: [{ title, cards }] },
// arrays of { title, url } and nested { name/title, children/items } trees.
function parseJsonImport(text, fallbackTitle) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    toast("That JSON file couldn't be read.", { tone: "error" });
    return;
  }
  if (data && Array.isArray(data.pages)) {
    importState.kind = "backup";
    importState.backup = data;
    importState.label = "MintList backup";
    showReview();
    return;
  }
  const tree = folderNode(fallbackTitle, 0);
  const asLink = (item) => {
    if (!item || typeof item !== "object") return null;
    const url = item.url || item.href || item.link || item.uri;
    if (typeof url !== "string" || !S.isValidUrl(url)) return null;
    return { title: item.customTitle || item.title || item.name || "", url, tags: item.tags, note: item.note || item.description || item.customDescription || "" };
  };
  const walk = (value, folder, depth) => {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        const link = asLink(item);
        if (link) folder.links.push(link);
        else if (item && typeof item === "object") walk(item, folder, depth);
      });
      return;
    }
    if (!value || typeof value !== "object") return;
    const children = value.cards || value.links || value.bookmarks || value.children || value.items || value.lists || value.groups || value.collections;
    const name = value.title || value.name || value.label;
    if (children && Array.isArray(children)) {
      const sub = name && depth > 0 ? folderNode(name, depth) : folder;
      if (sub !== folder) folder.children.push(sub);
      walk(children, sub, depth + 1);
    } else {
      Object.values(value).forEach((child) => { if (typeof child === "object") walk(child, folder, depth); });
    }
  };
  walk(data, tree, 0);
  finishTree(tree, fallbackTitle);
}

function parseTextImport(text, fallbackTitle) {
  const share = S.decodeShare(text);
  if (share) {
    const tree = folderNode(share.kind === "page" ? share.name : share.title, 0);
    if (share.kind === "page") {
      share.boards.forEach((board, index) => {
        const node = folderNode(board.title, 1);
        node.color = board.color || IMPORT_COLORS[index % IMPORT_COLORS.length];
        node.links = board.links || [];
        tree.children.push(node);
      });
      finishTree(tree, share.name || "Shared page", share.icon || "🔖");
    } else {
      const node = folderNode(share.title, 1);
      node.color = share.color;
      node.links = share.links || [];
      tree.children.push(node);
      finishTree(tree, share.title || "Shared board");
    }
    return;
  }
  const groups = S.parseLinkText(text);
  if (!groups.length) {
    toast("No links found. Paste URLs, Markdown links or a share code.", { tone: "error" });
    return;
  }
  const tree = folderNode(fallbackTitle, 0);
  groups.forEach((group) => {
    const node = folderNode(group.title, 1);
    node.links = group.links;
    tree.children.push(node);
  });
  finishTree(tree, fallbackTitle);
}

async function handleImportFile(file) {
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) {
    toast("That file is too large to import.", { tone: "error" });
    return;
  }
  const text = await file.text();
  const name = S.clampText(file.name.replace(/\.[^.]+$/, ""), 60, "Imported");
  const trimmed = text.trim();
  if (/\.json$/i.test(file.name) || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    parseJsonImport(text, name);
  } else if (/NETSCAPE-Bookmark|<dl|<a\s/i.test(text)) {
    finishTree(parseBookmarksHtml(text, name === "bookmarks" || /^bookmarks_/i.test(name) ? "Imported bookmarks" : name), "Imported bookmarks");
  } else {
    parseTextImport(text, name);
  }
}

// ------------------------------------------------------------ review

function showReview() {
  showImportStep("review");
  const isBackup = importState.kind === "backup";
  $("#importBackupOptions").hidden = !isBackup;
  $("#importDestinationRow").hidden = isBackup;
  $("#importDedupeRow").hidden = isBackup;
  $("#importTree").hidden = isBackup;
  if (isBackup) {
    const backup = importState.backup;
    const pages = backup.pages.length;
    const links = backup.pages.reduce((total, page) => total + (page.boards || []).reduce((sum, board) => sum + (board.links || []).length, 0), 0);
    const when = backup.exportedAt ? new Date(backup.exportedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "an earlier version";
    $("#importSummary").replaceChildren(icon("file"), h("span", {}, h("strong", { text: `MintList backup from ${when}` }), h("small", { text: `${pluralize(pages, "page")} · ${pluralize(links, "link")}${backup.wallpapers?.length ? ` · ${pluralize(backup.wallpapers.length, "wallpaper")}` : ""}` })));
    $$('input[name="backupMode"]').forEach((input) => { input.checked = input.value === "merge"; });
    $("#importNextButton").textContent = "Restore";
    return;
  }

  const destination = $("#importDestination");
  const topWithLinks = importState.tree.children.filter((child) => countTree(child, false) > 0);
  const options = [h("option", { value: "new", text: "A new page" })];
  if (topWithLinks.length > 1) options.push(h("option", { value: "split", text: "One page per top-level folder" }));
  state.pages.forEach((page) => options.push(h("option", { value: page.id, text: `${page.icon ? `${page.icon} ` : ""}${page.name}` })));
  destination.replaceChildren(...options);
  destination.value = "new";
  $("#importPageName").value = importState.label;
  $("#importPageNameField").hidden = false;
  $("#importDedupe").checked = true;
  renderImportTree();
}

function renderImportTree() {
  const container = $("#importTree");
  container.replaceChildren();
  const tree = importState.tree;
  const rows = [];
  // `ownOnly` renders a row for a folder's loose links without its sub-folders.
  const addRow = (node, depth, ownOnly) => {
    const total = ownOnly ? node.links.length : countTree(node, false);
    if (!total) return;
    const checkedCount = ownOnly ? (node.checked ? node.links.length : 0) : countTree(node);
    const checkbox = h("input", { class: "tree-check", type: "checkbox" });
    checkbox.checked = checkedCount > 0;
    checkbox.indeterminate = checkedCount > 0 && checkedCount < total;
    checkbox.addEventListener("change", () => {
      if (ownOnly) node.checked = checkbox.checked;
      else setTreeChecked(node, checkbox.checked);
      renderImportTree();
    });
    rows.push(h("div", { class: "tree-row", style: { "padding-left": `${8 + depth * 20}px` } },
      h("label", {},
        checkbox,
        icon(node === tree ? "bookmark" : "folder"),
        h("span", { class: "tree-name", text: node.title }),
        h("span", { class: "tree-count", text: node.links.length ? pluralize(node.links.length, "link") : `${total} inside` })
      )
    ));
    if (!ownOnly) node.children.forEach((child) => addRow(child, depth + 1, false));
  };
  if (tree.links.length) addRow(tree, 0, true);
  tree.children.forEach((child) => addRow(child, tree.links.length ? 1 : 0, false));
  container.append(...rows);
  updateImportSummary();
}

function updateImportSummary() {
  const links = countTree(importState.tree);
  const folders = countFolders(importState.tree);
  $("#importSummary").replaceChildren(
    icon("bookmark"),
    h("span", {},
      h("strong", { text: importState.label }),
      h("small", { text: `${pluralize(links, "link")} selected in ${pluralize(folders, "folder")} — each folder becomes a board.` })
    )
  );
  $("#importNextButton").disabled = !links;
  $("#importNextButton").textContent = links ? `Import ${pluralize(links, "link")}` : "Import";
}

function boardsFromNode(node, parentTitle = "") {
  const boards = [];
  const walk = (current, parent, depth) => {
    if (current.checked && current.links.length) {
      const title = depth >= 3 && parent ? `${parent} / ${current.title}` : current.title;
      boards.push({ title, color: current.color, links: current.links });
    }
    current.children.forEach((child) => walk(child, current.title, depth + 1));
  };
  walk(node, parentTitle, node.depth || 0);
  return boards;
}

function runImport() {
  if (importState.kind === "backup") {
    runBackupImport();
    return;
  }
  const tree = importState.tree;
  const destination = $("#importDestination").value;
  const dedupe = $("#importDedupe").checked;
  const seen = dedupe ? new Set(S.allLinks(state).map(({ link }) => S.urlKey(link.url))) : null;
  let skipped = 0;
  let added = 0;
  let boardCount = 0;
  let colorIndex = 0;

  const buildBoards = (specs, startCol = 0) => specs.map((spec, index) => {
    const links = spec.links.filter((link) => {
      if (!seen) return true;
      const key = S.urlKey(S.normalizeUrl(link.url));
      if (seen.has(key)) {
        skipped += 1;
        return false;
      }
      seen.add(key);
      return true;
    });
    if (!links.length) return null;
    added += links.length;
    boardCount += 1;
    const color = spec.color || IMPORT_COLORS[colorIndex++ % IMPORT_COLORS.length];
    return S.makeBoard({ title: spec.title, color, col: (startCol + index) % 4, links });
  }).filter(Boolean);

  const newPages = [];
  let focusPageId = null;
  if (destination === "split") {
    if (tree.checked && tree.links.length) {
      const boards = buildBoards([{ title: tree.title, links: tree.links }]);
      if (boards.length) newPages.push(S.makePage({ name: tree.title, icon: importState.icon, boards }));
    }
    tree.children.forEach((child) => {
      const boards = buildBoards(boardsFromNode({ ...child, depth: 1 }));
      if (boards.length) newPages.push(S.makePage({ name: child.title, icon: "🗂️", boards }));
    });
  } else if (destination === "new") {
    const boards = buildBoards(boardsFromNode(tree));
    if (boards.length) newPages.push(S.makePage({ name: S.clampText($("#importPageName").value, 60, importState.label), icon: importState.icon, boards }));
  } else {
    const page = S.findPage(state, destination);
    if (page) {
      const boards = buildBoards(boardsFromNode(tree), page.boards.length);
      page.boards.push(...boards);
      focusPageId = page.id;
    }
  }

  if (!added) {
    toast(skipped ? "Nothing new — every selected link is already in MintList." : "Nothing selected to import.", { tone: "info" });
    return;
  }

  if (newPages.length) {
    if (importState.onboarding) {
      // Drop the untouched starter page so the import is the first thing you see.
      state.pages = state.pages.filter((page) => linkCount(page) > 0 || page.boards.length > 1 || page.boards.some((board) => board.title !== "Inbox"));
    }
    state.pages.push(...newPages);
    focusPageId = newPages[0].id;
  }
  $("#importDialog").close();
  ui.view = { type: "page" };
  if (focusPageId) state.activePageId = focusPageId;
  commit();
  const extra = skipped ? ` · ${pluralize(skipped, "duplicate")} skipped` : "";
  toast(`Imported ${pluralize(added, "link")} into ${pluralize(boardCount, "board")}${extra}`, { duration: 5000 });
}

function cloneWithNewIds(page) {
  return S.makePage({
    ...page,
    id: undefined,
    boards: (page.boards || []).map((board) => ({
      ...board,
      id: undefined,
      links: (board.links || []).map((link) => ({ ...link, id: undefined }))
    }))
  });
}

async function runBackupImport() {
  const backup = importState.backup;
  const mode = $('input[name="backupMode"]:checked')?.value || "merge";
  const incomingWallpapers = Array.isArray(backup.wallpapers) ? backup.wallpapers.filter((item) => item?.image) : [];
  const legacyWallpapers = Array.isArray(backup.settings?.uploadedWallpapers) ? backup.settings.uploadedWallpapers.filter((item) => item?.image) : [];
  const mergedWallpapers = [...wallpapers];
  [...incomingWallpapers, ...legacyWallpapers].forEach((item) => {
    if (!mergedWallpapers.some((existing) => existing.id === item.id)) {
      mergedWallpapers.push({ id: item.id || S.uid("wallpaper"), name: item.name || "Wallpaper", image: item.image, tone: item.tone === "light" || item.scheme === "light" ? "light" : "dark", custom: true });
    }
  });

  if (mode === "replace") {
    const answer = await askConfirm({
      title: "Replace your library?",
      message: "Your current pages move to Trash and the backup is restored exactly, including its settings.",
      confirmLabel: "Replace"
    });
    if (answer !== "confirm") return;
    const previous = state;
    const restored = S.normalizeState({ ...backup, settings: { ...backup.settings, onboarded: true, sync: previous.settings.sync } });
    previous.pages.forEach((page, index) => {
      restored.trash.unshift({ id: S.uid("trash"), type: "page", item: page, from: { index }, context: "replaced by backup", deletedAt: Date.now() });
    });
    state = restored;
  } else {
    const pages = backup.pages.filter((page) => page && typeof page === "object").map(cloneWithNewIds);
    state.pages.push(...pages);
    if (pages[0]) state.activePageId = pages[0].id;
  }

  try {
    wallpapers = mergedWallpapers;
    await S.saveWallpapers(wallpapers);
  } catch {
    toast("Some wallpapers were too large to restore.", { tone: "error" });
  }
  $("#importDialog").close();
  ui.view = { type: "page" };
  commit();
  toast(mode === "replace" ? "Backup restored" : `Added ${pluralize(backup.pages.length, "page")} from the backup`);
}

// ------------------------------------------------------------ wiring

function initImporter() {
  $("#importButton").addEventListener("click", () => openImport());
  $("#importChromeButton").addEventListener("click", () => loadChromeBookmarks());
  $("#importPasteButton").addEventListener("click", () => {
    showImportStep("paste");
    $("#importPasteInput").focus();
  });
  $("#importFileInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    await handleImportFile(file);
  });
  $("#importBackButton").addEventListener("click", () => showImportStep("source"));
  $("#importNextButton").addEventListener("click", () => {
    if (importState.step === "paste") {
      const text = $("#importPasteInput").value;
      if (!text.trim()) {
        $("#importPasteInput").focus();
        return;
      }
      parseTextImport(text, "Pasted links");
    } else if (importState.step === "review") {
      runImport();
    }
  });
  $("#importDestination").addEventListener("change", (event) => {
    $("#importPageNameField").hidden = event.target.value !== "new";
  });

  const dialog = $("#importDialog");
  const zone = $("#importDropZone");
  dialog.addEventListener("dragover", (event) => {
    if (!event.dataTransfer?.types?.includes("Files")) return;
    event.preventDefault();
    zone.classList.add("active");
  });
  dialog.addEventListener("dragleave", (event) => {
    if (!dialog.contains(event.relatedTarget)) zone.classList.remove("active");
  });
  dialog.addEventListener("drop", async (event) => {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    zone.classList.remove("active");
    if (importState.step !== "source") showImportStep("source");
    await handleImportFile(event.dataTransfer.files[0]);
  });
}
