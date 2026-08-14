/* Professional admin settings, theme preferences, backup and protected reset. */
'use strict';
(()=>{
  const KEY='mm_settings_v1';
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}};
  const write=value=>localStorage.setItem(KEY,JSON.stringify({...read(),...value}));
  const icon=(name)=>({home:'⌂',moon:'◐',bell:'♢',shield:'◇',download:'⇩',danger:'!',info:'i'}[name]||'•');
  function applyTheme(theme=read().theme||'system'){
    const dark=theme==='dark'||(theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme=dark?'dark':'light';
    document.documentElement.style.colorScheme=dark?'dark':'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#091426':'#f7f9ff');
  }
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if((read().theme||'system')==='system')applyTheme('system')});

  // Appearance is a per-device preference, so every signed-in member may open Settings.
  // Activity remains admin-only.
  if(typeof adminPages!=='undefined'&&adminPages?.delete)adminPages.delete('settings');

  const row=(title,text,control,kind='')=>`<div class="setting-row ${kind}"><div class="setting-copy"><b>${title}</b>${text?`<small>${text}</small>`:''}</div>${control}</div>`;
  const toggle=(key,label)=>`<label class="setting-switch" aria-label="${label}"><input type="checkbox" data-pref="${key}" ${read()[key]!==false?'checked':''}><span></span></label>`;
  const themePicker=theme=>`<section class="settings-card"><header><i>${icon('moon')}</i><div><h3>Appearance</h3><p>Choose how Mess Manager looks on this device</p></div></header><div class="theme-picker" role="radiogroup">${[['light','☀','Light'],['dark','◐','Dark'],['system','◒','System']].map(([v,i,l])=>`<button type="button" data-theme-choice="${v}" class="${theme===v?'selected':''}" role="radio" aria-checked="${theme===v}"><i>${i}</i><b>${l}</b></button>`).join('')}</div></section>`;

  function bindCommonSettings(c){
    c.querySelectorAll('[data-theme-choice]').forEach(b=>b.onclick=()=>{write({theme:b.dataset.themeChoice});applyTheme(b.dataset.themeChoice);settingsPage(c)});
    c.querySelectorAll('[data-pref]').forEach(x=>x.onchange=()=>{write({[x.dataset.pref]:x.checked});notify('Preference saved.','success')});
  }

  function settingsPage(c){
    const prefs=read(),theme=prefs.theme||'system',email=session?.user?.email||profile?.email||'';

    // Members get personal/device settings only. No workspace-admin controls are exposed.
    if(profile?.role!=='admin'){
      c.innerHTML=`<section class="settings-hero"><div class="settings-hero-mark">${icon('home')}</div><div><span>PERSONAL SETTINGS</span><h2>${esc(profile?.name||'Member')}</h2><p>${esc(mess?.name||'Mess Manager')} · Member</p></div><span class="settings-admin-badge">Member</span></section><div class="settings-grid">${themePicker(theme)}<section class="settings-card"><header><i>${icon('bell')}</i><div><h3>Notifications</h3><p>Control reminders on this device</p></div></header>${row('Deposit reminders','Payment reminder এবং due alerts.',toggle('depositAlerts','Deposit reminders'))}${row('Bazar schedule alerts','Assigned Bazar date alerts.',toggle('bazarAlerts','Bazar schedule alerts'))}${row('Monthly statement','Settlement ready হলে notification.',toggle('statementAlerts','Monthly statement alerts'))}</section><section class="settings-card"><header><i>${icon('shield')}</i><div><h3>Account</h3><p>Your signed-in member account</p></div></header>${row('Signed-in account',esc(email),'<span class="settings-verified">✓ Verified</span>')}${row('Role & access','Standard member permissions','<span class="settings-value">Member</span>')}</section></div>`;
      bindCommonSettings(c);
      return;
    }

    c.innerHTML=`<section class="settings-hero"><div class="settings-hero-mark">${icon('home')}</div><div><span>MESS WORKSPACE</span><h2>${esc(mess.name)}</h2><p>${activeMembers().length} active members · Managed by ${esc(profile.name)}</p></div><span class="settings-admin-badge">Admin</span></section>
    <div class="settings-grid">
      <section class="settings-card settings-profile"><header><i>${icon('home')}</i><div><h3>Mess profile</h3><p>Workspace identity and basic information</p></div></header><form id="messProfileForm">${row('Mess name','',`<input class="settings-text" name="mess_name" maxlength="160" value="${esc(mess.name)}" required>`)}<div class="settings-action"><button class="btn primary" type="submit">Save mess name</button></div></form></section>
      ${themePicker(theme)}
      <section class="settings-card"><header><i>${icon('bell')}</i><div><h3>Notifications</h3><p>Control useful reminders on this device</p></div></header>${row('Deposit reminders','Member payment reminder এবং due alerts.',toggle('depositAlerts','Deposit reminders'))}${row('Bazar schedule alerts','Assigned Bazar date ও pending task alerts.',toggle('bazarAlerts','Bazar schedule alerts'))}${row('Monthly statement','Settlement ready হলে notification.',toggle('statementAlerts','Monthly statement alerts'))}</section>
      <section class="settings-card"><header><i>${icon('shield')}</i><div><h3>Account & security</h3><p>Your signed-in admin account</p></div></header>${row('Admin account',esc(email),'<span class="settings-verified">✓ Verified</span>')}${row('Role & access','Workspace owner permissions','<span class="settings-value">Admin</span>')}</section>
      <section class="settings-card"><header><i>${icon('download')}</i><div><h3>Data backup</h3><p>Keep a readable copy before major changes</p></div></header>${row('Export current workspace','Download an Excel workbook with separate sheets for every section.','<button class="btn settings-inline-btn" id="exportMessData">Download Excel</button>')}</section>
      <section class="settings-card settings-danger"><header><i>${icon('danger')}</i><div><h3>Danger zone</h3><p>Permanent workspace actions</p></div></header>${row('Reset workspace','Deletes all data and every member account. Only the current verified admin and Mess workspace remain.','<button class="btn danger" id="startReset">Reset all data</button>','danger-row')}</section>
      <section class="settings-card settings-about"><header><i>${icon('info')}</i><div><h3>About Mess Manager</h3><p>Secure shared-living management</p></div></header>${row('App version','Latest production release','<span class="settings-value">2026.08</span>')}${row('Data sync','Supabase encrypted cloud sync','<span class="settings-live"><i></i> Live</span>')}</section>
    </div>`;
    bindCommonSettings(c);
    $('#messProfileForm').onsubmit=async e=>{e.preventDefault();const name=new FormData(e.currentTarget).get('mess_name').trim();if(name.length<2)return notify('Mess name দিন।');const btn=e.submitter,old=btn.textContent;btn.disabled=true;btn.textContent='Saving…';try{assertResult(await client.from('messes').update({name}).eq('id',mess.id));mess={...mess,name};render();notify('Mess name updated.','success')}catch(err){notify(friendlyError(err))}finally{btn.disabled=false;btn.textContent=old}};
    $('#exportMessData').onclick=exportData;
    $('#startReset').onclick=openReset;
  }

  // The mobile More sheet was originally admin-only for Settings. Add Settings for members too.
  document.addEventListener('click',e=>{
    const trigger=e.target.closest?.('#mobileMore');
    if(!trigger||profile?.role==='admin')return;
    setTimeout(()=>{
      const grid=document.querySelector('#moreSheet .sheet-grid');
      if(!grid||grid.querySelector('[data-member-settings]'))return;
      const b=document.createElement('button');
      b.type='button';b.dataset.memberSettings='1';b.innerHTML=`<span>${icon('moon')}</span><b>Settings</b>`;
      b.onclick=()=>{document.querySelector('#moreSheet')?.remove();state.page='settings';render();};
      grid.appendChild(b);
    },0);
  },true);

  function exportData(){
    const name=id=>db.members.find(m=>m.id===id)?.name||'',clean=o=>Object.fromEntries(Object.entries(o).filter(([,v])=>typeof v!=='object'||v===null));
    const sheets={Summary:[{Mess:mess.name,'Export date':new Date().toLocaleString(),'Admin':profile.name,'Active members':activeMembers().length}],Members:db.members.map(m=>({Name:m.name,Email:m.email||'',Phone:m.phone||'',Role:m.role,Active:m.active?'Yes':'No','Join date':m.join_date||''})),Meals:db.meals.map(x=>({Date:x.date||x.meal_date,Member:name(x.memberId||x.member_id),Units:Number(x.units||0),Enabled:x.on??x.enabled?'Yes':'No'})),Bazar:(db.bazar||[]).flatMap(x=>(x.items||[]).map(i=>({Date:x.date||x.entry_date,Buyer:name(x.buyer_member_id)||x.buyer||'',Item:i.item_name,Category:i.category,Quantity:Number(i.quantity||0),Unit:i.unit,'Total price':Number(i.entered_total??i.total??0),Note:x.note||''}))),Deposits:db.deposits.map(x=>({Date:x.date||x.deposit_date,Member:name(x.memberId||x.member_id),Amount:Number(x.amount||0),Note:x.note||''})),Utilities:db.utilities.map(x=>({Date:x.date||x.bill_date,Type:x.type||x.bill_type,Amount:Number(x.amount||0),'Shared members':(x.memberIds||[]).map(name).filter(Boolean).join(', ')})),Schedules:db.schedules.map(x=>({Date:x.date||x.schedule_date,'Assigned members':x.names||x.assigned_names||'',Status:x.done?'Done':x.status||'Pending','Bazar list':x.bazar_list||''})),Settlements:(db.settlements||[]).map(x=>({...clean(x),member:name(x.member_id)})),Notices:(db.notices||[]).map(clean),Messages:(db.messages||[]).map(x=>({...clean(x),sender:name(x.sender_member_id)}))};
    const xml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&apos;'}[c]));const cell=v=>`<Cell><Data ss:Type="${typeof v==='number'&&Number.isFinite(v)?'Number':'String'}">${xml(v)}</Data></Cell>`;const worksheets=Object.entries(sheets).map(([sheet,data])=>{const rows=data.length?data:[{Info:'No records'}],headers=[...new Set(rows.flatMap(r=>Object.keys(r)))];return `<Worksheet ss:Name="${xml(sheet.slice(0,31))}"><Table><Row ss:StyleID="Header">${headers.map(cell).join('')}</Row>${rows.map(row=>`<Row>${headers.map(h=>cell(row[h]??'')).join('')}</Row>`).join('')}</Table></Worksheet>`}).join('');const workbook=`<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Default"><Font ss:FontName="Arial" ss:Size="11"/></Style><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1769D2" ss:Pattern="Solid"/></Style></Styles>${worksheets}</Workbook>`;const blob=new Blob([workbook],{type:'application/vnd.ms-excel;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${String(mess.name||'mess').replace(/[^a-z0-9\u0980-\u09ff]+/gi,'-')}-backup-${today()}.xls`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);notify('Excel backup downloaded.','success');
  }
  function openReset(){notify('Reset is available to verified admins only.');}
  window.settings=settingsPage;
})();
