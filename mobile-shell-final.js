/* Mobile shell state bridge. Keeps page mode, iOS visual viewport and keyboard offsets in one place. */
'use strict';
(() => {
  if (window.__mmMobileShellFinalLoaded) return;
  window.__mmMobileShellFinalLoaded = true;

  const root = document.documentElement;
  const LOW_NAV_PAGES = new Set(['chat', 'assistant', 'schedule']);

  const currentPage = () => {
    try { return typeof state !== 'undefined' ? String(state?.page || '') : ''; }
    catch (_) { return ''; }
  };

  const syncTargetPageBottomNav = () => {
    const page = currentPage();
    const nav = document.querySelector('.mobilebar');
    const main = document.querySelector('.main');
    const isTarget = LOW_NAV_PAGES.has(page);
    const keyboardOpen = (page === 'chat' && root.classList.contains('mm-chat-keyboard')) ||
      (page === 'assistant' && root.classList.contains('mm-assistant-keyboard'));

    if (nav) {
      if (isTarget) {
        /* These viewport-heavy pages were still inheriting the legacy
           18px + safe-area bottom offset. Pin them to the same physical
           10px bottom position as Dashboard. Inline !important is deliberate:
           several legacy page styles are injected after the static CSS. */
        nav.dataset.mmBottomNavNormalized = '1';
        nav.style.setProperty('position', 'fixed', 'important');
        nav.style.setProperty('bottom', '10px', 'important');
      } else if (nav.dataset.mmBottomNavNormalized === '1') {
        nav.style.removeProperty('position');
        nav.style.removeProperty('bottom');
        delete nav.dataset.mmBottomNavNormalized;
      }
    }

    if (main) {
      if (isTarget) {
        /* Removing the legacy safe-area reserve moves Chat/Assistant composers
           down together with the navigation, so no new gap appears above it. */
        main.dataset.mmBottomNavNormalized = '1';
        main.style.setProperty('padding-bottom', keyboardOpen ? '8px' : '88px', 'important');
      } else if (main.dataset.mmBottomNavNormalized === '1') {
        main.style.removeProperty('padding-bottom');
        delete main.dataset.mmBottomNavNormalized;
      }
    }
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
    root.style.setProperty('--mm-keyboard-bottom', `${Math.round(keyboardBottom)}px`);
  };

  const syncKeyboardState = () => {
    syncPageMode();
    const active = document.activeElement;
    const page = root.dataset.mmPage;
    const chatFocused = page === 'chat' && !!active?.matches?.('.chat-compose-pro textarea');
    const assistantFocused = page === 'assistant' && !!active?.matches?.('.ai-reference-composer input');

    root.classList.toggle('mm-chat-keyboard', chatFocused);
    root.classList.toggle('mm-assistant-keyboard', assistantFocused);
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
  window.addEventListener('resize', syncKeyboardState);
  window.addEventListener('orientationchange', () => setTimeout(syncKeyboardState, 180));
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
