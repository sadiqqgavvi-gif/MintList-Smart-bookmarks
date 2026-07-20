(function () {
  // Paint the last-known theme instantly, before styles.css/newtab.js
  // finish loading, so opening a new tab never flashes a blank or
  // wrong-colored page while chrome.storage.local resolves.
  // (Kept as its own file, not an inline <script>, because Manifest V3's
  // default CSP for extension pages blocks inline scripts.)
  try {
    var quick = JSON.parse(localStorage.getItem("mintlist-quick-theme") || "null");
    if (quick) {
      var root = document.documentElement.style;
      root.setProperty("--wallpaper-a", quick.a);
      root.setProperty("--wallpaper-b", quick.b);
      root.setProperty("--wallpaper-c", quick.c);
      root.setProperty("--text", quick.scheme === "light" ? "#1e2429" : "#f6f2e8");
      root.setProperty("--muted", quick.scheme === "light" ? "#58636b" : "#b8bdc9");
      root.setProperty("--panel", quick.scheme === "light" ? "rgba(255, 255, 255, 0.72)" : "rgba(20, 23, 31, 0.82)");
      root.setProperty("--panel-strong", quick.scheme === "light" ? "rgba(255, 255, 255, 0.92)" : "rgba(28, 32, 42, 0.94)");
      root.setProperty("--line", quick.scheme === "light" ? "rgba(30, 36, 41, 0.16)" : "rgba(255, 255, 255, 0.14)");
      document.documentElement.style.colorScheme = quick.scheme;
    }
  } catch (error) {
    // No quick cache yet (first-ever load) - default CSS variables apply.
  }
})();