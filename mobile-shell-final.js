/* Mobile shell state bridge. Keeps page mode, iOS visual viewport and keyboard offsets in one place. */
'use strict';
(() => {
  if (window.__mmMobileShellFinalLoaded) return;
  window.__mmMobileShellFinalLoaded = true;

  const root = document.documentElement;
  const LOW_NAV_PAGES = new Set(['chat', 'assistant', 'schedule']);
  const NAV_BOTTOM = 10;
  const NAV_RESERVE = 88;
  let safeAreaBottomCache = null;
  let navMeasureFrame = 0;

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

  const effectiveViewportBottom = () => {
    const vv = window.visualViewport;
    const visualBottom = vv ? Number(vv.offsetTop || 0) + Number(vv.height || 0) : 0;
    let bottom = Math.max(Number(window.innerHeight || 0), visualBottom);

    /* In an installed iOS PWA, screen.height can include the home-indicator band
       while the layout/visual viewport reported to a viewport-locked page can be
       shorter. Only use that extra band when the difference is plausibly a safe
       area, never while a software keyboard is changing the viewport. */
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

  const measureAndCorrectTargetNav = (page, nav, main) => {
    cancelAnimationFrame(navMeasureFrame);
    navMeasureFrame = requestAnimationFrame(() => {
      if (!nav?.isConnected || currentPage() !== page || !LOW_NAV_PAGES.has(page)) return;
      const keyboardOpen = (page === 'chat' && root.classList.contains('mm-chat-keyboard')) ||
        (page === 'assistant' && root.classList.contains('mm-assistant-keyboard'));
      if (keyboardOpen) return;

      const viewportBottom = effectiveViewportBottom();
      const rect = nav.getBoundingClientRect();
      if (!viewportBottom || !rect.height) return;

      const visibleGap = viewportBottom - rect.bottom;
      const safe = readSafeAreaBottom();
      const maxCorrection = Math.max(36, safe + 2);
      const correction = Math.max(0, Math.min(maxCorrection, visibleGap - NAV_BOTTOM));

      /* This is the important fallback for iOS standalone pages. If a page-specific
         100dvh/overflow context exposes one safe-area band below the fixed nav,
         compensate only that measured band. Dashboard does not need this path. */
      if (correction > 1) {
        const correctedBottom = NAV_BOTTOM - correction;
        nav.style.setProperty('bottom', `${correctedBottom}px`, 'important');
        nav.style.setProperty('inset-block-end', `${correctedBottom}px`, 'important');
        nav.dataset.mmBottomCorrection = String(Math.round(correction));
        if (main) main.style.setProperty('padding-bottom', `${Math.max(52, NAV_RESERVE - correction)}px`, 'important');
      } else {
        nav.dataset.mmBottomCorrection = '0';
      }
    });
  };

  const syncTargetPageBottomNav = () => {
    const page = currentPage();
    const nav = document.querySelector('.mobilebar');
    const main = document.querySelector('.main');
    const isTarget = LOW_NAV_PAGES.has(page);
    const keyboardOpen = (page === 'chat' && root.classList.contains('mm-chat-keyboard')) ||
      (page === 'assistant' && root.classList.contains('mm-assistant-keyboard'));

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
      /* When the software keyboard is visible the visual viewport itself is the
         available screen. Reserving even the old 8px shell padding here could
         expose the iOS home-indicator band as a white strip below the composer. */
      main.style.setProperty('padding-bottom', keyboardOpen ? '0px' : `${NAV_RESERVE}px`, 'important');
    }

    if (!keyboardOpen && nav) measureAndCorrectTargetNav(page, nav, main);
  };

  const syncPageMode = () => {
    const page = currentPage();
    root.dataset.mmPage = page;
    root.classList.toggle('mm-chat-keyboard', page === 'chat' && root.classList.contains('mm-chat-keyboard'));
    root.classList.toggle('mm-assistant-keyboard', page === 'assistant' && root.classList.contains('mm-assistant-keyboard'));
    if (page !== 'chat') root.classList.remove('mm-chat-keyboard');
    if (page !== 'assistant') root.classList.remove('mm-assistant-keyboard');
    syncTargetPageBottomNav();
  };

  const updateViewportMetrics = () => {
    const vv = window.visualViewport;
    const visualHeight = vv?.height || window.innerHeight;
    const offsetTop = vv?.offsetTop || 0;
    const layoutHeight = window.innerHeight || document.documentElement.clientHeight || visualHeight;
    const keyboardBottom = Math.max(0, layoutHeight - (visualHeight + offsetTop));

    if (visualHeight) root.style.setProperty('--mm-visual-height', `${Math.round(visualHeight)}px`);
    root.style.setProperty('--mm-visual-offset-top', `${Math.round(offsetTop)}px`);
    root.style.setProperty('--mm-keyboard-bottom', `${Math.round(keyboardBottom)}px`);
  };

  const syncKeyboardState = () => {
    const active = document.activeElement;
    const page = currentPage();
    root.dataset.mmPage = page;

    const chatFocused = page === 'chat' && !!active?.matches?.('.chat-compose-pro textarea');
    const assistantFocused = page === 'assistant' && !!active?.matches?.('.ai-reference-composer input');

    root.classList.toggle('mm-chat-keyboard', chatFocused);
    root.classList.toggle('mm-assistant-keyboard', assistantFocused);
    if (page !== 'chat') root.classList.remove('mm-chat-keyboard');
    if (page !== 'assistant') root.classList.remove('mm-assistant-keyboard');

    /* Update the visual viewport before applying page sizing. On iOS this avoids
       one frame where the old 100dvh height survives after the keyboard opens and
       paints a white band beneath the focused composer. */
    updateViewportMetrics();
    syncTargetPageBottomNav();
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
  window.visualViewport?.addEventListener('scroll', syncKeyboardState);
  document.addEventListener('focusin', syncKeyboardState);
  document.addEventListener('focusout', () => setTimeout(syncKeyboardState, 140));
  window.addEventListener('resize', () => {
    safeAreaBottomCache = null;
    syncKeyboardState();
  });
  window.addEventListener('orientationchange', () => {
    safeAreaBottomCache = null;
    setTimeout(syncKeyboardState, 180);
  });
  window.addEventListener('pageshow', syncKeyboardState);

  const app = document.getElementById('app');
  if (app && 'MutationObserver' in window) {
    new MutationObserver(() => requestAnimationFrame(syncTargetPageBottomNav))
      .observe(app, { childList: true, subtree: true });
  }

  syncPageMode();
  updateViewportMetrics();
  requestAnimationFrame(syncTargetPageBottomNav);
})();
