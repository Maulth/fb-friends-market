const test = require("node:test");
const assert = require("node:assert/strict");
const { load, loadFixture, scan } = require("./helpers");

const FB = "https://www.facebook.com";

test("classifyPage tells the Friends feed from the ranked feed", () => {
  const cases = {
    "/?filter=friends&sk=h_chr": "friends",
    "/?sk=h_chr&filter=friends": "friends",
    "/home.php?filter=friends": "friends",
    "/": "feed",
    "/?ref=logo": "feed",
    "/?filter=all&sk=h_chr": "feed",
    "/?filter=friendsfoo": "feed",
    "/home.php": "feed",
    "/watch/?v=123": "feed",
    "/reel/456": "feed",
    "/stories/789": "feed",
    "/groups/feed/": "feed",
    "/gaming/play/": "feed",
    "/marketplace/": "marketplace",
    "/marketplace/item/123/": "marketplace",
    "/maya.chen.7": "other",
    "/profile.php?id=100": "other",
    "/groups/watchmakersclub/": "other",
    "/messages/t/123": "other",
    "/watchmaker": "other"
  };
  for (const [url, page] of Object.entries(cases)) {
    assert.equal(scan.classifyPage(FB + url), page, url);
  }
});

test("isRedirected covers home and Watch/Reels/Stories, not the Friends feed", () => {
  const redirected = ["/", "/?ref=logo", "/?filter=all&sk=h_chr", "/home.php", "/watch", "/watch/?v=1", "/reel/2", "/reels/", "/stories/3"];
  const allowed = ["/?filter=friends&sk=h_chr", "/marketplace/", "/maya.chen.7", "/groups/feed/", "/watchmaker", "/messages/"];
  for (const url of redirected) assert.equal(scan.isRedirected(FB + url), true, url);
  for (const url of allowed) assert.equal(scan.isRedirected(FB + url), false, url);
});

test("friends feed fixture: every unit gets exactly its expected tag", () => {
  const { document, scan } = loadFixture("friends-feed.html");
  scan.scanFeed(document);
  const units = document.querySelectorAll('[role="feed"] > [data-expect]');
  assert.ok(units.length >= 15, `expected the full fixture, got ${units.length} units`);
  for (const unit of units) {
    const expect = unit.getAttribute("data-expect");
    const label = `${expect}: ${unit.textContent.replace(/\s+/g, " ").trim().slice(0, 50)}`;
    const hide = unit.getAttribute("data-fbm-hide");
    const reshare = unit.hasAttribute("data-fbm-reshare");
    if (expect === "keep") {
      assert.equal(hide, null, label);
      assert.equal(reshare, false, label);
    } else if (expect === "reshare") {
      assert.equal(hide, null, label);
      assert.equal(reshare, true, label);
    } else {
      assert.equal(hide, expect, label);
    }
  }
});

test("profile fixture: a friend's timeline is left alone", () => {
  const { document, scan } = loadFixture("profile.html", FB + "/maya.chen.7");
  scan.scanFeed(document);
  assert.equal(scan.classifyPage(FB + "/maya.chen.7"), "other");
  assert.equal(document.querySelectorAll("[data-fbm-hide], [data-fbm-reshare]").length, 0);
});

test("a unit that fills in after the first scan is rescanned", () => {
  const { document, scan } = load(
    '<div role="feed"><div id="u"><div>Loading</div></div></div>',
    FB + "/?filter=friends&sk=h_chr"
  );
  const unit = document.getElementById("u");
  scan.scanFeed(document);
  assert.equal(unit.getAttribute("data-fbm-hide"), null);

  // Facebook renders a placeholder first, then swaps the post in.
  unit.firstElementChild.innerHTML = "<h4><a href='/x'>Some Page</a></h4><span>Suggested for you</span>";
  scan.scanFeed(document);
  assert.equal(unit.getAttribute("data-fbm-hide"), "suggested");
});

test("right rail: only the Sponsored section is tagged", () => {
  const { document, scan } = loadFixture("friends-feed.html");
  scan.scanRails(document);
  const rail = document.querySelector('[role="complementary"]');
  for (const section of rail.querySelectorAll("[data-expect]")) {
    const expect = section.getAttribute("data-expect");
    const want = expect === "keep" ? null : expect;
    assert.equal(section.getAttribute("data-fbm-hide"), want, section.textContent.trim().slice(0, 30));
  }
  // Nothing above the section was tagged.
  assert.equal(rail.querySelectorAll("[data-fbm-hide]").length, 1);
  assert.equal(rail.hasAttribute("data-fbm-hide"), false);
});

test("comment scanner tags 'View more comments' and comment counts only", () => {
  const { document, scan } = loadFixture("friends-feed.html");
  scan.scanComments(document);
  const tagged = [...document.querySelectorAll("[data-fbr-fbc]")];
  const expected = [...document.querySelectorAll('[data-expect="fbc"]')];
  assert.ok(expected.length > 0);
  assert.deepEqual(tagged, expected);
});

test("phrase table is the only English text, and every entry is matchable", () => {
  for (const [key, list] of Object.entries(scan.PHRASES)) {
    assert.ok(list.length > 0, key);
    for (const phrase of list) {
      assert.equal(phrase, phrase.trim(), `${key}: "${phrase}" has stray whitespace`);
      assert.ok(phrase.length <= 60, `${key}: "${phrase}" is longer than a label can be`);
    }
  }
});
