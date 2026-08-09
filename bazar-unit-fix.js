/* Correct stale unit values for standard Bazar categories. */
'use strict';
(() => {
  const UNITS = {'চাল':'kg','ডাল':'kg','তেল':'L','মুরগি':'kg','মাছ':'kg','ডিম':'হালি'};
  function sync(root=document){
    if (!root.querySelectorAll) return;
    root.querySelectorAll('[data-bazar-row]').forEach(row => {
      const category = row.querySelector('[name="category"]')?.value || row.querySelector('[data-category-label]')?.textContent?.trim();
      const unit = UNITS[category];
      if (!unit) return;
      const hidden = row.querySelector('[name="unit"]');
      const box = row.querySelector('.unit-box');
      if (hidden) hidden.value = unit;
      if (box) box.textContent = unit;
    });
  }
  const observer = new MutationObserver(() => sync());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click', e => {
    if (e.target.closest('[data-category-button],[data-cat],[data-edit],[data-add]')) setTimeout(sync,0);
  });
  sync();
})();
