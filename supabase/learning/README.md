# Source-backed learning backend — staged, not deployed

This additive implementation lives behind `LEARNING_ENABLED=false`. It has not changed the live Supabase database, storage, Edge Functions, existing quiz grading, or existing mastery records. No real model calls were made during implementation. The API is course-agnostic: module/question IDs and reviewed source mappings drive the workflow.

## What is implemented

`learning-api` verifies every user JWT with Supabase Auth, then requires the same approved-account, valid-session, MFA and `allowed` checks as the existing security layer. Module access is checked using the caller's token before service-role operations. Developer authoring and personal learner plan access are distinct. `process_job` also accepts a separate high-entropy server-only worker token, for that action alone.

The database-backed workflow is:

1. Organize readable evidence from original image/text/PDF bytes; reject unreadable evidence rather than fabricate extraction.
2. Author lessons for the missed, guessed, unanswered, or uncertain mapped objectives, and a different single-choice retest.
3. Make independent source, rules, and presentation review calls in separate contexts. The source reviewer receives original bytes, not just extraction. Optional per-role model overrides allow different reviewer models.
4. Require all three PASS verdicts for the exact canonical artifact SHA-256 before publication. Every published read recomputes the hash and checks the same reviews.
5. Require acknowledgments of every lesson before returning any retest questions. Grade only the complete set, retain its first submission, and keep evidence separate from the existing mastery system.

The queue uses transactionally claimed leases, `FOR UPDATE SKIP LOCKED`, three attempts per stage, delayed retries, two author revisions after failed reviews, and immutable evidence versions. Publication requires a current publication-stage lease. A persistent external worker resumes queued work independently of any browser. Each role is a separate provider request, not a claim of infallible or human review; model quality still needs course-specific evaluation before enabling automatic release for users.

## Data and privacy

The staged SQL creates only new `learning_*` tables and a new private `learning-sources` bucket. It does not alter existing learner/course tables. `learning_attempts` records client-reported evidence with stable event IDs; it is not trusted proof of mastery. Existing `card_progress`/`test_sessions` are untouched. Quiz evidence drains in batches of at most 100 events. Unusually large individual responses or question snapshots are bounded with explicit truncation markers and original byte counts; they are partial evidence, and the lesson author must not treat them as complete answers.

Source upload is developer-only shared module authoring in this first release. Learners can see only sources explicitly included in reviewed mappings for accessible modules; unmapped uploads are not listed for learners. Source objects have no browser storage policy; the authorized API provides five-minute signed URLs. This is not yet a personal learner-upload feature. A linked source is intentionally shared course material, so developers must not map private personal files into it.

Sources and rules are immutable versions. Mapping changes apply only to new plans; each plan retains its source hashes, original questions, mapping versions, course rule version, base rules, learner evidence and module revision. Course instructions are plain developer-authored text, bounded to 8,000 characters, and cannot override the base source/safety requirements. Clearing them creates a new empty rules version.

Artifact answers, draft content, review data and job payloads have no authenticated Data API read grants. Only sanitized published questions are returned after the lesson gate. Plans, append-only attempts and results have own-user SELECT policies plus `security_private.is_allowed()`. Browser users have no direct INSERT/UPDATE/DELETE grants on the new tables. Application service-role writes also cannot mutate or delete immutable evidence. A future administrative retention/deletion procedure needs separate review; none is silently supplied here.

## Bounds and costs

Each source is at most 2 MiB; formats are UTF-8 text, PNG, JPEG and PDF. A plan accepts at most 100 input question outcomes, eight objectives, four sources, and 12 detected pages per source. PDF extraction is performed through the configured multimodal provider and independently compared with the original bytes; there is no local PDF parser or claim of guaranteed OCR accuracy. Unsupported/encrypted/unreadable material fails closed. File signatures, MIME allowlists, private storage, byte hashes, bounded bodies and output schemas are enforced.

Ten new plans per user per UTC day and at most three pending plans are enforced transactionally. Model/provider billing remains separate; these are request limits, not a dollar budget. Provider requests time out after 45 seconds. This implementation orchestrates an external Gemini API; it does not host model weights in Supabase Edge. Provider or model availability was not exercised. A different provider requires another server-side adapter with the same contracts and tests. The model specified in `env.example` is a configuration example, not a recommendation or availability guarantee.

Retest freshness rejects exact original prompts and prompts from the user's previous 20 published plans for this module, and asks independent reviewers to check semantic freshness. This is not a guarantee of unlimited novel questions or validated learning gains. Scored output is multiple-choice evidence; reading acknowledgments, ungraded recall, delayed retention and hands-on evidence remain distinct.

## API contract

All user calls are authenticated JSON `POST`s to `/functions/v1/learning-api`. Never send a service-role/provider/worker key from a browser.

| action | Input | Result |
|---|---|---|
| `status` | none | `enabled`, `configured`, `worker_configured`, `worker_ready`, `developer`, `reason` |
| `list_sources` | `module_id` | accessible `sources` with signed URLs and `mappings` |
| `save_sources` | `module_id`, `sources:[{filename,mime_type,text? or content_base64?}]` | immutable uploaded `sources`; developer only |
| `save_mappings` | `module_id`, `mappings:[{question_id,objective_id,objective_title,source_ids}]` | validated reviewed mappings; developer only |
| `get_rules` | `module_id` | latest `rules:{id,text,created_at}` or null, plus `base_rules`; developer only |
| `save_rules` | `module_id`, `rules` string | new immutable rules version; developer only |
| `save_attempts` | `module_id`, `attempts:[{event_id,question_id,outcome,confidence,...}]` | `{ok:true,saved}`; append-once events owned by caller |
| `create_plan` | `module_id`, `request_id` UUID, `mode`, `attempts`, optional `session_id` and `attempt_ids` | idempotent `{plan_id,status}`; captured responses are resolved from own persisted events |
| `get_plan` | `plan_id` | sanitized plan/job, published lessons, signed sources, acknowledged IDs, gated questions, stored results |
| `acknowledge` | `plan_id`, `lesson_id` | reading acknowledgment only |
| `submit_retest` | `plan_id`, `answers:[{question_id,choice_id,confidence}]` | first complete submission's results; repeated calls return it |
| `process_job` | optional `plan_id` | advances one job stage; developer or server worker only |

Outcomes: `wrong`, `guessed`, `correct`, `confident`, `unanswered`. Confidence: `Confident`, `Guessed`, `Unknown`, `No idea`. An unanswered or unknown answer is not automatically a demonstrated misconception. `no_idea` is the reserved retest response ID and cannot be a generated correct choice. Plan creation resolves supplied event IDs against the caller's persisted events in the same module/session. Missing or pending events are explicitly snapshotted as `summary_only_response_unavailable` with a null response, so the author must not invent a learner misconception. Resolved responses remain labelled client-reported evidence, not server-verified mastery.

Lessons use `{id,objective_id,title,summary,facts:[{text,source_ids,locator}],example,recall_prompt,recall_answer,source_ids}`. Questions use `{id,type,objective_id,prompt,choices:[{id,text}],source_ids}`. `answer_id` and `rationale` appear only in results after full submission. All text must be rendered as text/escaped strings by the frontend.

## Deployment handoff — pending, not run

The Supabase CLI was unavailable in this environment, so `learning_schema.sql` is an explicit staging file, not a fabricated timestamped migration. On a machine with the CLI installed:

1. Inspect `supabase --help` and `supabase migration new --help`. Run `supabase migration new source_backed_learning`, then copy the staged SQL into the generated migration file. Review the exact diff and apply it to an isolated development database first. The schema requires existing `public.modules`, `public.questions`, `auth.users` and `security_private.is_allowed()`.
2. Run the repository tests and database/RLS/lease tests. Check advisors and real authenticated ownership, revocation and MFA cases in the development project. The isolated database harness does not reproduce Supabase Auth, Storage or Edge hosting.
3. Configure the Edge environment using protected server settings. `env.example` lists names, never real credentials. Use a randomly generated worker token of at least 32 characters. Keep `LEARNING_ENABLED=false` until the rollout is approved. Configure allowed frontend origins explicitly.
4. Review `supabase/config.toml`: only `learning-api` disables gateway JWT verification because the handler verifies Auth and the distinct worker token itself. Do not copy this setting to existing functions. Deploy only after explicit release authorization; this work did not deploy it.
5. Run `node supabase/learning/worker.mjs` in a persistent managed process on a server. Supply only `LEARNING_API_URL` and `LEARNING_WORKER_TOKEN` to that process. It needs neither the service-role key nor the model API key. Configure automatic restart and logging. Multiple workers are safe because database claims are leased and publication checks the lease.
6. Enable the server feature flag and start the worker. The worker records a heartbeat; learner plan creation remains unavailable until a heartbeat is present and less than five minutes old. Developer-authenticated manual job advancement is a diagnostic fallback, not a replacement for the background worker. Enable the frontend feature flag only after the deployment is verified.

Current storage capacity, plan quota headroom, provider budget and hosting runtime limits require deployment-specific verification. Do not treat an empty queue or installed schema as evidence that the external worker/model is functioning.

## Verification boundary

Offline Node tests cover domain validation, complete-answer gates, separate reviewer contexts, exact-hash bindings, bounded revisions, unreadable extraction, API auth/ownership contracts and provider-free pipeline execution. The isolated PostgreSQL harness executes the actual staged SQL with explicit Auth/Storage fixtures and SHA-256 compatibility wiring, covering row access, immutable evidence, queue leases and publication gates. Neither test path contacts live Supabase or a model provider.
