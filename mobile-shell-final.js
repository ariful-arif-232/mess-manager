/* Mobile shell state bridge. */
'use strict';
(() => {
  const syncPageMode = () => {
    const page = window.state?.page || '';
    document.documentElement.dataset.mmPage = page;
  };

  const originalRender = window.renderPage;
  if (typeof originalRender === 'function') {
    window.renderPage = function mobileShellRenderPage() {
      syncPageMode();
      return originalRender.apply(this, arguments);
    };
  }

  const updateHeight = () => {
    const height = window.visualViewport?.height;
    if (height) document.documentElement.style.setProperty('--mm-visual-height', `${height}px`);
  };

  const inputState = () => {
    const active = document.activeElement;
    const isChat = document.documentElement.dataset.mmPage === 'chat';
    const isAssistant = document.documentElement.dataset.mmPage === 'assistant';
    const focused = active && (active.matches('.chat-compose-pro textarea') || active.matches('.ai-reference-composer input'));
    document.documentElement.classList.toggle('mm-chat-keyboard', !!(isChat && focused));
    document.documentElement.classList.toggle('mm-assistant-keyboard', !!(isAssistant && focused));
  };

  window.visualViewport?.addEventListener('resize', () => { updateHeight(); inputState(); });
  document.addEventListener('focusin', inputState);
  document.addEventListener('focusout', () => setTimeout(inputState, 100));
  window.addEventListener('resize', updateHeight);
  updateHeight();
})();
