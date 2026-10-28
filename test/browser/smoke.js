/*
 * Real-browser smoke test. jsdom can't evaluate facebook.css, the
 * declarativeNetRequest rules, or the Navigation API, so this loads the
 * unpacked extension into Chromium and serves the fixtures as
 * https://www.facebook.com (via --host-resolver-rules and a throwaway
 * self-signed certificate). Nothing goes to the real facebook.com.
 *
 *   npm run test:browser
 *
 * Needs openssl on PATH (Git for Windows ships one) and a browser that
 * still honors --load-extension: Edge, Playwright's Chromium, or Chrome for
 * Testing, not branded Chrome. It uses $CHROME_PATH, else Edge, else the
 * newest Playwright Chromium it can find. Set $SCREENSHOTS to a directory
 * to keep screenshots.
 */
const https = require("node:https");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright-core");

const REPO = path.join(__dirname, "..", "..");
// $EXTENSION_DIR tests a packaged copy (e.g. an unzipped release) instead.
const EXT = path.resolve(process.env.EXTENSION_DIR || REPO);
const FB = "https://www.facebook.com";
const FRIENDS = FB + "/?filter=friends&sk=h_chr";
const MARKETPLACE = FB + "/marketplace/";
const fixture = (name) => fs.readFileSync(path.join(REPO, "fixtures", name), "utf8");

// Stand-ins for pages that have no fixture.
const RANKED = `<!DOCTYPE html><html><body><div role="main"><div role="feed">
  <div>RANKED FEED POST</div></div></div></body></html>`;
// Marketplace with SPA-style navigations, like clicking the Facebook logo.
const MARKET = `<!DOCTYPE html><html><body>
  <div role="main"><h1>Marketplace</h1>
  <button id="spa-home" onclick="history.pushState({}, '', '/')">logo</button>
  <button id="spa-reel" onclick="history.pushState({}, '', '/reel/42')">reel</button>
  </div></body></html>`;

const EDGE_PATHS = {
  win32: [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
  ],
  darwin: ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
  linux: ["/usr/bin/microsoft-edge", "/opt/microsoft/msedge/msedge"]
};

// $CHROME_PATH, then Edge (it still honors --load-extension), then the
// newest Playwright Chromium.
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const edge = (EDGE_PATHS[process.platform] || []).find((p) => fs.existsSync(p));
  if (edge) return edge;
  const base = process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA || "", "ms-playwright")
    : path.join(os.homedir(), process.platform === "darwin" ? "Library/Caches" : ".cache", "ms-playwright");
  const exe = {
    win32: "chrome-win64/chrome.exe",
    darwin: "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
    linux: "chrome-linux/chrome"
  }[process.platform];
  const builds = fs.existsSync(base)
    ? fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()
    : [];
  for (const dir of builds) {
    const candidate = path.join(base, dir, exe);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("No Edge or Chromium found. Set CHROME_PATH, or run: npx playwright-core install chromium");
}

function makeCert(dir) {
  const key = path.join(dir, "key.pem");
  const cert = path.join(dir, "cert.pem");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-keyout", key, "-out", cert,
    "-subj", "/CN=www.facebook.com",
    "-addext", "subjectAltName=DNS:www.facebook.com,DNS:facebook.com"
  ], { stdio: "ignore", env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? "  -- " + detail : ""}`);
}

const displays = (page, sel) => page.$$eval(sel, (els) => els.map((e) => getComputedStyle(e).display));
const pageType = (page) => page.getAttribute("html", "data-fbm-page");
const units = (page) =>
  page.$$eval('[role="feed"] > [data-expect]', (els) =>
    els.map((u) => ({
      expect: u.dataset.expect,
      hidden: getComputedStyle(u).display === "none",
      outline: getComputedStyle(u).outlineStyle
    }))
  );

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fbm-smoke-"));
  const shots = process.env.SCREENSHOTS;
  const shot = (page, name, opts) => shots && page.screenshot({ path: path.join(shots, name), ...opts });

  const served = [];
  const server = https.createServer(makeCert(tmp), (req, res) => {
    served.push(req.url);
    const url = new URL(req.url, FB);
    let body = "<!DOCTYPE html><html><body>other</body></html>";
    if (url.pathname === "/" && url.searchParams.get("filter") === "friends") body = fixture("friends-feed.html");
    else if (url.pathname === "/") body = RANKED;
    else if (url.pathname === "/maya.chen.7") body = fixture("profile.html");
    else if (url.pathname.startsWith("/marketplace")) body = MARKET;
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const browser = findChrome();
  console.log(`browser: ${browser}\n`);
  const ctx = await chromium.launchPersistentContext(path.join(tmp, "profile"), {
    executablePath: browser,
    headless: true,
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 },
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      `--host-resolver-rules=MAP www.facebook.com 127.0.0.1:${port}, MAP facebook.com 127.0.0.1:${port}`,
      "--ignore-certificate-errors"
    ]
  });

  try {
    const worker =
      ctx.serviceWorkers()[0] ||
      (await ctx.waitForEvent("serviceworker", { timeout: 15000 }).catch(() => {
        throw new Error(
          `${browser} didn't load the extension; it may ignore --load-extension. ` +
          "Set CHROME_PATH to Playwright's Chromium or Chrome for Testing."
        );
      }));
    const extId = new URL(worker.url()).host;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const set = async (settings) => {
      await worker.evaluate((s) => chrome.storage.sync.set(s), settings);
      await wait(400); // ruleset swap and storage events
    };
    const settle = () => wait(900); // longer than the 300ms scan debounce
    const landsOn = (page, url) => page.waitForURL(url, { timeout: 3000 }).then(() => true, () => false);

    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // Hard loads of "/" and Watch never reach the server.
    served.length = 0;
    await page.goto(FB + "/");
    check("hard load of / lands on the Friends feed", page.url() === FRIENDS, page.url());
    await page.goto(FB + "/watch/?v=123");
    check("hard load of /watch lands on the Friends feed", page.url() === FRIENDS, page.url());
    check("neither / nor /watch reached the server",
      !served.some((u) => u === "/" || u.startsWith("/watch")), served.join());
    await settle();

    // Friends feed: friend posts render, everything else is hidden.
    check("Friends feed is classified", (await pageType(page)) === "friends");
    check("Friends feed itself is visible", (await displays(page, '[role="feed"]'))[0] !== "none");
    for (const u of await units(page)) {
      const wantHidden = !["keep", "reshare"].includes(u.expect);
      check(`feed unit [${u.expect}] is ${wantHidden ? "hidden" : "visible"}`, u.hidden === wantHidden);
    }
    const navHidden = await displays(page, '[data-expect-css="hidden"]');
    check("Video, Gaming, Memories, Feeds, Ads links and Stories are hidden", navHidden.every((d) => d === "none"), navHidden.join());
    const navGone = await page.$$eval('[role="navigation"] a:not([data-expect-css])', (as) =>
      as.filter((a) => getComputedStyle(a).display === "none").map((a) => a.textContent));
    check("Friends, Saved, Marketplace, and group links stay", navGone.length === 0, navGone.join());
    check("composer stays on the Friends feed", (await displays(page, '[aria-label="Create a post"]'))[0] !== "none");
    const rail = await page.$$eval('[role="complementary"] [data-expect]', (els) =>
      els.map((e) => [e.dataset.expect, getComputedStyle(e).display === "none"]));
    check("right rail: Sponsored hidden, Birthdays and Contacts visible",
      rail.every(([expect, hidden]) => hidden === (expect !== "keep")), JSON.stringify(rail));
    const box = await (await page.$("[data-fbm-switcher]"))?.boundingBox();
    check("switcher is mounted on screen", !!box && box.width > 100, JSON.stringify(box));
    await shot(page, "1-friends-feed.png");

    // Opt-in toggles apply live.
    await set({ strictFriends: true });
    const strict = await units(page);
    check("strict: reshares hidden live", strict.filter((u) => u.expect === "reshare").every((u) => u.hidden));
    check("strict: friend posts still visible", strict.filter((u) => u.expect === "keep").every((u) => !u.hidden));
    await set({ hideFbComments: true });
    await settle();
    const comments = await displays(page, '[role="article"][aria-label^="Comment by"], [data-expect="fbc"]');
    check("comments, 'View more comments', and counts hidden", comments.every((d) => d === "none"), comments.join());
    await set({ debugOutline: true });
    const outlined = (await units(page)).filter((u) => u.expect !== "keep");
    check("debug: hidden units are outlined instead", outlined.every((u) => !u.hidden && u.outline === "dashed"));
    await shot(page, "2-debug.png", { fullPage: true });
    await set({ debugOutline: false, strictFriends: false, hideFbComments: false });

    // A friend's profile timeline renders.
    await page.goto(FB + "/maya.chen.7");
    await settle();
    check("profile is classified as other", (await pageType(page)) === "other");
    const profile = await displays(page, '[role="feed"], [role="feed"] > *');
    check("profile timeline and posts visible", profile.every((d) => d !== "none"), profile.join());

    // Client-side navigations bounce to home.
    await page.goto(MARKETPLACE);
    await settle();
    check("Marketplace is classified", (await pageType(page)) === "marketplace");
    await page.click("#spa-home");
    check("SPA navigation to / goes to the Friends feed", await landsOn(page, FRIENDS), page.url());
    await page.goto(MARKETPLACE);
    await settle();
    await page.click("#spa-reel");
    check("SPA navigation to /reel goes to the Friends feed", await landsOn(page, FRIENDS), page.url());

    // Home = Marketplace swaps both the network rules and the in-page redirect.
    await set({ homePage: "marketplace" });
    await page.goto(FB + "/");
    check("home=marketplace: / lands on Marketplace", page.url() === MARKETPLACE, page.url());
    await page.goto(FRIENDS);
    check("home=marketplace: Friends feed still reachable", page.url() === FRIENDS, page.url());
    await settle();
    await page.evaluate(() => history.pushState({}, "", "/"));
    check("home=marketplace: SPA / goes to Marketplace", await landsOn(page, MARKETPLACE), page.url());

    // Main toggle off: Facebook behaves normally.
    await set({ hideFbFeed: false, homePage: "friends" });
    await page.goto(FB + "/");
    await settle();
    check("off: / is served as-is", page.url() === FB + "/", page.url());
    check("off: ranked feed visible", (await displays(page, '[role="feed"]'))[0] !== "none");
    check("off: switcher hidden", (await displays(page, "[data-fbm-switcher]")).every((d) => d === "none"));
    await set({ hideFbFeed: true });
    check("back on: an open / page redirects to Friends", await landsOn(page, FRIENDS), page.url());

    // Popup reflects storage.
    await set({ strictFriends: true, homePage: "marketplace" });
    const popup = await ctx.newPage();
    await popup.setViewportSize({ width: 300, height: 420 });
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.waitForTimeout(300);
    const state = await popup.evaluate(() => ({
      master: document.getElementById("hideFbFeed").checked,
      strict: document.getElementById("strictFriends").checked,
      home: document.querySelector('input[name="homePage"]:checked')?.value
    }));
    check("popup reflects storage", state.master && state.strict && state.home === "marketplace", JSON.stringify(state));
    await shot(popup, "3-popup.png", { fullPage: true });

    check("no page errors", errors.length === 0, errors.join(" | "));
  } finally {
    await ctx.close();
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log(failures ? `\n${failures} FAILED` : "\nall passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
