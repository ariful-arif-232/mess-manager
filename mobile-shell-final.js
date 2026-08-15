/* Mobile shell state bridge. */
'use strict';
(() => {
  const currentPage = () => {
    try { return typeof state !== 'undefined' ? String(state?.page || '') : ''; }
    catch (_) { return ''; }
  };

  const syncPageMode = () => {
    const root = document.documentElement;
    const page = currentPage();
    root.dataset.mmPage = page;
    if (page !== 'chat') root.classList.remove('mm-chat-keyboard');
    if (page !== 'assistant') root.classList.remove('mm-assistant-keyboard');
  };

  const originalRenderPage = window.renderPage;
  if (typeof originalRenderPage === 'function') {
    window.renderPage = function mobileShellRenderPage() {
      syncPageMode();
      return originalRenderPage.apply(this, arguments);
    };
  }

  const updateHeight = () => {
    const height = window.visualViewport?.height || window.innerHeight;
    if (height) document.documentElement.style.setProperty('--mm-visual-height', `${Math.round(height)}px`);
  };

  const syncKeyboardState = () => {
    const root = document.documentElement;
    const active = document.activeElement;
    const chatFocused = root.dataset.mmPage === 'chat' && !!active?.matches?.('.chat-compose-pro textarea');
    const assistantFocused = root.dataset.mmPage === 'assistant' && !!active?.matches?.('.ai-reference-composer input');
    root.classList.toggle('mm-chat-keyboard', chatFocused);
    root.classList.toggle('mm-assistant-keyboard', assistantFocused);
    updateHeight();
  };

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
  window.visualViewport?.addEventListener('scroll', updateHeight);
  document.addEventListener('focusin', syncKeyboardState);
  document.addEventListener('focusout', () => setTimeout(syncKeyboardState, 120));
  window.addEventListener('resize', syncKeyboardState);
  window.addEventListener('pageshow', () => { syncPageMode(); syncKeyboardState(); });

  syncPageMode();
  updateHeight();
})();
