# Security hardening: 2026-09-26

## Operational use

Use the main sign-in page. Open Developer Studio > Security Activity. Enroll an authenticator, store a protected backup or add a second authenticator, then verify its code. Enrollment is not complete until verification succeeds. The account/session modification controls require a verified AAL2 developer session even before MFA is enrolled. Existing study access for approved, unenrolled accounts is not automatically withdrawn.

Available controls: approve/block another account; revoke a selected retained session; revoke every existing session for another account; revoke your other sessions while preserving the current administrator session. Mutations require confirmation and are re-authorized in SQL. Self-blocking and revoking the current administrator session through these controls are rejected.

Revocation prevents protected application data access on subsequent authorized requests. It does not remove Auth's ability to issue refresh tokens, nor recall downloaded data or invalidate previously issued Storage signed URLs. Revoked session IDs stay denied despite token refresh. Blocking advances an account-level session cutoff, so re-approval does not restore pre-block sessions. A new login after a cutoff is permitted if the account is approved.

## Enforcement

Supabase migration `security_mfa_and_session_revocation` was applied. The full applied DDL is retained in Supabase migration history. It adds `session_cutoff` and `require_mfa` to the existing private allowlist, private revocation and administrative-event tables, session/MFA predicates, and thin SECURITY INVOKER RPC wrappers. Privileged implementations stay in `security_private` with fixed empty search paths and explicit grants. Private tables are not exposed for direct client reads or writes.

Existing restrictive RLS policies on ten public tables and the question-images bucket call the strengthened `is_allowed()` predicate. It checks account approval, session ownership/existence/expiry, Auth bans, session cutoff, individual revocation, and required MFA. Existing protected developer RPCs also use that predicate through their administrator check. No passwords, signing keys, auth secrets, or user metadata are used as authorization decisions.

When a verified factor exists, AAL1 requests are denied. After verification, the UI also pins `require_mfa=true`; removal of the final factor does not silently downgrade protection. Losing every factor therefore requires recovery through the owner's Supabase dashboard. This UI does not generate recovery codes or remove verified factors.

The `login-audit` compatibility Edge Function now uses the caller's JWT and a server-side Auth-session RPC. It no longer uses a service-role key or accepts client-provided identity, IP, location, timestamps, or device strings as audit facts. Gateway JWT verification remains enabled. Audit insertion is deduplicated by Auth session ID. Location enrichment is not added by this release; unknown locations remain unknown.

The security page has a restrictive Content Security Policy, no-referrer, and noindex. These are defense-in-depth, not hosting authentication. The root sign-in page loads `security-auth.js` before the existing portal script. Direct legacy sign-in forms may require returning to the main page to complete MFA; server checks still apply regardless of UI.

## Verification

- 14 live-database authorization assertions passed inside a rolled-back transaction. Covered approved-user reads, student admin denial, role-write denial, password-only security mutation denial, required-MFA denial, AAL2 acceptance, session ownership, revocation despite refreshed claims, pre-block session denial after re-approval, and anonymous RPC denial. SQL tests simulate claims/roles; they are not signed-token end-to-end tests.
- Eight Node authorization regression tests passed and are included under `tests/security-authorization.test.cjs`.
- 22 local Chromium DOM assertions passed for the new MFA and controls UI, including wrong-code rejection, successful enrollment state changes, mutation targets/scopes, escaped labels, secret cleanup, logout cleanup, and mobile overflow. Supabase responses and storage were mocked; CSP was removed from the test-only fixture to inject scripts. These tests do not verify live TOTP delivery/enrollment, deployed CSP behavior, or cross-browser compatibility.
- No existing accounts were blocked and no retained sessions were revoked by the test transaction. Users must enroll their own authenticators.

## Remaining boundaries

This is not a full penetration test, WAF, failed-password log, IP-geolocation service, or authenticated static host. Public GitHub Pages and repository files remain public. Move confidential static content to an authenticated origin and ensure the origin cannot be bypassed before describing the whole website as private. Authentication-provider signup, password policy, CAPTCHA, and recovery settings were not changed through this release.

Official references: https://supabase.com/docs/guides/auth/auth-mfa and https://supabase.com/docs/guides/auth/sessions
