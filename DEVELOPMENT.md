# Development

Technical notes for working on FB Friends & Market. The user-facing install guide is in [README.md](README.md). The original plan and gap analysis are in [docs/](docs/).

## Running from source

1. Clone the repo.
2. Open `edge://extensions` (or `chrome://extensions`) and turn on Developer mode.
3. Click "Load unpacked" and pick the repo folder.
4. After changing code, click Reload on the extension's card.

## How it works

Everything follows upstream Zuckless's rules: hiding is CSS-only from first paint, scripts only *tag* elements with `data-*` attributes and never remove nodes or intercept events, and selectors use ARIA roles, `aria-label`s, and URLs, never Facebook's class names. Permissions are `declarativeNetRequest`, `storage`, and facebook.com only.

| File | Role |
|---|---|
| `rules_friends.json`, `rules_marketplace.json` | Network redirects. Both let the Friends feed URL through. `background.js` enables the one that matches the Home page setting, or neither when the extension is off. |
| `gate.js` | Upstream's toggle system. Settings become tokens on `<html data-fbr-allow / data-fbr-deny>`. |
| `scan.js` | Page classification, plus the scanners that tag feed units (`data-fbm-hide="<reason>"`, `data-fbm-reshare`), the right rail, and comment links. It holds the English phrase table. |
| `facebook.js` | Sets `<html data-fbm-page="friends|feed|marketplace|other">`, redirects SPA navigations, runs the scanners on DOM changes, and mounts the Friends/Marketplace switcher in a closed shadow root. |
| `facebook.css` | Hides by role, label, URL, and tag, gated on those attributes. Each hide rule is written once, and a nested block turns it into an outline in debug mode. |
| `popup.*` | The settings popup. Keys and defaults are in `popup.js`. |
| `icons/icon.svg` | Source for the PNG icons. |

## Things to re-check against live Facebook

The code is tested against synthetic fixtures and in real Edge and Chromium, but Facebook's markup changes without notice.

1. **The Friends feed URL.** The extension assumes `https://www.facebook.com/?filter=friends&sk=h_chr`. If Facebook moves it, change `FRIENDS_URL` in `scan.js` and the redirect URL in `rules_friends.json`. `npm test` fails until the two match.
2. **Manual checks:** a logo click, back/forward, a hard refresh on `/`, opening a friend's profile, a Marketplace listing, and Messenger. None of them should flash hidden content.
3. **Debug outlines** on a scrolled Friends feed. Every red-labeled post should be junk, and no friend post should carry a label.

## When Facebook changes

1. Turn on Debug outlines to see what's being caught and what isn't.
2. Capture the broken part of the page as a fixture (see `fixtures/README.md`), and annotate each feed unit with `data-expect`.
3. Run `npm test`, then fix `scan.js` or `facebook.css` until it passes.

## Tests

```
npm install
npm test               # jsdom: scanners against fixtures/, DNR rules vs. the in-page redirect
npm run test:browser   # real browser: loads the extension, checks CSS, redirects, toggles, SPA nav
```

`test:browser` serves the fixtures as `www.facebook.com` from a local HTTPS server, so it never contacts Facebook. It needs `openssl` on PATH and a browser that honors `--load-extension`: Edge, Playwright's Chromium, or Chrome for Testing (branded Chrome 137+ ignores the flag). It uses `CHROME_PATH` if set, otherwise your installed Edge, otherwise Playwright's Chromium. It runs in a throwaway profile. Set `SCREENSHOTS=<dir>` to keep screenshots, or `EXTENSION_DIR=<dir>` to test an unzipped release instead of the repo.

## Releasing

1. Bump `version` in `manifest.json` and `package.json`.
2. Run `npm test` and `npm run test:browser`.
3. Run `npm run package`. This builds `dist/fb-friends-market.zip` from the files `manifest.json` and `popup.html` reference.
4. Optional: unzip it somewhere and run `EXTENSION_DIR=<that folder> npm run test:browser`.
5. Publish it: `gh release create vX.Y.Z dist/fb-friends-market.zip --title "vX.Y.Z" --notes "..."`

Keep the asset name `fb-friends-market.zip` and don't mark the release as a pre-release. The README's download button links to `releases/latest/download/fb-friends-market.zip`, which only resolves for the latest full release with that exact file name.

## Limits

- **English only.** Feed filtering matches English phrases ("Sponsored", "Suggested for you"...). They all live in `PHRASES` and `RESHARE_RE` in `scan.js`, so adding a language means editing that one table. Redirects, page classification, and ARIA-based hiding work in any language.
- **Sponsored labels are obfuscated** by Facebook. The scanner checks the label text, `aria-labelledby` and SVG `<use>` references, "About this ad" links, and ad call-to-action buttons. It can still miss a new trick.
- **Desktop only, and hide-only.** It can't touch the Facebook apps, and it can't reorder posts (the Friends feed is already chronological).

## Upstream

Forked from [Zuckless](https://github.com/scottylad007/zuckless) (MIT). Add it as a remote with `git remote add upstream https://github.com/scottylad007/zuckless.git`. The fork has diverged enough that merges need hand-resolution in `facebook.js` and `facebook.css`.
