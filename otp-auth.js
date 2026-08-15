/* Passwordless auth + Google OAuth + self-service admin onboarding for Mess Manager. */
'use strict';
(()=>{
let pendingEmail='';
let googleResolution=null;
let authReturn=null;
const GOOGLE_INTENT_KEY='mm_google_auth_intent_v1';
const GOOGLE_INTENT_TTL=20*60*1000;
const originalBootstrap=window.bootstrap;
const shell=body=>`<div class="auth-page"><main class="auth-wrap">${body}</main></div>`;
const adminIcon=()=>`<svg class="auth-svg" viewBox="0 0 64 64" aria-hidden="true"><circle cx="28" cy="20" r="10" fill="currentColor"/><path d="M9 51c0-12 8-20 19-20s19 8 19 20H9Z" fill="currentColor"/><path d="M43 35l4 3 5-7 4 3-8 12-8-7 3-4Z" fill="#fff"/></svg>`;
const memberIcon=()=>`<svg class="auth-svg" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="19" r="9" fill="currentColor"/><circle cx="16" cy="24" r="7" fill="currentColor" opacity=".8"/><circle cx="48" cy="24" r="7" fill="currentColor" opacity=".8"/><path d="M15 52c1-13 8-20 17-20s16 7 17 20H15Z" fill="currentColor"/><path d="M3 50c1-10 6-16 13-16 3 0 6 1 8 3-5 4-8 8-9 13H3Zm58 0H49c-1-5-4-9-9-13 2-2 5-3 8-3 7 0 12 6 13 16Z" fill="currentColor" opacity=".8"/></svg>`;
const houseIcon=()=>`<svg class="auth-brand-svg" viewBox="0 0 120 100" aria-hidden="true"><path d="M15 48 59 10l46 39M25 43v43h70V43" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="M45 53h31l-3 25H48l-3-25Zm7 0v-7c0-6 4-10 9-10s9 4 9 10v7" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><path d="M85 18c7-7 14-2 9 6-3 4-7 5-11 4 0-4 0-7 2-10Z" fill="#24a64a"/></svg>`;
const googleIcon=()=>`<svg class="auth-google-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.04H12v3.86h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.74 2.98-4.31 2.98-7.34Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.43l-3.24-2.5c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.13H3.06v2.58A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.9A6 6 0 0 1 6.09 12c0-.66.11-1.3.31-1.9V7.52H3.06A10 10 0 0 0 2 12c0 1.61.39 3.14 1.06 4.48L6.4 13.9Z"/><path fill="#EA4335" d="M12 5.97c1.47 0 2.79.5 3.82 1.49l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.94 5.52L6.4 10.1C7.19 7.73 9.4 5.97 12 5.97Z"/></svg>`;
const googleBlock=(id,label='Continue with Google')=>`<div class="auth-oauth-divider"><span>or</span></div><button class="btn full auth-google-btn" id="${id}" type="button">${googleIcon()}<span>${label}</span></button>`;
const hero=()=>`<section class="auth-hero"><div class="auth-house">${houseIcon()}</div><h1 class="auth-brand-title">Mess <b>Manager</b></h1><p class="auth-tagline">Manage your mess, <b>simply.</b></p><p class="auth-bn">বাজার, মিল, খরচ ও হিসাব—সব এক জায়গায়।</p></section>`;

async function functionJson(name,body){const r=await fetch(`${cfg.supabaseUrl}/functions/v1/${name}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.supabaseAnonKey},body:JSON.stringify(body)});let d={};try{d=await r.json()}catch(_){ }if(!r.ok)throw new Error(d.error||'Request failed.');return d}
window.functionJson=functionJson;

function readGoogleIntent(){
  try{
    const value=JSON.parse(localStorage.getItem(GOOGLE_INTENT_KEY)||'null');
    if(!value?.id||!value?.kind||Date.now()-Number(value.startedAt||0)>GOOGLE_INTENT_TTL){localStorage.removeItem(GOOGLE_INTENT_KEY);return null}
    return value;
  }catch(_){localStorage.removeItem(GOOGLE_INTENT_KEY);return null}
}
function clearGoogleIntent(){try{localStorage.removeItem(GOOGLE_INTENT_KEY)}catch(_){}}
function googleFlowId(){try{return new URL(location.href).searchParams.get('google_flow')||''}catch(_){return ''}}
function cleanGoogleFlowUrl(){
  try{
    const url=new URL(location.href);
    url.searchParams.delete('google_flow');
    history.replaceState({},document.title,`${url.pathname}${url.search}${url.hash}`);
  }catch(_){ }
}
function oauthErrorMessage(error){
  const text=String(error?.message||error||'').trim();
  if(/provider.*not.*enabled|unsupported.*provider/i.test(text))return 'Google sign-in is not enabled on the authentication server yet.';
  if(/redirect/i.test(text)&&/allow|url|uri/i.test(text))return 'Google sign-in redirect is not configured for this app.';
  return text||'Google sign-in could not be started. Please try again.';
}
async function startGoogleOAuth(kind,setup,button){
  if(!client?.auth?.signInWithOAuth)return notify('Google sign-in is unavailable.');
  const id=crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const intent={id,kind,setup:setup||{},startedAt:Date.now()};
  const redirect=new URL(location.href);
  redirect.hash='';
  redirect.search='';
  redirect.searchParams.set('google_flow',id);
  localStorage.setItem(GOOGLE_INTENT_KEY,JSON.stringify(intent));
  const old=button?.innerHTML;
  if(button){button.disabled=true;button.setAttribute('aria-busy','true');button.innerHTML='<span class="mm-spin auth-google-spin"></span><span>Connecting to Google…</span>'}
  try{
    const result=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirect.toString()}});
    if(result?.error)throw result.error;
  }catch(error){
    clearGoogleIntent();
    if(button){button.disabled=false;button.removeAttribute('aria-busy');button.innerHTML=old}
    notify(oauthErrorMessage(error));
  }
}
function setAuthReturn(screen,message,setup={}){authReturn={screen,message,setup,notified:false}}
async function rejectGoogleSession(screen,message,setup={}){
  setAuthReturn(screen,message,setup);
  clearGoogleIntent();
  cleanGoogleFlowUrl();
  try{await client.auth.signOut()}catch(_){ }
  session=null;profile=null;mess=null;
  return originalBootstrap(null);
}
async function resolveGoogleSession(s,intent){
  clearGoogleIntent();
  cleanGoogleFlowUrl();
  const email=String(s?.user?.email||'').trim().toLowerCase();
  if(!email)return rejectGoogleSession(intent.kind==='admin'?'admin':'member','Your Google account does not provide a verified email.',intent.setup);

  if(intent.kind==='member'){
    const claim=await client.rpc('claim_member_by_email');
    if(claim.error)return rejectGoogleSession('member',claim.error.message||'This Google account is not registered as an active member.');
    return originalBootstrap(s);
  }

  if(intent.kind==='admin'){
    const claim=await client.rpc('claim_member_by_email');
    if(!claim.error)return originalBootstrap(s);
    const claimMessage=String(claim.error?.message||'');
    if(!/No active mess member is registered for this email/i.test(claimMessage)){
      return rejectGoogleSession('admin',claimMessage||'This Google account cannot create another workspace.',intent.setup);
    }
    const name=String(intent.setup?.name||'').trim();
    const messName=String(intent.setup?.messName||'').trim();
    if(!name||!messName)return rejectGoogleSession('admin','Enter your name and Mess name before continuing with Google.',intent.setup);
    const created=await client.rpc('create_admin_workspace',{p_name:name,p_mess_name:messName,p_email:email});
    if(created.error)return rejectGoogleSession('admin',created.error.message||'Admin workspace could not be created.',intent.setup);
    return originalBootstrap(s);
  }

  return originalBootstrap(s);
}

window.bootstrap=async function googleAwareBootstrap(s){
  if(!s?.user)return originalBootstrap(s);
  const intent=readGoogleIntent();
  const flow=googleFlowId();
  const isGoogleReturn=!!(intent&&flow&&intent.id===flow);
  if(isGoogleReturn){
    if(googleResolution)return googleResolution;
    googleResolution=(async()=>{try{return await resolveGoogleSession(s,intent)}finally{googleResolution=null}})();
    return googleResolution;
  }
  const claim=await client.rpc('claim_member_by_email');
  if(claim.error)console.warn('Member auto-link skipped:',claim.error.message);
  return originalBootstrap(s);
};

function renderWelcome(){
  authReturn=null;
  $('#app').innerHTML=shell(`${hero()}<section class="auth-card auth-choice"><div class="auth-choice-icon">${adminIcon()}</div><h2>Create Account for Admin</h2><p>Create your mess (workspace) and manage members, bazar, meals, expenses and more.</p><button class="btn primary full auth-main-btn" id="newAdmin">Create Admin Account <span>›</span></button><div class="auth-divider">or</div><div class="auth-member-card auth-choice member"><div class="auth-choice-icon">${memberIcon()}</div><h2>Member Login</h2><p>Login with your email and OTP to access your mess.</p><button class="btn full auth-secondary-btn" id="memberLogin">Login as Member <span>›</span></button></div></section><section class="auth-features"><div class="auth-feature"><i>🛒</i>Bazar<small>বাজার করুন<br>সহজে</small></div><div class="auth-feature"><i>🍲</i>Meals<small>মিল ও মেনু<br>পরিচালনা</small></div><div class="auth-feature"><i>◔</i>Expenses<small>খরচ ও হিসাব<br>সহজভাবে</small></div><div class="auth-feature"><i>💬</i>Chat<small>সবার সাথে<br>যোগাযোগ</small></div></section><div class="auth-safe">🛡️ &nbsp; Your data is safe with us<small>100% Secure • Private • Encrypted</small></div>`);
  $('#newAdmin').onclick=()=>renderAdminSignup();$('#memberLogin').onclick=renderMemberLogin;
}
function renderAdminSignup(prefill={}){
  const name=esc(prefill.name||''),email=esc(prefill.email||''),messName=esc(prefill.messName||'');
  $('#app').innerHTML=shell(`<section class="auth-card auth-form-card"><button class="auth-back" id="authBack">‹</button><div class="auth-form-head"><div class="auth-form-icon">${adminIcon()}</div><h2>Create Admin Account</h2><p class="muted">Create your mess account and<br>start managing everything.</p></div><form id="adminSignup"><div class="field"><label>Your Name</label><input id="adminName" autocomplete="name" maxlength="120" value="${name}" required placeholder="Enter your full name"></div><div class="field gap-top"><label>Email</label><input id="adminEmail" type="email" autocomplete="email" value="${email}" required placeholder="Enter your email"></div><div class="field gap-top"><label>Mess Name</label><input id="messName" maxlength="160" value="${messName}" required placeholder="Enter your mess name"></div><button class="btn primary full gap-top auth-main-btn" id="adminSendOtp" type="submit">Send verification OTP <span>›</span></button></form><div id="adminVerify" class="auth-verify hidden"><div class="field gap-top"><label>8-digit OTP</label><input id="adminCode" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="8" placeholder="Enter 8-digit OTP"></div><button class="btn primary full gap-top auth-main-btn" id="verifyAdmin">Verify & Create Account <span>›</span></button></div>${googleBlock('adminGoogle')}<p class="auth-foot">🛡️ &nbsp; You will be the admin of this mess.<br>You can add members later.</p></section>`);
  $('#authBack').onclick=renderWelcome;
  $('#adminGoogle').onclick=()=>{const n=$('#adminName').value.trim(),m=$('#messName').value.trim();if(!n||!m)return notify('Enter your name and Mess name first.');startGoogleOAuth('admin',{name:n,messName:m},$('#adminGoogle'))};
  $('#adminSignup').onsubmit=async e=>{e.preventDefault();const email=$('#adminEmail').value.trim().toLowerCase(),name=$('#adminName').value.trim(),messName=$('#messName').value.trim(),btn=$('#adminSendOtp');if(!name||!messName||!email)return notify('সব তথ্য পূরণ করুন।');if(btn.disabled)return;pendingEmail=email;sessionStorage.setItem('mm_admin_setup',JSON.stringify({name,messName,email}));const old=btn.innerHTML;btn.disabled=true;btn.setAttribute('aria-busy','true');btn.innerHTML='<span class="mm-spin"></span>Sending OTP…';try{await functionJson('request-admin-otp',{email});$('#adminVerify').classList.remove('hidden');btn.innerHTML='Resend verification OTP <span>›</span>';notify('8-digit OTP ইমেইলে পাঠানো হয়েছে।','success');$('#adminCode').focus()}catch(err){notify(err?.message||'OTP পাঠানো যাচ্ছে না।')}finally{btn.disabled=false;btn.removeAttribute('aria-busy');if(!$('#adminVerify')||$('#adminVerify').classList.contains('hidden'))btn.innerHTML=old}};
  $('#verifyAdmin').onclick=async()=>{const s=JSON.parse(sessionStorage.getItem('mm_admin_setup')||'{}'),token=$('#adminCode').value.trim();if(!s.email)return notify('আগে OTP পাঠান।');if(!/^\d{8}$/.test(token))return notify('8-digit OTP দিন।');await run(async()=>{const v=await functionJson('verify-admin-otp',{email:s.email,token});if(!v.token_hash)throw new Error('Verification session তৈরি হয়নি।');const verified=assertResult(await client.auth.verifyOtp({token_hash:v.token_hash,type:'email'}));const sess=verified?.session||(await client.auth.getSession()).data.session;if(!sess)throw new Error('Login session তৈরি হয়নি।');const c=await client.rpc('create_admin_workspace',{p_name:s.name,p_mess_name:s.messName,p_email:s.email});if(c.error&&!String(c.error.message||'').includes('already linked'))throw c.error;sessionStorage.removeItem('mm_admin_setup');location.reload()},'Mess তৈরি হয়েছে।')};
}
function renderMemberLogin(){
  $('#app').innerHTML=shell(`<section class="auth-card auth-form-card"><button class="auth-back" id="authBack">‹</button><div class="auth-form-head"><div class="auth-form-icon member">${memberIcon()}</div><h2>Member Login</h2><p class="muted">Enter your email and we will send<br>you an 8-digit OTP.</p></div><form id="otpForm"><div class="field"><label>Email</label><input id="otpEmail" type="email" autocomplete="email" value="${esc(pendingEmail)}" required placeholder="Enter your email"></div><button class="btn primary full gap-top auth-main-btn" id="sendOtp">✈ &nbsp; Send OTP</button></form><div id="memberVerify" class="auth-verify hidden"><div class="field gap-top"><label>OTP Code</label><input id="otpCode" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="Enter 8-digit OTP"></div><button class="btn primary full gap-top auth-main-btn" id="verifyOtp">🔒 &nbsp; Verify & Login</button></div>${googleBlock('memberGoogle')}<p class="auth-foot">Not a member? Contact your admin.</p></section>`);
  $('#authBack').onclick=renderWelcome;
  $('#memberGoogle').onclick=()=>startGoogleOAuth('member',{},$('#memberGoogle'));
  const email=$('#otpEmail'),code=$('#otpCode'),send=$('#sendOtp');$('#otpForm').onsubmit=async e=>{e.preventDefault();pendingEmail=email.value.trim().toLowerCase();if(!pendingEmail)return notify('Email দিন।');if(send.disabled)return;const old=send.innerHTML;send.disabled=true;send.setAttribute('aria-busy','true');send.innerHTML='<span class="mm-spin"></span>Sending OTP…';try{const r=await fetch(`${cfg.supabaseUrl}/functions/v1/request-mess-otp`,{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.supabaseAnonKey},body:JSON.stringify({email:pendingEmail})});if(!r.ok)throw new Error('OTP পাঠানো যাচ্ছে না।');send.innerHTML='Resend OTP';$('#memberVerify').classList.remove('hidden');notify('8-digit OTP ইমেইলে পাঠানো হয়েছে।','success');code.focus()}catch(err){send.innerHTML=old;notify(err?.message||'OTP পাঠানো যাচ্ছে না।')}finally{send.disabled=false;send.removeAttribute('aria-busy')}};$('#verifyOtp').onclick=async()=>{const token=code.value.trim();if(!/^\d{8}$/.test(token))return notify('8-digit OTP দিন।');await run(async()=>{const d=assertResult(await client.auth.verifyOtp({email:pendingEmail||email.value.trim().toLowerCase(),token,type:'email'}));const sess=d?.session||(await client.auth.getSession()).data.session;if(!sess)throw new Error('Login session তৈরি হয়নি।');const c=await client.rpc('claim_member_by_email');if(c.error&&!String(c.error.message||'').includes('already'))throw c.error;location.reload()})};
}
window.renderLogin=()=>{
  document.querySelector('.toast')?.remove();
  if(authReturn?.screen==='member'){
    renderMemberLogin();
    if(authReturn.message&&!authReturn.notified){authReturn.notified=true;setTimeout(()=>notify(authReturn.message),80)}
    return;
  }
  if(authReturn?.screen==='admin'){
    renderAdminSignup(authReturn.setup||{});
    if(authReturn.message&&!authReturn.notified){authReturn.notified=true;setTimeout(()=>notify(authReturn.message),80)}
    return;
  }
  renderWelcome();
};
window.renderAdminSignup=renderAdminSignup;window.renderMemberLogin=renderMemberLogin;

/* app.js may finish its initial session lookup before this deferred enhancement
   has replaced bootstrap. Re-process only a matching Google callback so OAuth is
   deterministic without disturbing normal OTP sessions. */
if(client){
  client.auth.getSession().then(({data})=>{
    const intent=readGoogleIntent(),flow=googleFlowId();
    if(data?.session&&intent&&flow&&intent.id===flow)return window.bootstrap(data.session);
    if(!data?.session&&!session)window.renderLogin();
  }).catch(console.warn);
}
})();
