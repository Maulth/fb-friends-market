const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, scan, readJson } = require("./helpers");

const manifest = readJson("manifest.json");
const rulesets = Object.fromEntries(
  manifest.declarative_net_request.rule_resources.map((r) => [r.id, readJson(r.path)])
);

// Just enough of declarativeNetRequest's matching for main_frame requests:
// the highest priority wins, and at equal priority "allow" beats "redirect".
function dnr(rules, url) {
  const hits = rules
    .filter((r) => r.condition.resourceTypes.includes("main_frame"))
    .filter((r) => new RegExp(r.condition.regexFilter).test(url))
    .sort((a, b) => b.priority - a.priority || (a.action.type === "allow" ? -1 : 1));
  if (!hits.length) return null;
  const { type, redirect } = hits[0].action;
  return type === "redirect" ? redirect.url : "allow";
}

const URLS = [
  "https://www.facebook.com/",
  "https://facebook.com/",
  "https://www.facebook.com/?ref=logo",
  "https://www.facebook.com/?sk=h_nor",
  "https://www.facebook.com/?filter=all&sk=h_chr",
  "https://www.facebook.com/?filter=friendsfoo",
  "https://www.facebook.com/?filter=friends&sk=h_chr",
  "https://www.facebook.com/?sk=h_chr&filter=friends",
  "https://www.facebook.com/home.php",
  "https://www.facebook.com/home.php?filter=friends",
  "https://www.facebook.com/watch",
  "https://www.facebook.com/watch/?v=123",
  "https://www.facebook.com/reel/456",
  "https://www.facebook.com/reels/",
  "https://www.facebook.com/stories/789/",
  "https://www.facebook.com/marketplace/",
  "https://www.facebook.com/marketplace/item/1/",
  "https://www.facebook.com/maya.chen.7",
  "https://www.facebook.com/watchmaker",
  "https://www.facebook.com/groups/feed/",
  "https://www.facebook.com/messages/t/1"
];

test("manifest lists both rulesets, Friends live by default", () => {
  assert.deepEqual(
    manifest.declarative_net_request.rule_resources.map((r) => [r.id, r.enabled]),
    [["rules_friends", true], ["rules_marketplace", false]]
  );
  // background.js must know the same ids.
  const bg = fs.readFileSync(path.join(ROOT, "background.js"), "utf8");
  for (const id of Object.keys(rulesets)) assert.ok(bg.includes(`"${id}"`), id);
});

test("each ruleset sends home to its target and lets the Friends feed through", () => {
  const targets = { rules_friends: scan.FRIENDS_URL, rules_marketplace: scan.MARKETPLACE_URL };
  for (const [id, rules] of Object.entries(rulesets)) {
    const home = targets[id];
    assert.equal(dnr(rules, "https://www.facebook.com/"), home, id);
    assert.equal(dnr(rules, "https://www.facebook.com/watch/?v=1"), home, id);
    assert.equal(dnr(rules, scan.FRIENDS_URL), "allow", id);
    // No redirect lands somewhere that redirects again.
    for (const rule of rules.filter((r) => r.action.type === "redirect")) {
      const next = dnr(rules, rule.action.redirect.url);
      assert.ok(next === null || next === "allow", `${id} rule ${rule.id} loops`);
    }
  }
});

test("network rules and the in-page watcher agree on every URL", () => {
  for (const rules of Object.values(rulesets)) {
    for (const url of URLS) {
      const result = dnr(rules, url);
      const networkRedirects = result !== null && result !== "allow";
      assert.equal(networkRedirects, scan.isRedirected(url), url);
    }
  }
});

test("regexFilters stay inside RE2 (no lookaround, no backreferences)", () => {
  for (const [id, rules] of Object.entries(rulesets)) {
    const ids = rules.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, `${id} has duplicate rule ids`);
    for (const rule of rules) {
      const re = rule.condition.regexFilter;
      assert.doesNotMatch(re, /\(\?[=!<]|\\[1-9]/, `${id} rule ${rule.id}`);
    }
  }
});

test("manifest stays within store limits and loads scripts in order", () => {
  assert.ok(manifest.description.length <= 132, `description is ${manifest.description.length} chars`);
  assert.deepEqual(manifest.content_scripts[0].js, ["gate.js", "scan.js", "facebook.js"]);
  assert.deepEqual(manifest.permissions, ["declarativeNetRequest", "storage"]);
});
