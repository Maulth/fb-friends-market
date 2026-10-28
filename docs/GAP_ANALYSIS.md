# Gap Analysis: Zuckless → FB Friends & Market

**Target:** Facebook shows only (1) what my friends are doing and (2) Marketplace. Nothing algorithmic, nothing suggested, nothing designed to provoke.

**Base:** [Zuckless](https://github.com/scottylad007/zuckless) v1.3.0 (MIT, Manifest V3, last commit 2026-07-23). The upstream is kept as the `upstream` remote.

## Status at v0.2.0

| Gap | Status | Notes |
|---|---|---|
| G1 Friends feed carved out | Done | Friends is the default home. An `allow` rule at priority 2 exempts `filter=friends`. `data-fbm-page` scopes the feed hide to ranked feeds, and the feed is also hidden before classification, so nothing flashes. |
| G2 Filtering inside the Friends feed | Done (English) | Covers sponsored, suggested, Follow/Join, Reels shelves, and PYMK. Strict mode adds reshares and link posts. |
| G3 Friends / Marketplace nav | Done, placed differently | Placed **bottom-left**, not at the top. A top bar would collide with Facebook's own banner and center tabs, and the bottom center collides with the Messenger composer. |
| G4 Rails and nav clutter | Done | Nav links are matched by URL. The right rail's Sponsored section is found by its heading. |
| G5 Marketplace cleanup | Not started | |
| G6 Notifications | Not started | |
| G7 Settings | Done | The popup has the main switch, Home page (Friends/Market), Strict friends, Hide comments, and Debug outlines. |
| G8 Language | Documented | Every phrase lives in `PHRASES` / `RESHARE_RE` in `scan.js`. |
| G9 Tests and debug | Done | `npm test` runs jsdom against the fixtures and checks the DNR rules against the in-page redirect. `npm run test:browser` loads the extension in Chromium against the fixtures. The fixtures are synthetic, so swap in real captures (`fixtures/README.md`). |

**Still unverified against live Facebook:** the Friends feed URL, and every `aria-label` and text phrase. The checks to run are in the README.

## Why Zuckless

| Candidate | License | Last update | Verdict |
|---|---|---|---|
| **Zuckless** | MIT | Jul 2026 | **Chosen.** MV3, Marketplace redirect already built, ARIA-based selectors, clean toggle architecture |
| FB Hide Recommendations and Reels | MIT | Feb 2024 | Stale. Heavy TypeScript/webpack. Language-keyed text matching. Useful only as a reference for suggested-post detection (`src/lib/langs.ts`) |
| BasedBook | none stated | small | 40-line userscript that redirects to the chronological feed (`?filter=all&sk=h_chr`). Good proof of the redirect idea, but it isn't an extension and has no license |
| FreshBook | AGPL-3.0 | unknown | Firefox-only, 7 users, and AGPL is heavier to fork than MIT |

## What Zuckless already gives us (keep)

- **Marketplace as home.** Network-level `declarativeNetRequest` redirect plus an SPA navigation watcher. There's no flash of the feed.
- **Watch, Reels, and Stories killed.** Those URLs redirect to Marketplace.
- **Selector strategy.** It targets `role="feed"` and `aria-label` values instead of Facebook's obfuscated classes, which is the most durable approach available.
- **Gate system** (`gate.js`). Per-feature toggles via data attributes on `<html>`, with live on/off and no reload. Hiding is CSS-only from first paint.
- **Minimal permissions.** It only asks for `declarativeNetRequest`, `storage`, and access to facebook.com.
- **Optional comment hiding.** Opt-in. Keep it as an option, since comment sections are where most of the rage bait lives.

## Fork changes already made (v0.1.0)

- Removed the Instagram, YouTube, and X/Twitter modules, store assets, and funding config.
- Renamed to "FB Friends & Market" and trimmed the popup to the two Facebook toggles.
- **Behavior is unchanged.** The fork currently behaves exactly like Zuckless on Facebook.

## Gaps

### G1. Friends feed is blocked, not shown. Critical, blocks the core goal.
Zuckless treats every feed as bad. Three things conflict with the spec:
- `rules.json` rule 1 regex `^https?://(www\.)?facebook\.com/?(\?.*)?$` matches **any query string on `/`**, so the friends feed URL `/?filter=friends&sk=h_chr` gets redirected to Marketplace. I verified this by testing the regex.
- `facebook.js` blocks pathname `/` regardless of query, so client-side navigation to the friends feed is also bounced.
- `facebook.css` hides `div[role="feed"]` **everywhere**, which hides the friends feed and friends' profile timelines too.

**Fix:**
- Redirect bare `/` (no query) to the friends feed instead of Marketplace.
- Exempt `filter=friends` in both the DNR rule (higher-priority `allow` rule, or a tighter regex) and the JS watcher.
- Scope the `role="feed"` hide so it applies on the main ranked feed only, not on the friends feed or profile pages. Gate it with a page-type attribute set by `facebook.js` (for example `<html data-fbm-page="friends|profile|other">`).

**To verify:** the exact friends-feed URL. `?filter=friends&sk=h_chr` is the widely cited one, but check it in a logged-in browser, since Facebook changes these.

### G2. No filtering inside the friends feed. High.
Even the Friends feed can carry non-friend content: "Suggested for you" units, sponsored posts, Reels shelves, "People you may know," and friends' shares of pages. Zuckless has no per-post filtering because it never needed any.

**Fix:** add a MutationObserver scanner, in the same style as Zuckless's comment scanner, that tags posts inside `role="feed"` with `data-fbm-hide` when:
- the post header contains "Suggested for you", "Sponsored", or "Follow"/"Join" buttons, or
- the post is a Reels or "People you may know" unit.

Hide tagged posts via CSS. Port the phrase list from FB Hide Recommendations' `langs.ts`, English only to start.

**Optional, stricter mode:** hide reshares of public-page content so only original friend posts show.

### G3. No navigation between the two halves. Medium.
Once the home page and nav chrome are hidden or redirected, there's no obvious way to hop between Friends and Marketplace.

**Fix:** inject a small fixed two-tab bar ("Friends" / "Marketplace") at the top of facebook.com pages, or replace the Facebook logo link target. Keep it out of the page's React tree by using a shadow-DOM host element.

### G4. Left/right rails and nav clutter remain. Medium.
The left nav (Gaming, Video, Memories, Feeds), right rail (sponsored, contacts, birthdays), and top nav icons (Watch, Gaming) are all still visible.

**Fix:** add CSS rules for `div[role="navigation"]` children by `aria-label` and the "Sponsored" right-rail section. Leave Messenger, notifications, and Marketplace nav visible.

### G5. Marketplace isn't cleaned up. Low.
Marketplace has its own algorithmic junk: "Today's picks" ranking, sponsored listings, and suggested categories.

**Fix (later):** hide sponsored Marketplace tiles and default to a saved search or sort-by-newest URL (for example `/marketplace/<city>/search?sortBy=creation_time_descend`). Verify the params live.

### G6. Notifications still pull you into the engagement layer. Low.
Notifications for "a page you might like posted…" or "memories" lead back to junk.

**Fix (later):** hide notification items that aren't about friend activity or Marketplace messages. This is text-matched and fragile, so make it opt-in.

### G7. Settings are stale. Low.
- Popup labels still describe "hide feed, send home to Marketplace." Rename the toggles to the new model: Friends-only feed, Strict friends (no reshares), Hide comments, Marketplace as default home vs. Friends as default home.
- Add a "default landing page" choice: Friends or Marketplace.

### G8. Language dependence. Low (you're on English).
G2 and G6 depend on English text matching. ARIA hooks are language-independent, but text phrases aren't. Document this and keep the phrases in one table.

### G9. Maintenance and verification. Ongoing.
- No tests upstream. Add a `fixtures/` folder of saved Facebook HTML snapshots (sanitized) and a tiny Node/jsdom test that runs the scanners against them, so you can tell when Facebook breaks a selector.
- Add a debug toggle that outlines hidden elements instead of removing them, for diagnosing breakage.

## Out of scope / not possible

- **Mobile apps.** Extensions only affect desktop browsers, or Firefox for Android at best.
- **Using the API.** Covered earlier: there is no API path to friends' posts or Marketplace browsing.
- **Reordering or re-ranking posts.** We can only hide what Facebook sends. The Friends feed is already chronological.

## Suggested build order

1. G1: carve out the friends feed. Make Friends the default home.
2. G3: two-tab nav.
3. G2: suggested and sponsored scanner inside the friends feed.
4. G4: rails and nav cleanup.
5. G7: popup settings.
6. G9: fixtures and debug outline mode.
7. G5, G6: Marketplace and notifications polish.
