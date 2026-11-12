/* Startup, global keyboard shortcuts and live updates from other tabs,
   the popup, the background worker and Chrome Sync. */

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function initShell() {
  $("#collapseSidebarButton").addEventListener("click", () => setSidebarCollapsed(true));
  $("#expandSidebarButton").addEventListener("click", () => setSidebarCollapsed(false));
  $("#searchTrigger").addEventListener("click", () => openPalette());
  $("#addPageButton").addEventListener("click", () => openPageDialog());
  $("#openSettingsButton").addEventListener("click", () => openSettings());
  $("#addBoardButton").addEventListener("click", () => createBoard());
  $("#selectModeButton").addEventListener("click", () => setSelectMode(!ui.selectMode));
  $("#tabsPanelButton").addEventListener("click", () => setTabsPanel(!state.settings.tabsPanelOpen));
  $("#closeTabsPanelButton").addEventListener("click", () => setTabsPanel(false));
  $("#saveAllTabsButton").addEventListener("click", () => saveAllTabs());
  $$(".bulk-action").forEach((button) => button.addEventListener("click", () => handleBulk(button.dataset.bulk)));

  $("#viewTitle").addEventListener("dblclick", startTitleEdit);
  $("#viewIcon").addEventListener("click", () => {
    if (ui.view.type === "page") openPageDialog(state.activePageId);
  });
  const titleInput = $("#viewTitleInput");
  titleInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finishTitleEdit(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      finishTitleEdit(false);
    }
  });
  titleInput.addEventListener("blur", () => finishTitleEdit(true));

  const filterInput = $("#filterInput");
  const applyFilter = debounce(() => {
    ui.filter = filterInput.value;
    renderContent();
  }, 70);
  filterInput.addEventListener("input", () => {
    $("#filterField").classList.toggle("has-value", Boolean(filterInput.value));
    applyFilter();
  });
  filterInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      filterInput.value = "";
      $("#filterField").classList.remove("has-value");
      ui.filter = "";
      renderContent();
      filterInput.blur();
    } else if (event.key === "Enter") {
      // Enter opens the first visible match.
      const first = $("#content .link");
      if (first) {
        event.preventDefault();
        openLinkById(first.dataset.linkId, event.ctrlKey || event.metaKey ? "background" : "default");
      }
    }
  });

  const tabsList = $("#tabsList");
  tabsList.addEventListener("click", async (event) => {
    const item = event.target.closest(".tab-item");
    const tab = item && tabById(item.dataset.tabId);
    if (!tab) return;
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "save-tab") {
      openSaveTabMenu(tab, event.target.closest("[data-action]"));
    } else {
      try {
        await chromeApi.tabs.update(tab.id, { active: true });
      } catch {
        refreshTabs();
      }
    }
  });
}

function initKeyboard() {
  document.addEventListener("keydown", (event) => {
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key;
    if (mod && key.toLowerCase() === "k") {
      event.preventDefault();
      if ($("#paletteDialog").open) $("#paletteDialog").close();
      else {
        $$("dialog[open]").forEach((dialog) => dialog.close());
        openPalette();
      }
      return;
    }
    if (anyDialogOpen() || !$("#menu").hidden) return;
    const typing = isTypingTarget(event.target);
    if (mod && key.toLowerCase() === "z" && !typing) {
      if (undoAction) {
        event.preventDefault();
        runUndo();
      }
      return;
    }
    if (typing || mod || event.altKey) return;

    switch (key) {
      case "/":
        event.preventDefault();
        if (ui.view.type !== "trash") $("#filterInput").focus();
        break;
      case "n":
      case "N":
        event.preventDefault();
        if (ui.view.type !== "page") setView({ type: "page" });
        createBoard();
        break;
      case "a":
      case "A":
        event.preventDefault();
        openLinkDialog({});
        break;
      case "p":
      case "P":
        event.preventDefault();
        openPageDialog();
        break;
      case "i":
      case "I":
        event.preventDefault();
        openImport();
        break;
      case "s":
      case "S":
        if (ui.view.type === "trash") break;
        event.preventDefault();
        setSelectMode(!ui.selectMode);
        break;
      case "[":
        event.preventDefault();
        setSidebarCollapsed(!state.settings.sidebarCollapsed);
        break;
      case "]":
        event.preventDefault();
        setTabsPanel(!state.settings.tabsPanelOpen);
        break;
      case "?":
        event.preventDefault();
        openSettings("shortcuts");
        break;
      case "Escape":
        if (ui.selectMode) setSelectMode(false);
        else if (ui.filter) {
          $("#filterInput").value = "";
          ui.filter = "";
          renderContent();
        }
        break;
      default:
        if (/^[1-9]$/.test(key)) {
          const page = state.pages[Number(key) - 1];
          if (page) {
            event.preventDefault();
            setView({ type: "page", id: page.id });
          }
        }
        break;
    }
  });
}

function initLiveUpdates() {
  const applyIncoming = (raw) => {
    if (!raw || raw.savedBy === INSTANCE) return;
    if (raw.rev === state.rev && raw.updatedAt === state.updatedAt) return;
    // Don't yank the page out from under someone typing.
    const editing = document.activeElement && isTypingTarget(document.activeElement) && $("#content").contains(document.activeElement);
    state = S.normalizeState(raw);
    if (editing) {
      renderSidebar();
      renderHeader();
    } else {
      render();
    }
    if (state.settings.tabsPanelOpen) renderTabsPanel();
  };

  if (chromeApi?.storage?.onChanged) {
    chromeApi.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[S.STATE_KEY]) applyIncoming(changes[S.STATE_KEY].newValue);
      if (changes[S.WALLPAPER_KEY]) {
        wallpapers = (changes[S.WALLPAPER_KEY].newValue || []).filter((item) => item?.image);
        applyTheme();
        if ($("#settingsDialog").open) renderWallpaperGrid();
      }
      if (changes.mintListSyncStatus) {
        ui.syncStatus = changes.mintListSyncStatus.newValue;
        renderSyncStatus();
      }
    });
    chromeApi.storage.local.get("mintListSyncStatus").then((value) => {
      ui.syncStatus = value.mintListSyncStatus;
      renderSidebar();
    });
  } else {
    window.addEventListener("storage", (event) => {
      if (event.key !== "mintlist-state" || !event.newValue) return;
      try {
        applyIncoming(JSON.parse(event.newValue));
      } catch {
        // Ignore malformed demo data.
      }
    });
  }

  if (chromeApi?.tabs) {
    const refresh = debounce(() => { if (state.settings.tabsPanelOpen) refreshTabs(); }, 250);
    ["onCreated", "onRemoved", "onMoved", "onAttached", "onDetached"].forEach((name) => chromeApi.tabs[name]?.addListener(refresh));
    chromeApi.tabs.onUpdated.addListener((_id, info) => {
      if (info.title || info.url || info.status === "complete" || info.favIconUrl) refresh();
    });
  }

  window.matchMedia?.("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (state.settings.theme === "system") applyTheme();
  });

  const content = $("#content");
  if (window.ResizeObserver) {
    new ResizeObserver(debounce(() => relayout(), 60)).observe(content);
  } else {
    window.addEventListener("resize", debounce(() => relayout(), 100));
  }

  const narrowQuery = window.matchMedia?.("(max-width: 900px)");
  const applyNarrow = () => {
    ui.narrow = Boolean(narrowQuery?.matches);
    if (ui.narrow && !state.settings.sidebarCollapsed) setSidebarCollapsed(true, { save: false });
  };
  narrowQuery?.addEventListener("change", applyNarrow);
  applyNarrow();
  // On small screens the sidebar and tabs panel float over the page; a tap
  // outside closes them.
  $("#workspace").addEventListener("pointerdown", () => {
    if (!ui.narrow) return;
    if (!state.settings.sidebarCollapsed) setSidebarCollapsed(true, { save: false });
    if (state.settings.tabsPanelOpen) setTabsPanel(false);
  });

  // Back/forward cache restores a stale page; reload the latest data.
  window.addEventListener("pageshow", async (event) => {
    if (!event.persisted) return;
    const loaded = await S.load();
    state = loaded.state;
    wallpapers = loaded.wallpapers;
    render();
  });

  setInterval(renderGreeting, 15000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      renderGreeting();
      if (state.settings.tabsPanelOpen) refreshTabs();
    }
  });
}

function handleHash() {
  const hash = window.location.hash.replace("#", "");
  if (!hash) return;
  if (hash.startsWith("settings")) openSettings(hash.split("/")[1] || "general");
  else if (hash === "import") openImport();
  else if (hash === "search") openPalette();
  history.replaceState(null, "", window.location.pathname);
}

(async function init() {
  initMenus();
  initDialogs();
  initConfirm();
  initLinkDialog();
  initPageDialog();
  initMoveDialog();
  initShareDialog();
  initPromptDialog();
  initSettings();
  initDuplicates();
  initWelcome();
  initImporter();
  initPalette();
  initShell();
  initContentEvents();
  initDragAndDrop();
  initKeyboard();
  renderMintIcons();
  applyModifierLabels();

  const loaded = await S.load();
  state = loaded.state;
  wallpapers = loaded.wallpapers;
  ui.freshInstall = loaded.fresh;
  initLiveUpdates();
  render();
  refreshTabs();

  if (!state.settings.onboarded) openWelcome();
  else handleHash();
  window.addEventListener("hashchange", handleHash);
})();
