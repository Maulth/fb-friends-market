# GOAL: FB Friends & Market v0.2

Make facebook.com show only my friends' activity and Marketplace. Read `GAP_ANALYSIS.md` first; it's the spec. Work the gaps in this order: G1, G3, G2, G4, G7, G9.

## Constraints
- Manifest V3, Chrome first (Firefox later). No build step: plain JS/CSS like upstream.
- Keep upstream's architecture: `gate.js` toggles, CSS-only hiding from first paint, scanners only *tag* elements with `data-*` attributes (never remove nodes, never intercept events or network beyond the existing DNR rules).
- Selectors: `role`, `aria-label`, and URL structure only. Never Facebook class names.
- Permissions must not grow beyond `declarativeNetRequest`, `storage`, and facebook.com hosts.
- Keep the MIT license and Zuckless attribution in README and LICENSE.

## Done when
1. `facebook.com/` lands on the Friends feed (configurable to Marketplace).
2. The Friends feed and friends' profile timelines render. The main ranked feed, Watch, Reels, and Stories never do.
3. No "Suggested for you", sponsored, Reels, or "People you may know" units appear in the Friends feed.
4. A persistent Friends | Marketplace switcher is visible on every facebook.com page.
5. Popup toggles: default home, strict friends (hide reshares), hide comments, debug outline mode.
6. `npm test` runs jsdom scanner tests against fixtures in `fixtures/` and passes.

## Verify manually
Load unpacked in Chrome. Then check: the logo click, back/forward navigation, a hard refresh on `/`, opening a friend's profile, a Marketplace listing, and Messenger. All must behave as above with no flash of hidden content.

## Open question to confirm in a live browser first
The exact friends-feed URL (expected `/?filter=friends&sk=h_chr`).
