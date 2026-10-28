/*
 * Page classification and DOM scanners, shared by facebook.js and the jsdom
 * tests in test/. Nothing here reads settings or touches the network. The
 * scanners only ever *tag* elements with data attributes; facebook.css
 * decides what each tag hides, and only while the matching toggle is on.
 *
 * Tags written:
 *   data-fbm-hide="<reason>"  feed unit or rail section that is never a
 *                             friend post (sponsored, suggested, pymk,
 *                             reels, follow). Always hidden.
 *   data-fbm-reshare          a friend's reshare or link post. Hidden only
 *                             in strict mode.
 *   data-fbr-fbc              "View more comments" links and comment
 *                             counts. Hidden only when comments are hidden.
 *
 * Language: ARIA roles and URLs are language-neutral, but the phrases below
 * are English. They all live in PHRASES and RESHARE_RE so another language
 * is a change to this one table.
 */
window.__fbmScan = (() => {
  "use strict";

  const ORIGIN = "https://www.facebook.com";
  // The chronological Friends feed. Facebook has moved this before; if it
  // changes, update it here and in rules_friends.json/rules_marketplace.json.
  const FRIENDS_URL = ORIGIN + "/?filter=friends&sk=h_chr";
  const MARKETPLACE_URL = ORIGIN + "/marketplace/";

  // Exact, case-insensitive matches against short text or aria-labels.
  const PHRASES = {
    // The ad label in a post header and the right-rail section heading.
    sponsored: ["Sponsored"],
    // Call-to-action buttons that only ads carry. "Learn more" is left out
    // on purpose: Facebook also puts it on info labels under normal posts.
    adCta: [
      "Shop now", "Install now", "Book now", "Get offer", "Apply now",
      "Order now", "Sign up", "Get quote", "Download", "Play game",
      "Buy tickets", "Use app", "Listen now", "See menu", "Get showtimes"
    ],
    suggested: [
      "Suggested for you", "Suggested post", "Suggested posts",
      "Suggested groups", "Suggested pages", "Suggested reels",
      "Suggested videos", "Recommended for you", "Recommended post",
      "Popular near you"
    ],
    pymk: ["People you may know", "Friend suggestions"],
    reels: ["Reels", "Reels and short videos", "Short videos"],
    // Friends' posts never carry these; pages and groups you don't follow do.
    follow: ["Follow", "Join", "Join group"]
  };

  // Post header of a reshare: "Sam shared a post." / "Sam shared CNN's video."
  // A friend sharing their own memory is left alone.
  const RESHARE_RE =
    /\bshared (a|an|[^.]{1,60}?['’]s) (post|link|reel|video|photo|album|event)\b/i;

  // Facebook's tracking redirect wraps every outbound link.
  const LINK_SHIM = 'a[href*="l.facebook.com/l.php"], a[href^="https://l.facebook.com/"]';
  const AD_LINKS = 'a[href*="/ads/about"], a[href^="/ads/"], a[href*="facebook.com/ads/"]';

  const TEXTY = "span, strong, a, h2, h3, h4, [role='heading']";
  const HEADINGS = "h2, h3, h4, [role='heading']";
  const CONTROLS = "a, button, [role='button'], [role='link']";
  const COMMENTS =
    '[role="article"][aria-label^="Comment"], [role="article"][aria-label^="Reply"], ' +
    '[aria-label^="Write a comment"]';

  // Text over this length is post content, not a label.
  const MAX_LABEL = 60;

  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

  const LOOKUP = {};
  for (const key of Object.keys(PHRASES)) {
    LOOKUP[key] = new Set(PHRASES[key].map(norm));
  }

  // ---- Page classification -------------------------------------------------

  const JUNK_PATHS = [
    /^\/watch([/?]|$)/,
    /^\/reel([/?]|$)/,
    /^\/reels([/?]|$)/,
    /^\/stories([/?]|$)/
  ];
  // Ranked feeds we hide in place rather than redirect away from.
  const RANKED_PATHS = [/^\/groups\/feed([/?]|$)/, /^\/gaming([/?]|$)/];

  function parse(href) {
    return new URL(href, ORIGIN);
  }

  function isHomePath(path) {
    return path === "/" || path === "/home.php";
  }

  // friends | feed | marketplace | other. "feed" means a ranked feed that
  // must never render; facebook.css keys off this.
  function classifyPage(href) {
    const url = parse(href);
    const path = url.pathname;
    if (isHomePath(path)) {
      return url.searchParams.get("filter") === "friends" ? "friends" : "feed";
    }
    if (JUNK_PATHS.some((re) => re.test(path))) return "feed";
    if (RANKED_PATHS.some((re) => re.test(path))) return "feed";
    if (/^\/marketplace([/?]|$)/.test(path)) return "marketplace";
    return "other";
  }

  // Mirrors the declarativeNetRequest rules, for client-side navigations.
  function isRedirected(href) {
    const url = parse(href);
    const path = url.pathname;
    if (isHomePath(path)) return url.searchParams.get("filter") !== "friends";
    return JUNK_PATHS.some((re) => re.test(path));
  }

  // ---- Matching helpers ----------------------------------------------------

  function inComments(el) {
    return el.closest(COMMENTS) !== null;
  }

  function labelText(el) {
    if (el.childElementCount > 4) return null;
    const text = el.textContent;
    return text.length <= MAX_LABEL ? norm(text) : null;
  }

  function textIs(el, key) {
    const text = labelText(el);
    return text !== null && LOOKUP[key].has(text);
  }

  function anyText(scope, selector, key) {
    for (const el of scope.querySelectorAll(selector)) {
      if (textIs(el, key) && !inComments(el)) return true;
    }
    return false;
  }

  function anyLabel(scope, key) {
    for (const el of scope.querySelectorAll("[aria-label]")) {
      if (LOOKUP[key].has(norm(el.getAttribute("aria-label"))) && !inComments(el)) {
        return true;
      }
    }
    return false;
  }

  function anyLink(scope, selector) {
    for (const el of scope.querySelectorAll(selector)) {
      if (!inComments(el)) return true;
    }
    return false;
  }

  // Facebook often renders the ad label somewhere else in the document and
  // points at it, via aria-labelledby or an SVG <use> reference.
  function anyReferenced(scope, key) {
    const doc = scope.ownerDocument;
    for (const el of scope.querySelectorAll("[aria-labelledby]")) {
      if (inComments(el)) continue;
      for (const id of el.getAttribute("aria-labelledby").split(/\s+/)) {
        const target = id && doc.getElementById(id);
        if (target && textIs(target, key)) return true;
      }
    }
    for (const use of scope.querySelectorAll("use")) {
      const ref = use.getAttribute("href") || use.getAttribute("xlink:href") || "";
      const target = ref.startsWith("#") && doc.getElementById(ref.slice(1));
      if (target && textIs(target, key)) return true;
    }
    return false;
  }

  // ---- Feed units ----------------------------------------------------------

  function isSponsored(unit) {
    return (
      anyLink(unit, AD_LINKS) ||
      anyLabel(unit, "sponsored") ||
      anyText(unit, TEXTY, "sponsored") ||
      anyReferenced(unit, "sponsored") ||
      anyText(unit, CONTROLS, "adCta")
    );
  }

  // Why a feed unit is not a friend's post, or null if it is one.
  function unitReason(unit) {
    if (isSponsored(unit)) return "sponsored";
    if (anyText(unit, TEXTY, "suggested") || anyLabel(unit, "suggested")) return "suggested";
    if (anyText(unit, TEXTY, "pymk") || anyLabel(unit, "pymk")) return "pymk";
    if (anyText(unit, HEADINGS, "reels") || anyLabel(unit, "reels")) return "reels";
    if (anyText(unit, CONTROLS, "follow") || anyLabel(unit, "follow")) return "follow";
    return null;
  }

  function isReshare(unit) {
    if (anyLink(unit, LINK_SHIM)) return true;
    for (const el of unit.querySelectorAll(HEADINGS)) {
      if (el.textContent.length <= 200 && RESHARE_RE.test(el.textContent) && !inComments(el)) {
        return true;
      }
    }
    return false;
  }

  // Units fill in lazily, so a unit is rescanned whenever its element count
  // changes. Hidden units are final.
  const unitSizes = new WeakMap();

  function scanFeed(root) {
    for (const feed of root.querySelectorAll('[role="feed"]')) {
      for (const unit of feed.children) {
        if (unit.hasAttribute("data-fbm-hide")) continue;
        const size = unit.getElementsByTagName("*").length;
        if (unitSizes.get(unit) === size) continue;
        unitSizes.set(unit, size);

        const reason = unitReason(unit);
        if (reason) {
          unit.setAttribute("data-fbm-hide", reason);
        } else if (!unit.hasAttribute("data-fbm-reshare") && isReshare(unit)) {
          unit.setAttribute("data-fbm-reshare", "");
        }
      }
    }
  }

  // ---- Right rail ----------------------------------------------------------

  // Climb from a section's label to the largest ancestor that holds no
  // other heading, which is that section and nothing else.
  function sectionOf(label, boundary) {
    let node = label;
    while (node.parentElement && node.parentElement !== boundary) {
      const parent = node.parentElement;
      const other = Array.from(parent.querySelectorAll(HEADINGS)).some(
        (h) => !h.contains(label) && !label.contains(h)
      );
      if (other) break;
      node = parent;
    }
    return node;
  }

  function scanRails(root) {
    for (const rail of root.querySelectorAll('[role="complementary"]')) {
      for (const el of rail.querySelectorAll(TEXTY)) {
        if (!textIs(el, "sponsored")) continue;
        const section = sectionOf(el, rail);
        if (!section.hasAttribute("data-fbm-hide")) {
          section.setAttribute("data-fbm-hide", "sponsored");
        }
      }
    }
  }

  // ---- Comments ------------------------------------------------------------

  // Most comment UI is caught by pure CSS (facebook.css), but "View more
  // comments" links and comment counts have no stable attributes.
  const COMMENT_TEXT_RE =
    /^(view|see) ([\d,]+ )?(more |previous |all )?(comments?|repl(y|ies))$|^[\d,.]+[KM]? comments?$/i;

  function scanComments(root) {
    for (const el of root.querySelectorAll(
      'div[role="button"], span[role="button"], span[dir="auto"]'
    )) {
      if (
        !el.hasAttribute("data-fbr-fbc") &&
        el.childElementCount <= 2 &&
        el.textContent.length < 40 &&
        COMMENT_TEXT_RE.test(el.textContent.trim())
      ) {
        el.setAttribute("data-fbr-fbc", "");
      }
    }
  }

  return {
    FRIENDS_URL,
    MARKETPLACE_URL,
    PHRASES,
    classifyPage,
    isRedirected,
    unitReason,
    isReshare,
    scanFeed,
    scanRails,
    scanComments
  };
})();
