/* Passwordless email OTP login for Mess Manager. */
'use strict';
(() => {
  let pendingEmail = '';
  const originalBootstrap = window.bootstrap;

  window.bootstrap = async function otpAwareBootstrap(authSession) {
    if (authSession?.user) {
      const claim = await client.rpc('claim_member_by_email');
      if (claim.error) console.warn('Member auto-link skipped:', claim.error.message);
    }
    return originalBootstrap(authSession);
  };

  window.renderLogin = function renderOtpLogin() {
    $('#app').innerHTML = `<div class="login"><form class="card" id="otpForm"><h1>Mess Manager</h1><p class="muted">Password লাগবে না — email-এ পাঠানো OTP দিয়ে login করুন।</p><div class="field"><label for="otpEmail">Email</label><input id="otpEmail" type="email" autocomplete="email" value="${esc(pendingEmail)}" required/></div><div id="otpStep" style="display:none"><div class="field gap-top"><label for="otpCode">OTP code</label><input id="otpCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" placeholder="OTP code"/></div><button class="btn primary full gap-top" id="verifyOtp" type="button">Verify & Sign in</button></div><button class="btn primary full gap-top" id="sendOtp" type="submit">Send OTP</button><p class="muted gap-top">শুধু admin-এর member list-এ থাকা email mess data access করতে পারবে।</p></form></div>`;

    const emailInput = $('#otpEmail');
    const codeInput = $('#otpCode');
    const step = $('#otpStep');
    const sendButton = $('#sendOtp');

    $('#otpForm').addEventListener('submit', async event => {
      event.preventDefault();
      pendingEmail = emailInput.value.trim().toLowerCase();
      if (!pendingEmail) return notify('Email দিন।');
      await run(async () => {
        assertResult(await client.auth.signInWithOtp({
          email: pendingEmail,
          options: { shouldCreateUser: true }
        }));
        step.style.display = '';
        sendButton.textContent = 'Resend OTP';
        codeInput.required = true;
        codeInput.focus();
      }, 'OTP email পাঠানো হয়েছে।');
    });

    $('#verifyOtp').addEventListener('click', async () => {
      const token = codeInput.value.trim();
      if (!/^\d{6,10}$/.test(token)) return notify('Email-এ পাওয়া 6–10 digit OTP দিন।');
      await run(async () => {
        assertResult(await client.auth.verifyOtp({ email: pendingEmail || emailInput.value.trim().toLowerCase(), token, type: 'email' }));
      }, 'Login successful.');
    });
  };

  // app.js may have already rendered the old password form before this deferred
  // enhancement runs. Replace it immediately for signed-out users.
  if (!session) window.renderLogin();
})();
