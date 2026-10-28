/*
 * Facebook is a single-page app: clicking the logo or "Home" navigates
 * client-side with no network request, so the declarativeNetRequest redirect
 * in rules_*.json never fires for those. This script watches for in-page
 * navigations and keeps three things in step with the URL:
 *
 *  - <html data-fbm-page>, which facebook.css reads to decide where a feed
 *    may render (the Friends feed, profiles, groups) and where it may not
 *    (the ranked feed).
 *  - A redirect from the ranked feed, Watch, Reels, and Stories to the
 *    chosen home page (the Friends feed or Marketplace).
 *  - The active tab of the Friends | Marketplace switcher.
 *
 * It also runs the scanners in scan.js, which tag suggested, sponsored, and
 * other non-friend units so the CSS can hide them.
 *
 * It is intentionally passive: it never changes Facebook's own nodes beyond
 * data attributes, never intercepts events or requests, and never patches
 * history. A blocked page gets a normal top-level navigation.
 */
(() => {
  "use strict";

  const scan = window.__fbmScan;
  const root = document.documentElement;

  // Both stay null until storage answers, so nothing redirects on a guess.
  let hideEnabled = null; // the "Friends & Market mode" toggle
  let homeUrl = null;
  let commentsEnabled = false;
  let redirecting = false;
  let switcher = null; // { host, tabs: { friends: <a>, marketplace: <a> } }

  function markPage(href) {
    root.setAttribute("data-fbm-page", scan.classifyPage(href));
  }

  function enforce() {
    markPage(location.href);
    updateSwitcher();
    if (!hideEnabled || !homeUrl || redirecting) return;
    if (scan.isRedirected(location.href)) {
      redirecting = true;
      location.replace(homeUrl);
    }
  }

  // Classify before first paint, so the CSS knows whether the feed may show.
  markPage(location.href);

  window.__fbrGate("hideFbFeed", "fb", (enabled) => {
    hideEnabled = enabled;
    enforce();
    scheduleScan();
  });

  // Opt-in toggles (OFF by default). Strict mode also hides friends'
  // reshares and link posts; debug mode outlines everything that would be
  // hidden instead of hiding it.
  window.__fbrGate("strictFriends", "strict", null, { optIn: true });
  window.__fbrGate("debugOutline", "debug", null, { optIn: true });
  window.__fbrGate(
    "hideFbComments",
    "fbc",
    (enabled) => {
      commentsEnabled = enabled;
      if (enabled) scheduleScan();
    },
    { optIn: true }
  );

  // The home page is a choice, not an on/off, so it skips the gate.
  function setHome(page) {
    homeUrl = page === "marketplace" ? scan.MARKETPLACE_URL : scan.FRIENDS_URL;
    enforce();
  }
  chrome.storage.sync.get({ homePage: "friends" }, (v) => setHome(v.homePage));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.homePage) setHome(changes.homePage.newValue);
  });

  // ---- Friends | Marketplace switcher --------------------------------------

  // Lives in a closed shadow root on <html>, outside Facebook's React tree,
  // so neither side's styles or scripts can reach the other. facebook.css
  // hides the host when the main toggle is off.
  const SWITCHER_CSS = `
    :host {
      all: initial;
      position: fixed;
      left: 16px;
      bottom: 16px;
      z-index: 2147483000;
      font: 600 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    nav {
      display: flex;
      gap: 2px;
      padding: 3px;
      border-radius: 999px;
      background: #fff;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.06);
    }
    a {
      padding: 9px 14px;
      border-radius: 999px;
      color: #050505;
      text-decoration: none;
    }
    a:hover { background: #f0f2f5; }
    a[aria-current="page"] { background: #1877f2; color: #fff; }
    a:focus-visible { outline: 2px solid #1877f2; outline-offset: 2px; }
    :host([data-theme="dark"]) nav {
      background: #242526;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08);
    }
    :host([data-theme="dark"]) a { color: #e4e6eb; }
    :host([data-theme="dark"]) a:hover { background: #3a3b3c; }
    :host([data-theme="dark"]) a[aria-current="page"] { background: #2d88ff; color: #fff; }
  `;

  const TABS = [
    ["friends", "Friends", scan.FRIENDS_URL],
    ["marketplace", "Marketplace", scan.MARKETPLACE_URL]
  ];

  function buildSwitcher() {
    const host = document.createElement("div");
    host.setAttribute("data-fbm-switcher", "");
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = SWITCHER_CSS;
    const nav = document.createElement("nav");
    nav.setAttribute("aria-label", "Friends and Marketplace");
    const tabs = {};
    for (const [page, label, href] of TABS) {
      const a = document.createElement("a");
      a.href = href;
      a.textContent = label;
      nav.append(a);
      tabs[page] = a;
    }
    shadow.append(style, nav);
    return { host, tabs };
  }

  // Re-mounts if Facebook ever drops the host.
  function mountSwitcher() {
    if (!switcher) switcher = buildSwitcher();
    if (!switcher.host.isConnected) root.append(switcher.host);
    updateSwitcher();
  }

  // Facebook has its own light/dark setting, independent of the OS, so read
  // the page's actual background rather than prefers-color-scheme.
  function pageIsDark() {
    for (const el of [document.body, root]) {
      if (!el) continue;
      const rgba = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
      if (!rgba || (rgba.length > 3 && Number(rgba[3]) === 0)) continue;
      const [r, g, b] = rgba.map(Number);
      return 0.299 * r + 0.587 * g + 0.114 * b < 128;
    }
    return matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function updateSwitcher() {
    if (!switcher) return;
    const page = root.getAttribute("data-fbm-page");
    for (const [name, a] of Object.entries(switcher.tabs)) {
      if (name === page) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
    switcher.host.setAttribute("data-theme", pageIsDark() ? "dark" : "light");
  }

  // ---- Scanners ------------------------------------------------------------

  function runScanners() {
    if (hideEnabled) {
      scan.scanFeed(document);
      scan.scanRails(document);
    }
    if (commentsEnabled) scan.scanComments(document);
    mountSwitcher();
  }

  let pendingScan = null;
  function scheduleScan() {
    if (pendingScan !== null || document.readyState === "loading") return;
    pendingScan = setTimeout(() => {
      pendingScan = null;
      runScanners();
    }, 300);
  }

  function startScanners() {
    runScanners();
    new MutationObserver(scheduleScan).observe(root, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startScanners, { once: true });
  } else {
    startScanners();
  }

  // ---- Navigation ----------------------------------------------------------

  // Preferred: the Navigation API fires for all SPA route changes. Marking
  // the destination as soon as a navigation starts hides the ranked feed
  // before Facebook renders it; enforce() then redirects once it commits.
  if (window.navigation && typeof window.navigation.addEventListener === "function") {
    window.navigation.addEventListener("navigate", (e) => {
      if (e.destination && e.destination.url) markPage(e.destination.url);
    });
    window.navigation.addEventListener("navigatesuccess", enforce);
    window.navigation.addEventListener("navigateerror", enforce);
  }

  // Fallback: lightweight URL poll for browsers/paths the above misses.
  // It compares the query too, because the Friends feed and the ranked
  // feed share the "/" path.
  let lastUrl = location.pathname + location.search;
  setInterval(() => {
    const url = location.pathname + location.search;
    if (url !== lastUrl) {
      lastUrl = url;
      enforce();
    }
  }, 400);
})();
