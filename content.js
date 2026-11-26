// Shorts Remover — content script for www.youtube.com and m.youtube.com.
// content.css does most of the hiding; this script adds three things CSS
// can't do: honour the popup settings, send Shorts URLs to the normal player,
// and hide controls that are only recognisable by their "Shorts" label.
(() => {
  'use strict';

  const DEFAULTS = { hideShorts: true, redirectShorts: true };
  const HIDE_CLASS = 'ysr-on';
  const MARK_ATTR = 'data-ysr-shorts';

  // Controls whose only Shorts signal is their visible label: channel tabs,
  // filter chips and the search filter menu.
  const LABELLED_CONTROLS = [
    'yt-tab-shape',
    'tp-yt-paper-tab',
    'yt-chip-cloud-chip-renderer',
    'ytm-chip-cloud-chip-renderer',
    'chip-view-model',
    'ytd-search-filter-renderer',
  ].join(',');

  const root = document.documentElement;
  let settings = { ...DEFAULTS };

  // Hide straight away so Shorts never flash on screen while settings load.
  root.classList.add(HIDE_CLASS);

  function shortsIdFrom(url) {
    const match = url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{5,})/);
    return match ? match[1] : null;
  }

  function isYouTubeHost(hostname) {
    return hostname === 'youtube.com' || hostname.endsWith('.youtube.com');
  }

  function watchUrlFor(id) {
    return `${location.origin}/watch?v=${encodeURIComponent(id)}`;
  }

  // If we're sitting on a /shorts/ page, swap it for the regular player.
  function redirectIfOnShorts() {
    if (!settings.redirectShorts) return;
    const id = shortsIdFrom(location);
    if (id) location.replace(watchUrlFor(id));
  }

  // Catch plain left-clicks on Shorts links before YouTube's own router
  // opens them in the Shorts player. Modified clicks (new tab, etc.) fall
  // through and are redirected when the new page loads.
  function onClick(event) {
    if (!settings.redirectShorts) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link) return;

    let url;
    try {
      url = new URL(link.href, location.href);
    } catch {
      return;
    }
    if (!isYouTubeHost(url.hostname)) return;

    const id = shortsIdFrom(url);
    if (!id) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(watchUrlFor(id));
  }

  // Mark or unmark labelled controls. YouTube reuses these nodes for
  // different labels as you navigate, so every pass re-checks all of them.
  function markLabelledControls() {
    for (const el of document.querySelectorAll(LABELLED_CONTROLS)) {
      const label = (el.getAttribute('tab-title') || el.textContent || '').trim().toLowerCase();
      if (label === 'shorts') {
        if (!el.hasAttribute(MARK_ATTR)) el.setAttribute(MARK_ATTR, '');
      } else if (el.hasAttribute(MARK_ATTR)) {
        el.removeAttribute(MARK_ATTR);
      }
    }
  }

  // YouTube is a single-page app, so watch the DOM and URL for changes.
  // Work is throttled to at most one pass every 150 ms.
  let lastHref = location.href;
  let scheduled = false;

  function runPass() {
    scheduled = false;
    if (location.href !== lastHref) {
      lastHref = location.href;
      redirectIfOnShorts();
    }
    if (settings.hideShorts) markLabelledControls();
  }

  function schedulePass() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(runPass, 150);
  }

  function applySettings(next) {
    settings = { ...DEFAULTS, ...next };
    root.classList.toggle(HIDE_CLASS, settings.hideShorts);
    redirectIfOnShorts();
    if (settings.hideShorts) markLabelledControls();
  }

  document.addEventListener('click', onClick, true);
  document.addEventListener('yt-navigate-finish', schedulePass);
  window.addEventListener('popstate', schedulePass);
  new MutationObserver(schedulePass).observe(root, { childList: true, subtree: true });

  try {
    chrome.storage.sync.get(DEFAULTS, applySettings);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      const next = { ...settings };
      for (const [key, { newValue }] of Object.entries(changes)) {
        if (key in DEFAULTS) next[key] = newValue ?? DEFAULTS[key];
      }
      applySettings(next);
    });
  } catch {
    // Storage is unavailable (e.g. the extension was reloaded under this
    // tab). Keep running on the defaults.
    applySettings(DEFAULTS);
  }
})();
