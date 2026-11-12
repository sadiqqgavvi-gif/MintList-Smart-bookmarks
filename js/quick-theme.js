(function () {
  // Paint the last-known theme instantly, before styles.css and the app
  // scripts finish loading, so opening a new tab never flashes a blank or
  // wrong-coloured page while chrome.storage.local resolves.
  // (Its own file rather than an inline <script>: Manifest V3's default CSP
  // for extension pages blocks inline scripts.)
  try {
    var quick = JSON.parse(localStorage.getItem("mintlist-quick-theme") || "null");
    if (!quick) return;
    var root = document.documentElement;
    var style = root.style;
    root.setAttribute("data-theme", quick.scheme === "light" ? "light" : "dark");
    if (quick.density) root.setAttribute("data-density", quick.density);
    root.setAttribute("data-glass", quick.glass === false ? "off" : "on");
    if (quick.accent) style.setProperty("--accent", quick.accent);
    if (quick.a) style.setProperty("--wp-a", quick.a);
    if (quick.b) style.setProperty("--wp-b", quick.b);
    if (quick.c) style.setProperty("--wp-c", quick.c);
    if (typeof quick.dim === "number") style.setProperty("--dim", String(quick.dim / 100));
    if (typeof quick.blur === "number") style.setProperty("--blur", quick.blur + "px");
    if (quick.image) {
      style.setProperty("--wp-image", 'url("' + quick.image + '")');
      root.setAttribute("data-wp-image", "on");
    }
  } catch (error) {
    // No cache yet (first load) — the default CSS variables apply.
  }
})();
