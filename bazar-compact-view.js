/* Force compact Bazar history cards and popup details. */
'use strict';
(()=>{
  const itemTotal=i=>Number(i?.entered_total ?? i?.total ?? (Number(i?.quantity||0)*Number(i?.unit_price||0)));
  const isFresh=i=>i?.category==='Vegetable'||i?.category==='কাঁচাবাজার';
  const person=id=>db.members.find(m=>m.id===id);
  const initials=name=>String(name||'M').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
  const niceDate=v=>{const d=new Date(`${v}T00:00:00`);return Number.isNaN(d.getTime())?v:d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});};
  const avatar=m=>m?.avatar_url?`<img class="compact-bazar-avatar" src="${esc(m.avatar_url)}" alt="${esc(m.name||'Member')}">`:`<span class="compact-bazar-avatar">${esc(initials(m?.name))}</span>`;
  function detailHtml(entry){
    const items=entry.items||[],fresh=items.filter(isFresh),normal=items.filter(x=>!isFresh(x));
    let rows=normal.map(i=>`<div class="bazar-detail-row"><div><b>${esc(i.item_name)}</b><span>${esc(i.quantity)} ${esc(i.unit||'')}</span></div><strong>${money(itemTotal(i))}</strong></div>`).join('');
    if(fresh.length){const total=fresh.reduce((s,i)=>s+itemTotal(i),0);rows+=`<div class="bazar-fresh-group"><div class="bazar-fresh-group-head"><b>কাঁচাবাজার</b><strong>${money(total)}</strong></div><div class="bazar-fresh-names">${fresh.map(i=>esc(i.item_name)).join(' · ')}</div><div class="bazar-fresh-qty">${fresh.map(i=>`<span>${esc(i.item_name)} ${esc(i.quantity)} ${esc(i.unit||'')}</span>`).join('')}</div></div>`;}
    return rows||'<div class="empty">No bazar items</div>';
  }
  function openDetails(id){
    const e=db.bazar.find(x=>String(x.id)===String(id));if(!e)return;
    const m=person(e.buyer_member_id);
    document.querySelector('#bazarDetailSheet')?.remove();
    document.body.insertAdjacentHTML('beforeend',`<div class="sheet-backdrop" id="bazarDetailSheet"><div class="action-sheet bazar-detail-sheet"><div class="sheet-handle"></div><div class="bazar-detail-head"><div><span>${esc(niceDate(e.date))}</span><h3>${esc(m?.name||memberName(e.buyer_member_id))}</h3></div><div class="bazar-detail-grand"><small>Total</small><b>${money(e.amount)}</b></div></div><div class="bazar-detail-list">${detailHtml(e)}</div></div></div>`);
    const s=document.querySelector('#bazarDetailSheet');s.onclick=ev=>{if(ev.target===s)s.remove();};
  }
  function compactBazar(c){
    const controls=profile.role==='admin';
    c.innerHTML=`<div class="section-head"><div><h2>Bazar</h2></div>${controls?'<button class="btn primary" data-add>+ Add Bazar</button>':''}</div><div class="bazar-entry-list compact-bazar-list">${db.bazar.map(e=>{const m=person(e.buyer_member_id),count=(e.items||[]).length;return `<article class="card bazar-entry compact-bazar-card"><div class="compact-bazar-summary"><div class="compact-bazar-person">${avatar(m)}<div class="compact-bazar-copy"><span class="compact-date">◷ ${esc(niceDate(e.date))}</span><h3>${esc(m?.name||memberName(e.buyer_member_id))}</h3></div></div><div class="compact-bazar-total"><span>Total</span><b>${money(e.amount)}</b></div></div><button type="button" class="bazar-view-button" data-view-bazar="${esc(e.id)}"><span><b>Tap to view Bazar List</b><small>${count} item${count===1?'':'s'} • full details</small></span><strong>View ›</strong></button>${controls?`<div class="entry-actions"><button class="btn" data-edit="${esc(e.id)}">Edit</button><button class="btn danger" data-delete="${esc(e.id)}" data-kind="bazar">Delete</button></div>`:''}</article>`}).join('')||'<div class="card empty">No bazar entries</div>'}</div>`;
    c.querySelectorAll('[data-view-bazar]').forEach(b=>b.onclick=()=>openDetails(b.dataset.viewBazar));
    if(controls)bindCrud(c,'bazar',window.bazarModal||bazarModal);
  }
  window.bazar=compactBazar;
  const previousRenderPage=window.renderPage;
  window.renderPage=function(){if(state.page==='bazar')return compactBazar(document.querySelector('#content'));return previousRenderPage();};
  document.addEventListener('click',e=>{const b=e.target.closest('[data-view-bazar]');if(b){e.preventDefault();openDetails(b.dataset.viewBazar);}},true);
})();
