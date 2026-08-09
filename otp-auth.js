/* Passwordless auth + self-service admin onboarding for Mess Manager. */
'use strict';
(() => {
  let pendingEmail = '';
  let mode = 'welcome';
  const originalBootstrap = window.bootstrap;

  const authShell = body => `<div class="auth-page"><div class="auth-glow auth-glow-one"></div><div class="auth-glow auth-glow-two"></div><main class="auth-wrap"><section class="auth-brand"><div class="auth-logo">M</div><div><h1>Mess Manager</h1><p>Meals, bazar, deposits and bills — all in one place.</p></div></section>${body}<p class="auth-foot">Securely powered by Supabase</p></main></div>`;

  window.bootstrap = async function otpAwareBootstrap(authSession) {
    if (authSession?.user) {
      const claim = await client.rpc('claim_member_by_email');
      if (claim.error) console.warn('Member auto-link skipped:', claim.error.message);
    }
    return originalBootstrap(authSession);
  };

  function renderWelcome(){
    mode = 'welcome';
    $('#app').innerHTML = authShell(`<section class="auth-card auth-welcome"><span class="auth-kicker">WELCOME</span><h2>আপনার মেস ম্যানেজ করুন সহজে</h2><p class="muted">Admin হিসেবে নতুন Mess তৈরি করুন, অথবা Member হিসেবে আপনার Admin-এর দেওয়া email দিয়ে OTP login করুন।</p><div class="auth-actions"><button class="btn primary full auth-main-btn" id="newAdmin">Create Admin Account</button><button class="btn full auth-secondary-btn" id="memberLogin">Member Sign in</button></div><div class="auth-points"><span>✓ Secure login</span><span>✓ Mobile friendly</span><span>✓ Realtime updates</span></div></section>`);
    $('#newAdmin').onclick = renderAdminSignup;
    $('#memberLogin').onclick = renderMemberLogin;
  }

  function renderAdminSignup(){
    mode = 'admin';
    $('#app').innerHTML = authShell(`<section class="auth-card"><button class="auth-back" id="authBack" type="button">← Back</button><span class="auth-kicker">NEW ADMIN</span><h2>Create your Mess</h2><p class="muted">আপনার তথ্য দিন। Email verification শেষ হলে নতুন Mess workspace তৈরি হবে।</p><form id="adminSignup"><div class="field"><label>Your name</label><input id="adminName" autocomplete="name" maxlength="120" required placeholder="e.g. Ariful Islam"></div><div class="field gap-top"><label>Mess name</label><input id="messName" maxlength="160" required placeholder="e.g. Dream House Mess"></div><div class="field gap-top"><label>Email</label><input id="adminEmail" type="email" autocomplete="email" required placeholder="you@example.com"></div><button class="btn primary full gap-top auth-main-btn" type="submit">Send verification OTP</button></form><div id="adminVerify" class="auth-verify hidden"><div class="field gap-top"><label>8-digit OTP</label><input id="adminCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8" placeholder="••••••••"></div><button class="btn primary full gap-top" id="verifyAdmin" type="button">Verify & Create Mess</button></div></section>`);
    $('#authBack').onclick = renderWelcome;
    $('#adminSignup').onsubmit = async event => {
      event.preventDefault();
      const email = $('#adminEmail').value.trim().toLowerCase();
      const name = $('#adminName').value.trim();
      const messName = $('#messName').value.trim();
      if(!name || !messName || !email) return notify('সব তথ্য পূরণ করুন।');
      pendingEmail = email;
      sessionStorage.setItem('mm_admin_setup', JSON.stringify({name,messName,email}));
      await run(async()=>{
        const result = await client.auth.signInWithOtp({email, options:{shouldCreateUser:true}});
        if(result.error) throw result.error;
        $('#adminVerify').classList.remove('hidden');
        $('#adminCode').focus();
      }, 'OTP পাঠানো হয়েছে। Email check করুন।');
    };
    $('#verifyAdmin').onclick = async()=>{
      const setup = JSON.parse(sessionStorage.getItem('mm_admin_setup') || '{}');
      const token = $('#adminCode').value.trim();
      if(!/^\d{8}$/.test(token)) return notify('8-digit OTP দিন।');
      await run(async()=>{
        const verified = assertResult(await client.auth.verifyOtp({email:setup.email,token,type:'email'}));
        const authSession = verified?.session || (await client.auth.getSession()).data.session;
        if(!authSession) throw new Error('Login session তৈরি হয়নি। নতুন OTP নিন।');
        const created = await client.rpc('create_admin_workspace',{p_name:setup.name,p_mess_name:setup.messName,p_email:setup.email});
        if(created.error && !String(created.error.message||'').includes('already linked')) throw created.error;
        sessionStorage.removeItem('mm_admin_setup');
        location.reload();
      }, 'Mess তৈরি হয়েছে।');
    };
  }

  function renderMemberLogin(){
    mode = 'member';
    $('#app').innerHTML = authShell(`<section class="auth-card"><button class="auth-back" id="authBack" type="button">← Back</button><span class="auth-kicker">MEMBER LOGIN</span><h2>Sign in with OTP</h2><p class="muted">আপনার Admin যে email দিয়ে Member হিসেবে add করেছেন, সেই email ব্যবহার করুন।</p><form id="otpForm"><div class="field"><label>Email</label><input id="otpEmail" type="email" autocomplete="email" value="${esc(pendingEmail)}" required placeholder="you@example.com"></div><button class="btn primary full gap-top auth-main-btn" id="sendOtp" type="submit">Send OTP</button></form><div id="memberVerify" class="auth-verify hidden"><div class="field gap-top"><label>8-digit OTP</label><input id="otpCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8" placeholder="••••••••"></div><button class="btn primary full gap-top" id="verifyOtp" type="button">Verify & Sign in</button></div></section>`);
    $('#authBack').onclick = renderWelcome;
    const emailInput = $('#otpEmail'), codeInput = $('#otpCode'), sendButton = $('#sendOtp');
    $('#otpForm').onsubmit = async event => {
      event.preventDefault(); pendingEmail = emailInput.value.trim().toLowerCase();
      if(!pendingEmail) return notify('Email দিন।');
      await run(async()=>{
        const response = await fetch(`${cfg.supabaseUrl}/functions/v1/request-mess-otp`,{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.supabaseAnonKey},body:JSON.stringify({email:pendingEmail})});
        if(!response.ok) throw new Error('OTP পাঠানো যাচ্ছে না। আবার চেষ্টা করুন।');
        sendButton.textContent='Resend OTP'; $('#memberVerify').classList.remove('hidden'); codeInput.focus();
      },'Member account থাকলে OTP পাঠানো হয়েছে।');
    };
    $('#verifyOtp').onclick = async()=>{
      const email=(pendingEmail||emailInput.value).trim().toLowerCase(), token=codeInput.value.trim();
      if(!/^\d{8}$/.test(token)) return notify('8-digit OTP দিন।');
      await run(async()=>{
        const authData=assertResult(await client.auth.verifyOtp({email,token,type:'email'}));
        const authSession=authData?.session||(await client.auth.getSession()).data.session;
        if(!authSession) throw new Error('Login session তৈরি হয়নি।');
        const claim=await client.rpc('claim_member_by_email');
        if(claim.error && !String(claim.error.message||'').includes('already')) throw claim.error;
        location.reload();
      });
    };
  }

  window.renderLogin = function renderAuth(){ document.querySelector('.toast')?.remove(); renderWelcome(); };
  window.renderAdminSignup = renderAdminSignup;
  window.renderMemberLogin = renderMemberLogin;
  if(!session) window.renderLogin();
})();
