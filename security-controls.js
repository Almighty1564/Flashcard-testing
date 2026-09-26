/* MFA enrollment and privileged account/session controls. All mutations are authorized again in SQL. */
(function () {
  'use strict';
  const client = window.FC?.client;
  if (!client || !window.T08Security) return;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const panel = document.createElement('section'); panel.className = 'panel'; panel.id = 'securityControls';
  panel.innerHTML = '<h2>Access controls & MFA</h2><p id="controlMessage" role="status">Checking security controls…</p><div id="mfaControls"></div><div id="adminControls"></div>';
  document.querySelector('#app .notice').after(panel);
  const $ = id => document.getElementById(id);
  let data = null, pendingFactor = null, busy = false, serial = 0, actor = null;
  const msg = text => { $('controlMessage').textContent = text; };
  const when = value => value ? new Date(value).toLocaleString() : 'Not recorded';
  async function call(name, args) { const result = await client.rpc(name, args); if (result.error) throw result.error; return result.data; }
  function clearPrivate() { serial++; data = null; pendingFactor = null; $('mfaControls').replaceChildren(); $('adminControls').replaceChildren(); }
  async function refresh() {
    const request = ++serial;
    try {
      const access = await T08Security.ensure();
      if (access.role !== 'developer') throw new Error('Developer access required.');
      const result = await call('security_controls');
      if (request !== serial) return;
      data = result; actor = result.self;
      const mine = data.accounts.find(a => a.id === actor);
      $('mfaControls').innerHTML = '<h3>Authenticator protection</h3><p>' + (mine?.mfa_enrolled ? 'A verified authenticator is enrolled.' : 'No authenticator is enrolled yet.') + ' ' + (mine?.require_mfa ? 'MFA is required by the database, even if a factor is removed.' : 'Enrolled factors require MFA; pin the requirement after verification.') + '</p><div class="actions"><button class="btn" data-control="enroll">' + (mine?.mfa_enrolled ? 'Add backup authenticator' : 'Enroll authenticator') + '</button>' + (mine?.mfa_enrolled && !mine.require_mfa ? '<button class="btn" data-control="enforce">Require MFA permanently</button>' : '') + '<button class="btn" data-control="pending">Clear unfinished enrollments</button></div><div id="enrollment"></div><p class="privacy">Keep a second authenticator or a protected copy of the setup secret. No recovery codes are generated here. If all factors are lost, recover through the owner’s Supabase dashboard. Do not share the QR code or secret.</p>';
      $('adminControls').innerHTML = '<h3>Approved accounts</h3><p class="privacy">Security changes require a verified second factor. Blocking denies protected data on the next request. Approval does not restore old sessions.</p><div class="table-wrap"><table><thead><tr><th>Account</th><th>Access / MFA</th><th>Last sign-in</th><th>Actions</th></tr></thead><tbody>' + data.accounts.map(a => '<tr><td>' + esc(a.username || a.id) + (a.id === actor ? ' (you)' : '') + '</td><td>' + (a.approved ? 'Approved' : 'Blocked') + ' / ' + (a.mfa_enrolled ? 'Enrolled' : 'Not enrolled') + '</td><td>' + esc(when(a.last_sign_in_at)) + '</td><td>' + (a.id !== actor ? '<button class="btn" data-control="access" data-user="' + esc(a.id) + '" ' + (!data.can_mutate ? 'disabled' : '') + '>' + (a.approved ? 'Block' : 'Approve') + '</button> <button class="btn" data-control="all" data-user="' + esc(a.id) + '" ' + (!data.can_mutate ? 'disabled' : '') + '>Revoke all sessions</button>' : '<button class="btn" data-control="others" ' + (!data.can_mutate ? 'disabled' : '') + '>Revoke my other sessions</button>') + '</td></tr>').join('') + '</tbody></table></div><h3>Retained Auth sessions</h3><p class="privacy">Showing ' + data.sessions.length + ' of ' + data.session_total + ' retained sessions, newest first (maximum 200). “Eligible” is not proof of current activity; each data request must also satisfy MFA. Revocation denies application data, not Auth token issuance or already downloaded files.</p><div class="table-wrap"><table><thead><tr><th>Account</th><th>IP / device observed by Auth</th><th>Created / updated</th><th>Eligibility</th><th>Action</th></tr></thead><tbody>' + data.sessions.map(s => '<tr><td>' + esc(s.username || s.user_id) + '</td><td>' + esc(s.ip_address || 'Unknown') + '<details><summary>Device</summary>' + esc(s.user_agent || 'Unknown') + '</details></td><td>' + esc(when(s.created_at)) + '<br>' + esc(when(s.updated_at)) + '</td><td>' + (s.data_access_eligible ? 'Eligible, subject to MFA' : 'Denied / expired') + (s.is_current ? '<br>Current session' : '') + '</td><td>' + (!s.is_current && s.data_access_eligible ? '<button class="btn" data-control="one" data-session="' + esc(s.id) + '" data-user="' + esc(s.user_id) + '" ' + (!data.can_mutate ? 'disabled' : '') + '>Revoke</button>' : '') + '</td></tr>').join('') + '</tbody></table></div><h3>Security change history</h3><p class="privacy">Latest 100 administrative events. Ordinary accounts cannot modify this history.</p><div class="table-wrap"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Account</th></tr></thead><tbody>' + data.events.map(e => '<tr><td>' + esc(when(e.occurred_at)) + '</td><td>' + esc(e.actor) + '</td><td>' + esc(e.action) + '</td><td>' + esc(e.subject) + '</td></tr>').join('') + '</tbody></table></div><button class="btn" data-control="refresh" style="margin-top:14px">Refresh controls</button>';
      msg(data.can_mutate ? 'MFA verified. Privileged controls are enabled.' : 'Read-only until you enroll and verify an authenticator. Existing approved study access is unchanged.');
    } catch (error) { if (request === serial) { clearPrivate(); msg(error.message || 'Access unavailable.'); } }
  }
  async function enroll() {
    if (pendingFactor) throw new Error('Finish or cancel the current enrollment first.');
    const result = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Tomato08 ' + new Date().toISOString().slice(0,19) });
    if (result.error) throw result.error;
    pendingFactor = result.data.id;
    const host = $('enrollment'); host.innerHTML = '<h4>Scan privately, then verify</h4><img id="mfaQr" alt="Private authenticator setup QR code" style="max-width:220px;background:white;padding:10px"><details><summary>Manual setup secret</summary><code id="mfaSecret"></code></details><form id="enrollForm"><label for="enrollCode">Authenticator code</label><input id="enrollCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required><button class="btn" type="submit">Verify and require MFA</button> <button class="btn" type="button" data-control="cancel">Cancel enrollment</button></form>';
    const qr = result.data.totp.qr_code;
    $('mfaQr').src = qr.startsWith('data:image/') ? qr : 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qr);
    $('mfaSecret').textContent = result.data.totp.secret;
    $('enrollCode').focus();
    msg('Enrollment is not active until the authenticator code is verified. Verifying a new factor may sign out other sessions.');
  }
  panel.addEventListener('submit', async e => {
    if (e.target.id !== 'enrollForm') return;
    e.preventDefault(); if (busy || !pendingFactor) return;
    busy = true; const button = e.target.querySelector('[type="submit"]'); button.disabled = true;
    try {
      const result = await client.auth.mfa.challengeAndVerify({ factorId: pendingFactor, code: $('enrollCode').value });
      $('enrollCode').value = '';
      if (result.error) throw new Error('Code not accepted. Try a fresh code.');
      pendingFactor = null; $('enrollment').replaceChildren();
      await call('security_enforce_mfa'); await refresh();
    } catch (error) { msg(error.message || 'Verification failed.'); if (!pendingFactor) await refresh(); }
    finally { busy = false; if (button.isConnected) button.disabled = false; }
  });
  panel.addEventListener('click', async e => {
    const button = e.target.closest('[data-control]'); if (!button || busy || button.disabled) return;
    const action = button.dataset.control; busy = true; button.disabled = true;
    try {
      if (action === 'enroll') await enroll();
      else if (action === 'cancel') {
        if (pendingFactor) { const result = await client.auth.mfa.unenroll({ factorId: pendingFactor }); if (result.error) throw result.error; }
        pendingFactor = null; $('enrollment').replaceChildren(); msg('Unverified enrollment cancelled.');
      } else if (action === 'pending') {
        const result = await client.auth.mfa.listFactors(); if (result.error) throw result.error;
        const pending = (result.data.all || []).filter(f => f.status === 'unverified');
        if (!pending.length) { msg('No unfinished enrollments found.'); return; }
        if (!confirm('Remove unfinished authenticator enrollments? Verified authenticators are not changed.')) return;
        for (const f of pending) { const res = await client.auth.mfa.unenroll({ factorId: f.id }); if (res.error) throw res.error; }
        pendingFactor = null; await refresh();
      } else if (action === 'enforce') { await call('security_enforce_mfa'); await refresh(); }
      else if (action === 'refresh') { if (pendingFactor) throw new Error('Finish or cancel enrollment before refreshing.'); await refresh(); }
      else {
        const userId = action === 'others' ? actor : button.dataset.user;
        const account = data.accounts.find(a => a.id === userId); if (!account) throw new Error('Account not available. Refresh controls.');
        if (!confirm((action === 'access' ? (account.approved ? 'Block ' : 'Approve ') : 'Revoke ' + (action === 'one' ? 'this session for ' : action === 'others' ? 'your other sessions for ' : 'all current sessions for ')) + (account.username || userId) + '? Protected-data access changes immediately. Previously downloaded data cannot be recalled.')) return;
        if (action === 'access') await call('security_set_access', { p_user_id: userId, p_approved: !account.approved });
        else await call('security_revoke_sessions', { p_user_id: userId, p_session_id: button.dataset.session || null, p_scope: action });
        await refresh();
      }
    } catch (error) { msg(error.message || 'Security action failed.'); }
    finally { busy = false; if (button.isConnected) button.disabled = false; }
  });
  client.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') { clearPrivate(); msg('Signed out. Private controls cleared.'); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !busy && !pendingFactor) refresh(); });
  refresh();
})();
