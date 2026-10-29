const DEFAULTS = {
  hideFbFeed: true,
  homePage: "friends",
  strictFriends: false,
  allowReels: false,
  hideFbComments: false,
  debugOutline: false
};

// Rows that only matter while the main toggle is on are dimmed when it's off.
function syncDependents(master) {
  for (const row of document.querySelectorAll('[data-needs="hideFbFeed"]')) {
    row.classList.toggle("inactive", !master);
  }
}

chrome.storage.sync.get(DEFAULTS, (settings) => {
  for (const key of Object.keys(DEFAULTS)) {
    if (typeof DEFAULTS[key] === "boolean") {
      const box = document.getElementById(key);
      box.checked = settings[key] === true;
      box.addEventListener("change", () => {
        chrome.storage.sync.set({ [key]: box.checked });
        if (key === "hideFbFeed") syncDependents(box.checked);
      });
    } else {
      for (const radio of document.querySelectorAll(`input[name="${key}"]`)) {
        radio.checked = radio.value === settings[key];
        radio.addEventListener("change", () => {
          if (radio.checked) chrome.storage.sync.set({ [key]: radio.value });
        });
      }
    }
  }
  syncDependents(settings.hideFbFeed);
});
