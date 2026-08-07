const $ = s => document.querySelector(s);
const money = n => `৳${Number(n||0).toLocaleString('en-BD')}`;
const today = () => new Date().toISOString().slice(0,10);
const monthKey = d => (d||today()).slice(0,7);

const seed = {
  users:[{id:'u-admin',name:'Admin',role:'admin',pin:'1234'},{id:'u1',name:'Sajib',role:'member',pin:'1111'},{id:'u2',name:'Imamul',role:'member',pin:'1111'},{id:'u3',name:'Rudro',role:'member',pin:'1111'},{id:'u4',name:'Arif',role:'member',pin:'1111'},{id:'u5',name:'Ashik',role:'member',pin:'1111'}],
  members:[{id:'m1',name:'Sajib',active:true},{id:'m2',name:'Imamul',active:true},{id:'m3',name:'Rudro',active:true},{id:'m4',name:'Arif',active:true},{id:'m5',name:'Ashik',active:true}],
  meals:[],
  deposits:[
    {id:'d1',memberId:'m1',date:'2026-08-03',amount:525,note:''},{id:'d2',memberId:'m2',date:'2026-08-03',amount:1000,note:''},{id:'d3',memberId:'m3',date:'2026-08-03',amount:1500,note:''},{id:'d4',memberId:'m4',date:'2026-08-03',amount:1000,note:''},{id:'d5',memberId:'m5',date:'2026-08-03',amount:1000,note:''},{id:'d6',memberId:'m4',date:'2026-08-04',amount:1000,note:''},{id:'d7',memberId:'m5',date:'2026-08-04',amount:1000,note:''},{id:'d8',memberId:'m4',date:'2026-08-05',amount:500,note:''},{id:'d9',memberId:'m5',date:'2026-08-05',amount:500,note:''}
  ],
  bazar:[
    {id:'b1',date:'2026-08-01',buyer:'Arif & Ashik',items:'চাল 10kg 600; ব্রয়লার 440; তেল 220; হলুদ 50; কাঁচাবাজার 270',amount:1580},
    {id:'b2',date:'2026-08-02',buyer:'Arif & Ashik',items:'ডিম 135; ডাল 60; সাবান 10',amount:205},
    {id:'b3',date:'2026-08-03',buyer:'Arif & Ashik',items:'মাছ 1105; জিরা 28; কাঁচাবাজার 590; ভাড়া 40',amount:1763},
    {id:'b4',date:'2026-08-05',buyer:'Arif & Ashik',items:'চাল 870; তেল 220; ডিম 340',amount:1430},
    {id:'b5',date:'2026-08-06',buyer:'',items:'লবণ 42',amount:42},
    {id:'b6',date:'2026-08-07',buyer:'',items:'ব্রয়লার 380; কাঁচাবাজার 310; পোলাও মসলা/ডাল 380',amount:1070}
  ],
  utilities:[{id:'x1',type:'WiFi',date:'2026-08-01',amount:525,memberIds:['m1','m2','m3','m4']},{id:'x2',type:'Current',date:'2026-08-01',amount:1010,memberIds:['m1','m2','m3','m4','m5']},{id:'x3',type:'Gas',date:'2026-08-07',amount:1670,memberIds:['m1','m2','m3','m4','m5']}],
  schedules:[{id:'s1',date:'2026-08-03',names:'Arif & Ashik',done:true},{id:'s2',date:'2026-08-04',names:'Imamul & Sajib',done:true},{id:'s3',date:'2026-08-05',names:'Rudro & Imamul',done:true}],
  settings:{messName:'আমাদের মেস',mealUnitCostMode:'equal'}
};

let db = JSON.parse(localStorage.getItem('messdb')||'null') || structuredClone(seed);
let session = JSON.parse(localStorage.getItem('messsession')||'null');
let state = {page:'dashboard',month:'2026-08'};
function save(){ localStorage.setItem('messdb',JSON.stringify(db)); }
function saveSession(){ localStorage.setItem('messsession',JSON.stringify(session)); }
function uid(p='id'){return p+Math.random().toString(36).slice(2,9)}
function memberName(id){return db.members.find(m=>m.id===id)?.name||'-'}
function activeMembers(){return db.members.filter(m=>m.active)}
function monthFilter(arr,dateField='date'){return arr.filter(x=>monthKey(x[dateField])===state.month)}

function ensureMeals(){
  const start = new Date(state.month+'-01T00:00:00');
  const end = new Date(start.getFullYear(),start.getMonth()+1,0);
  for(let d=1;d<=end.getDate();d++){
    const date=`${state.month}-${String(d).padStart(2,'0')}`;
    activeMembers().forEach(m=>{
      if(!db.meals.some(x=>x.date===date&&x.memberId===m.id)) db.meals.push({id:uid('ml'),date,memberId:m.id,on:date<=today()});
    });
  }
  save();
}

function calcMonth(){
  ensureMeals();
  const members=activeMembers();
  const bazarTotal=monthFilter(db.bazar).reduce((s,x)=>s+Number(x.amount),0);
  const mealRows=monthFilter(db.meals);
  const totalMealUnits=mealRows.filter(x=>x.on).length || 1;
  const mealRate=bazarTotal/totalMealUnits;
  const utilities=monthFilter(db.utilities);
  return members.map(m=>{
    const units=mealRows.filter(x=>x.memberId===m.id&&x.on).length;
    const food=units*mealRate;
    const util=utilities.reduce((s,u)=>s+(u.memberIds.includes(m.id)?Number(u.amount)/(u.memberIds.length||1):0),0);
    const deposit=monthFilter(db.deposits).filter(x=>x.memberId===m.id).reduce((s,x)=>s+Number(x.amount),0);
    const total=food+util;
    return {member:m,units,deposit,food,util,total,balance:deposit-total};
  });
}

function nav(){
 const items=[['dashboard','Dashboard'],['members','Members'],['meals','Meal'],['bazar','Bazar'],['deposits','Deposit'],['utilities','Bills'],['schedule','Schedule'],['settlement','Settlement'],['reports','Reports'],['settings','Settings']];
 return items.map(([k,l])=>`<button class="${state.page===k?'active':''}" onclick="go('${k}')">${l}</button>`).join('');
}
function go(p){state.page=p;render()}

function render(){
 if(!session) return renderLogin();
 const admin=session.role==='admin';
 const visible=admin?nav():[['dashboard','Dashboard'],['meals','Meal'],['settlement','My Account']].map(([k,l])=>`<button class="${state.page===k?'active':''}" onclick="go('${k}')">${l}</button>`).join('');
 $('#app').innerHTML=`<div class="layout"><aside class="sidebar"><div class="brand">Mess Manager</div><div class="nav">${visible}</div><div style="position:absolute;bottom:20px;left:18px;right:18px"><button class="btn" style="width:100%" onclick="logout()">Logout</button></div></aside><main class="main"><div class="topbar"><div><h1>${pageTitle()}</h1><div class="muted">${db.settings.messName}</div></div><div class="row"><input type="month" value="${state.month}" onchange="state.month=this.value;render()"/><span class="badge">${session.name} · ${session.role}</span></div></div><div id="content"></div></main><div class="mobilebar">${visible}</div></div>`;
 renderPage();
}
function pageTitle(){return {dashboard:'Dashboard',members:'Members',meals:'Daily Meal',bazar:'Bazar Management',deposits:'Deposits',utilities:'Utility Bills',schedule:'Bazar Schedule',settlement:'Monthly Settlement',reports:'Reports',settings:'Settings'}[state.page]}

function renderLogin(){
 $('#app').innerHTML=`<div class="login"><div class="card"><h1>Mess Manager</h1><div class="notice">Demo Admin PIN: <b>1234</b> · Member PIN: <b>1111</b></div><div class="field"><label>User</label><select id="loginUser">${db.users.map(u=>`<option value="${u.id}">${u.name} (${u.role})</option>`).join('')}</select></div><div class="field" style="margin-top:12px"><label>PIN</label><input id="loginPin" type="password" placeholder="PIN"/></div><button class="btn primary" style="width:100%;margin-top:14px" onclick="login()">Login</button></div></div>`;
}
function login(){const u=db.users.find(x=>x.id===$('#loginUser').value&&x.pin===$('#loginPin').value);if(!u)return alert('Wrong PIN');session={id:u.id,name:u.name,role:u.role};saveSession();state.page='dashboard';render()}
function logout(){session=null;localStorage.removeItem('messsession');render()}

function renderPage(){const c=$('#content');
 if(state.page==='dashboard') return dashboard(c);
 if(state.page==='members') return members(c);
 if(state.page==='meals') return meals(c);
 if(state.page==='bazar') return bazar(c);
 if(state.page==='deposits') return deposits(c);
 if(state.page==='utilities') return utilities(c);
 if(state.page==='schedule') return schedule(c);
 if(state.page==='settlement') return settlement(c);
 if(state.page==='reports') return reports(c);
 if(state.page==='settings') return settings(c);
}

function dashboard(c){const calc=calcMonth();const bazarTotal=monthFilter(db.bazar).reduce((s,x)=>s+Number(x.amount),0);const dep=calc.reduce((s,x)=>s+x.deposit,0);const util=monthFilter(db.utilities).reduce((s,x)=>s+Number(x.amount),0);const due=calc.reduce((s,x)=>s+Math.max(0,-x.balance),0);c.innerHTML=`<div class="grid kpis"><div class="card kpi"><div class="label">মোট বাজার</div><div class="value">${money(bazarTotal)}</div></div><div class="card kpi"><div class="label">মোট জমা</div><div class="value">${money(dep)}</div></div><div class="card kpi"><div class="label">Utility Bills</div><div class="value">${money(util)}</div></div><div class="card kpi"><div class="label">মোট Due</div><div class="value">${money(due)}</div></div></div><div class="section-head"><h2>Member Summary</h2></div>${settlementTable(calc)}`}

function members(c){c.innerHTML=`<div class="section-head"><h2>সব Member</h2><button class="btn primary" onclick="memberModal()">+ Add Member</button></div><div class="list">${db.members.map(m=>`<div class="list-item"><div><b>${m.name}</b><div class="muted">${m.active?'Active':'Inactive'}</div></div><div class="actions"><button class="btn" onclick="memberModal('${m.id}')">Edit</button><button class="btn danger" onclick="toggleMember('${m.id}')">${m.active?'Deactivate':'Activate'}</button></div></div>`).join('')}</div>`}
function toggleMember(id){const m=db.members.find(x=>x.id===id);m.active=!m.active;save();render()}
function memberModal(id){const m=db.members.find(x=>x.id===id)||{name:'',active:true};modal(`<h2>${id?'Edit':'Add'} Member</h2><div class="field"><label>Name</label><input id="mName" value="${m.name}"/></div><div class="actions" style="margin-top:14px"><button class="btn primary" onclick="saveMember('${id||''}')">Save</button><button class="btn" onclick="closeModal()">Cancel</button></div>`)}
function saveMember(id){const name=$('#mName').value.trim();if(!name)return;if(id){db.members.find(x=>x.id===id).name=name}else{const mid=uid('m');db.members.push({id:mid,name,active:true});db.users.push({id:uid('u'),name,role:'member',pin:'1111'})}save();closeModal();render()}

function meals(c){ensureMeals();const dates=[...new Set(monthFilter(db.meals).map(x=>x.date))];c.innerHTML=`<div class="card"><div class="muted">প্রতিদিন member-এর meal ON/OFF করুন। Food cost শুধু ON থাকা meal unit-এর উপর ভাগ হবে।</div></div><div class="section-head"><h2>Daily Meal</h2></div><div style="overflow:auto"><table><thead><tr><th>Date</th>${activeMembers().map(m=>`<th>${m.name}</th>`).join('')}</tr></thead><tbody>${dates.map(d=>`<tr><td>${d}</td>${activeMembers().map(m=>{const x=db.meals.find(z=>z.date===d&&z.memberId===m.id);return `<td><button class="btn ${x?.on?'good':''}" onclick="toggleMeal('${x.id}')">${x?.on?'ON':'OFF'}</button></td>`}).join('')}</tr>`).join('')}</tbody></table></div>`}
function toggleMeal(id){const x=db.meals.find(z=>z.id===id);if(session.role!=='admin'&&memberName(x.memberId)!==session.name)return alert('You can change only your own meal');x.on=!x.on;save();render()}

function bazar(c){const rows=monthFilter(db.bazar);c.innerHTML=`<div class="section-head"><h2>Bazar Entries</h2><button class="btn primary" onclick="bazarModal()">+ Add Bazar</button></div><div style="overflow:auto"><table><thead><tr><th>Date</th><th>Buyer</th><th>Items</th><th>Amount</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.date}</td><td>${x.buyer||'-'}</td><td>${x.items}</td><td>${money(x.amount)}</td><td><div class="actions"><button class="btn" onclick="bazarModal('${x.id}')">Edit</button><button class="btn danger" onclick="remove('bazar','${x.id}')">Delete</button></div></td></tr>`).join('')||`<tr><td colspan="5" class="empty">No entries</td></tr>`}</tbody></table></div>`}
function bazarModal(id){const x=db.bazar.find(z=>z.id===id)||{date:today(),buyer:'',items:'',amount:''};modal(`<h2>${id?'Edit':'Add'} Bazar</h2><div class="form-grid"><div class="field"><label>Date</label><input id="bDate" type="date" value="${x.date}"/></div><div class="field"><label>Buyer</label><input id="bBuyer" value="${x.buyer}" placeholder="Arif & Ashik"/></div><div class="field" style="grid-column:1/-1"><label>Items</label><textarea id="bItems" rows="4">${x.items}</textarea></div><div class="field"><label>Total Amount</label><input id="bAmount" type="number" value="${x.amount}"/></div></div><div class="actions" style="margin-top:14px"><button class="btn primary" onclick="saveBazar('${id||''}')">Save</button><button class="btn" onclick="closeModal()">Cancel</button></div>`)}
function saveBazar(id){const obj={date:$('#bDate').value,buyer:$('#bBuyer').value,items:$('#bItems').value,amount:Number($('#bAmount').value)};if(id)Object.assign(db.bazar.find(x=>x.id===id),obj);else db.bazar.push({id:uid('b'),...obj});save();closeModal();render()}

function deposits(c){const rows=monthFilter(db.deposits);c.innerHTML=`<div class="section-head"><h2>Deposits</h2><button class="btn primary" onclick="depositModal()">+ Add Deposit</button></div><table><thead><tr><th>Date</th><th>Member</th><th>Amount</th><th>Note</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.date}</td><td>${memberName(x.memberId)}</td><td>${money(x.amount)}</td><td>${x.note||'-'}</td><td><div class="actions"><button class="btn" onclick="depositModal('${x.id}')">Edit</button><button class="btn danger" onclick="remove('deposits','${x.id}')">Delete</button></div></td></tr>`).join('')}</tbody></table>`}
function depositModal(id){const x=db.deposits.find(z=>z.id===id)||{date:today(),memberId:activeMembers()[0]?.id,amount:'',note:''};modal(`<h2>${id?'Edit':'Add'} Deposit</h2><div class="form-grid"><div class="field"><label>Date</label><input id="dDate" type="date" value="${x.date}"/></div><div class="field"><label>Member</label><select id="dMember">${activeMembers().map(m=>`<option value="${m.id}" ${x.memberId===m.id?'selected':''}>${m.name}</option>`).join('')}</select></div><div class="field"><label>Amount</label><input id="dAmount" type="number" value="${x.amount}"/></div><div class="field"><label>Note</label><input id="dNote" value="${x.note}"/></div></div><div class="actions" style="margin-top:14px"><button class="btn primary" onclick="saveDeposit('${id||''}')">Save</button><button class="btn" onclick="closeModal()">Cancel</button></div>`)}
function saveDeposit(id){const obj={date:$('#dDate').value,memberId:$('#dMember').value,amount:Number($('#dAmount').value),note:$('#dNote').value};if(id)Object.assign(db.deposits.find(x=>x.id===id),obj);else db.deposits.push({id:uid('d'),...obj});save();closeModal();render()}

function utilities(c){const rows=monthFilter(db.utilities);c.innerHTML=`<div class="section-head"><h2>Utility Bills</h2><button class="btn primary" onclick="utilityModal()">+ Add Bill</button></div><table><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Shared By</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.date}</td><td>${x.type}</td><td>${money(x.amount)}</td><td>${x.memberIds.map(memberName).join(', ')}</td><td><div class="actions"><button class="btn" onclick="utilityModal('${x.id}')">Edit</button><button class="btn danger" onclick="remove('utilities','${x.id}')">Delete</button></div></td></tr>`).join('')}</tbody></table>`}
function utilityModal(id){const x=db.utilities.find(z=>z.id===id)||{date:today(),type:'Gas',amount:'',memberIds:activeMembers().map(m=>m.id)};modal(`<h2>${id?'Edit':'Add'} Utility Bill</h2><div class="form-grid"><div class="field"><label>Date</label><input id="uDate" type="date" value="${x.date}"/></div><div class="field"><label>Type</label><select id="uType"><option>Gas</option><option>WiFi</option><option>Current</option><option>Water</option><option>Other</option></select></div><div class="field"><label>Amount</label><input id="uAmount" type="number" value="${x.amount}"/></div><div class="field"><label>Share With</label><div>${activeMembers().map(m=>`<label style="display:block"><input type="checkbox" class="uMember" value="${m.id}" ${x.memberIds.includes(m.id)?'checked':''}/> ${m.name}</label>`).join('')}</div></div></div><div class="actions" style="margin-top:14px"><button class="btn primary" onclick="saveUtility('${id||''}')">Save</button><button class="btn" onclick="closeModal()">Cancel</button></div>`);$('#uType').value=x.type}
function saveUtility(id){const memberIds=[...document.querySelectorAll('.uMember:checked')].map(x=>x.value);const obj={date:$('#uDate').value,type:$('#uType').value,amount:Number($('#uAmount').value),memberIds};if(id)Object.assign(db.utilities.find(x=>x.id===id),obj);else db.utilities.push({id:uid('u'),...obj});save();closeModal();render()}

function schedule(c){const rows=monthFilter(db.schedules);c.innerHTML=`<div class="section-head"><h2>Bazar Schedule</h2><button class="btn primary" onclick="scheduleModal()">+ Add Schedule</button></div><table><thead><tr><th>Date</th><th>Assigned</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.date}</td><td>${x.names}</td><td><span class="pill ${x.done?'on':'off'}">${x.done?'Done':'Pending'}</span></td><td><div class="actions"><button class="btn" onclick="scheduleModal('${x.id}')">Edit</button><button class="btn danger" onclick="remove('schedules','${x.id}')">Delete</button></div></td></tr>`).join('')}</tbody></table>`}
function scheduleModal(id){const x=db.schedules.find(z=>z.id===id)||{date:today(),names:'',done:false};modal(`<h2>${id?'Edit':'Add'} Schedule</h2><div class="form-grid"><div class="field"><label>Date</label><input id="sDate" type="date" value="${x.date}"/></div><div class="field"><label>Assigned Names</label><input id="sNames" value="${x.names}" placeholder="Arif & Ashik"/></div><div class="field"><label>Status</label><select id="sDone"><option value="false">Pending</option><option value="true">Done</option></select></div></div><div class="actions" style="margin-top:14px"><button class="btn primary" onclick="saveSchedule('${id||''}')">Save</button><button class="btn" onclick="closeModal()">Cancel</button></div>`);$('#sDone').value=String(x.done)}
function saveSchedule(id){const obj={date:$('#sDate').value,names:$('#sNames').value,done:$('#sDone').value==='true'};if(id)Object.assign(db.schedules.find(x=>x.id===id),obj);else db.schedules.push({id:uid('s'),...obj});save();closeModal();render()}

function settlementTable(calc){return `<div style="overflow:auto"><table><thead><tr><th>Member</th><th>Meals</th><th>Deposit</th><th>Food</th><th>Utility</th><th>Total Bill</th><th>Due/Advance</th></tr></thead><tbody>${calc.map(x=>`<tr><td><b>${x.member.name}</b></td><td>${x.units}</td><td>${money(x.deposit)}</td><td>${money(x.food.toFixed(0))}</td><td>${money(x.util.toFixed(0))}</td><td>${money(x.total.toFixed(0))}</td><td>${x.balance>=0?`<span class="pill advance">Advance ${money(x.balance.toFixed(0))}</span>`:`<span class="pill due">Due ${money((-x.balance).toFixed(0))}</span>`}</td></tr>`).join('')}</tbody></table></div>`}
function settlement(c){let calc=calcMonth();if(session.role!=='admin'){calc=calc.filter(x=>x.member.name===session.name)}c.innerHTML=`<div class="card"><b>Calculation:</b> Bazar cost ÷ total active meal units = per-meal-unit cost. Utility bill selected members-এর মধ্যে equal share হয়। Deposit − Total Bill = Advance/Due.</div><div class="section-head"><h2>${state.month} Settlement</h2></div>${settlementTable(calc)}`}

function reports(c){const calc=calcMonth();const totalMeal=calc.reduce((s,x)=>s+x.units,0);const bazar=monthFilter(db.bazar).reduce((s,x)=>s+Number(x.amount),0);const avg=totalMeal?bazar/totalMeal:0;c.innerHTML=`<div class="grid kpis"><div class="card kpi"><div class="label">Total Meal Units</div><div class="value">${totalMeal}</div></div><div class="card kpi"><div class="label">Food Cost / Unit</div><div class="value">${money(avg.toFixed(0))}</div></div><div class="card kpi"><div class="label">Bazar Entries</div><div class="value">${monthFilter(db.bazar).length}</div></div><div class="card kpi"><div class="label">Utility Entries</div><div class="value">${monthFilter(db.utilities).length}</div></div></div><div class="section-head"><h2>Settlement Report</h2></div>${settlementTable(calc)}`}

function settings(c){c.innerHTML=`<div class="card"><div class="form-grid"><div class="field"><label>Mess Name</label><input id="messName" value="${db.settings.messName}"/></div><div class="field"><label>Admin PIN</label><input id="adminPin" value="${db.users.find(x=>x.role==='admin').pin}"/></div></div><div class="actions" style="margin-top:14px"><button class="btn primary" onclick="saveSettings()">Save Settings</button><button class="btn danger" onclick="resetDemo()">Reset Demo Data</button></div></div>`}
function saveSettings(){db.settings.messName=$('#messName').value;db.users.find(x=>x.role==='admin').pin=$('#adminPin').value;save();render();alert('Saved')}
function resetDemo(){if(!confirm('Reset all demo data?'))return;db=structuredClone(seed);save();render()}

function remove(collection,id){if(!confirm('Delete this entry?'))return;db[collection]=db[collection].filter(x=>x.id!==id);save();render()}
function modal(html){document.body.insertAdjacentHTML('beforeend',`<div class="modal-wrap" id="modal"><div class="modal">${html}</div></div>`)}
function closeModal(){document.querySelector('#modal')?.remove()}

if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
render();
