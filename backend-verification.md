# Flashcard backend verification

Read-only inspection completed 2026-09-12. Project: `semtnzdzpluhnkzxkquk`.

The existing backend supports the principal flashcard workflows in the supplied ZIP. A UI reskin does not require a database migration. These checks used the authenticated Supabase management connector to inspect project metadata, schema, grants, policies, RPC definitions, storage configuration, and deployed function source. No account records, question content, images, passwords, tokens, or secret values were read. No database writes, sign-ins, function invocations, deployments, or paid model calls were performed. This is a contract inspection, not an end-to-end authenticated browser test.

## Verified contracts

- Project is `ACTIVE_HEALTHY`, in `us-west-2`, running PostgreSQL 17 (`17.6.1.166`).
- All eight tables referenced by the main application exist and have RLS enabled: `profiles`, `modules`, `question_groups`, `questions`, `card_progress`, `test_sessions`, `presence`, `question_reports`.
- The columns selected and written by the core `FC` methods in the supplied `cloud.js` match these tables. `card_progress` has the expected composite primary key `(user_id, question_id)` for upsert.
- Question types are `flashcard`, `multiple-choice`, `multiple-select`, `matching`, and `numeric`. The richer image-entry and visual question data remain in JSON `answer_data`, as the existing renderer expects.
- `profiles.role` is constrained to `tester` or `developer`. Frontend developer routing should continue to use the profile role; actual authorization remains in database grants and RLS.
- `list_question_reports(p_module_slug text)` exists and returns the report fields expected by the developer interface. `set_report_status(p_id uuid, p_status text)` exists. Both deployed function bodies check the caller's developer profile before accessing or changing reports.
- `memorized_rank(p_module_slug text)` exists and returns `my_rank`, `total_users`, `my_learned`, `top_learned`, and `bank_size`. It returns a row only for the current user when that user has the tester role; a developer receiving no rank is expected.
- The configured `question-images` bucket exists and is private. Authenticated users have a SELECT policy; developers have INSERT, UPDATE, and DELETE policies. This supports existing signed image URLs and upload-with-upsert. The bucket has no explicit file-size or MIME allowlist configured.

## One existing feature is not installed

`profiles.stud_number` and the RPC `set_stud_number` are absent. The existing `FC.studLabel` fallback, which extracts trailing digits from a username, still works. `FC.setStudNumber` already translates this missing RPC into a migration-needed error. Preserve that honest unavailable state; do not represent Stud-number editing as successfully connected. The referenced migration `supabase-reports-and-rank.sql` was not included in the supplied repository. No migration was added or run during this check.

## Grants and policy findings

- Authenticated clients have the table privileges needed for question authoring, group/module editing, progress upserts, presence, and reports, subject to RLS. Session history grants permit SELECT and INSERT, matching the application.
- The authenticated role cannot UPDATE `profiles.role` (verified with `has_column_privilege`) and cannot UPDATE the profiles table. The broad-looking self-update profile policy alone does not establish a role-escalation vulnerability.
- Anonymous clients have no SELECT grant on profiles, modules, questions, question groups, progress, or session history. Presence and report tables have anonymous SELECT grants, but their observed RLS predicates require the current owner or a developer; no unscoped read policy was found there.
- Several older permissive policies coexist with newer policies. PostgreSQL combines permissive policies with OR. In particular, the older `questions_read` policy permits visible-module questions without checking `is_active`; the UI filters inactive questions, but that filter is not the database authorization boundary. Consolidating overlapping policies is separate backend maintenance.
- Security Advisor reports mutable search path on `public.touch_updated_at`, broad execution grants on five SECURITY DEFINER functions, and disabled leaked-password protection. The report/status RPCs have explicit developer checks, and rank output is scoped to `auth.uid()`, so advisor notices are review items rather than proof of anonymous data disclosure.

Advisor references: [function search path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [anonymous SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## AI helper integration

The deployed function is `distractors`, ACTIVE version 5, with `verify_jwt: true`. Its deployed source differs from the ZIP's `index.ts`; the actual model string is `gemini-3.5-flash-lite`. Its availability and generated results were not tested because that would invoke the external model.

The source browser helper looks for authentication on `window.sb`, but the main application exposes its client as `FC.client`. The correct integration is to obtain the signed-in session through that existing client, send its access token as `Authorization: Bearer <user JWT>`, and send the existing publishable project key in `apikey`. A publishable key is not a user session; fail clearly if no session is available. Preserve existing answer choices until the generation request succeeds, then apply replacement.

The deployed CORS allowlist is exactly:

- `https://www.tomato08.com`
- `https://tomato08.com`
- `https://almighty1564.github.io`
- `http://localhost:8000`
- `http://127.0.0.1:5500`

Use one of the allowed local origins for an AI-capable review. A preview at `http://127.0.0.1:2714` would be blocked by browser CORS for this function. No CORS setting was changed.

The deployed handler checks only for a Bearer prefix before calling the model; it does not independently verify user identity or developer role. Correcting the browser's token retrieval does not harden the deployed server. Current Supabase header documentation explicitly describes API-key compatibility paths through `verify_jwt`, so do not claim that this flag alone proves a logged-in developer. The deployed handler also lacks a null-body guard and explicit model-request timeout. These are pre-existing backend follow-ups outside the visual reskin; no production behavior was changed.

References: [Authorization headers](https://supabase.com/docs/guides/functions/auth-headers), [Securing Edge Functions](https://supabase.com/docs/guides/functions/auth), [API keys](https://supabase.com/docs/guides/getting-started/api-keys).

## Documentation verification

The mandatory markdown changelog URL was attempted first; the web fetcher rejected its markdown content type and the shell network request was blocked. The official [HTML changelog](https://supabase.com/changelog) and relevant linked release note were then inspected. The [Data API grant change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) requires deliberate grants for new tables and preserves existing-table grants. No new tables are required for this reskin. The current API-key migration guide and dedicated header reference are not fully consistent about gateway compatibility, reinforcing the recommendation to use a real user JWT and validate authorization inside sensitive functions.

## Release verification still needed

An owner should exercise an existing tester and developer account in the completed UI: sign in/out, open a module, submit study answers, reload progress, report a question, edit a question, upload an image, and request AI distractors. This report does not claim those user actions succeeded. No test account or production record was created to simulate them.
