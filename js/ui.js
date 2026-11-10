/* Generic UI helpers shared by every MintList screen: element builder,
   toasts, menus, confirm dialogs, favicons, clipboard and file helpers. */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const isMac = /Mac|iPhone|iPad/i.test(navigator.userAgentData?.platform || navigator.platform || "");

// Small hyperscript helper. Children may be strings, nodes, arrays or null.
function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  Object.entries(props || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) return;
    if (key === "class") element.className = value;
    else if (key === "text") element.textContent = value;
    else if (key === "html") element.innerHTML = value;
    else if (key === "dataset") Object.assign(element.dataset, value);
    else if (key === "style" && typeof value === "object") Object.entries(value).forEach(([prop, val]) => element.style.setProperty(prop, val));
    else if (key.startsWith("on") && typeof value === "function") element.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) element.setAttribute(key, "");
    else element.setAttribute(key, value);
  });
  appendChildren(element, children);
  return element;
}

function appendChildren(element, children) {
  children.flat(Infinity).forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
}

function icon(name, className = "") {
  const span = document.createElement("span");
  span.dataset.icon = name;
  span.dataset.iconRendered = name;
  if (className) span.className = className;
  span.innerHTML = iconSvg(name);
  return span;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

function relativeTime(ms) {
  if (!ms) return "never";
  const diff = Date.now() - ms;
  const minute = 60000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} h ago`;
  if (diff < 7 * day) {
    const days = Math.floor(diff / day);
    return days === 1 ? "yesterday" : `${days} days ago`;
  }
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function hueFor(text) {
  let hash = 0;
  for (const char of String(text)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

function applyModifierLabels(root = document) {
  if (!isMac) return;
  root.querySelectorAll(".kbd-mod").forEach((element) => {
    element.textContent = element.textContent.replace(/Ctrl/g, "⌘").replace(/Shift/g, "⇧").replace(/Alt/g, "⌥");
  });
}

// ---------------------------------------------------------------- favicons

function faviconSource(url) {
  const api = MintStore.chromeApi;
  if (!api?.runtime?.getURL) return null;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return api.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`);
  } catch {
    return null;
  }
}

function letterFor(title, url) {
  const source = String(title || MintStore.hostLabel(url) || "?").replace(/^[^a-z0-9]+/i, "");
  return (source.charAt(0) || "•").toUpperCase();
}

// Chrome's favicon service answers unknown sites with a generic globe. We
// detect that image and show a coloured letter instead, and remember the
// result for a day so new tabs don't flicker.
const FAVICON_CACHE_KEY = "mintlist-favicon-defaults";
const FAVICON_RECHECK_MS = 24 * 60 * 60 * 1000;
let defaultFaviconPromise = null;
const faviconDefaults = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(FAVICON_CACHE_KEY) || "{}");
    const fresh = {};
    Object.entries(raw).forEach(([key, time]) => { if (Date.now() - time < FAVICON_RECHECK_MS) fresh[key] = time; });
    return fresh;
  } catch {
    return {};
  }
})();
const faviconOk = new Set();
const saveFaviconDefaults = debounce(() => {
  try {
    const entries = Object.entries(faviconDefaults).sort((a, b) => b[1] - a[1]).slice(0, 800);
    localStorage.setItem(FAVICON_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage full — detection still works, it just isn't remembered.
  }
}, 500);

function imageSignature(img) {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(img, 0, 0, 16, 16);
  const data = context.getImageData(0, 0, 16, 16).data;
  let hash = 0;
  for (let i = 0; i < data.length; i += 1) hash = (hash * 31 + data[i]) >>> 0;
  return `${img.naturalWidth}x${img.naturalHeight}:${hash}`;
}

function defaultFaviconSignature() {
  if (!defaultFaviconPromise) {
    defaultFaviconPromise = new Promise((resolve) => {
      const src = faviconSource("https://mintlist-unknown-site.invalid/");
      if (!src) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          resolve(imageSignature(img));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  return defaultFaviconPromise;
}

function faviconEl(url, title, preferred = null) {
  const wrapper = h("span", { class: "favicon", "aria-hidden": "true" });
  const ownSource = faviconSource(url);
  const src = preferred || ownSource;
  const fallback = () => {
    wrapper.replaceChildren(letterFor(title, url));
    wrapper.classList.add("letter");
    wrapper.style.setProperty("--hue", hueFor(MintStore.hostLabel(url) || title));
  };
  if (!src || (src === ownSource && faviconDefaults[src])) {
    fallback();
    return wrapper;
  }
  const img = h("img", { src, alt: "", decoding: "async", draggable: "false" });
  img.addEventListener("error", fallback, { once: true });
  if (src === ownSource && !faviconOk.has(src)) {
    img.addEventListener("load", async () => {
      const signature = await defaultFaviconSignature();
      if (!signature) return;
      try {
        if (imageSignature(img) === signature) {
          faviconDefaults[src] = Date.now();
          saveFaviconDefaults();
          fallback();
        } else {
          faviconOk.add(src);
        }
      } catch {
        // Unreadable image — keep it as is.
      }
    }, { once: true });
  }
  wrapper.append(img);
  return wrapper;
}

// Wrap every occurrence of the query terms in <mark>.
function highlightText(text, terms) {
  const fragment = document.createDocumentFragment();
  const value = String(text || "");
  const cleaned = (terms || []).map((term) => term.trim()).filter(Boolean);
  if (!cleaned.length) {
    fragment.append(value);
    return fragment;
  }
  const pattern = new RegExp(`(${cleaned.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length).join("|")})`, "gi");
  let last = 0;
  value.replace(pattern, (match, _group, offset) => {
    if (offset > last) fragment.append(value.slice(last, offset));
    fragment.append(h("mark", { text: match }));
    last = offset + match.length;
    return match;
  });
  if (last < value.length) fragment.append(value.slice(last));
  return fragment;
}

// ------------------------------------------------------------------ toasts

function toast(message, options = {}) {
  const region = $("#toastRegion");
  if (!region) return;
  const { tone = "success", action = null, duration = action ? 6000 : 3200 } = options;
  const iconName = tone === "error" ? "alert" : tone === "info" ? "info" : "check";
  const node = h("div", { class: `toast ${tone}`, role: tone === "error" ? "alert" : "status" },
    icon(iconName),
    h("span", { class: "toast-text", text: message })
  );
  let timer = null;
  const dismiss = () => {
    clearTimeout(timer);
    node.classList.add("leaving");
    setTimeout(() => node.remove(), 200);
  };
  if (action) {
    node.append(h("button", {
      class: "btn btn-secondary sm",
      type: "button",
      text: action.label,
      onclick: () => {
        dismiss();
        action.run();
      }
    }));
  }
  while (region.children.length >= 3) region.firstElementChild.remove();
  region.append(node);
  timer = setTimeout(dismiss, duration);
  node.addEventListener("mouseenter", () => clearTimeout(timer));
  node.addEventListener("mouseleave", () => { timer = setTimeout(dismiss, 1800); });
  return dismiss;
}

// ------------------------------------------------------------------- menus

const menuState = { anchor: null, onClose: null, openedAt: 0 };

/*
 * items: arrays of
 *   { label, icon, hint, danger, disabled, run }
 *   "sep"
 *   { type: "label", label }
 *   { type: "colors", colors: [{ id, value, name }], active, pick(id) }
 */
function openMenu(target, items, options = {}) {
  closeMenu();
  const menu = $("#menu");
  menu.replaceChildren();
  menu.setAttribute("aria-label", options.label || "Menu");

  items.filter(Boolean).forEach((item) => {
    if (item === "sep") {
      menu.append(h("div", { class: "menu-sep", role: "separator" }));
      return;
    }
    if (item.type === "label") {
      menu.append(h("div", { class: "menu-label", text: item.label }));
      return;
    }
    if (item.type === "colors") {
      const row = h("div", { class: "menu-colors" });
      item.colors.forEach((color) => {
        row.append(h("button", {
          class: `color-swatch${color.id ? "" : " none"}${item.active === color.id ? " active" : ""}`,
          type: "button",
          title: color.name,
          "aria-label": `${color.name} colour`,
          style: color.value ? { "--swatch": color.value } : null,
          onclick: () => {
            closeMenu();
            item.pick(color.id);
          }
        }));
      });
      menu.append(row);
      return;
    }
    const button = h("button", {
      class: `menu-item${item.danger ? " danger" : ""}`,
      type: "button",
      role: "menuitem",
      disabled: item.disabled ? true : null,
      onclick: () => {
        closeMenu();
        item.run?.();
      }
    },
    item.icon ? icon(item.icon) : h("span", { class: "nav-icon" }),
    h("span", { class: "menu-item-label", text: item.label }),
    item.hint ? h("span", { class: "menu-hint", text: item.hint }) : null);
    menu.append(button);
  });

  menu.hidden = false;
  const rect = menu.getBoundingClientRect();
  let x;
  let y;
  if (target instanceof Element) {
    const anchorRect = target.getBoundingClientRect();
    x = options.align === "left" ? anchorRect.left : anchorRect.right - rect.width;
    y = anchorRect.bottom + 6;
    if (y + rect.height > window.innerHeight - 8) y = anchorRect.top - rect.height - 6;
    target.setAttribute("aria-expanded", "true");
    menuState.anchor = target;
  } else {
    x = target.x;
    y = target.y;
    if (y + rect.height > window.innerHeight - 8) y = Math.max(8, target.y - rect.height);
  }
  x = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
  y = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
  menu.style.left = `${Math.round(x)}px`;
  menu.style.top = `${Math.round(y)}px`;
  menuState.onClose = options.onClose || null;
  menuState.openedAt = performance.now();
  const first = menu.querySelector(".menu-item:not(:disabled)");
  first?.focus({ preventScroll: true });
}

function closeMenu() {
  const menu = $("#menu");
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  menuState.anchor?.setAttribute("aria-expanded", "false");
  menuState.anchor = null;
  const callback = menuState.onClose;
  menuState.onClose = null;
  callback?.();
}

function initMenus() {
  const menu = $("#menu");
  document.addEventListener("pointerdown", (event) => {
    if (!menu.hidden && !menu.contains(event.target) && event.target !== menuState.anchor && !menuState.anchor?.contains(event.target)) closeMenu();
  }, true);
  window.addEventListener("resize", closeMenu);
  window.addEventListener("blur", closeMenu);
  document.addEventListener("scroll", (event) => {
    // Ignore the scroll that often lands right after opening (scrollIntoView).
    if (performance.now() - menuState.openedAt < 250) return;
    if (!menu.contains(event.target)) closeMenu();
  }, true);
  menu.addEventListener("keydown", (event) => {
    const items = $$(".menu-item:not(:disabled), .color-swatch", menu);
    const index = items.indexOf(document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      const anchor = menuState.anchor;
      closeMenu();
      anchor?.focus();
    } else if (event.key === "Tab") {
      closeMenu();
    }
  });
}

// ----------------------------------------------------------------- dialogs

function initDialogs() {
  $$("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target.closest("[data-close]")) {
        dialog.close("cancel");
        return;
      }
      // Light dismiss: a click on the backdrop lands on the <dialog> itself.
      if (event.target === dialog && dialog.dataset.persistent !== "true") {
        const rect = dialog.getBoundingClientRect();
        const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
        if (!inside) dialog.close("cancel");
      }
    });
  });
}

function anyDialogOpen() {
  return $$("dialog").some((dialog) => dialog.open);
}

let confirmResolver = null;

function askConfirm({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", altLabel = "", tone = "danger", iconName } = {}) {
  const dialog = $("#confirmDialog");
  if (dialog.open) dialog.close("cancel");
  $("#confirmTitle").textContent = title || "Are you sure?";
  $("#confirmMessage").textContent = message || "";
  const iconEl = $("#confirmIcon");
  iconEl.dataset.icon = iconName || (tone === "danger" ? "trash" : "info");
  delete iconEl.dataset.iconRendered;
  iconEl.classList.toggle("info", tone !== "danger");
  renderMintIcons(dialog);
  const ok = $("#confirmOkButton");
  ok.textContent = confirmLabel;
  ok.className = `btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`;
  $("#confirmCancelButton").textContent = cancelLabel;
  const alt = $("#confirmAltButton");
  alt.hidden = !altLabel;
  alt.textContent = altLabel;
  dialog.showModal();
  ok.focus();
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function initConfirm() {
  const dialog = $("#confirmDialog");
  $("#confirmOkButton").addEventListener("click", () => dialog.close("confirm"));
  $("#confirmAltButton").addEventListener("click", () => dialog.close("alt"));
  $("#confirmCancelButton").addEventListener("click", () => dialog.close("cancel"));
  dialog.addEventListener("close", () => {
    const resolve = confirmResolver;
    confirmResolver = null;
    const value = dialog.returnValue;
    resolve?.(value === "confirm" ? "confirm" : value === "alt" ? "alt" : null);
  });
}

// ------------------------------------------------------- clipboard & files

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = h("textarea", { style: { position: "fixed", opacity: "0" } });
    area.value = text;
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

function downloadFile(filename, content, type = "text/plain") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = h("a", { href: url, download: filename });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function fileStamp() {
  return new Date().toISOString().slice(0, 10);
}

function slugify(text) {
  return String(text || "mintlist").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "mintlist";
}
