/* UX fixes requested from mobile review. Loaded after feature modules. */
'use strict';
(() => {
  const avatar = m => m.avatar_url ? `<img class="member-photo" src="${esc(m.avatar_url)}" alt=""/>` : `<span class="member-photo fallback">${esc((m.name||'M').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase())}</span>`;
  const memberDetails = m => modal(`<div class="modal-title"><div><span class="eyebrow">Member profile</span><h2>${esc(m.name)}</h2></div><button class="icon-btn" data-close>×</button></div><div class="profile-popup"><div class="profile-photo">${avatar(m)}</div><div class="profile-info"><div><span>Role</span><b>${esc(m.role)}</b></div><div><span>Status</span><b>${m.active?'Active':'Inactive'}</b></div><div><span>Email</span><b>${esc(m.email||'Not added')}</b></div><div><span>Phone</span><b>${esc(m.phone||'Not added')}</b></div><div><span>Joined</span><b>${esc(m.join_date||'-')}</b></div></div></div>`);

  window.members = function membersClean(c){
    const controls=profile.role==='admin';
    c.innerHTML=`<div class="section-head"><div><span class="eyebrow">Mess family</span><h2>সব Member</h2></div>${controls?'<button class="btn primary" data-add>+ Add Member</button>':''}</div><div class="member-clean-list">${db.members.map(m=>`<article class="member-clean-card"><button class="member-identity" data-view-member="${m.id}">${avatar(m)}<span><b>${esc(m.name)}</b><small>Tap to view profile</small></span></button>${controls?`<div class="member-admin-actions"><button class="btn" data-edit="${m.id}">Edit</button><button class="btn danger" data-toggle="${m.id}">${m.active?'Deactivate':'Activate'}</button></div>`:''}</article>`).join('')}</div>`;
    c.querySelectorAll('[data-view-member]').forEach(b=>b.onclick=()=>{const m=db.members.find(x=>x.id===b.dataset.viewMember);memberDetails(m);$('[data-close]').onclick=closeModal;});
    if(!controls)return;
    c.querySelector('[data-add]').onclick=()=>memberModal();c.querySelectorAll('[data-edit]').forEach(x=>x.onclick=()=>memberModal(x.dataset.edit));c.querySelectorAll('[data-toggle]').forEach(x=>x.onclick=()=>toggleMember(x.dataset.toggle));
  };

  window.memberModal = function memberModalPhoto(id){
    const m=db.members.find(x=>x.id===id)||{name:'',email:'',phone:'',join_date:today(),user_id:'',role:'member',active:true,avatar_url:''};
    modal(`<div class="modal-title"><div><span class="eyebrow">${id?'Update profile':'New member'}</span><h2>${id?'Edit':'Add'} Member</h2></div><button class="icon-btn" data-close>×</button></div><form id="memberForm"><div class="photo-picker"><div id="photoPreview">${avatar(m)}</div><label class="btn photo-btn">Choose photo<input id="avatarFile" type="file" accept="image/*" hidden></label><small>Optional · square photo works best</small></div><div class="form-grid"><div class="field"><label>Name</label><input name="name" value="${esc(m.name)}" required maxlength="120"/></div><div class="field"><label>Email</label><input name="email" type="email" value="${esc(m.email||'')}"/></div><div class="field"><label>Phone</label><input name="phone" type="tel" value="${esc(m.phone||'')}" maxlength="40"/></div><div class="field"><label>Join date</label><input name="join_date" type="date" value="${esc(m.join_date||today())}" required/></div><div class="field"><label>Role</label><select name="role"><option value="member">Member</option><option value="admin" ${m.role==='admin'?'selected':''}>Admin</option></select></div></div><div class="actions gap-top"><button class="btn primary">Save Member</button><button class="btn" type="button" data-close2>Cancel</button></div></form>`);
    let avatarUrl=m.avatar_url||'';const file=$('#avatarFile');file.onchange=()=>{const f=file.files?.[0];if(!f)return;if(f.size>450000)return notify('Photo 450KB-এর কম দিন।');const reader=new FileReader();reader.onload=()=>{avatarUrl=reader.result;$('#photoPreview').innerHTML=`<img class="member-photo" src="${avatarUrl}" alt=""/>`;};reader.readAsDataURL(f);};
    $('[data-close]').onclick=closeModal;$('[data-close2]').onclick=closeModal;$('#memberForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),payload={mess_id:profile.mess_id,name:f.get('name').trim(),email:f.get('email').trim()||null,phone:f.get('phone').trim()||null,join_date:f.get('join_date'),role:f.get('role'),avatar_url:avatarUrl||null};await run(async()=>{const q=id?client.from('members').update(payload).eq('id',id):client.from('members').insert(payload);assertResult(await q);closeModal();await loadData();render();},'Member saved.');};
  };

  window.meals = function mealsFood(c){
    const [start,end]=dateRange(),dates=[];for(let d=new Date(start+'T00:00:00Z'),last=new Date(end+'T00:00:00Z');d<=last;d.setUTCDate(d.getUTCDate()+1))dates.push(d.toISOString().slice(0,10));const visible=activeMembers();
    const initialDate=today()>=start&&today()<=end?today():start;
    c.innerHTML=`<div class="section-head meal-head"><div><span class="eyebrow">Daily food attendance</span><h2>খাবারের হিসাব</h2></div><div class="meal-legend"><span><i class="meal-dot eating"></i>খাবে</span><span><i class="meal-dot skip"></i>খাবে না</span></div></div>${profile.role==='admin'?`<section class="meal-all-card"><div class="meal-all-icon">🍽️</div><div class="meal-all-copy"><b>সবাই খাবে</b></div><label class="meal-all-date"><span>তারিখ</span><input id="mealAllDate" type="date" min="${start}" max="${end}" value="${initialDate}"></label><button class="meal-all-button" id="allEatDate" ${!visible.length?'disabled':''}>সবাইকে খাবে করুন</button></section>`:''}<div class="table-wrap meal-table-wrap"><table class="meal-table"><thead><tr><th>Date</th>${visible.map(m=>`<th>${esc(m.name)}</th>`).join('')}</tr></thead><tbody>${dates.map(date=>`<tr><td>${date.slice(8)}/${date.slice(5,7)}</td>${visible.map(m=>{const x=db.meals.find(z=>z.date===date&&z.memberId===m.id),on=!!x?.on;return `<td><button class="meal-choice ${on?'eating':'skip'}" ${profile.role==='admin'?'':'disabled'} data-meal-member="${m.id}" data-meal-date="${date}" data-current="${on}"><span>${on?'🍽️':'—'}</span><b>${on?'খাবে':'বাদ'}</b></button></td>`;}).join('')}</tr>`).join('')}</tbody></table></div>`;
    c.querySelectorAll('[data-meal-member]').forEach(b=>b.onclick=()=>setMeal(b.dataset.mealMember,b.dataset.mealDate,b.dataset.current!=='true'));
    c.querySelector('#allEatDate')?.addEventListener('click',()=>setEveryoneEating(visible,c.querySelector('#mealAllDate')?.value));
  };

  async function saveMeals(rows,message,metadata){
    if(!requireAdmin()||!rows.length)return;
    await run(async()=>{assertResult(await client.from('meals').upsert(rows,{onConflict:'member_id,meal_date'}));await logActivity('toggle_meal','meal',null,metadata);await loadData();render();},message);
  }
  function setMeal(memberId,date,enabled){const existing=db.meals.find(x=>x.memberId===memberId&&x.date===date);return saveMeals([{mess_id:profile.mess_id,member_id:memberId,meal_date:date,units:Number(existing?.units||1),enabled}],enabled?'Meal enabled.':'Meal disabled.',{date,member_ids:[memberId],enabled});}
  function setEveryoneEating(members,date){if(!date)return notify('একটি তারিখ বেছে নিন।');return saveMeals(members.map(m=>{const existing=db.meals.find(x=>x.memberId===m.id&&x.date===date);return{mess_id:profile.mess_id,member_id:m.id,meal_date:date,units:Number(existing?.units||1),enabled:true};}),`${date.slice(8)}/${date.slice(5,7)} তারিখে সবাই খাবে হিসেবে সেট হয়েছে।`,{date,member_ids:members.map(m=>m.id),enabled:true,bulk:true});}

  window.settlement = function settlementClean(c){const calc=calcMonth();c.innerHTML=`<div class="section-head"><div><span class="eyebrow">Monthly accounts</span><h2>${state.month} Settlement</h2></div>${profile.role==='admin'?'<button class="btn primary" id="saveSettlement">Save draft</button>':''}</div>${settlementTable(calc)}`;if($('#saveSettlement'))$('#saveSettlement').onclick=()=>saveSettlements(calc);};

  const baseDeposits=window.deposits;
  window.deposits=function depositsWithoutNote(c){baseDeposits(c);c.querySelectorAll('table tr').forEach(row=>row.children[3]?.remove());};

  const oldBazar=window.bazar;
  window.bazar=function bazarFix(c){oldBazar(c);c.querySelectorAll('.bazar-read-row').forEach(row=>{const left=row.children[0],right=row.children[1];if(left){const b=left.querySelector('b');if(b){const text=b.textContent.trim(),parts=text.split(/\s+/);if(parts.length>1&&parts.every(x=>x===parts[0]))b.textContent=parts[0];}}if(right){const spans=right.querySelectorAll('span'),b=right.querySelector('b');if(spans[0]&&b){const rate=spans[0].textContent.trim();const total=b.textContent.trim();right.innerHTML=`<div class="price-breakdown"><small>Rate</small><span>${esc(rate)}</span><small>Subtotal</small><strong>${esc(total)}</strong></div>`;}}});};

  if('Notification' in window && Notification.permission==='default') setTimeout(()=>Notification.requestPermission().catch(()=>{}),1800);
  const oldChat=window.chat;
  if(oldChat) window.chat=async function chatNotify(c){await oldChat(c);};
})();
