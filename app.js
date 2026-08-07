/* global supabase, MESS_MANAGER_CONFIG */
'use strict';
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const money = n => `৳${Number(n || 0).toLocaleString('en-BD', {maximumFractionDigits: 0})}`;
const today = () => new Date().toISOString().slice(0, 10);
const monthKey = d => (d || today()).slice(0, 7);
const cfg = window.MESS_MANAGER_CONFIG || {};
const configured = /^https:\/\/.+\.supabase\.co$/.test(cfg.supabaseUrl || '') && !String(cfg.supabaseAnonKey).includes('YOUR_');
const client = configured ? supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
  auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}
}) : null;
let session = null;
let profile = null;
let mess = null;
let db = {members:[], meals:[], bazar:[], deposits:[], utilities:[], schedules:[], settlements:[], logs:[]};
let state = {page:'dashboard', month:monthKey(), busy:false};
let realtimeChannel = null;
let realtimeTimer = null;
const adminPages = new Set(['deposits','utilities','schedule','reports','settings','activity']);

function notify(message, type='error') {
  document.querySelector('.toast')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="toast ${type}" role="status">${esc(message)}</div>`);
  setTimeout(() => document.querySelector('.toast')?.remove(), 4500);
}
function requireAdmin(){ if(profile?.role !== 'admin'){ notify('Admin access required.'); return false; } return true; }
function memberName(id){ return db.members.find(m => m.id === id)?.name || '-'; }
function activeMembers(){ return db.members.filter(m => m.active); }
function monthFilter(arr, field='date'){ return arr.filter(x => monthKey(x[field]) === state.month); }
function dateRange(){ const [y,m] = state.month.split('-').map(Number); return [`${state.month}-01`, new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)]; }
function friendlyError(error){ console.error(error); return error?.message || 'Something went wrong. Please try again.'; }
async function run(task, success){
  if(state.busy) return;
  state.busy = true;
  try { await task(); if(success) notify(success, 'success'); }
  catch(error){ notify(friendlyError(error)); }
  finally { state.busy = false; }
}
function assertResult(result){ if(result.error) throw result.error; return result.data; }
async function logActivity(action, entityType, entityId=null, metadata={}){
  const result = await client.from('activity_logs').insert({mess_id:profile.mess_id, actor_id:session.user.id, action, entity_type:entityType, entity_id:entityId, metadata:metadata || {}});
  if(result.error) console.warn('Audit log failed', result.error.message);
}

async function loadData(){
  const [start,end] = dateRange();
  const calls = [
    client.from('members').select('*').order('name'),
    client.from('meals').select('*').gte('meal_date',start).lte('meal_date',end),
    client.from('bazar_entries').select('*, bazar_items(*)').gte('entry_date',start).lte('entry_date',end).order('entry_date',{ascending:false}),
    client.from('deposits').select('*').gte('deposit_date',start).lte('deposit_date',end).order('deposit_date',{ascending:false}),
    client.from('utility_bills').select('*, utility_bill_members(member_id)').gte('bill_date',start).lte('bill_date',end).order('bill_date',{ascending:false}),
    client.from('bazar_schedules').select('*').gte('schedule_date',start).lte('schedule_date',end).order('schedule_date'),
    client.from('monthly_settlements').select('*').eq('month',start)
  ];
  if(profile.role === 'admin') calls.push(client.from('activity_logs').select('*').order('created_at',{ascending:false}).limit(100));
  const results = await Promise.all(calls);
  results.forEach(assertResult);
  db.members = results[0].data;
  db.meals = results[1].data.map(x => ({...x,date:x.meal_date,memberId:x.member_id,on:x.enabled}));
  db.bazar = results[2].data.map(x => ({...x,date:x.entry_date,buyerId:x.buyer_member_id,bazar_items:(x.bazar_items||[]).sort((a,b)=>a.position-b.position)}));
  db.deposits = results[3].data.map(x => ({...x,date:x.deposit_date,memberId:x.member_id}));
  db.utilities = results[4].data.map(x => ({...x,date:x.bill_date,type:x.bill_type,memberIds:x.utility_bill_members.map(y=>y.member_id)}));
  db.schedules = results[5].data.map(x => ({...x,date:x.schedule_date,names:x.assigned_names,done:x.status==='done'}));
  db.settlements = results[6].data;
  db.logs = results[7]?.data || [];
}
function stopRealtime(){ if(realtimeChannel){ client.removeChannel(realtimeChannel); realtimeChannel=null; } clearTimeout(realtimeTimer); }
function startRealtime(){
  stopRealtime();
  const refresh = () => {
    clearTimeout(realtimeTimer);
    realtimeTimer=setTimeout(async()=>{
      if(state.busy || !session) return;
      try {
        profile=assertResult(await client.from('members').select('*').eq('user_id',session.user.id).eq('active',true).single());
        await loadData();
        if(profile.role!=='admin' && adminPages.has(state.page)) state.page='dashboard';
        render();
      } catch(error){ console.error('Realtime refresh failed',error); }
    },250);
  };
  realtimeChannel=client.channel(`mess:${profile.mess_id}`);
  ['members','meals','bazar_entries','bazar_items','deposits','utility_bills','utility_bill_members'].forEach(table=>{
    realtimeChannel.on('postgres_changes',{event:'*',schema:'public',table},refresh);
  });
  realtimeChannel.subscribe(status=>{ if(status==='CHANNEL_ERROR') console.warn('Realtime connection interrupted'); });
}
async function bootstrap(authSession){
  session = authSession;
  if(!session){ stopRealtime(); profile=null; mess=null; render(); return; }
  try {
    profile = assertResult(await client.from('members').select('*').eq('user_id',session.user.id).eq('active',true).single());
    mess = assertResult(await client.from('messes').select('*').eq('id',profile.mess_id).single());
    await loadData();
    startRealtime();
    if(profile.role !== 'admin' && adminPages.has(state.page)) state.page='dashboard';
  } catch(error){ profile=null; notify('Your account is not linked to an active mess. Contact an administrator.'); console.error(error); }
  render();
}

function nav(){
  const all=[['dashboard','Dashboard'],['members','Members'],['meals','Meal'],['bazar','Bazar'],['deposits','Deposit'],['utilities','Bills'],['schedule','Schedule'],['settlement','Settlement'],['reports','Reports'],['activity','Activity'],['settings','Settings']];
  const allowed = profile.role === 'admin' ? all : all.filter(([k]) => ['dashboard','members','meals','bazar','settlement'].includes(k));
  return allowed.map(([k,l])=>`<button class="${state.page===k?'active':''}" data-page="${k}">${l}</button>`).join('');
}
async function go(page){ if(adminPages.has(page) && !requireAdmin()) return; state.page=page; render(); }
function pageTitle(){return {dashboard:'Dashboard',members:'Members',meals:'Daily Meal',bazar:'Bazar Management',deposits:'Deposits',utilities:'Utility Bills',schedule:'Bazar Schedule',settlement:'Monthly Settlement',reports:'Reports',activity:'Activity Log',settings:'Settings'}[state.page] || 'Mess Manager';}
function render(){
  if(!configured) return renderSetup();
  if(!session || !profile) return renderLogin();
  const navigation=nav();
  $('#app').innerHTML=`<div class="layout"><aside class="sidebar"><div class="brand">Mess Manager</div><nav class="nav" aria-label="Main navigation">${navigation}</nav><div class="sidebar-foot"><button class="btn" id="logout">Logout</button></div></aside><main class="main"><header class="topbar"><div><h1>${pageTitle()}</h1><div class="muted">${esc(mess.name)}</div></div><div class="row"><label class="sr-only" for="month">Month</label><input id="month" type="month" value="${state.month}"/><span class="badge">${esc(profile.name)} · ${esc(profile.role)}</span></div></header><div id="content"></div></main><nav class="mobilebar" aria-label="Mobile navigation">${navigation}</nav></div>`;
  document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.page)));
  $('#logout').addEventListener('click',()=>client.auth.signOut());
  $('#month').addEventListener('change', async e=>{state.month=e.target.value; await run(async()=>{await loadData(); render();});});
  renderPage();
}
function renderSetup(){ $('#app').innerHTML=`<div class="login"><div class="card"><h1>Connect Supabase</h1><p class="muted">Copy <code>config.example.js</code> to <code>config.js</code>, add your project URL and publishable key, then reload.</p><div class="notice">Never use a service-role key in browser code. Apply the included migration first so Row Level Security is active.</div></div></div>`; }
function renderLogin(){
  $('#app').innerHTML=`<div class="login"><form class="card" id="loginForm"><h1>Mess Manager</h1><p class="muted">Secure Admin & Member sign in</p><div class="field"><label for="email">Email</label><input id="email" type="email" autocomplete="email" required/></div><div class="field gap-top"><label for="password">Password</label><input id="password" type="password" autocomplete="current-password" minlength="8" required/></div><button class="btn primary full gap-top" type="submit">Sign in</button><button class="link-button" id="forgot" type="button">Forgot password?</button></form></div>`;
  $('#loginForm').addEventListener('submit', async e=>{e.preventDefault(); await run(async()=>assertResult(await client.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value})));});
  $('#forgot').addEventListener('click', async()=>{const email=$('#email').value.trim();if(!email)return notify('Enter your email first.');await run(async()=>assertResult(await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname})),'Password reset email sent.');});
}
function renderPage(){ const c=$('#content'); ({dashboard,members,meals,bazar,deposits,utilities,schedule,settlement,reports,activity,settings}[state.page] || dashboard)(c); }
function calcMonth(){
  const members=activeMembers(); const bazarTotal=db.bazar.reduce((s,x)=>s+Number(x.amount),0); const totalUnits=db.meals.filter(x=>x.on).reduce((s,x)=>s+Number(x.units||1),0); const rate=totalUnits?bazarTotal/totalUnits:0;
  return members.map(member=>{const units=db.meals.filter(x=>x.memberId===member.id&&x.on).reduce((s,x)=>s+Number(x.units||1),0);const food=units*rate;const util=db.utilities.reduce((s,u)=>s+(u.memberIds.includes(member.id)?Number(u.amount)/(u.memberIds.length||1):0),0);const deposit=db.deposits.filter(x=>x.memberId===member.id).reduce((s,x)=>s+Number(x.amount),0);return {member,units,food,util,deposit,total:food+util,balance:deposit-food-util};});
}
function dashboard(c){let calc=calcMonth();if(profile.role!=='admin')calc=calc.filter(x=>x.member.id===profile.id);const bazarTotal=db.bazar.reduce((s,x)=>s+Number(x.amount),0),dep=calc.reduce((s,x)=>s+x.deposit,0),util=db.utilities.reduce((s,x)=>s+Number(x.amount),0),due=calc.reduce((s,x)=>s+Math.max(0,-x.balance),0);c.innerHTML=`<div class="grid kpis"><div class="card kpi"><div class="label">মোট বাজার</div><div class="value">${money(bazarTotal)}</div></div><div class="card kpi"><div class="label">মোট জমা</div><div class="value">${money(dep)}</div></div><div class="card kpi"><div class="label">Utility Bills</div><div class="value">${money(util)}</div></div><div class="card kpi"><div class="label">মোট Due</div><div class="value">${money(due)}</div></div></div><div class="section-head"><h2>Member Summary</h2></div>${settlementTable(calc)}`;}
function members(c){const visible=profile.role==='admin'?db.members:activeMembers();c.innerHTML=`<div class="section-head"><h2>সব Member</h2>${profile.role==='admin'?'<button class="btn primary" data-add>+ Add Member</button>':''}</div>${profile.role==='admin'?'<div class="notice">Create an Auth user securely in Supabase, then link its user UUID here. Role and status changes are enforced by database policies.</div>':''}<div class="list">${visible.map(m=>`<div class="list-item"><div><b>${esc(m.name)}</b><div class="muted">${m.active?'Active':'Inactive'} · ${esc(m.role)} · ${esc(m.email||'No email')} · ${esc(m.phone||'No phone')} · Joined ${esc(m.join_date)}</div></div>${profile.role==='admin'?`<div class="actions"><button class="btn" data-edit="${m.id}">Edit</button><button class="btn danger" data-toggle="${m.id}">${m.active?'Deactivate':'Activate'}</button></div>`:''}</div>`).join('')}</div>`;if(profile.role==='admin'){c.querySelector('[data-add]').onclick=()=>memberModal();c.querySelectorAll('[data-edit]').forEach(x=>x.onclick=()=>memberModal(x.dataset.edit));c.querySelectorAll('[data-toggle]').forEach(x=>x.onclick=()=>toggleMember(x.dataset.toggle));}}
function memberModal(id){if(!requireAdmin())return;const m=db.members.find(x=>x.id===id)||{name:'',email:'',phone:'',join_date:today(),user_id:'',role:'member',active:true};modal(`<h2>${id?'Edit':'Add'} Member</h2><form id="memberForm"><div class="form-grid"><div class="field"><label>Name</label><input name="name" value="${esc(m.name)}" required maxlength="120"/></div><div class="field"><label>Email</label><input name="email" type="email" value="${esc(m.email||'')}" required/></div><div class="field"><label>Phone (optional)</label><input name="phone" type="tel" value="${esc(m.phone||'')}" maxlength="40"/></div><div class="field"><label>Join date</label><input name="join_date" type="date" value="${esc(m.join_date||today())}" required/></div><div class="field"><label>Auth user UUID (optional)</label><input name="user_id" value="${esc(m.user_id||'')}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/></div><div class="field"><label>Role</label><select name="role"><option value="member">Member</option><option value="admin" ${m.role==='admin'?'selected':''}>Admin</option></select></div></div><div class="actions gap-top"><button class="btn primary">Save</button><button class="btn" type="button" data-close>Cancel</button></div></form>`);$('[data-close]').onclick=closeModal;$('#memberForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),payload={mess_id:profile.mess_id,name:f.get('name').trim(),email:f.get('email').trim(),phone:f.get('phone').trim()||null,join_date:f.get('join_date'),user_id:f.get('user_id').trim()||null,role:f.get('role')};await run(async()=>{const q=id?client.from('members').update(payload).eq('id',id):client.from('members').insert(payload);assertResult(await q);await logActivity(id?'update':'create','member',id,{role:payload.role});closeModal();await loadData();render();},'Member saved.');};}
async function toggleMember(id){await run(async()=>{const m=db.members.find(x=>x.id===id);assertResult(await client.from('members').update({active:!m.active}).eq('id',id));await logActivity('status_change','member',id,{active:!m.active});await loadData();render();},'Member status updated.');}
function meals(c){const [start,end]=dateRange();const dates=[];for(let d=new Date(start+'T00:00:00Z'),last=new Date(end+'T00:00:00Z');d<=last;d.setUTCDate(d.getUTCDate()+1))dates.push(d.toISOString().slice(0,10));const visible=profile.role==='admin'?activeMembers():activeMembers().filter(m=>m.id===profile.id);c.innerHTML=`<div class="card"><div class="muted">প্রতিদিন meal ON/OFF করুন। Missing days default to OFF and are created securely when toggled.</div></div><div class="section-head"><h2>Daily Meal</h2></div><div class="table-wrap"><table><thead><tr><th>Date</th>${visible.map(m=>`<th>${esc(m.name)}</th>`).join('')}</tr></thead><tbody>${dates.map(date=>`<tr><td>${date}</td>${visible.map(m=>{const x=db.meals.find(z=>z.date===date&&z.memberId===m.id);return `<td><button class="btn ${x?.on?'good':''}" data-meal-member="${m.id}" data-meal-date="${date}" data-current="${x?.on?'true':'false'}">${x?.on?'ON':'OFF'}</button></td>`;}).join('')}</tr>`).join('')}</tbody></table></div>`;c.querySelectorAll('[data-meal-member]').forEach(b=>b.onclick=()=>toggleMeal(b.dataset.mealMember,b.dataset.mealDate,b.dataset.current==='true'));}
async function toggleMeal(memberId,date,current){if(profile.role!=='admin'&&memberId!==profile.id)return notify('You can change only your own meal.');await run(async()=>{assertResult(await client.from('meals').upsert({mess_id:profile.mess_id,member_id:memberId,meal_date:date,enabled:!current,units:1},{onConflict:'member_id,meal_date'}));await logActivity('toggle','meal',null,{member_id:memberId,date,enabled:!current});await loadData();render();});}
function bazar(c){const total=db.bazar.reduce((sum,x)=>sum+Number(x.amount),0),todays=db.bazar.filter(x=>x.date===today());const cards=rows=>rows.map(x=>`<article class="card bazar-card"><div class="section-head"><div><b>${esc(x.date)}</b><div class="muted">Buyer: ${esc(x.buyerId?memberName(x.buyerId):x.buyer)}${x.note?` · ${esc(x.note)}`:''}</div></div><strong>${money(x.amount)}</strong></div><div class="item-list">${x.bazar_items.map(i=>`<div><span>${esc(i.item_name)} <small class="muted">${esc(i.category)}${i.quantity?` · ${esc(i.quantity)} ${esc(i.unit||'')}`:''}${i.unit_price?` · ${money(i.unit_price)}`:''}</small></span><b>${money(i.total_price)}</b></div>`).join('')}</div>${profile.role==='admin'?`<div class="actions gap-top"><button class="btn" data-edit="${x.id}">Edit</button><button class="btn danger" data-delete="${x.id}">Delete</button></div>`:''}</article>`).join('')||'<div class="card empty">No bazar entries</div>';c.innerHTML=`<div class="grid kpis bazar-summary"><div class="card kpi"><div class="label">Monthly total</div><div class="value">${money(total)}</div></div><div class="card kpi"><div class="label">Today</div><div class="value">${money(todays.reduce((s,x)=>s+Number(x.amount),0))}</div></div></div><div class="section-head"><h2>Today's bazar</h2>${profile.role==='admin'?'<button class="btn primary" data-add>+ Add Bazar</button>':''}</div><div class="bazar-grid">${cards(todays)}</div><div class="section-head"><h2>${esc(state.month)} history</h2></div><div class="bazar-grid">${cards(db.bazar)}</div>`;if(profile.role==='admin'){c.querySelector('[data-add]').onclick=()=>bazarModal();c.querySelectorAll('[data-edit]').forEach(x=>x.onclick=()=>bazarModal(x.dataset.edit));c.querySelectorAll('[data-delete]').forEach(x=>x.onclick=()=>remove('bazar',x.dataset.delete));}}
function bazarItemRow(item={}){return `<div class="bazar-item-row"><input name="item_name" placeholder="Item name" value="${esc(item.item_name||'')}" required/><input name="category" placeholder="Category" value="${esc(item.category||'Grocery')}" required/><input name="quantity" type="number" min="0.001" step="0.001" placeholder="Qty" value="${esc(item.quantity||'')}"/><input name="unit" placeholder="kg / pcs / L" value="${esc(item.unit||'')}"/><input name="unit_price" type="number" min="0" step="0.01" placeholder="Unit price" value="${esc(item.unit_price||'')}"/><input name="total_price" type="number" min="0" step="0.01" placeholder="Total" value="${esc(item.total_price||'')}" required/><button class="btn danger" type="button" data-remove-item>×</button></div>`;}
function bazarModal(id){if(!requireAdmin())return;const x=db.bazar.find(z=>z.id===id)||{date:today(),buyerId:activeMembers()[0]?.id,note:'',bazar_items:[{}]};modal(`<h2>${id?'Edit':'Add'} Detailed Bazar</h2><form id="bazarForm"><div class="form-grid"><div class="field"><label>Date</label><input name="entry_date" type="date" value="${esc(x.date)}" required/></div><div class="field"><label>Buyer</label><select name="buyer_member_id" required>${activeMembers().map(m=>`<option value="${m.id}" ${x.buyerId===m.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></div><div class="field"><label>Note (optional)</label><input name="note" maxlength="500" value="${esc(x.note||'')}"/></div></div><div class="section-head"><h3>Items</h3><button class="btn" type="button" data-add-item>+ Item</button></div><div id="bazarItems">${x.bazar_items.map(bazarItemRow).join('')}</div><div class="bazar-form-total">Total: <b id="bazarTotal">${money(x.amount)}</b></div>${modalButtons()}</form>`);const items=$('#bazarItems'),bindRows=()=>{items.querySelectorAll('[data-remove-item]').forEach(b=>b.onclick=()=>{if(items.children.length>1)b.parentElement.remove();updateTotal();});items.querySelectorAll('input').forEach(input=>input.oninput=()=>{const row=input.closest('.bazar-item-row'),quantity=row.querySelector('[name="quantity"]'),unitPrice=row.querySelector('[name="unit_price"]');if((input===quantity||input===unitPrice)&&quantity.value&&unitPrice.value)row.querySelector('[name="total_price"]').value=(Number(quantity.value)*Number(unitPrice.value)).toFixed(2);updateTotal();});};const updateTotal=()=>{$('#bazarTotal').textContent=money([...items.querySelectorAll('[name="total_price"]')].reduce((s,i)=>s+Number(i.value||0),0));};$('[data-add-item]').onclick=()=>{items.insertAdjacentHTML('beforeend',bazarItemRow());bindRows();};$('[data-close]').onclick=closeModal;bindRows();$('#bazarForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),rows=[...items.children].map((row,position)=>Object.fromEntries([...row.querySelectorAll('input')].map(input=>[input.name,input.value]).concat([['position',position]])));await run(async()=>{const savedId=assertResult(await client.rpc('save_bazar_entry',{p_id:id||null,p_entry_date:f.get('entry_date'),p_buyer_member_id:f.get('buyer_member_id'),p_note:f.get('note').trim(),p_items:rows}));await logActivity(id?'update':'create','bazar',savedId);closeModal();await loadData();render();},'Bazar saved.');};}
function deposits(c){c.innerHTML=`<div class="section-head"><h2>Deposits</h2><button class="btn primary" data-add>+ Add Deposit</button></div>${entryTable(db.deposits,[['Date','date'],['Member',x=>memberName(x.memberId)],['Amount','amount'],['Note','note']],'deposits')}`;bindCrud(c,'deposits',depositModal);}
function depositModal(id){const x=db.deposits.find(z=>z.id===id)||{date:today(),memberId:activeMembers()[0]?.id,amount:'',note:''};modal(`<h2>${id?'Edit':'Add'} Deposit</h2><form id="dataForm"><div class="form-grid"><div class="field"><label>Date</label><input name="deposit_date" type="date" value="${x.date}" required/></div><div class="field"><label>Member</label><select name="member_id">${activeMembers().map(m=>`<option value="${m.id}" ${x.memberId===m.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></div><div class="field"><label>Amount</label><input name="amount" type="number" min="0.01" step="0.01" value="${x.amount}" required/></div><div class="field"><label>Note</label><input name="note" maxlength="500" value="${esc(x.note)}"/></div></div>${modalButtons()}</form>`);bindForm(async p=>{p.mess_id=profile.mess_id;p.amount=Number(p.amount);await persist('deposits',id,p,'deposit');});}
function utilities(c){c.innerHTML=`<div class="section-head"><h2>Utility Bills</h2><button class="btn primary" data-add>+ Add Bill</button></div>${entryTable(db.utilities,[['Date','date'],['Type','type'],['Amount','amount'],['Shared By',x=>x.memberIds.map(memberName).join(', ')]],'utilities')}`;bindCrud(c,'utilities',utilityModal);}
function utilityModal(id){const x=db.utilities.find(z=>z.id===id)||{date:today(),type:'Gas',amount:'',memberIds:activeMembers().map(m=>m.id)};modal(`<h2>${id?'Edit':'Add'} Utility Bill</h2><form id="dataForm"><div class="form-grid"><div class="field"><label>Date</label><input name="bill_date" type="date" value="${x.date}" required/></div><div class="field"><label>Type</label><select name="bill_type">${['Gas','WiFi','Current','Water','Other'].map(t=>`<option ${t===x.type?'selected':''}>${t}</option>`).join('')}</select></div><div class="field"><label>Amount</label><input name="amount" type="number" min="0" step="0.01" value="${x.amount}" required/></div><fieldset class="field"><legend>Share With</legend>${activeMembers().map(m=>`<label><input type="checkbox" name="memberIds" value="${m.id}" ${x.memberIds.includes(m.id)?'checked':''}/> ${esc(m.name)}</label>`).join('')}</fieldset></div>${modalButtons()}</form>`);$('#dataForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),memberIds=f.getAll('memberIds');if(!memberIds.length)return notify('Select at least one member.');await run(async()=>{const payload={mess_id:profile.mess_id,bill_date:f.get('bill_date'),bill_type:f.get('bill_type'),amount:Number(f.get('amount'))};let billId=id;if(id)assertResult(await client.from('utility_bills').update(payload).eq('id',id));else billId=assertResult(await client.from('utility_bills').insert(payload).select('id').single()).id;assertResult(await client.from('utility_bill_members').delete().eq('utility_bill_id',billId));assertResult(await client.from('utility_bill_members').insert(memberIds.map(member_id=>({utility_bill_id:billId,member_id}))));await logActivity(id?'update':'create','utility_bill',billId);closeModal();await loadData();render();},'Utility bill saved.');};$('[data-close]').onclick=closeModal;}
function schedule(c){c.innerHTML=`<div class="section-head"><h2>Bazar Schedule</h2><button class="btn primary" data-add>+ Add Schedule</button></div>${entryTable(db.schedules,[['Date','date'],['Assigned','names'],['Status',x=>x.done?'Done':'Pending']],'schedules')}`;bindCrud(c,'schedules',scheduleModal);}
function scheduleModal(id){const x=db.schedules.find(z=>z.id===id)||{date:today(),names:'',done:false};simpleModal(id,'Schedule',[['schedule_date','Date','date',x.date],['assigned_names','Assigned Names','text',x.names],['status','Status','select',x.done?'done':'pending']],async p=>{p.mess_id=profile.mess_id;await persist('bazar_schedules',id,p,'schedule');});}
function settlementTable(calc){return `<div class="table-wrap"><table><thead><tr><th>Member</th><th>Meals</th><th>Deposit</th><th>Food</th><th>Utility</th><th>Total Bill</th><th>Due/Advance</th></tr></thead><tbody>${calc.map(x=>`<tr><td><b>${esc(x.member.name)}</b></td><td>${x.units}</td><td>${money(x.deposit)}</td><td>${money(x.food)}</td><td>${money(x.util)}</td><td>${money(x.total)}</td><td>${x.balance>=0?`<span class="pill advance">Advance ${money(x.balance)}</span>`:`<span class="pill due">Due ${money(-x.balance)}</span>`}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">No data</td></tr>'}</tbody></table></div>`;}
function settlement(c){let calc=calcMonth();if(profile.role!=='admin')calc=calc.filter(x=>x.member.id===profile.id);c.innerHTML=`<div class="card"><b>Calculation:</b> Bazar cost ÷ active meal units = meal rate. Utilities are divided among selected members. Deposit − total bill = advance/due.</div><div class="section-head"><h2>${state.month} Settlement</h2>${profile.role==='admin'?'<button class="btn primary" id="saveSettlement">Save draft</button>':''}</div>${settlementTable(calc)}`;if($('#saveSettlement'))$('#saveSettlement').onclick=()=>saveSettlements(calc);}
async function saveSettlements(calc){await run(async()=>{const rows=calc.map(x=>({mess_id:profile.mess_id,member_id:x.member.id,month:`${state.month}-01`,meal_units:x.units,food_cost:x.food,utility_cost:x.util,deposit_total:x.deposit,balance:x.balance,status:'draft'}));assertResult(await client.from('monthly_settlements').upsert(rows,{onConflict:'mess_id,member_id,month'}));await logActivity('save_draft','monthly_settlement',state.month);await loadData();render();},'Settlement draft saved.');}
function reports(c){const calc=calcMonth(),units=calc.reduce((s,x)=>s+x.units,0),cost=db.bazar.reduce((s,x)=>s+Number(x.amount),0);c.innerHTML=`<div class="grid kpis"><div class="card kpi"><div class="label">Total Meal Units</div><div class="value">${units}</div></div><div class="card kpi"><div class="label">Food Cost / Unit</div><div class="value">${money(units?cost/units:0)}</div></div><div class="card kpi"><div class="label">Bazar Entries</div><div class="value">${db.bazar.length}</div></div><div class="card kpi"><div class="label">Utility Entries</div><div class="value">${db.utilities.length}</div></div></div><div class="section-head"><h2>Settlement Report</h2></div>${settlementTable(calc)}`;}
function activity(c){c.innerHTML=`<div class="section-head"><h2>Recent Activity</h2></div><div class="list">${db.logs.map(x=>`<div class="list-item"><div><b>${esc(x.action)} ${esc(x.entity_type)}</b><div class="muted">${new Date(x.created_at).toLocaleString()} · ${esc(x.entity_id||'')}</div></div></div>`).join('')||'<div class="card empty">No activity yet</div>'}</div>`;}
function settings(c){c.innerHTML=`<div class="card"><form id="settingsForm"><div class="field"><label>Mess Name</label><input name="name" value="${esc(mess.name)}" required maxlength="120"/></div><div class="actions gap-top"><button class="btn primary">Save Settings</button><button class="btn danger" type="button" id="resetPassword">Send password reset</button></div></form></div>`;$('#settingsForm').onsubmit=async e=>{e.preventDefault();await run(async()=>{assertResult(await client.from('messes').update({name:new FormData(e.target).get('name').trim()}).eq('id',mess.id));await logActivity('update','mess',mess.id);mess.name=new FormData(e.target).get('name').trim();render();},'Settings saved.');};$('#resetPassword').onclick=()=>run(async()=>assertResult(await client.auth.resetPasswordForEmail(session.user.email,{redirectTo:location.origin+location.pathname})),'Password reset email sent.');}
function entryTable(rows,columns,kind){return `<div class="table-wrap"><table><thead><tr>${columns.map(([h])=>`<th>${h}</th>`).join('')}<th>Actions</th></tr></thead><tbody>${rows.map(x=>`<tr>${columns.map(([,key])=>{let value=typeof key==='function'?key(x):x[key];if(key==='amount')value=money(value);return `<td>${esc(value||'-')}</td>`;}).join('')}<td><div class="actions"><button class="btn" data-edit="${x.id}">Edit</button><button class="btn danger" data-delete="${x.id}" data-kind="${kind}">Delete</button></div></td></tr>`).join('')||`<tr><td colspan="${columns.length+1}" class="empty">No entries</td></tr>`}</tbody></table></div>`;}
function bindCrud(c,kind,open){c.querySelector('[data-add]').onclick=()=>open();c.querySelectorAll('[data-edit]').forEach(x=>x.onclick=()=>open(x.dataset.edit));c.querySelectorAll('[data-delete]').forEach(x=>x.onclick=()=>remove(kind,x.dataset.delete));}
const tableMap={bazar:['bazar_entries','bazar'],deposits:['deposits','deposit'],utilities:['utility_bills','utility_bill'],schedules:['bazar_schedules','schedule']};
async function remove(kind,id){if(!requireAdmin()||!confirm('Delete this entry?'))return;await run(async()=>{const [table,entity]=tableMap[kind];assertResult(await client.from(table).delete().eq('id',id));await logActivity('delete',entity,id);await loadData();render();},'Entry deleted.');}
async function persist(table,id,payload,entity){await run(async()=>{const q=id?client.from(table).update(payload).eq('id',id):client.from(table).insert(payload);assertResult(await q);await logActivity(id?'update':'create',entity,id);closeModal();await loadData();render();},`${entity.replace('_',' ')} saved.`);}
function simpleModal(id,title,fields,onSave){modal(`<h2>${id?'Edit':'Add'} ${title}</h2><form id="dataForm"><div class="form-grid">${fields.map(([name,label,type,value])=>`<div class="field"><label>${label}</label>${type==='textarea'?`<textarea name="${name}" required>${esc(value)}</textarea>`:type==='select'?`<select name="${name}"><option value="pending" ${value==='pending'?'selected':''}>Pending</option><option value="done" ${value==='done'?'selected':''}>Done</option></select>`:`<input name="${name}" type="${type}" value="${esc(value)}" ${type==='number'?'min="0" step="0.01"':''} required/>`}</div>`).join('')}</div>${modalButtons()}</form>`);bindForm(onSave);}
function bindForm(onSave){$('[data-close]').onclick=closeModal;$('#dataForm').onsubmit=async e=>{e.preventDefault();await onSave(Object.fromEntries(new FormData(e.target)));};}
function modalButtons(){return `<div class="actions gap-top"><button class="btn primary">Save</button><button class="btn" type="button" data-close>Cancel</button></div>`;}
function modal(html){document.body.insertAdjacentHTML('beforeend',`<div class="modal-wrap" id="modal" role="dialog" aria-modal="true"><div class="modal">${html}</div></div>`);}
function closeModal(){ $('#modal')?.remove(); }

if(client){client.auth.onAuthStateChange((_event,newSession)=>setTimeout(()=>bootstrap(newSession),0));client.auth.getSession().then(({data})=>bootstrap(data.session));}else render();
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
