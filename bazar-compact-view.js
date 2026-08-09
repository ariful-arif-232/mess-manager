/* Compact bazar history view. Keeps edit/delete logic intact and groups shared-price fresh market items. */
'use strict';
(()=>{
  const baseBazar=window.bazar;
  const itemTotal=i=>Number(i?.total ?? (Number(i?.quantity||0)*Number(i?.unit_price||0)));
  const isFresh=i=>i?.category==='Vegetable'||i?.category==='কাঁচাবাজার';
  const member=id=>db.members.find(m=>m.id===id);
  const initials=name=>String(name||'M').trim().split(/\s+/).slice