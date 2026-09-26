/* Server authorization and TOTP step-up for Tomato08. No credentials are persisted here. */
(function () {
  'use strict';
  if (!window.FC || window.T08Security) return;
  const client = FC.client, originalProfile = FC.getProfile;
  let challengePromise = null;
  async function status() {
    const result = await client.rpc('security_access_status');
    if (result.error) throw new Error('Access verification failed. Retry with a connection.');
    if (!result.data || typeof result.data.allowed !== 'boolean') throw new Error('Invalid access response.');
    return result.data;
  }
  function challenge() {
    if (challengePromise) return challengePromise;
    challengePromise = (async () => {
      const response = await client.auth.mfa.listFactors();
      if (response.error) throw response.error;
      const factors = (response.data.totp || []).filter(f => f.status === 'verified');
      if (!factors.length) throw new Error('MFA is required but no verified authenticator is available. Recover access through the account owner’s Supabase dashboard.');
      return new Promise((resolve, reject) => {
        const dialog = document.createElement('dialog');
        dialog.setAttribute('aria-labelledby', 't08-mfa-title');
        dialog.style.cssText = 'max-width:440px;width:calc(100% - 32px);padding:24px;border:1px solid #526074;border-radius:14px;background:#151b24;color:#eef2f7;';
        dialog.innerHTML = '<h2 id="t08-mfa-title">Verify your sign-in</h2><p>Enter the current code from your authenticator.</p><form><label for="t08-factor">Authenticator</label><select id="t08-factor" style="display:block;width:100%;padding:10px;margin:8px 0 16px"></select><label for="t08-code">Six-digit code</label><input id="t08-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required style="display:block;width:100%;padding:12px;margin:8px 0 16px"><p role="alert" id="t08-mfa-error"></p><button type="submit" style="padding:10px 16px">Verify</button> <button type="button" id="t08-cancel" style="padding:10px 16px">Cancel</button></form>';
        const select = dialog.querySelector('select');
        factors.forEach(f => { const option = document.createElement('option'); option.value = f.id; option.textContent = f.friendly_name || 'Authenticator'; select.append(option); });
        const finish = error => { dialog.close(); dialog.remove(); error ? reject(error) : resolve(); };
        dialog.addEventListener('cancel', e => { e.preventDefault(); finish(new Error('Verification cancelled.')); });
        dialog.querySelector('#t08-cancel').onclick = () => finish(new Error('Verification cancelled.'));
        dialog.querySelector('form').onsubmit = async e => {
          e.preventDefault(); const button = dialog.querySelector('[type="submit"]'), code = dialog.querySelector('input');
          if (!/^[0-9]{6}$/.test(code.value)) return;
          button.disabled = true; dialog.querySelector('#t08-mfa-error').textContent = '';
          try {
            const result = await client.auth.mfa.challengeAndVerify({ factorId: select.value, code: code.value });
            code.value = '';
            if (result.error) throw new Error('Code not accepted. Use a fresh authenticator code.');
            finish();
          } catch (error) { dialog.querySelector('#t08-mfa-error').textContent = error.message; button.disabled = false; code.focus(); }
        };
        document.body.append(dialog); dialog.showModal(); dialog.querySelector('input').focus();
      });
    })().finally(() => { challengePromise = null; });
    return challengePromise;
  }
  async function ensure() {
    let state = await status();
    if (!state.approved) throw new Error('This account is not approved for Tomato08.');
    if (!state.session_valid) throw new Error('This session is blocked, revoked, or expired. Sign in again.');
    if (state.mfa_required && state.aal !== 'aal2') { await challenge(); state = await status(); }
    if (!state.allowed) throw new Error('Access denied by the server.');
    return state;
  }
  async function getProfile() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data.session) return null;
    await ensure();
    return originalProfile();
  }
  FC.getProfile = getProfile;
  FC.requireUser = getProfile;
  FC.requireDeveloper = async () => { const p = await getProfile(); return p ? { denied: p.role !== 'developer', profile: p } : null; };
  FC.recordLoginAudit = async source => {
    const { error } = await client.rpc('security_record_session', { p_source: source || 'portal' });
    if (error) console.warn('Session audit could not be recorded.');
  };
  FC.signIn = async (username, password) => {
    const email = FC.usernameToEmail(username);
    if (!email || !password) throw new Error('Enter your username and password.');
    const result = await client.auth.signInWithPassword({ email, password });
    if (result.error) throw new Error('Username or password is incorrect.');
    await FC.recordLoginAudit('portal');
    await ensure();
    return (await client.auth.getSession()).data.session;
  };
  window.T08Security = { status, ensure, challenge };
})();
