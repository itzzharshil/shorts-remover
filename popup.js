// Keep in sync with DEFAULTS in content.js.
const DEFAULTS = { hideShorts: true, redirectShorts: true };

chrome.storage.sync.get(DEFAULTS, (settings) => {
  for (const key of Object.keys(DEFAULTS)) {
    const box = document.getElementById(key);
    box.checked = Boolean(settings[key]);
    box.addEventListener('change', () => {
      chrome.storage.sync.set({ [key]: box.checked });
    });
  }
});
