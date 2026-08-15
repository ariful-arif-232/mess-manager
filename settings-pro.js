/* Professional admin settings, theme preferences, backup and protected reset. */
'use strict';
(()=>{
  const KEY='mm_settings_v1';
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}};
  const write=value=>localStorage.setItem(KEY,JSON.stringify({...read(),...value}));
  const icon=(name)=>({home:'⌂',moon:'◐',bell:'♢',shield:'◇',download:'⇩',danger:'!',info:'i'}[name]||'•');
  const manager=()=>db?.members?.find?.(m=>m.role==='admin'&&m.active!==false)||db?.members?.find?.(m=>m.role==='admin')||profile;
  const personPhoto=p=>p?.avatar_url?`<img src="${esc(p.avatar_url)}" alt="${esc(p.name||'Member')}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block">`:icon('home');
  const workspaceHero=()=>{const admin=manager();return `<section class="settings-hero"><div class="settings-hero-mark">${personPhoto(admin)}</div><div><span>MESS WORKSPACE</span><h2>${esc(mess?.name||'Mess Manager')}</h2><p>${activeMembers().length} active members · Managed by ${esc(admin?.name||'Admin')}</p></div>${profile?.role==='admin'?'<span class="settings-admin-badge">Admin</span>':''}</section>`};
  function applyTheme(theme=read().theme||'system'){
    const dark=theme==='dark'||(theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme=dark?'dark':'light';
    document.documentElement.style.colorScheme=dark?'dark':'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#091426':'#f7f9ff');
  }
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if((read().theme||'system')==='system')applyTheme('system')});
  if(typeof adminPages!=='undefined'&&adminPages?.delete)adminPages.delete('settings');
  const row=(title,text,control,kind='')=>`<div class="setting-row ${kind}"><div class="setting-copy"><b>${title}</b>${text?`<small>${text}</small>`:''}</div>${control}</div>`;
  const toggle=(key,label)=>`<label class="setting-switch" aria-label="${label}"><input type="checkbox" data-pref="${key}" ${read()[key]!==false?'checked':''}><span></span></label>`;
  const themePicker=theme=>`<section class="settings-card"><header><i>${icon('moon')}</i><div><h3>Appearance</h3><p>Choose how Mess Manager looks on this device</p></div></header><div class="theme-picker" role="radiogroup">${[['light','☀','Light'],['dark','◐','Dark'],['system','◒','System']].map(([v,i,l])=>`<button type="button" data-theme-choice="${v}" class="${theme===v?'selected':''}" role="radio" aria-checked="${theme===v}"><i>${i}</i><b>${l}</b></button>`).join('')}</div></section>`;
  function bindCommonSettings(c){c.querySelectorAll('[data-theme-choice]').forEach(b=>b.onclick=()=>{write({theme:b.dataset.themeChoice});applyTheme(b.dataset.themeChoice);settingsPage(c)});c.querySelectorAll('[data-pref]').forEach(x=>x.onchange=()=>{write({[x.dataset.pref]:x.checked});notify('Preference saved.','success')});}
  function settingsPage(c){
    const prefs=read(),theme=prefs.theme||'system',email=session?.user?.email||profile?.email||'';
    if(profile?.role!=='admin'){
      c.innerHTML=`${workspaceHero()}<div class="settings-grid">${themePicker(theme)}<section class="settings-card"><header><i>${icon('bell')}</i><div><h3>Notifications</h3><p>Control reminders on this device</p></div></header>${row('Deposit reminders','Payment reminder এবং due alerts.',toggle('depositAlerts','Deposit reminders'))}${row('Bazar schedule alerts','Assigned Bazar date alerts.',toggle('bazarAlerts','Bazar schedule alerts'))}${row('Monthly statement','Settlement ready হলে notification.',toggle('statementAlerts','Monthly statement alerts'))}</section><section class="settings-card"><header><i>${icon('shield')}</i><div><h3>Account</h3><p>Your signed-in member account</p></div></header>${row('Signed-in account',esc(email),'<span class="settings-verified">✓ Verified</span>')}${row('Role & access','Standard member permissions','<span class="settings-value">Member</span>')}</section></div>`;bindCommonSettings(c);return;
    }
    c.innerHTML=`${workspaceHero()}<div class="settings-grid"><section class="settings-card settings-profile"><header><i class="settings-brand-icon"><img src="icons/icon-192.png?v=20260814-borderless2" alt=""></i><div><h3>Mess profile</h3><p>Workspace identity and basic information</p></div></header><form id="messProfileForm" class="mess-profile-form"><label class="mess-name-field"><span>Mess name</span><input class="settings-text" name="mess_name" maxlength="160" value="${esc(mess.name)}" required></label><button class="btn primary mess-name-save" type="submit">Save</button></form></section>${themePicker(theme)}<section class="settings-card"><header><i>${icon('bell')}</i><div><h3>Notifications</h3><p>Control useful reminders on this device</p></div></header>${row('Deposit reminders','Member payment reminder এবং due alerts.',toggle('depositAlerts','Deposit reminders'))}${row('Bazar schedule alerts','Assigned Bazar date ও pending task alerts.',toggle('bazarAlerts','Bazar schedule alerts'))}${row('Monthly statement','Settlement ready হলে notification.',toggle('statementAlerts','Monthly statement alerts'))}</section><section class="settings-card"><header><i>${icon('shield')}</i><div><h3>Account & security</h3><p>Your signed-in admin account</p></div></header>${row('Admin account',esc(email),'<span class="settings-verified">✓ Verified</span>')}${row('Role & access','Workspace owner permissions','<span class="settings-value">Admin</span>')}</section><section class="settings-card"><header><i>${icon('download')}</i><div><h3>Data backup</h3><p>Keep a readable copy before major changes</p></div></header>${row('Export current workspace','Download an Excel workbook with separate sheets for every section.','<button class="btn settings-inline-btn" id="exportMessData">Download Excel</button>')}</section><section class="settings-card settings-danger"><header><i>${icon('danger')}</i><div><h3>Danger zone</h3><p>Permanent workspace actions</p></div></header>${row('Reset workspace','Deletes all data and every member account. Only the current verified admin and Mess workspace remain.','<button class="btn danger" id="startReset">Reset all data</button>','danger-row')}</section><section class="settings-card settings-about"><header><i>${icon('info')}</i><div><h3>About Mess Manager</h3><p>Secure shared-living management</p></div></header>${row('App version','Latest production release','<span class="settings-value">2026.08</span>')}${row('Data sync','Supabase encrypted cloud sync','<span class="settings-live"><i></i> Live</span>')}</section></div>`;
    bindCommonSettings(c);$('#messProfileForm').onsubmit=async e=>{e.preventDefault();const name=new FormData(e.currentTarget).get('mess_name').trim();if(name.length<2)return notify('Mess name দিন।');const btn=e.submitter,old=btn.textContent;btn.disabled=true;btn.textContent='Saving…';try{assertResult(await client.from('messes').update({name}).eq('id',mess.id));mess={...mess,name};render();notify('Mess name updated.','success')}catch(err){notify(friendlyError(err))}finally{btn.disabled=false;btn.textContent=old}};$('#exportMessData').onclick=exportData;$('#startReset').onclick=openReset;
  }
  document.addEventListener('click',e=>{const trigger=e.target.closest?.('#mobileMore');if(!trigger||profile?.role==='admin')return;setTimeout(()=>{const grid=document.querySelector('#moreSheet .sheet-grid');if(!grid||grid.querySelector('[data-member-settings]'))return;const b=document.createElement('button');b.type='button';b.dataset.memberSettings='1';b.innerHTML=`<span>${icon('moon')}</span><b>Settings</b>`;b.onclick=()=>{document.querySelector('#moreSheet')?.remove();state.page='settings';render();};grid.appendChild(b);},0);},true);
  function exportData(){notify('Excel backup is available to admins.','success')}

  async function resetFunction(name,body,{auth=false}={}){
    const current=(await client.auth.getSession()).data.session;
    if(auth&&!current?.access_token)throw new Error('Admin sign-in required.');
    const headers={'Content-Type':'application/json',apikey:cfg.supabaseAnonKey};
    if(auth)headers.Authorization=`Bearer ${current.access_token}`;
    const response=await fetch(`${cfg.supabaseUrl}/functions/v1/${name}`,{method:'POST',headers,body:JSON.stringify(body)});
    let data={};
    try{data=await response.json()}catch(_){ }
    if(!response.ok)throw new Error(data.error||'Security verification failed.');
    return data;
  }

  function openReset(){
    if(profile?.role!=='admin')return notify('Admin access required.');
    const email=String(session?.user?.email||'').trim().toLowerCase();
    if(!email)return notify('Verified admin email is unavailable. Please sign in again.');

    modal(`<div class="reset-modal"><div class="reset-lock">!</div><h2>Reset workspace?</h2><p>এই কাজটি ফিরিয়ে আনা যাবে না। বর্তমান verified admin account এবং Mess workspace ছাড়া সব data ও অন্য member account permanently delete হবে।</p><div class="reset-summary"><b>Deleted permanently</b><span>Members except you, meals, Bazar, deposits, utility bills, schedules, settlements, chat, notices and activity history.</span></div><div class="field"><label>Verified admin email</label><input value="${esc(email)}" readonly></div><button class="btn primary full" id="sendResetOtp" type="button">Send security OTP</button><div id="resetVerify" class="reset-verify hidden"><div class="field"><label>8-digit security OTP</label><input id="resetOtp" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="8" placeholder="Enter 8-digit OTP"></div><div class="field"><label>Type RESET to confirm</label><input id="resetWord" autocomplete="off" autocapitalize="characters" placeholder="RESET"></div><button class="btn danger full" id="confirmReset" type="button">Verify & reset everything</button></div><button class="btn full" data-close-reset type="button">Cancel</button></div>`);
    $('[data-close-reset]').onclick=closeModal;

    $('#sendResetOtp').onclick=async e=>{
      const button=e.currentTarget,old=button.textContent;
      button.disabled=true;button.textContent='Sending…';
      try{
        await resetFunction('request-admin-otp',{email,purpose:'reset'},{auth:true});
        $('#resetVerify').classList.remove('hidden');
        button.textContent='Resend security OTP';
        $('#resetOtp').focus();
        notify('8-digit security OTP sent to your admin email.','success');
      }catch(err){
        notify(friendlyError(err));
        button.textContent=old;
      }finally{button.disabled=false}
    };

    $('#confirmReset').onclick=async e=>{
      const token=$('#resetOtp').value.trim();
      const confirmation=$('#resetWord').value.trim().toUpperCase();
      if(!/^\d{8}$/.test(token))return notify('8-digit security OTP দিন।');
      if(confirmation!=='RESET')return notify('Confirm করতে RESET লিখুন।');

      const button=e.currentTarget,old=button.textContent;
      button.disabled=true;button.textContent='Verifying…';
      try{
        const verifiedOtp=await resetFunction('verify-admin-otp',{email,token});
        if(!verifiedOtp?.token_hash)throw new Error('Security verification session তৈরি হয়নি।');
        const verified=assertResult(await client.auth.verifyOtp({token_hash:verifiedOtp.token_hash,type:'email'}));
        session=verified?.session||(await client.auth.getSession()).data.session;
        if(!session)throw new Error('Fresh security session তৈরি হয়নি।');

        button.textContent='Resetting…';
        const result=assertResult(await client.rpc('reset_current_mess',{p_confirmation:'RESET',p_admin_email:email}));
        closeModal();
        await loadData();
        state.page='dashboard';
        render();
        const memberCount=Number(result?.deleted_members||0);
        const authCount=Number(result?.deleted_auth_users||0);
        notify(`Workspace reset complete. ${Number(result?.deleted_records||0)} records and ${Math.max(memberCount,authCount)} member accounts removed.`,'success');
      }catch(err){
        notify(friendlyError(err));
        button.disabled=false;button.textContent=old;
      }
    };
  }
  window.settings=settingsPage;
})();
