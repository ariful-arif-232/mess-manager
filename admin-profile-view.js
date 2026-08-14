/* View mess admin profiles by tapping the unchanged Settings workspace hero. */
'use strict';
(()=>{
  const OVERLAY_ID='adminProfileViewer';
  const closeIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';
  const chevronIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
  let returnFocus=null;

  const admins=()=>(db?.members||[])
    .filter(member=>member?.role==='admin')
    .slice