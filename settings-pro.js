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
  const row=(title,text,control,kind='')=>`<div class="setting-row ${kind}"><div class="setting-copy"><b>${title}</b>${text?`<small>${text}</small>`:''}</div>${control}</div>`;
  const toggle=(key,label)=>`<label class="setting-switch" aria-label="${label}"><input type="checkbox" data-pref="${key}" ${read()[key]!==false?'checked':''}><span></span></label>`;
  function settingsPage(c){
    const prefs=read(),theme=prefs.theme||'system',email=session?.user?.email||profile?.email||'';
    c.innerHTML=`<section class="settings-hero"><div class="settings-hero-mark">${icon('home')}</div><div><span>MESS WORKSPACE</span><h2>${esc(mess.name)}</h2><p>${activeMembers().length} active members · Managed by ${esc(profile.name)}</p></div><span class="settings-admin-badge">Admin</span></section>
    <div class="settings-grid">
      <section class="settings-card settings-profile"><header><i>${icon('home')}</i><div><h3>Mess profile</h3><p>Workspace identity and basic information</p></div></header><form id="messProfileForm">${row('Mess name','',`<input class="settings-text" name="mess_name" maxlength="160" value="${esc(mess.name)}" required>`)}<div class="settings-action"><button class="btn primary" type="submit">Save mess name</button></div></form></section>
      <section class="settings-card"><header><i>${icon('moon')}</i><div><h3>Appearance</h3><p>Choose how Mess Manager looks</p></div></header><div class="theme-picker" role="radiogroup">${[['light','☀','Light'],['dark','◐','Dark'],['system','◒','System']].map(([v,i,l])=>`<button type="button" data-theme-choice="${v}" class="${theme===v?'selected':''}" role="radio" aria-checked="${theme===v}"><i>${i}</i><b>${l}</b></button>`).join('')}</div></section>
      <section class="settings-card"><header><i>${icon('bell')}</i><div><h3>Notifications</h3><p>Control useful reminders on this device</p></div></header>${row('Deposit reminders','Member payment reminder এবং due alerts.',toggle('depositAlerts','Deposit reminders'))}${row('Bazar schedule alerts','Assigned Bazar date ও pending task alerts.',toggle('bazarAlerts','Bazar schedule alerts'))}${row('Monthly statement','Settlement ready হলে notification.',toggle('statementAlerts','Monthly statement alerts'))}</section>
      <section class="settings-card"><header><i>${icon('shield')}</i><div><h3>Account & security</h3><p>Your signed-in admin account</p></div></header>${row('Admin account',esc(email),'<span class="settings-verified">✓ Verified</span>')}${row('Role & access','Workspace owner permissions','<span class="settings-value">Admin</span>')}</section>
      <section class="settings-card"><header><i>${icon('download')}</i><div><h3>Data backup</h3><p>Keep a readable copy before major changes</p></div></header>${row('Export current workspace','Download an Excel workbook with separate sheets for every section.','<button class="btn settings-inline-btn" id="exportMessData">Download Excel</button>')}</section>
      <section class="settings-card settings-danger"><header><i>${icon('danger')}</i><div><h3>Danger zone</h3><p>Permanent workspace actions</p></div></header>${row('Reset workspace','Deletes all data and every member account. Only the current verified admin and Mess workspace remain.','<button class="btn danger" id="startReset">Reset all data</button>','danger-row')}</section>
      <section class="settings-card settings-about"><header><i>${icon('info')}</i><div><h3>About Mess Manager</h3><p>Secure shared-living management</p></div></header>${row('App version','Latest production release','<span class="settings-value">2026.08</span>')}${row('Data sync','Supabase encrypted cloud sync','<span class="settings-live"><i></i> Live</span>')}</section>
    </div>`;
    c.querySelectorAll('[data-theme-choice]').forEach(b=>b.onclick=()=>{write({theme:b.dataset.themeChoice});applyTheme(b.dataset.themeChoice);settingsPage(c)});
    c.querySelectorAll('[data-pref]').forEach(x=>x.onchange=()=>{write({[x.dataset.pref]:x.checked});notify('Preference saved.','success')});
    $('#messProfileForm').onsubmit=async e=>{e.preventDefault();const name=new FormData(e.currentTarget).get('mess_name').trim();if(name.length<2)return notify('Mess name দিন।');const btn=e.submitter,old=btn.textContent;btn.disabled=true;btn.textContent='Saving…';try{assertResult(await client.from('messes').update({name}).eq('id',mess.id));mess={...mess,name};render();notify('Mess name updated.','success')}catch(err){notify(friendlyError(err))}finally{btn.disabled=false;btn.textContent=old}};
    $('#exportMessData').onclick=exportData;
    $('#startReset').onclick=openReset;
  }
  function exportData(){
    const name=id=>db.members.find(m=>m.id===id)?.name||'',clean=o=>Object.fromEntries(Object.entries(o).filter(([,v])=>typeof v!=='object'||v===null));
    const sheets={
      Summary:[{Mess:mess.name,'Export date':new Date().toLocaleString(),'Admin':profile.name,'Active members':activeMembers().length}],
      Members:db.members.map(m=>({Name:m.name,Email:m.email||'',Phone:m.phone||'',Role:m.role,Active:m.active?'Yes':'No','Join date':m.join_date||''})),
      Meals:db.meals.map(x=>({Date:x.date||x.meal_date,Member:name(x.memberId||x.member_id),Units:Number(x.units||0),Enabled:x.on??x.enabled?'Yes':'No'})),
      Bazar:(db.bazar||[]).flatMap(x=>(x.items||[]).map(i=>({Date:x.date||x.entry_date,Buyer:name(x.buyer_member_id)||x.buyer||'',Item:i.item_name,Category:i.category,Quantity:Number(i.quantity||0),Unit:i.unit,'Total price':Number(i.entered_total??i.total??0),Note:x.note||''}))),
      Deposits:db.deposits.map(x=>({Date:x.date||x.deposit_date,Member:name(x.memberId||x.member_id),Amount:Number(x.amount||0),Note:x.note||''})),
      Utilities:db.utilities.map(x=>({Date:x.date||x.bill_date,Type:x.type||x.bill_type,Amount:Number(x.amount||0),'Shared members':(x.memberIds||[]).map(name).filter(Boolean).join(', ')})),
      Schedules:db.schedules.map(x=>({Date:x.date||x.schedule_date,'Assigned members':x.names||x.assigned_names||'',Status:x.done?'Done':x.status||'Pending','Bazar list':x.bazar_list||''})),
      Settlements:(db.settlements||[]).map(x=>({...clean(x),member:name(x.member_id)})),
      Notices:(db.notices||[]).map(clean),Messages:(db.messages||[]).map(x=>({...clean(x),sender:name(x.sender_member_id)}))
    };
    const xml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
    const cell=v=>`<Cell><Data ss:Type="${typeof v==='number'&&Number.isFinite(v)?'Number':'String'}">${xml(v)}</Data></Cell>`;
    const worksheets=Object.entries(sheets).map(([sheet,data])=>{const rows=data.length?data:[{Info:'No records'}],headers=[...new Set(rows.flatMap(r=>Object.keys(r)))];return `<Worksheet ss:Name="${xml(sheet.slice(0,31))}"><Table><Row ss:StyleID="Header">${headers.map(cell).join('')}</Row>${rows.map(row=>`<Row>${headers.map(h=>cell(row[h]??'')).join('')}</Row>`).join('')}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions></Worksheet>`}).join('');
    const workbook=`<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel"><Styles><Style ss:ID="Default"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="11"/></Style><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1769D2" ss:Pattern="Solid"/></Style></Styles>${worksheets}</Workbook>`;
    const blob=new Blob([workbook],{type:'application/vnd.ms-excel;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${String(mess.name||'mess').replace(/[^a-z0-9\u0980-\u09ff]+/gi,'-')}-backup-${today()}.xls`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);notify('Excel backup downloaded.','success');
  }
  function openReset(){
    const email=session?.user?.email||profile?.email||'';
    modal(`<div class="reset-modal"><div class="reset-lock">!</div><h2>Reset workspace?</h2><p>এই কাজটি ফিরিয়ে আনা যাবে না। আগে backup download করে নিন।</p><div class="reset-summary"><b>Deleted permanently</b><span>All member accounts except you, meals, Bazar, deposits, utility bills, schedules, settlements, chat, notices and activity history</span></div><div class="field"><label>Admin email</label><input value="${esc(email)}" readonly></div><button class="btn primary full" id="sendResetOtp">Send security OTP</button><div id="resetVerify" class="reset-verify hidden"><div class="field"><label>Email OTP</label><input id="resetOtp" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="Enter OTP"></div><div class="field"><label>Type RESET to confirm</label><input id="resetWord" autocomplete="off" placeholder="RESET"></div><button class="btn danger full" id="confirmReset">Verify & reset everything</button></div><button class="btn full" data-close-reset>Cancel</button></div>`);
    $('[data-close-reset]').onclick=closeModal;
    $('#sendResetOtp').onclick=async e=>{const b=e.currentTarget,old=b.textContent;b.disabled=true;b.textContent='Sending…';try{assertResult(await client.auth.signInWithOtp({email,options:{shouldCreateUser:false}}));$('#resetVerify').classList.remove('hidden');b.textContent='Resend security OTP';$('#resetOtp').focus();notify('Security OTP sent to admin email.','success')}catch(err){notify(friendlyError(err));b.textContent=old}finally{b.disabled=false}};
    $('#confirmReset').onclick=async e=>{const token=$('#resetOtp').value.trim(),confirmation=$('#resetWord').value.trim();if(!/^\d{6,8}$/.test(token))return notify('Valid OTP দিন।');if(confirmation!=='RESET')return notify('Confirm করতে RESET লিখুন।');const b=e.currentTarget,old=b.textContent;b.disabled=true;b.textContent='Verifying…';try{const verified=assertResult(await client.auth.verifyOtp({email,token,type:'email'}));session=verified?.session||(await client.auth.getSession()).data.session;if(!session)throw Error('Fresh security session তৈরি হয়নি।');const result=assertResult(await client.rpc('reset_current_mess',{p_confirmation:'RESET',p_admin_email:email}));closeModal();await loadData();state.page='dashboard';render();notify(`Workspace reset complete. ${result?.deleted_records||0} records deleted.`,'success')}catch(err){notify(friendlyError(err));b.disabled=false;b.textContent=old}};
  }
  window.settings=settingsPage;
})();
