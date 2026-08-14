/* Deterministic auth transition, repeat-login recovery and guarded logout. */
'use strict';
(()=>{
 const $=s=>document.querySelector(s), sleep=ms=>new Promise(r=>setTimeout(r,ms)); let transitioning=false;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function busy(b,on,label='Working…'){if(!b)return;if(on){if(!b.dataset.old)b.dataset.old=b.innerHTML;b.disabled=true;b.setAttribute('aria-busy','true');b.innerHTML=`<span class="mm-spin"></span>${esc(label)}`}else{b.disabled=false;b.removeAttribute('aria-busy');if(b.dataset.old)b.innerHTML=b.dataset.old}}
 function screen(title='Loading your mess…',text='Please wait while we prepare your dashboard.'){$('#app').innerHTML=`<main class="mm-auth-wait"><section class="mm-auth-ready"><div class="mm-ready-brand"><span class="mm-ready-logo" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M12 29 32 12l20 17v23H12V29Z"/><path d="M23 30h18l-2 15H25l-2-15Zm4 0v-4a5 5 0 0 1 10 0v4"/></svg></span><div><small>MESS MANAGER</small><b>সব হিসাব, এক জায়গায়</b></div></div><div class="mm-ready-orbit" aria-hidden="true"><span class="mm-ready-core">✓</span><i></i><i></i><i></i></div><h2>${esc(title)}</h2><p>${esc(text)}</p><div class="mm-ready-features"><span>🛒 <b>বাজার</b></span><span>🍲 <b>খাবার</b></span><span>৳ <b>হিসাব</b></span></div><div class="mm-ready-progress"><i></i></div><small class="mm-ready-note">নিরাপদভাবে আপনার মেস প্রস্তুত হচ্ছে</small></section></main>`}
 async function ready(){let err;for(let i=0;i<18;i++){try{const r=await client.auth.getSession(),s=r.data.session;if(!s)throw Error('Login session তৈরি হয়নি।');session=s;const p=await client.from('members').select('*').eq('user_id',s.user.id).eq('active',true).single();if(p.error)throw p.error;profile=p.data;const m=await client.from('messes').select('*').eq('id',profile.mess_id).single();if(m.error)throw m.error;mess=m.data;await loadData();subscribeRealtime();state.page='dashboard';render();return}catch(e){err=e;await sleep(450)}}throw err||Error('Account load করা যায়নি।')}
 async function finish(b,label,fn){
  if(transitioning)return;
  transitioning=true;busy(b,true,label);
  try{await fn();screen('Loading your mess…','Account verified. Preparing your dashboard.');await ready();notify('Login successful.','success')}
  catch(e){try{renderLogin()}catch{}notify(e?.message||'Something went wrong. Please try again.')}
  finally{transitioning=false;busy(b,false)}
 }

 /* Every direct signOut call is guarded. If the premium logout dialog is already open,
    that dialog is the confirmation and we allow the real sign-out without a second prompt. */
 if(client?.auth?.signOut&&!client.auth.__mmGuardedSignOut){
  const rawSignOut=client.auth.signOut.bind(client.auth);
  const guarded=async(options)=>{
   if(document.getElementById('logoutConfirmDialog'))return rawSignOut(options||{scope:'local'});
   const ok=window.confirm('Logout করবেন?\n\nConfirm করলে এই device থেকে sign out হবে।');
   if(!ok)return {error:null,cancelled:true};
   return rawSignOut(options||{scope:'local'});
  };
  guarded.__mmOriginal=rawSignOut;
  client.auth.signOut=guarded;
  client.auth.__mmGuardedSignOut=true;
 }

 if(client?.auth?.onAuthStateChange){
  client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){transitioning=false;try{sessionStorage.removeItem('mm_admin_setup')}catch{}}});
 }

 document.addEventListener('click',async e=>{
  const a=e.target.closest('#verifyAdmin');if(a){e.preventDefault();e.stopImmediatePropagation();const s=JSON.parse(sessionStorage.getItem('mm_admin_setup')||'{}'),token=$('#adminCode')?.value.trim()||'';if(!s.email)return notify('আগে OTP পাঠান।');if(!/^\d{8}$/.test(token))return notify('8-digit OTP দিন।');return finish(a,'Verifying & creating…',async()=>{const helper=window.functionJson;if(typeof helper!=='function')throw Error('Admin verification service load হয়নি। Refresh করে আবার চেষ্টা করুন।');const v=await helper('verify-admin-otp',{email:s.email,token});if(!v.token_hash)throw Error('Verification session তৈরি হয়নি।');const d=assertResult(await client.auth.verifyOtp({token_hash:v.token_hash,type:'email'}));session=d?.session||(await client.auth.getSession()).data.session;if(!session)throw Error('Login session তৈরি হয়নি।');screen('Creating your mess…','Setting up your admin account and workspace.');const c=await client.rpc('create_admin_workspace',{p_name:s.name,p_mess_name:s.messName,p_email:s.email});if(c.error&&!String(c.error.message||'').includes('already linked'))throw c.error;sessionStorage.removeItem('mm_admin_setup')})}
  const b=e.target.closest('#verifyOtp');if(b){e.preventDefault();e.stopImmediatePropagation();const token=$('#otpCode')?.value.trim()||'',email=($('#otpEmail')?.value||'').trim().toLowerCase();if(!email)return notify('Email দিন।');if(!/^\d{8}$/.test(token))return notify('8-digit OTP দিন।');return finish(b,'Verifying…',async()=>{const d=assertResult(await client.auth.verifyOtp({email,token,type:'email'}));session=d?.session||(await client.auth.getSession()).data.session;if(!session)throw Error('Login session তৈরি হয়নি।');const c=await client.rpc('claim_member_by_email');if(c.error&&!String(c.error.message||'').includes('already'))throw c.error})}
 },true);
 document.addEventListener('submit',e=>{const f=e.target;if(!(f instanceof HTMLFormElement))return;const b=f.querySelector('button[type="submit"],.primary');if(!b||b.disabled)return;b.classList.add('mm-tap');setTimeout(()=>b.classList.remove('mm-tap'),350)},true);
 document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled||b.id==='verifyAdmin'||b.id==='verifyOtp')return;b.classList.add('mm-tap');setTimeout(()=>b.classList.remove('mm-tap'),350)},true);
})();
