const DEFAULTS = {
  hideFbFeed: true,
  hideFbComments: false
};

chrome.storage.sync.get(DEFAULTS, (settings) => {
  for (const key of Object.keys(DEFAULTS)) {
    const box = document.getElementById(key);
    box.checked = settings[key] !== false;
    box.addEventListener("change", () => {
      chrome.storage.sync.set({ [key]: box.checked });
    });
  }
});
