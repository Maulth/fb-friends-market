/*
 * Keeps the network-level Facebook redirect rules in sync with settings.
 * Content-script hiding is gated separately (see gate.js); this only picks
 * which declarativeNetRequest rulesets are live:
 *
 *   rules_friends      "/" and Watch/Reels/Stories go to the Friends feed
 *   rules_marketplace  the same, but they go to Marketplace
 *   rules_reels        on top of either: lets reel pages through (Allow Reels)
 *   none               the main toggle is off; facebook.com behaves normally
 *
 * Both home rulesets let the Friends feed URL through untouched.
 */
const RULESETS = {
  friends: "rules_friends",
  marketplace: "rules_marketplace"
};
const REELS_RULESET = "rules_reels";

function syncRedirectRules() {
  chrome.storage.sync.get(
    { hideFbFeed: true, homePage: "friends", allowReels: false },
    ({ hideFbFeed, homePage, allowReels }) => {
      const live = [];
      if (hideFbFeed) {
        live.push(RULESETS[homePage] || RULESETS.friends);
        if (allowReels) live.push(REELS_RULESET);
      }
      const all = [...Object.values(RULESETS), REELS_RULESET];
      chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: live,
        disableRulesetIds: all.filter((id) => !live.includes(id))
      });
    }
  );
}

chrome.runtime.onInstalled.addListener(syncRedirectRules);
chrome.runtime.onStartup.addListener(syncRedirectRules);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes.hideFbFeed || changes.homePage || changes.allowReels)) {
    syncRedirectRules();
  }
});
