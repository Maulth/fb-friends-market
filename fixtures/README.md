# Fixtures

Saved Facebook pages that the tests run the scanners against. `friends-feed.html` and `profile.html` are **synthetic**: they were written by hand to match Facebook's ARIA structure, not captured from a live session. Replace or add to them with real captures when you can. A real capture is the only way to know the selectors still match what Facebook actually sends.

## Annotating

Each feed unit (a direct child of `role="feed"`) gets a `data-expect`:

| Value | Meaning |
|---|---|
| `keep` | A friend's post. It must not be tagged. |
| `sponsored`, `suggested`, `follow`, `reels`, `pymk` | It must get `data-fbm-hide` with that reason. |
| `reshare` | It must get `data-fbm-reshare` and no `data-fbm-hide`. |

Right-rail sections use the same values. `data-expect="fbc"` marks comment links the comment scanner must tag, and `data-expect-css="hidden"` marks elements the browser test expects the CSS to hide.

## Capturing a real page

1. Open the page on facebook.com and scroll until the units you care about have loaded.
2. Paste this into the DevTools console. It copies the page's HTML with class names, inline styles, images, and scripts stripped:

   ```js
   copy((() => {
     const doc = document.documentElement.cloneNode(true);
     doc.querySelectorAll("script, style, link, noscript, img, video, image").forEach((el) => el.remove());
     doc.querySelectorAll("*").forEach((el) => {
       for (const attr of ["class", "style", "src", "srcset"]) el.removeAttribute(attr);
     });
     return "<!DOCTYPE html>\n" + doc.outerHTML;
   })());
   ```

   The script keeps the whole document on purpose. Facebook often renders the "Sponsored" label outside the post and points at it by id (`aria-labelledby`, SVG `<use href="#...">`), so cutting out only the feed would lose that label.
3. Save the result as `fixtures/<name>.html`.
4. **Sanitize it.** Replace real names, profile URLs, post text, and anything else personal with made-up values. Check for tokens in URLs, such as `__cft__`, `__tn__`, and `fbclid` query strings.
5. Add `data-expect` to each unit, then add a test in `test/scan.test.js` that loads the new fixture (copy the friends-feed test).
