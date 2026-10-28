/*
 * Keeps the network-level Facebook redirect rules in sync with settings.
 * Content-script hiding is gated separately (see gate.js); this only picks
 * which declarativeNetRequest ruleset is live:
 *
 *   rules_friends      "/" and Watch/Reels/Stories go to the Friends feed
 *   rules_marketplace  the same, but they go to Marketplace
 *   neither            the main toggle is off; facebook.com behaves normally
 *
 * Both rulesets let the Friends feed URL through untouched.
 */
const RULESETS = {
  friends: "rules_friends",
  marketplace: "rules_marketplace"
};

function syncRedirectRules() {
  chrome.storage.sync.get(
    { hideFbFeed: true, homePage: "friends" },
    ({ hideFbFeed, homePage }) => {
      const live = hideFbFeed ? RULESETS[homePage] || RULESETS.friends : null;
      const all = Object.values(RULESETS);
      chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: live ? [live] : [],
        disableRulesetIds: all.filter((id) => id !== live)
      });
    }
  );
}

chrome.runtime.onInstalled.addListener(syncRedirectRules);
chrome.runtime.onStartup.addListener(syncRedirectRules);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes.hideFbFeed || changes.homePage)) {
    syncRedirectRules();
  }
});
