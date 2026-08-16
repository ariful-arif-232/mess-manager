/* Final Add/Edit Bazar interaction corrections. */
'use strict';
(()=>{
  if(window.__mmBazarUiFinalFixLoaded)return;
  window.__mmBazarUiFinalFixLoaded=true;

  const closeBazarModal=()=>{
    document.querySelectorAll('#bazarV2ChoiceLayer,#bazarV2FreshLayer,#bazarV2ModeLayer,#bazarV2PriceLayer').forEach(node=>node.remove());
    if(typeof window.closeModal==='function')return window.closeModal();
    document.querySelector('.modal-wrap:has(#bazarForm)')?.remove();
  };

  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-v2-modal-close]');
    if(!button||!button.closest?.('.modal-wrap:has(#bazarForm)'))return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeBazarModal();
  },true);
})();
