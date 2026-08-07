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
    document.querySelector('.toast')?.remove();

    $('#app').innerHTML = `<div class="login"><form class="card" id="otpForm"><h1>Mess Manager</h1><p class="muted">Secure Admin & Member sign in</p><div class="field"><label for="otpEmail">Email</label><input id="otpEmail" type="email" autocomplete="email" value="${esc(pendingEmail)}" required/></div><div class="field gap-top"><label for="otpCode">OTP Code</label><input id="otpCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8"/></div><button class="btn primary full gap-top" id="sendOtp" type="submit">Send OTP</button><button class="btn primary full gap-top" id="verifyOtp" type="button">Verify & Sign in</button></form></div>`;

    const emailInput = $('#otpEmail');
    const codeInput = $('#otpCode');
    const sendButton = $('#sendOtp');

    $('#otpForm').addEventListener('submit', async event => {
      event.preventDefault();
      pendingEmail = emailInput.value.trim().toLowerCase();
      if (!pendingEmail) return notify('Enter your email.');

      await run(async () => {
        const response = await fetch(`${cfg.supabaseUrl}/functions/v1/request-mess-otp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: cfg.supabaseAnonKey,
          },
          body: JSON.stringify({ email: pendingEmail }),
        });
        if (!response.ok) throw new Error('Unable to send OTP right now.');
        sendButton.textContent = 'Resend OTP';
        codeInput.focus();
      }, 'If this email belongs to an active member, an OTP has been sent.');
    });

    $('#verifyOtp').addEventListener('click', async () => {
      const email = (pendingEmail || emailInput.value).trim().toLowerCase();
      const token = codeInput.value.trim();

      if (!email) return notify('Enter your email.');
      if (!/^\d{8}$/.test(token)) return notify('Enter the 8-digit OTP.');

      await run(async () => {
        const authData = assertResult(await client.auth.verifyOtp({ email, token, type: 'email' }));
        const authSession = authData?.session || (await client.auth.getSession()).data.session;
        if (!authSession) throw new Error('Login session was not created. Please request a new OTP.');

        const claim = await client.rpc('claim_member_by_email');
        if (claim.error && !String(claim.error.message || '').includes('already')) throw claim.error;
        location.reload();
      });
    });
  };

  if (!session) window.renderLogin();
})();
