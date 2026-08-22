/* Dedicated Member Profile bottom sheet.
 * Uses the same sheet architecture as utility details so generic modal sizing
 * cannot stretch it into a full-height white page on iPhone.
 */
'use strict';
(()=>{
  if(window.__mmMemberProfileSheetFinalLoaded)return;
  window.__mmMemberProfileSheetFinalLoaded=true;

  const initials=member=>String(member?.name||'M').trim().split(/\s+/).filter(Boolean).map(part=>part[0]).slice(0,2).join('').toUpperCase()||'M';
  const avatar=member=>member?.avatar_url
    ?`<img class="mm-member-sheet-avatar" src="${esc(member.avatar_url)}" alt="${esc(member.name||'Member')}"/>`
    :`<span class="mm-member-sheet-avatar fallback">${esc(initials(member))}</span>`;

  function closeSheet(){document.getElementById('memberProfileBottomSheet')?.remove();}

  function openSheet(member){
    if(!member)return;
    closeSheet();
    document.body.insertAdjacentHTML('beforeend',`
      <div class="sheet-backdrop mm-member-profile-backdrop" id="memberProfileBottomSheet" role="presentation">
        <section class="action-sheet mm-member-profile-sheet" role="dialog" aria-modal="true" aria-labelledby="mmMemberProfileTitle">
          <div class="mm-member-sheet-handle" aria-hidden="true"></div>
          <header class="mm-member-sheet-head">
            ${avatar(member)}
            <div class="mm-member-sheet-title">
              <span>MEMBER PROFILE</span>
              <h3 id="mmMemberProfileTitle">${esc(member.name)}</h3>
            </div>
            <button type="button" class="mm-member-sheet-close" data-member-sheet-close aria-label="Close">×</button>
          </header>

          <div class="mm-member-sheet-grid">
            <div class="mm-member-sheet-field"><span>ROLE</span><b>${esc(member.role||'member')}</b></div>
            <div class="mm-member-sheet-field"><span>STATUS</span><b class="${member.active?'is-active':'is-inactive'}">${member.active?'Active':'Inactive'}</b></div>
            <div class="mm-member-sheet-field mm-member-sheet-wide"><span>EMAIL</span><b>${esc(member.email||'Not added')}</b></div>
            <div class="mm-member-sheet-field"><span>PHONE</span><b>${esc(member.phone||'Not added')}</b></div>
            <div class="mm-member-sheet-field"><span>JOINED</span><b>${esc(member.join_date||'-')}</b></div>
          </div>
        </section>
      </div>`);

    const root=document.getElementById('memberProfileBottomSheet');
    root?.querySelector('[data-member-sheet-close]')?.addEventListener('click',closeSheet);
    root?.addEventListener('click',event=>{if(event.target===root)closeSheet();});
  }

  document.addEventListener('click',event=>{
    const trigger=event.target.closest?.('[data-view-member]');
    if(!trigger)return;
    const member=(db?.members||[]).find(row=>String(row.id)===String(trigger.dataset.viewMember||''));
    if(!member)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openSheet(member);
  },true);
})();
