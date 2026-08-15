/* Mobile shell state bridge. Keeps page mode, iOS visual viewport and keyboard offsets in one place. */
'use strict';
(() => {
  if (window.__mmMobileShellFinalLoaded) return;
  window.__mmMobileShellFinalLoaded = true;

  const root = document.documentElement;
  const LOW_NAV_PAGES = new Set(['chat', 'assistant', 'schedule']);
  const KEYBOARD_PAGES = new Set(['chat', 'assistant']);
  const NAV_BOTTOM = 10;
  const NAV_RESERVE = 88;
  const KEYBOARD_THRESHOLD = 120;
  let safeAreaBottomCache = null;
  let navMeasureFrame = 0;
  let stableLayoutHeight = 0;
  let keyboardWasOpen = false;
  let restoreTimers = [];

  const currentPage = () => {
    try { return typeof state !== 'undefined' ? String(state?.page || '') : ''; }
    catch (_) { return ''; }
  };

  const readSafeAreaBottom = () => {
    if (safeAreaBottomCache !== null) return safeAreaBottomCache;
    if (!document.body) return 0;
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom);';
    document.body.appendChild(probe);
    safeAreaBottomCache = Math.max(0, parseFloat(getComputedStyle(probe).paddingBottom) || 0);
    probe.remove();
    return safeAreaBottomCache;
  };

  const viewportSnapshot = () => {
    const vv = window.visualViewport;
    const visualHeight = Number(vv?.height || window.innerHeight || document.documentElement.clientHeight || 0);
    const offsetTop = Number(vv?.offsetTop || 0);
    const visualBottom = visualHeight + offsetTop;
    const layoutCandidate = Math.max(
      Number(window.innerHeight || 0),
      Number(document.documentElement.clientHeight || 0),
      visualBottom
    );

    if (!stableLayoutHeight || visualBottom >= stableLayoutHeight - 80 || layoutCandidate > stableLayoutHeight) {
      stableLayoutHeight = layoutCandidate;
    }

    const keyboardBottom = Math.max(0, stableLayoutHeight - visualBottom);
    return { visualHeight, offsetTop, visualBottom, keyboardBottom };
  };

  const updateViewportMetrics = () => {
    const metrics = viewportSnapshot();
    if (metrics.visualHeight) root.style.setProperty('--mm-visual-height', `${Math.round(metrics.visualHeight)}px`);
    root.style.setProperty('--mm-visual-offset-top', `${Math.round(metrics.offsetTop)}px`);
    root.style.setProperty('--mm-keyboard-bottom', `${Math.round(metrics.keyboardBottom)}px`);
    return metrics;
  };

  const effectiveViewportBottom = () => {
    const vv = window.visualViewport;
    const visualBottom = vv ? Number(vv.offsetTop || 0) + Number(vv.height || 0) : 0;
    let bottom = Math.max(Number(window.innerHeight || 0), visualBottom, stableLayoutHeight || 0);

    const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
    const screenHeight = Number(window.screen?.height || 0);
    const safe = readSafeAreaBottom();
    const maxSafeBand = Math.max(48, safe + 16);
    if (standalone && screenHeight > bottom && screenHeight - bottom <= maxSafeBand) bottom = screenHeight;
    return bottom;
  };

  const clearTargetNavOverrides = (nav, main) => {
    if (nav?.dataset.mmBottomNavNormalized === '1') {
      nav.style.removeProperty('position');
      nav.style.removeProperty('bottom');
      nav.style.removeProperty('inset-block-end');
      delete nav.dataset.mmBottomNavNormalized;
      delete nav.dataset.mmBottomCorrection;
    }
    if (main?.dataset.mmBottomNavNormalized === '1') {
      main.style.removeProperty('padding-bottom');
      delete main.dataset.mmBottomNavNormalized;
    }
  };

  const keyboardClassOpen = page =>
    (page === 'chat' && root.classList.contains('mm-chat-keyboard')) ||
    (page === 'assistant' && root.classList.contains('mm-assistant-keyboard'));

  const measureAndCorrectTargetNav = (page, nav, main) => {
    cancelAnimationFrame(navMeasureFrame);
    navMeasureFrame = requestAnimationFrame(() => {
      if (!nav?.isConnected || currentPage() !== page || !LOW_NAV_PAGES.has(page) || keyboardClassOpen(page)) return;

      const viewportBottom = effectiveViewportBottom();
      const rect = nav.getBoundingClientRect();
      if (!viewportBottom || !rect.height) return;

      const visibleGap = viewportBottom - rect.bottom;
      const safe = readSafeAreaBottom();
      const maxCorrection = Math.max(36, safe + 2);
      const correction = Math.max(0, Math.min(maxCorrection, visibleGap - NAV_BOTTOM));

      if (correction > 1) {
        const correctedBottom = NAV_BOTTOM - correction;
        nav.style.setProperty('bottom', `${correctedBottom}px`, 'important');
        nav.style.setProperty('inset-block-end', `${correctedBottom}px`, 'important');
        nav.dataset.mmBottomCorrection = String(Math.round(correction));
        if (main) main.style.setProperty('padding-bottom', `${Math.max(52, NAV_RESERVE - correction)}px`, 'important');
      } else {
        nav.style.setProperty('bottom', `${NAV_BOTTOM}px`, 'important');
        nav.style.setProperty('inset-block-end', `${NAV_BOTTOM}px`, 'important');
        nav.dataset.mmBottomCorrection = '0';
      }
    });
  };

  const syncTargetPageBottomNav = () => {
    const page = currentPage();
    const nav = document.querySelector('.mobilebar');
    const main = document.querySelector('.main');
    const isTarget = LOW_NAV_PAGES.has(page);
    const keyboardOpen = keyboardClassOpen(page);

    if (!isTarget) {
      clearTargetNavOverrides(nav, main);
      return;
    }

    if (nav) {
      nav.dataset.mmBottomNavNormalized = '1';
      nav.style.setProperty('position', 'fixed', 'important');
      nav.style.setProperty('bottom', `${NAV_BOTTOM}px`, 'important');
      nav.style.setProperty('inset-block-end', `${NAV_BOTTOM}px`, 'important');
    }

    if (main) {
      main.dataset.mmBottomNavNormalized = '1';
      main.style.setProperty('padding-bottom', keyboardOpen ? '0px' : `${NAV_RESERVE}px`, 'important');
    }

    if (!keyboardOpen && nav) measureAndCorrectTargetNav(page, nav, main);
  };

  const syncPageMode = () => {
    const page = currentPage();
    root.dataset.mmPage = page;
    if (page !== 'chat') root.classList.remove('mm-chat-keyboard');
    if (page !== 'assistant') root.classList.remove('mm-assistant-keyboard');
    syncTargetPageBottomNav();
  };

  const keepDocumentAtOrigin = () => {
    const page = currentPage();
    if (!KEYBOARD_PAGES.has(page)) return;
    try {
      document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    } catch (_) {}
  };

  const clearRestoreTimers = () => {
    restoreTimers.forEach(clearTimeout);
    restoreTimers = [];
  };

  const schedulePostKeyboardRestore = () => {
    clearRestoreTimers();
    [0, 180, 420, 800].forEach(delay => {
      restoreTimers.push(setTimeout(() => {
        safeAreaBottomCache = null;
        keepDocumentAtOrigin();
        updateViewportMetrics();
        syncTargetPageBottomNav();
      }, delay));
    });
  };

  const syncKeyboardState = () => {
    const page = currentPage();
    root.dataset.mmPage = page;
    const active = document.activeElement;
    const chatFocused = page === 'chat' && !!active?.matches?.('.chat-compose-pro textarea');
    const assistantFocused = page === 'assistant' && !!active?.matches?.('.ai-reference-composer input');
    const focusedForKeyboard = chatFocused || assistantFocused;

    const metrics = updateViewportMetrics();
    const geometryKeyboardOpen = KEYBOARD_PAGES.has(page) && metrics.keyboardBottom >= KEYBOARD_THRESHOLD;
    const keyboardOpen = focusedForKeyboard || geometryKeyboardOpen;

    root.classList.toggle('mm-chat-keyboard', page === 'chat' && keyboardOpen);
    root.classList.toggle('mm-assistant-keyboard', page === 'assistant' && keyboardOpen);
    if (page !== 'chat') root.classList.remove('mm-chat-keyboard');
    if (page !== 'assistant') root.classList.remove('mm-assistant-keyboard');

    if (keyboardOpen) {
      clearRestoreTimers();
      keepDocumentAtOrigin();
      requestAnimationFrame(keepDocumentAtOrigin);
    }

    syncTargetPageBottomNav();

    if (keyboardWasOpen && !keyboardOpen) schedulePostKeyboardRestore();
    keyboardWasOpen = keyboardOpen;
  };

  const originalRenderPage = window.renderPage;
  if (typeof originalRenderPage === 'function') {
    window.renderPage = function mobileShellRenderPage() {
      syncPageMode();
      const result = originalRenderPage.apply(this, arguments);
      requestAnimationFrame(syncKeyboardState);
      setTimeout(syncTargetPageBottomNav, 0);
      return result;
    };
  }

  const restoreSendButton = (form, button, original) => {
    if (!form?.isConnected || !button?.isConnected) return;
    form.classList.remove('mm-submit-pending');
    form.removeAttribute('aria-busy');
    button.disabled = false;
    button.innerHTML = original;
  };

  document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== 'chatForm') return;
    const button = form.querySelector('button[type="submit"],button');
    if (!button || button.disabled) return;

    const original = button.innerHTML;
    form.classList.add('mm-submit-pending');
    form.setAttribute('aria-busy', 'true');
    button.disabled = true;
    button.innerHTML = '<span class="mm-send-spinner" aria-hidden="true"></span><span>Sending</span>';

    const started = Date.now();
    const wait = () => {
      if (!form.isConnected) return;
      let busy = false;
      try { busy = typeof state !== 'undefined' && !!state?.busy; } catch (_) {}
      if (!busy && Date.now() - started > 180) return restoreSendButton(form, button, original);
      if (Date.now() - started > 15000) return restoreSendButton(form, button, original);
      setTimeout(wait, 120);
    };
    setTimeout(wait, 120);
  }, true);

  window.visualViewport?.addEventListener('resize', syncKeyboardState);
  window.visualViewport?.addEventListener('scroll', () => {
    syncKeyboardState();
    if (keyboardWasOpen) requestAnimationFrame(keepDocumentAtOrigin);
  });
  document.addEventListener('focusin', () => {
    updateViewportMetrics();
    syncKeyboardState();
    requestAnimationFrame(keepDocumentAtOrigin);
  });
  document.addEventListener('focusout', () => {
    setTimeout(syncKeyboardState, 80);
    setTimeout(syncKeyboardState, 220);
  });
  window.addEventListener('resize', () => {
    safeAreaBottomCache = null;
    syncKeyboardState();
  });
  window.addEventListener('orientationchange', () => {
    safeAreaBottomCache = null;
    stableLayoutHeight = 0;
    setTimeout(syncKeyboardState, 180);
  });
  window.addEventListener('pageshow', () => {
    stableLayoutHeight = 0;
    updateViewportMetrics();
    syncKeyboardState();
  });

  const app = document.getElementById('app');
  if (app && 'MutationObserver' in window) {
    new MutationObserver(() => requestAnimationFrame(syncTargetPageBottomNav))
      .observe(app, { childList: true, subtree: true });
  }

  syncPageMode();
  updateViewportMetrics();
  requestAnimationFrame(syncTargetPageBottomNav);
})();
