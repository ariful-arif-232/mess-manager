/* global supabase, MESS_MANAGER_CONFIG */
'use strict';
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt',"'":'&#39;','"':'&quot;'}[c]));
const money = n => `৳${Number(n || 0).toLocaleString('en-BD', {maximumFractionDigits: 2})}`;
const today = () => new Date().toISOString().slice(0, 10);
const monthKey = d => (d || today()).slice(0, 7);
const cfg = window.MESS_MANAGER_CONFIG || {};
const configured = /^https:\/\/.+\.supabase\.co$/.test(cfg.supabaseUrl || '') && !String(cfg.supabaseAnonKey).includes('YOUR_');
const client = configured ? supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}) : null;
let session=null, profile=null, mess=null;
let db={members:[],meals:[],bazar:[],deposits:[],utilities:[],schedules:[],settlements:[],logs:[]};
let realtimeChannel=null,realtimeRefresh=null;
let state={page:'dashboard',month:monthKey(),busy:false};
const adminPages=new Set(['activity','settings']);
const MM_UTILITY_TYPES=[
  {key:'Gas',label:'Gas',icon:'🔥'},
  {key:'Current',label:'Current',icon:'⚡'},
  {key:'WiFi',label:'WiFi',icon:'📶'},
  {key:'Bua',label:'Bua Bill',icon:'🧹'},
  {key:'Water',label:'Water',icon:'💧'},
  {key:'Other',label:'Other',icon:'▦'}
];
const MM_UTILITY_TYPE_KEYS=new Set(MM_UTILITY_TYPES.map(x=>x.key));
function notify(message,type='error'){document.querySelector('.toast')?.remove();document.body.insertAdjacentHTML('beforeend',`<div class="toast ${type}" role="status">${esc(message)}</div>`);setTimeout(()=>document.querySelector('.toast')?.remove(),4500)}
function requireAdmin(){if(profile?.role!=='admin'){notify('Admin access required.');return false}return true}
function memberName(id){return db.members.find(m=>m.id===id)?.name||'-'}
function activeMembers(){return db.members.filter(m=>m.active)}
function normalizeUtilityType(value){const raw=String(value||'').trim();const lower=raw.toLowerCase();if(lower==='gas')return'Gas';if(['current','electricity','electric'].includes(lower))return'Current';if(['wifi','wi-fi','internet'].includes(lower))return'WiFi';if(['bua','bua bill','maid'].includes(lower))return'Bua';if(lower==='water')return'Water';if(lower==='other'||!raw)return'Other';return MM_UTILITY_TYPE_KEYS.has(raw)?raw:'Other'}
function depositPurposeOf(row){const raw=String(row?.purpose||row?.note||'').trim();const type=normalizeUtilityType(raw);if(raw.toLowerCase()==='bazar')return'Bazar';if(['Gas','Current','WiFi','Bua','Water','Other'].includes(type)&&raw)return type;return'Bazar'}
function utilityModeOf(row){return String(row?.mode||row?.bill_mode||'shared').toLowerCase()==='fixed'?'fixed':'shared'}
function utilityLedger(){
  const categories=MM_UTILITY_TYPES.map(meta=>({...meta,sharedEntries:[],fixedEntries:[],sharedTotal:0,fixedTotal:0,total:0,fixedByMember:new Map(),sharedMemberIds:new Set(),memberCharges:new Map(),sharedMembers:[],fixedMembers:[],remainder:0,fixedDeduction:0}));
  const byType=new Map(categories.map(x=>[x.key,x]));
  for(const row of db.utilities){
    const category=byType.get(normalizeUtilityType(row.type))||byType.get('Other');
    (utilityModeOf(row)==='fixed'?category.fixedEntries:category.sharedEntries).push(row);
  }
  const memberTotals=new Map();
  for(const category of categories){
    category.sharedTotal=category.sharedEntries.reduce((sum,row)=>sum+Number(row.amount||0),0);
    for(const row of category.sharedEntries){for(const memberId of row.memberIds||[])category.sharedMemberIds.add(memberId)}
    for(const row of category.fixedEntries){
      const fixedAmount=Number(row.amount||0);
      for(const memberId of row.memberIds||[]){category.fixedByMember.set(memberId,(category.fixedByMember.get(memberId)||0)+fixedAmount)}
    }
    category.fixedTotal=[...category.fixedByMember.values()].reduce((sum,value)=>sum+Number(value||0),0);
    category.total=Math.max(category.sharedTotal,category.fixedTotal);
    category.fixedDeduction=Math.min(category.fixedTotal,category.sharedTotal);
    category.remainder=Math.max(0,category.total-category.fixedTotal);
    category.fixedMembers=[...category.fixedByMember.keys()];
    category.sharedMembers=[...category.sharedMemberIds].filter(memberId=>!category.fixedByMember.has(memberId));
    const sharedEach=category.sharedMembers.length?category.remainder/category.sharedMembers.length:0;
    for(const [memberId,amount] of category.fixedByMember)category.memberCharges.set(memberId,amount);
    for(const memberId of category.sharedMembers)category.memberCharges.set(memberId,sharedEach);
    for(const [memberId,amount] of category.memberCharges)memberTotals.set(memberId,(memberTotals.get(memberId)||0)+Number(amount||0));
  }
  const totalActual=categories.reduce((sum,category)=>sum+category.total,0);
  return{categories,memberTotals,totalActual};
}
window.MM_UTILITY_TYPES=MM_UTILITY_TYPES;
window.mmDepositPurposeOf=depositPurposeOf;
window.mmUtilityLedger=utilityLedger;
function dateRange(){const[y,m]=state.month.split('-').map(Number);return[`${state.month}-01`,new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)]}
function friendlyError(error){console.error(error);return error?.message||'Something went wrong. Please try again.'}
async function run(task,success){if(state.busy)return;state.busy=true;try{await task();if(success)notify(success,'success')}catch(error){notify(friendlyError(error))}finally{state.busy=false}}
function assertResult(result){if(result.error)throw result.error;return result.data}
async function logActivity(action,entityType,entityId=null,metadata={}){const r=await client.from('activity_logs').insert({mess_id:profile.mess_id,actor_id:session.user.id,action,entity_type:entityType,entity_id:entityId,metadata:metadata||{}});if(r.error)console.warn('Audit log failed',r.error.message)}
async function loadData(){const[start,end]=dateRange();db.members=assertResult(await client.from('members').select('*').order('name'));profile=db.members.find(m=>m.user_id===session.user.id&&m.active);if(!profile)throw Error('Your account is no longer an active mess member.');const calls=[client.from('meals').select('*').gte('meal_date',start).lte('meal_date',end),client.from('bazar_entries').select('*, bazar_items(*)').gte('entry_date',start).lte('entry_date',end).order('entry_date',{ascending:false}),client.from('deposits').select('*').gte('deposit_date',start).lte('deposit_date',end).order('deposit_date',{ascending:false}),client.from('utility_bills').select('*, utility_bill_members(member_id)').gte('bill_date',start).lte('bill_date',end).order('bill_date',{ascending:false}),client.from('bazar_schedules').select('*').gte('schedule_date',start).lte('schedule_date',end).order('schedule_date'),client.from('monthly_settlements').select('*').eq('month',start)];if(profile.role==='admin')calls.push(client.from('activity_logs').select('*').order('created_at',{ascending:false}).limit(100));const r=await Promise.all(calls);r.forEach(assertResult);db.meals=r[0].data.map(x=>({...x,date:x.meal_date,memberId:x.member_id,on:x.enabled}));db.bazar=r[1].data.map(x=>({...x,date:x.entry_date,items:x.bazar_items||[]}));db.deposits=r[2].data.map(x=>({...x,date:x.deposit_date,memberId:x.member_id,purpose:x.purpose||depositPurposeOf(x)}));db.utilities=r[3].data.map(x=>({...x,date:x.bill_date,type:normalizeUtilityType(x.bill_type),mode:utilityModeOf(x),memberIds:x.utility_bill_members.map(y=>y.member_id)}));db.schedules=r[4].data.map(x=>({...x,date:x.schedule_date,names:x.assigned_names,done:x.status==='done'}));db.settlements=r[5].data;db.logs=r[6]?.data||[]}
async function bootstrap(authSession){session=authSession;if(!session){profile=null;mess=null;if(realtimeChannel)client.removeChannel(realtimeChannel);realtimeChannel=null;render();return}try{profile=assertResult(await client.from('members').select('*').eq('user_id',session.user.id).eq('active',true).single());mess=assertResult(await client.from('messes').select('*').eq('id',profile.mess_id).single());await loadData();subscribeRealtime();if(profile.role!=='admin'&&adminPages.has(state.page))state.page='dashboard'}catch(error){profile=null;console.error(error)}render()}
function subscribeRealtime(){if(realtimeChannel)client.removeChannel(realtimeChannel);realtimeChannel=client.channel(`mess:${profile.mess_id}`).on('postgres_changes',{event:'*',schema:'public'},p=>{if(!new Set(['members','meals','bazar_entries','bazar_items','deposits','utility_bills','utility_bill_members','bazar_schedules','monthly_settlements']).has(p.table))return;clearTimeout(realtimeRefresh);realtimeRefresh=setTimeout(()=>window.bootstrap(session),150)}).subscribe()}
function nav(){const all=[['dashboard','Dashboard'],['members','Members'],['meals','Meal'],['bazar','Bazar'],['deposits','Deposit'],['utilities','Bills'],['schedule','Schedule'],['settlement','Settlement'],['reports','Reports'],['activity','Activity'],['settings','Settings']];return(profile.role==='admin'?all:all.filter(([k])=>!adminPages.has(k))).map(([k,l])=>`<button class="${state.page===k?'active':''}" data-page="${k}">${l}</button>`).join('')}
function go(page){if(adminPages.has(page)&&!requireAdmin())return;state.page=page;render()}
function pageTitle(){return{dashboard:'Dashboard',members:'Members',meals:'Daily Meal',bazar:'Bazar Management',deposits:'Deposits',utilities:'Utility Bills',schedule:'Bazar Schedule',settlement:'Monthly Settlement',reports:'Reports',activity:'Activity Log',settings:'Settings'}[state.page]||'Mess Manager'}
function requestLogoutFromUI(trigger){if(typeof window.requestMessLogout==='function')return window.requestMessLogout(trigger);notify('Logout confirmation is loading. Please try again.');return Promise.resolve({error:null,cancelled:true})}
function render(){if(!configured)return renderSetup();if(!session||!profile)return renderLogin();const navigation=nav();$('#app').innerHTML=`<div class="layout"><aside class="sidebar"><div class="brand">Mess Manager</div><nav class="nav">${navigation}</nav><div class="sidebar-foot"><button class="btn" id="logout">Logout</button></div></aside><main class="main"><header class="topbar"><div><h1>${pageTitle()}</h1><div class="muted">${esc(mess.name)}</div></div><div class="row"><input id="month" type="month" value="${state.month}"/><span class="badge">${esc(profile.name)} · ${esc(profile.role)}</span></div></header><div id="content"></div></main><nav class="mobilebar">${navigation}</nav></div>`;document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>go(b.dataset.page));$('#logout').onclick=e=>requestLogoutFromUI(e.currentTarget);$('#month').onchange=async e=>{state.month=e.target.value;await run(async()=>{await loadData();render()})};renderPage()}
function renderSetup(){$('#app').innerHTML='<div class="login"><div class="card"><h1>Connect Supabase</h1></div></div>'}
function renderLogin(){$('#app').innerHTML='<div class="login"><div class="card"><h1>Mess Manager</h1><p class="muted">Loading secure sign in…</p></div></div>'}
function renderPage(){const c=$('#content');({dashboard,members,meals,bazar,deposits,utilities,schedule,settlement,reports,activity,settings}[state.page]||dashboard)(c)}
function calcMonth(){const members=activeMembers(),bazarTotal=db.bazar.reduce((s,x)=>s+Number(x.amount),0),units=db.meals.filter(x=>x.on).reduce((s,x)=>s+Number(x.units||1),0),rate=units?bazarTotal/units:0,utility=utilityLedger();return members.map(member=>{const u=db.meals.filter(x=>x.memberId===member.id&&x.on).reduce((s,x)=>s+Number(x.units||1),0),food=u*rate,util=Number(utility.memberTotals.get(member.id)||0),memberDeposits=db.deposits.filter(x=>x.memberId===member.id),foodDeposit=memberDeposits.filter(x=>depositPurposeOf(x)==='Bazar').reduce((s,x)=>s+Number(x.amount||0),0),utilityDeposit=memberDeposits.filter(x=>depositPurposeOf(x)!=='Bazar').reduce((s,x)=>s+Number(x.amount||0),0),deposit=foodDeposit+utilityDeposit;return{member,units:u,food,util,deposit,foodDeposit,utilityDeposit,total:food+util,balance:deposit-food-util}})}
function dashboard(c){const calc=calcMonth(),b=db.bazar.reduce((s,x)=>s+Number(x.amount),0),d=calc.reduce((s,x)=>s+x.deposit,0),u=utilityLedger().totalActual,due=calc.reduce((s,x)=>s+Math.max(0,-x.balance),0);c.innerHTML=`<div class="grid kpis"><div class="card kpi"><div class="label">মোট বাজার</div><div class="value">${money(b)}</div></div><div class="card kpi"><div class="label">মোট জমা</div><div class="value">${money(d)}</div></div><div class="card kpi"><div class="label">Utility Bills</div><div class="value">${money(u)}</div></div><div class="card kpi"><div class="label">মোট Due</div><div class="value">${money(due)}</div></div></div><div class="section-head"><h2>Member Summary</h2></div>${settlementTable(calc)}`}
function members(c){const controls=profile.role==='admin';c.innerHTML=`<div class="section-head"><h2>সব Member</h2>${controls?'<button class="btn primary" data-add>+ Add Member</button>':''}</div><div class="list">${db.members.map(m=>`<div class="list-item"><div><b>${esc(m.name)}</b><div class="muted">${m.active?'Active':'Inactive'} · ${esc(m.role)} · ${esc(m.email||'No email')}</div></div>${controls?`<div class="actions"><button class="btn" data-edit="${m.id}">Edit</button><button class="btn danger" data-toggle="${m.id}">${m.active?'Deactivate':'Activate'}</button></div>`:''}</div>`).join('')}</div>`;if(!controls)return;c.querySelector('[data-add]').onclick=()=>memberModal();c.querySelectorAll('[data-edit]').forEach(x=>x.onclick=()=>memberModal(x.dataset.edit));c.querySelectorAll('[data-toggle]').forEach(x=>x.onclick=()=>toggleMember(x.dataset.toggle))}
function memberModal(id){const m=db.members.find(x=>x.id===id)||{name:'',email:'',phone:'',join_date:today(),user_id:'',role:'member'};modal(`<h2>${id?'Edit':'Add'} Member</h2><form id="memberForm"><div class="form-grid"><div class="field"><label>Name</label><input name="name" value="${esc(m.name)}" required></div><div class="field"><label>Email</label><input name="email" type="email" value="${esc(m.email||'')}"></div><div class="field"><label>Phone</label><input name="phone" value="${esc(m.phone||'')}"></div><div class="field"><label>Join date</label><input name="join_date" type="date" value="${esc(m.join_date||today())}"></div><div class="field"><label>Auth user UUID</label><input name="user_id" value="${esc(m.user_id||'')}"></div><div class="field"><label>Role</label><select name="role"><option value="member">Member</option><option value="admin" ${m.role==='admin'?'selected':''}>Admin</option></select></div></div>${modalButtons()}</form>`);$('[data-close]').onclick=closeModal;$('#memberForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),p={mess_id:profile.mess_id,name:f.get('name').trim(),email:f.get('email').trim()||null,phone:f.get('phone').trim()||null,join_date:f.get('join_date'),user_id:f.get('user_id').trim()||null,role:f.get('role')};await run(async()=>{assertResult(await(id?client.from('members').update(p).eq('id',id):client.from('members').insert(p)));await logActivity(id?'update':'create','member',id);closeModal();await loadData();render()},'Member saved.')}}
async function toggleMember(id){await run(async()=>{const m=db.members.find(x=>x.id===id);assertResult(await client.from('members').update({active:!m.active}).eq('id',id));await loadData();render()})}
function meals(c){c.innerHTML='<div class="card"><div class="muted">Meal management</div></div>'}
function bazar(c){const controls=profile.role==='admin';c.innerHTML=`<div class="section-head"><h2>Detailed Bazar</h2>${controls?'<button class="btn primary" data-add>+ Add Bazar</button>':''}</div><div class="list">${db.bazar.map(x=>`<article class="card"><b>${esc(x.date)} · ${esc(memberName(x.buyer_member_id))}</b><div>${x.items.map(i=>esc(i.item_name)).join(', ')}</div><b>Total ${money(x.amount)}</b>${controls?`<div class="actions"><button class="btn" data-edit="${x.id}">Edit</button><button class="btn danger" data-delete="${x.id}" data-kind="bazar">Delete</button></div>`:''}</article>`).join('')}</div>`;if(controls)bindCrud(c,'bazar',bazarModal)}
function bazarModal(){notify('Bazar form is available from the enhanced mobile UI.','success')}
function deposits(c){const controls=profile.role==='admin';c.innerHTML=`<div class="section-head"><h2>Deposits</h2>${controls?'<button class="btn primary" data-add>+ Add Deposit</button>':''}</div>${entryTable(db.deposits,[['Date','date'],['Member',x=>memberName(x.memberId)],['Amount','amount'],['Purpose',x=>depositPurposeOf(x)]],'deposits',controls)}`;if(controls)bindCrud(c,'deposits',depositModal)}
function depositModal(id){const x=db.deposits.find(z=>z.id===id)||{date:today(),memberId:activeMembers()[0]?.id,amount:'',purpose:'Bazar'};simpleModal(id,'Deposit',[['deposit_date','Date','date',x.date],['member_id','Member','text',x.memberId],['amount','Amount','number',x.amount],['purpose','Purpose','text',depositPurposeOf(x)]],async p=>{p.mess_id=profile.mess_id;p.amount=Number(p.amount);p.note=p.purpose;await persist('deposits',id,p,'deposit')})}
function utilities(c){const controls=profile.role==='admin';c.innerHTML=`<div class="section-head"><h2>Utility Bills</h2>${controls?'<button class="btn primary" data-add>+ Add Bill</button>':''}</div>${entryTable(db.utilities,[['Date','date'],['Type','type'],['Mode',x=>utilityModeOf(x)],['Amount','amount']],'utilities',controls)}`;if(controls)bindCrud(c,'utilities',utilityModal)}
function utilityModal(id){const x=db.utilities.find(z=>z.id===id)||{date:today(),type:'Gas',mode:'shared',amount:''};simpleModal(id,'Utility Bill',[['bill_date','Date','date',x.date],['bill_type','Type','text',x.type],['bill_mode','Mode','text',utilityModeOf(x)],['amount','Amount','number',x.amount]],async p=>{p.mess_id=profile.mess_id;p.amount=Number(p.amount);await persist('utility_bills',id,p,'utility_bill')})}
function schedule(c){const controls=profile.role==='admin';c.innerHTML=`<div class="section-head"><h2>Bazar Schedule</h2>${controls?'<button class="btn primary" data-add>+ Add Schedule</button>':''}</div>${entryTable(db.schedules,[['Date','date'],['Assigned','names'],['Status',x=>x.done?'Done':'Pending']],'schedules',controls)}`;if(controls)bindCrud(c,'schedules',scheduleModal)}
function scheduleModal(id){const x=db.schedules.find(z=>z.id===id)||{date:today(),names:'',done:false};simpleModal(id,'Schedule',[['schedule_date','Date','date',x.date],['assigned_names','Assigned Names','text',x.names],['status','Status','select',x.done?'done':'pending']],async p=>{p.mess_id=profile.mess_id;await persist('bazar_schedules',id,p,'schedule')})}
function settlementTable(calc){return `<div class="table-wrap"><table><thead><tr><th>Member</th><th>Meals</th><th>Total Deposit</th><th>Food Deposit</th><th>Utility Deposit</th><th>Food Bill</th><th>Utility Bill</th><th>Total Bill</th><th>Due/Advance</th></tr></thead><tbody>${calc.map(x=>`<tr><td><b>${esc(x.member.name)}</b></td><td>${x.units}</td><td>${money(x.deposit)}</td><td>${money(x.foodDeposit)}</td><td>${money(x.utilityDeposit)}</td><td>${money(x.food)}</td><td>${money(x.util)}</td><td>${money(x.total)}</td><td>${money(x.balance)}</td></tr>`).join('')}</tbody></table></div>`}
function settlement(c){c.innerHTML=`<div class="section-head"><h2>${state.month} Settlement</h2></div>${settlementTable(calcMonth())}`}
function reports(c){c.innerHTML=`<div class="section-head"><h2>Settlement Report</h2></div>${settlementTable(calcMonth())}`}
function activity(c){c.innerHTML=`<div class="section-head"><h2>Recent Activity</h2></div><div class="list">${db.logs.map(x=>`<div class="list-item"><b>${esc(x.action)} ${esc(x.entity_type)}</b><div class="muted">${new Date(x.created_at).toLocaleString()}</div></div>`).join('')}</div>`}
function settings(c){c.innerHTML='<div class="card"><h2>Settings</h2></div>'}
function entryTable(rows,columns,kind,controls=true){return `<div class="table-wrap"><table><thead><tr>${columns.map(([h])=>`<th>${h}</th>`).join('')}${controls?'<th>Actions</th>':''}</tr></thead><tbody>${rows.map(x=>`<tr>${columns.map(([,k])=>{let v=typeof k==='function'?k(x):x[k];if(k==='amount')v=money(v);return`<td>${esc(v||'-')}</td>`}).join('')}${controls?`<td><button class="btn" data-edit="${x.id}">Edit</button><button class="btn danger" data-delete="${x.id}" data-kind="${kind}">Delete</button></td>`:''}</tr>`).join('')}</tbody></table></div>`}
function bindCrud(c,kind,open){c.querySelector('[data-add]')?.addEventListener('click',()=>open());c.querySelectorAll('[data-edit]').forEach(x=>x.onclick=()=>open(x.dataset.edit));c.querySelectorAll('[data-delete]').forEach(x=>x.onclick=()=>remove(kind,x.dataset.delete))}
const tableMap={bazar:['bazar_entries','bazar'],deposits:['deposits','deposit'],utilities:['utility_bills','utility_bill'],schedules:['bazar_schedules','schedule']};
async function remove(kind,id){if(!requireAdmin()||!confirm('Delete this entry?'))return;await run(async()=>{const[t,e]=tableMap[kind];assertResult(await client.from(t).delete().eq('id',id));await logActivity('delete',e,id);await loadData();render()})}
async function persist(table,id,payload,entity){await run(async()=>{assertResult(await(id?client.from(table).update(payload).eq('id',id):client.from(table).insert(payload)));await logActivity(id?'update':'create',entity,id);closeModal();await loadData();render()},`${entity.replace('_',' ')} saved.`)}
function simpleModal(id,title,fields,onSave){modal(`<h2>${id?'Edit':'Add'} ${title}</h2><form id="dataForm"><div class="form-grid">${fields.map(([name,label,type,value])=>`<div class="field"><label>${label}</label>${type==='select'?`<select name="${name}"><option value="pending">Pending</option><option value="done" ${value==='done'?'selected':''}>Done</option></select>`:`<input name="${name}" type="${type}" value="${esc(value||'')}" required>`}</div>`).join('')}</div>${modalButtons()}</form>`);bindForm(onSave)}
function bindForm(onSave){$('[data-close]').onclick=closeModal;$('#dataForm').onsubmit=async e=>{e.preventDefault();await onSave(Object.fromEntries(new FormData(e.target)))}}
function modalButtons(){return'<div class="actions gap-top"><button class="btn primary">Save</button><button class="btn" type="button" data-close>Cancel</button></div>'}
function modal(html){document.body.insertAdjacentHTML('beforeend',`<div class="modal-wrap" id="modal"><div class="modal">${html}</div></div>`)}
function closeModal(){$('#modal')?.remove()}
if(client){
  const startAuth=()=>{
    client.auth.onAuthStateChange((_event,s)=>setTimeout(()=>window.bootstrap(s),0));
    client.auth.getSession().then(({data})=>window.bootstrap(data.session)).catch(error=>{
      console.error('Initial auth session failed',error);
      if(!session)window.renderLogin?.();
    });
  };
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',startAuth,{once:true});
  else startAuth();
}else render();
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
