/* Correct stale unit values for standard Bazar categories without triggering a mutation loop. */
'use strict';
(() => {
  const UNITS = {'চাল':'kg','ডাল':'kg','তেল':'L','মুরগি':'kg','মাছ':'kg','ডিম':'হালি'};
  let scheduled = false;

  function sync(root=document){
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[data-bazar-row]').forEach(row => {
      const category = row.querySelector('[name="category"]')?.value || row.querySelector('[data-category-label]')?.textContent?.trim();
      const unit = UNITS[category];
      if (!unit) return;
      const hidden = row.querySelector('[name="unit"]');
      const box = row.querySelector('.unit-box');
      if (hidden && hidden.value !== unit) hidden.value = unit;
      if (box && box.textContent !== unit) box.textContent = unit;
    });
  }

  function scheduleSync(){
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      sync();
    });
  }

  const observer = new MutationObserver(mutations => {
    const needsSync = mutations.some(m =>
      Array.from(m.addedNodes || []).some(node =>
        node.nodeType === 1 && (node.matches?.('[data-bazar-row]') || node.querySelector?.('[data-bazar-row]'))
      )
    );
    if (needsSync) scheduleSync();
  });

  const start = () => {
    observer.observe(document.body || document.documentElement, {childList:true, subtree:true});
    document.addEventListener('click', e => {
      if (e.target.closest('[data-category-button],[data-cat],[data-edit],[data-add]')) scheduleSync();
    });
    sync();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
