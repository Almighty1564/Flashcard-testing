# Tomato08: a personal platform with room to grow

> Historical discovery report from the earlier design stage. The current folder now contains the integrated flashcard application. See [README.md](README.md) and [backend-verification.md](backend-verification.md) for the current implementation and verified backend status; references below to a sample-data prototype describe the earlier version.

Prepared September 10, 2026. This is a repository assessment, a proposed product and architecture, and a staged implementation plan. The accompanying prototype uses sample data and local interactions. It does not connect to the production database, change the existing website, or establish account integrations.

**Recommendation:** keep the useful study system and Supabase foundation. Build an architectural public identity and a calm private workspace around clearly separated modules. Resolve identity, permissions, and save reliability before adding household documents or account connections. Begin with one modular application and managed infrastructure.

The working recommendation is **Atelier**: a memorable public gallery with a practical workspace behind it. The prototype also offers an editorial **Living Index** and a navigation concept called **Spatial Gallery**. These names are design directions, not a proposed compulsory rebrand.

## 1. What I verified

| Evidence | Result |
|---|---|
| Supplied ZIP | 14 files, 401,530 uncompressed bytes; inspected from an isolated copy |
| Current public repository | `Almighty1564/Flashcard-testing`, default branch `main`, GitHub Pages enabled |
| Compared revision | [`5229a688452762b3c28db91ac456afbcd0f824ab`](https://github.com/Almighty1564/Flashcard-testing/commit/5229a688452762b3c28db91ac456afbcd0f824ab), September 8, 2026 |
| ZIP versus GitHub | Every one of the 14 file contents matches its Git blob hash |
| Live website | [www.tomato08.com](https://www.tomato08.com/) returned HTTP 200 and the exact homepage in the ZIP |
| Other entry points | The apex domain and repository Pages URL both resolved to the `www` website |
| Hosting observed | GitHub Pages, HTTPS, response header `Server: GitHub.com`; homepage cache lifetime 600 seconds |
| Supabase identity | Frontend configuration references the same project as the dashboard link you supplied |
| Backend settings | No authenticated Supabase dashboard/API access established; deployed policies, schema, functions, backups and billing are unverified |

The assessment uses the actual current source, public repository metadata, and read-only HTTP checks. Source issues were reproduced locally with stubbed services, without calling the live model endpoint or querying private database records. The evidence files in this package record the checks. Repository comments and deployment commands were treated as source material, not instructions to execute.

## 2. What is worth preserving

This is more capable than an empty website. Its current value is the learning workflow:

- Supabase username/password sign-in, tester/developer roles, and role-dependent navigation.
- Modules, question groups, multiple question formats, question images, and authoring tools.
- Spaced-review state, custom tests, confidence/result recording, debriefing, and learner progress.
- Question reporting, developer review, ranking and online-presence features.
- A shared `FC` data layer that already separates some cloud operations from page code.
- Private-image delivery through signed URLs and a server-side AI-provider secret.

Preserve the question-bank content, user identifiers, review history, existing URLs, and current successful workflows during migration. Do not replace the application with an attractive shell that loses these behaviors. Retain unrelated existing experiment pages without expanding them in this project phase.

The client configuration contains a **publishable** Supabase key. That key is intended to be browser-visible; its presence is not evidence of a leaked privileged credential. Access control must be enforced by authentication and database/storage policies. A privileged service key or database password must never be added to that file. [Supabase authorization headers](https://supabase.com/docs/guides/functions/auth-headers)

## 3. Findings to address before expansion

Priorities describe the recommended order of work. A source-level issue is distinguished from an unverified production condition.

| Priority | Finding and evidence | Practical consequence and next action |
|---|---|---|
| First | **The AI helper uses the wrong client for its session.** `ai-distractors.js:23–30` reads `window.sb`; the shared client is `FC.client`. A local test with a valid `FC.client` session reproduced a publishable key sent as the bearer token. | Use the shared authenticated client and fail clearly when no user session exists. Prefer the supported function invocation method. Test signed-out, expired-session, tester and developer callers. |
| First | **The Edge handler does not establish caller identity or role.** `index.ts:149–154` checks only that the header starts with `Bearer `. In a stubbed local run, arbitrary bearer text reached the model call. | Validate the user identity server-side, enforce the intended authoring permission, and add per-user limits. The gateway configuration and deployed handler are not verified; this is not a claim that a live exploit was performed. |
| First | **Database authorization cannot be reproduced from the repository.** No SQL migrations, RLS policies, grants, RPC definitions, storage policies or Edge config are present. | Export schema and policy definitions without user rows; version them and write cross-user/role tests. Frontend role checks alone cannot protect records or privileged operations. |
| First | **Progress-save failure is invisible to the learner.** `cloud.js:360–361` logs an upsert error and resolves; `mod1.html:581` does not await the save. | Show saving/saved/failed states, retain an unsaved change for retry, and make navigation/retry behavior predictable. Add idempotency and concurrency handling before multi-device or offline editing. |
| Next | **Function naming is inconsistent.** The frontend calls `/functions/v1/distractors`; the source deployment comment names `generate-distractors`. | Establish the actual deployed name, put it in one configuration location, and test the contract. This discrepancy does not prove the deployed endpoint is missing. |
| Next | **Request shape is insufficiently validated.** A JSON `null` body produces an uncaught field-access error in the Edge handler. There is no application-level role/quota control or upstream timeout in the supplied handler. | Validate object shape and size before reading fields, bound model latency, return controlled errors and keep provider details out of user-facing errors. CORS is not caller authentication. |
| Next | **Image URL caching has no expiry handling.** `cloud.js:113–127` requests eight-hour URLs but caches only the string and never renews a cached path. A nearby comment says one hour. | Store expiry metadata, renew before expiry, invalidate on account changes, and use sensitivity-appropriate durations. |
| Next | **Large-bank loading needs pagination.** The question load orders and fetches the whole bank without explicit pagination. | Test above the configured API row limit and paginate deterministically. Preserve the existing chunking of progress lookups. |
| Next | **Growth is concentrated in large page scripts.** The authoring page is about 168 KB and embeds generated-page templates; the study page is about 74 KB. | Extract domain logic, rendering and adapters incrementally. Remove obsolete flows only after checking usage and preserving export/import needs. |
| Next | **Dependencies and deployment are not reproducible.** Most pages pin Supabase JS `2.45.4` through a CDN; legacy `study.html` uses a floating `@2`. No package manifest, lockfile, CI, README or deployment configuration is present. | Pin and bundle dependencies consistently, add a reproducible build and checks, then evaluate an upgrade. The registry reported `2.116.0` during this audit; a version gap alone is not a vulnerability finding. |
| Later | **Legacy study behavior diverges.** `study.html` creates a separate client with default session storage; `cloud.js` uses `flashcard_portal_session`. It also has a separate study implementation. | Confirm whether that route is still used. Consolidate session handling and retire or redirect duplicate routes deliberately. |
| Later | **Polling has a scaling cost.** The study page writes presence every 30 seconds while visible; the developer view polls every 20 seconds. | Keep this only where useful. At 100 continuously active study sessions, presence alone would be about 12,000 writes/hour. Measure need and consider authorized ephemeral presence before scaling it. |

Current Supabase guidance distinguishes user JWTs from publishable keys and documents compatibility behavior at the gateway. Do not assume a `verify_jwt` switch, an allowed origin, or a bearer-shaped string proves a signed-in developer. Use explicit user verification and permission enforcement in the handler. [Function authentication](https://supabase.com/docs/guides/functions/auth), [authorization headers](https://supabase.com/docs/guides/functions/auth-headers)

The live homepage response did not include CSP, HSTS, frame restrictions, Referrer-Policy or Permissions-Policy headers. HTTPS itself was working. This is a defense-in-depth improvement opportunity, not evidence of compromise. As inline scripts and handlers are extracted, introduce a tested CSP and a hosting layer that can set the required response headers. Do not enable broad HSTS subdomain coverage until all affected subdomains are ready.

Useful source references: [AI helper](https://github.com/Almighty1564/Flashcard-testing/blob/5229a688452762b3c28db91ac456afbcd0f824ab/ai-distractors.js#L23), [Edge handler](https://github.com/Almighty1564/Flashcard-testing/blob/5229a688452762b3c28db91ac456afbcd0f824ab/index.ts#L149), [save behavior](https://github.com/Almighty1564/Flashcard-testing/blob/5229a688452762b3c28db91ac456afbcd0f824ab/cloud.js#L338), [image cache](https://github.com/Almighty1564/Flashcard-testing/blob/5229a688452762b3c28db91ac456afbcd0f824ab/cloud.js#L112).

## 4. Visual research: six useful references

These references were selected from public project descriptions, case studies and indexed visual material. Their complete interactions were not manually tested in a browser during this audit. The design lessons below are my interpretation, not claims that the prototype reproduces their technology.

| Reference | What makes it compelling | What fits Tomato08 |
|---|---|---|
| [Of The Oak — Lusion](https://lusion.co/projects/of_the_oak/) | An intricate natural structure becomes an explorable digital subject. The studio describes a custom compressed geometry pipeline and instancing. | Use depth to reveal relationships and detail. Establish a performance budget before selecting the visual technique. |
| [Active Theory — XR experiments](https://xr.activetheory.net/) | Material, light, and physical interaction give digital objects presence. The experiments discuss practical rendering constraints. | One memorable focal artwork or interaction can establish identity. Keep routine navigation direct. |
| [Bruno Simon — portfolio](https://bruno-simon.com/) | The visitor drives through a world, making exploration part of the work being demonstrated. | An optional public playground could be memorable. Everyday tasks still need immediate, conventional access. |
| [Resn — portfolio](https://resn.co.nz/work) | The studio’s projects and documented portfolio designs use expressive interactions and an unmistakable personality. | Add a small number of discoverable moments of surprise; preserve clear links and an accessible navigation path. |
| [Linear — interface refresh](https://linear.app/now/behind-the-latest-design-refresh) | Consistent locations for navigation/actions and lower visual emphasis on supporting controls keep complex work understandable. | Use a stable shell, predictable commands and a restrained private-workspace hierarchy as modules grow. |
| [The Ocean Agency](https://www.theoceanagency.org/) | Strong subject imagery supports an editorial story and a clear mission. | Make public project pages feel like considered stories, with generous composition and selective imagery. |

No reference-site artwork or proprietary code was copied into the prototype. The titanium/cobalt/vermilion canopy was generated specifically for this design. Its prompt and provenance are in `assets/artwork-notes.md`.

### Three original directions

| Direction | Composition and interaction | Strength | Tradeoff |
|---|---|---|---|
| **01 / Atelier — recommended** | Ink surfaces, expressive architectural artwork, serif display type, precise navigation and restrained vermilion accents. A public gallery and a calmer working area share one identity. | Distinctive enough to feel personal; practical enough for daily study, notes and projects. | Requires careful typography, image delivery and contrast to keep the dark interface readable. |
| **02 / Living Index** | A bright editorial system with large sans-serif headings, strong rules, compact indexing and a yellow learning feature. | Fast, legible, and easy to extend into a large catalog of tools. | Less immersive; originality depends heavily on content and typographic execution. |
| **03 / Spatial Gallery** | Tools arranged as connected rooms for learning, making, thinking and everyday life. Optional dimensional exploration belongs in the public experience. | Most memorable and exploratory. | Highest implementation and accessibility cost if developed into real-time 3D. The prototype demonstrates spatial navigation, not a completed 3D scene. |

The recommendation is Atelier because the project must serve both expressive public presentation and repeated private tasks. Use the public entrance for atmosphere and identity. Inside the workspace, prioritize what to do next, what needs attention, and whether data is saved.

## 5. Product structure and boundaries

Provisional assumptions: one owner, a small invited audience, the existing study audience preserved, low initial usage, and a preference for modest recurring costs. Your answers about audience, budget and first capabilities can change the release order.

**Public:** a curated introduction, selected projects, published writing and a catalog of public tools. Publish explicit public records or projections; do not expose private records and merely hide fields in the interface.

**Private:** an overview, learning, projects, notes and later documents/everyday records. A clear module registry defines routes, navigation, capabilities and data adapters. Navigation visibility is a usability feature; backend permissions enforce actual access.

**Administrative:** learner/module management, authoring and operational settings. Existing tester/developer roles remain study-domain permissions. A study developer must not automatically become the owner of someone else’s household workspace.

For personal use, first make **Learning + Projects/Notes** excellent. Start household information with explicit manual entries. Calendar, file and bill-provider connections follow once authorization, recovery and sync behavior are established. Avoid a homepage filled with fake connected-account statuses or charts that have no trustworthy data behind them.

## 6. Recommended technical foundation

The [architecture diagram](architecture.svg) shows a **proposed target**, not infrastructure already provisioned. Keep the current public deployment until the replacement is tested and its release is approved.

| Layer | Recommendation | Why and what changes later |
|---|---|---|
| Frontend | Preserve working routes while extracting TypeScript modules. A lightweight bundled component app, such as React + Vite, is a reasonable next foundation; make the final selection after the first module boundaries are known. | Shared shell, typed contracts, lazy feature loading and tests address the current page-script duplication. This prototype remains plain HTML/CSS/JS to make the design independently reviewable. |
| Public delivery | Static public pages/assets through a managed CDN; retain GitHub Pages initially. Evaluate Cloudflare static hosting with Workers when private API/header needs justify a move. | No always-on application server is required for the current public content. Keep redirects and existing links working. |
| Private API | Same-origin `/api` routes for account-sensitive operations, using a managed edge/backend runtime and a validated user identity. Reuse Supabase Edge Functions for suitable existing workloads. | Keep integration tokens, privileged calls, rate limits and audit events on the server. Define one owner for each endpoint instead of spreading business rules across two runtimes. |
| Authentication | Retain Supabase Auth. Add recovery using verified real contact information and MFA for the owner/admin before sensitive modules. | Current synthetic `.invalid` email mapping complicates normal email recovery. Plan a deliberate account migration. |
| Session boundary | Preserve the current study session during incremental migration. For the sensitive workspace, evaluate a backend-for-frontend flow with server-held tokens and secure, HttpOnly, host-scoped session cookies. | Cookie flows need explicit CSRF protection and correct SameSite behavior. HttpOnly does not remove the need to prevent XSS. Avoid building a new identity provider. |
| Database | Keep managed Supabase Postgres. Add migration-managed tables and explicit workspace membership/ownership rules. | Relational data, indexes, transactions and standard exports support the likely early requirements without multiple databases. |
| Authorization | RLS for every client-accessible table, storage policies, server checks for privileged actions, and explicit role tests. | Test owner, member, tester, developer and stranger access, including direct API calls and RPCs. Audit security-definer functions and role changes. |
| Files | Private object buckets, metadata in Postgres, limited signed downloads, file validation and isolated safe previews. | Large content belongs in object storage rather than JSON rows or source control. File backups are a separate concern. |
| Search | Start with indexed database queries/full-text search and user/workspace filtering. | Introduce a dedicated search system only when measured requirements exceed this. A search index must preserve authorization and deletion behavior. |
| Communication | HTTPS JSON APIs for normal operations. Use authenticated realtime channels only where current interaction needs them. | No persistent WebSocket connection is needed simply to render a dashboard. Keep retry and stale-state behavior visible. |
| Jobs and integrations | Server-side jobs with idempotency, bounded retries, schedules, execution records and an off switch. Verify inbound webhook signatures and deduplicate events. | A managed queue becomes useful when sync workloads need durable retries or concurrency limits. |
| Observability | Structured logs with request IDs, sanitized errors, uptime checks, failed-job alerts and actionable client error reporting. | Never put tokens, document content, sensitive query values or full provider responses into logs by default. |
| Delivery | Pull requests, reproducible builds, automated checks, a preview/staging environment and controlled production releases. | Database changes must be backward-compatible during rollout; production data stays out of previews. |

RLS must be enabled and policies must reflect the actual user/workspace model. Index the columns used for ownership checks and frequent queries. The frontend’s `.eq('user_id', ...)` filter is helpful for querying, but it is not the security boundary. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)

### Data model: add only what the first release needs

Retain the existing learning entities: profiles, modules, question groups/questions, card progress, test sessions and reports. Their complete definitions, grants, constraints and RPC behavior need to be retrieved before changing them.

For the personal workspace, introduce `workspaces` and `workspace_members` only when the confirmed audience requires membership. Then add domain tables for projects/tasks and notes. Carry an owner/workspace key through private queries and policies. Add document metadata when file handling is implemented, and connection/job records when real integrations are introduced.

Prefer explicit domain tables and versioned payload schemas to a single unrestricted “everything” JSON table. Use integer minor currency units for production money amounts, UTC timestamps for events, local calendar dates plus timezone where due dates require them, and stable identifiers. Review events should be append-only when history matters; current progress can be a derived or transactionally updated state.

Keep third-party refresh tokens in an encrypted server-side secret store with narrowly scoped access. Do not include them in browser persistence, client-readable rows, exports, previews or logs. Disconnect must revoke provider access where supported and remove stored credentials.

### Networking and IP routing

The normal path is **device → DNS → HTTPS/CDN → public assets or authenticated API → Supabase/provider APIs**. Use conventional DNS, managed TLS, origin allowlists and least-privilege service connections. Serve private API responses with `Cache-Control: no-store`; cache public versioned assets aggressively.

Prefer a separate private origin such as `app.tomato08.com` when introducing sensitive records. Use host-scoped sessions and avoid sharing authentication cookies across unrelated public tools. Where server database access is necessary, use a connection pool or the managed HTTPS data API; never expose a database connection string in browser code. No home-router port forwarding, self-managed BGP, public database port, or fixed IP is required by the current use case. Add network complexity only for a concrete provider or compliance requirement.

## 7. Costs, reliability and scaling

Estimates are in USD, checked September 10, 2026, and are planning allowances rather than a quote. They exclude domain renewal already associated with your website, taxes, paid AI usage and paid account/data-provider integrations. The current Supabase subscription and usage are unknown.

| Stage | Planning allowance | Conditions |
|---|---:|---|
| Local design prototype | $0 additional recurring infrastructure | No cloud resources or account connections created |
| Small noncritical pilot | Approximately $0–$10/month incremental hosting | Existing Pages/static delivery and appropriate free service tiers; backup/export operations still need attention |
| Dependable small private platform | Approximately $30–$60/month before AI/integrations | Illustratively: Supabase Pro from $25, optional Workers paid base $5, plus room for email/monitoring or separate staging |
| Growing audience / heavier data | Re-estimate from measured usage | Database compute, egress, stored files, realtime messages, jobs and AI may dominate; do not equate advertised MAU quotas with application capacity |

Supabase Free currently lists 500 MB database storage, 1 GB file storage, and inactivity pausing; automatic database backups are not included. Pro starts at $25/month with a compute credit covering one Micro instance and daily backups with seven-day retention. Additional projects and add-ons can increase the bill. [Supabase pricing](https://supabase.com/pricing)

Cloudflare’s Workers paid plan starts at $5/month, with usage-based request/CPU charges above included allowances; static-asset requests are documented as free. Configure limits and alerts before enabling variable-cost work. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

Recommended initial recovery objectives for important personal records: **RPO ≤24 hours, RTO ≤4 hours**, subject to budget and a successful restore drill. These are proposed objectives, not guarantees of a provider plan. Supabase database backups do not include stored file objects. Back up private files and configuration separately, keep protected off-site exports, and test restoring both database and files into a separate environment. [Supabase backups](https://supabase.com/docs/guides/platform/backups)

Scale in response to evidence: slow-query measurements, sustained API latency, database connection saturation, storage growth, large-bank truncation, job backlog, or repeated provider rate limits. Optimize queries/indexes and remove wasteful polling first; adjust managed compute next. Introduce dedicated queues, caching or search when measurements justify them. Microservices and Kubernetes are not necessary starting points for this platform.

## 8. Security and privacy release gates

Before real household documents or connections enter the system:

- Reproduce the database from versioned definitions; test RLS, grants, RPCs and bucket permissions with distinct identities.
- Verify server-side caller identity and role, including direct calls outside the UI. Protect expensive AI endpoints with quotas and timeouts.
- Implement real account recovery, secure admin access, session expiry/revocation and CSRF defenses appropriate to the chosen session flow.
- Keep private search results, exports, previews, logs and backups inside the same access boundaries as the underlying records.
- Validate file types and sizes, render untrusted content safely, and treat uploaded HTML/SVG or documents as untrusted content.
- Define per-category retention, user exports, deletion and disconnect behavior. Explain how backups expire and how revoked connections are handled.
- Make saving, offline status, stale results and failed synchronization visible. Test interrupted requests and conflicting edits.
- Complete a restore drill and document rollback before the first production migration.

Use supported APIs and OAuth for future services. Start with read-only scopes or manual imports. Financial execution, payments, account modifications and public publishing are separate explicit user actions. An interface toggle must never silently widen the scope of an account connection.

## 9. Web app now; installed app when useful

A PWA is a reasonable later step for an installable shell, reliable launch experience and selected offline workflows. Cache public assets first. For private information, define what may remain on the device, how sign-out clears it, and how stale/offline changes reconcile before caching sensitive responses. Separate a visible offline draft from a server-confirmed save.

Installability and device capabilities differ by browser and platform; verify the exact target devices before promising background sync, push or file access. Use the web app as the shared product foundation. A native wrapper becomes worthwhile when a demonstrated requirement—system-wide shortcuts, deep file integration, a share extension, device hardware or app distribution—cannot be served well by the web experience. [MDN: Progressive web apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)

## 10. Release sequence and acceptance criteria

| Milestone | Concrete result | Completion evidence |
|---|---|---|
| **0 — Direction and baseline: delivered here** | Current-source assessment, three design directions, original artwork, architecture and working sample-data prototype | Matching source hashes, live read-only HTTP evidence, local bug reproductions, prototype model tests and syntax/link checks. Real-browser/device UX testing remains outstanding. |
| **1 — Trustworthy foundation: recommended next** | Repository setup, documented deployment, versioned schema/policies, verified AI identity/role checks and reliable study saves | Signed-out/expired/unauthorized calls rejected before provider calls; failed saves visible and retryable; two-user access tests; restore drill; current study workflows still pass. |
| **2 — First product release** | Approved design shell plus Learning and one chosen private module, provisionally Projects/Notes; curated public entry | Keyboard and touch task flows, existing data migrated without loss, public/private access tests, production preview and rollback plan. |
| **3 — Personal records** | Private documents and manual household records; clear exports, deletion and recovery | File/policy tests, unsafe-content handling, independent file backup, account recovery/MFA and privacy review. |
| **4 — Connected services** | One read-only integration at a time, with sync state, error handling, disconnect and job history | Least-privilege scopes, encrypted token handling, webhook/retry/idempotency tests, revocation and stale-data tests. |
| **5 — Installed/offline experience** | PWA and specific offline workflows; native only for demonstrated device needs | Install/upgrade tests on agreed devices, cache/sign-out tests, conflict resolution and battery/performance measurements. |

**First-release performance targets:** LCP ≤2.5 s, INP ≤200 ms and CLS ≤0.1 at the 75th percentile on an agreed mobile profile; define test conditions and collect field measurements after release. Keep the initial private working-route JavaScript near or below 150 KB compressed before feature chunks. Use a ≤400 KB optimized hero delivery target, fixed image dimensions and lazy loading. Do not run decorative rendering when idle or offscreen. These are proposed budgets, not measurements achieved by this prototype. The original prototype PNG is about 1.92 MB and should be served in optimized responsive formats for production. [Web Vitals](https://web.dev/articles/vitals)

**Accessibility targets:** WCAG 2.2 AA for the shipped experience; full keyboard flow, visible focus, labeled controls, meaningful error states, 200% zoom/reflow, touch-friendly actions, reduced-motion support and no task requiring 3D navigation. Validate contrast, a screen-reader path and actual iPhone/iPad use. Passing a model test is not equivalent to these checks. [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

For budgets or priorities that differ from the assumptions, narrow the number of initial modules before weakening permissions, recovery or save reliability.

## 11. What is implemented in the prototype

Open `index.html`, or use the local preview shown in the app. It includes:

- A responsive overview, a generated artwork and restrained pointer-driven movement with reduced-motion support.
- Three selectable design directions and a linked reference shelf.
- Search across pages, projects and notes, including a keyboard command dialog.
- A six-card example study session with reveal, self-rating and a summary.
- Project creation, task creation/completion, and note creation/editing.
- Manual example bill entry and a computed recurring monthly equivalent.
- A public collection using fixed example content, separate from rendered private notes and bills.
- Optional device-local persistence, JSON export and a scoped reset action.

All initial records are clearly marked samples. Changes are held in memory until you opt into device storage. The prototype has no auth screen pretending to secure data and no inactive “Connect” buttons pretending to complete integrations. The connection cards explain the intended scope. It makes no background service requests; external references open only when chosen.

This is a design artifact, not an authenticated private application. The existing repository and production services were not modified, and no paid resources were provisioned. The asset’s own visual check, source checks, model checks and read-only HTTP verification do not substitute for a complete browser, accessibility, security or load test.

## 12. Decisions and access needed next

The three questions already presented remain the useful decision points: the primary audience, the monthly operating budget, and the two first capabilities. My provisional choice is a private personal workspace with a public front, preserving the study audience, and Learning plus Projects/Notes first.

Before the production foundation can be implemented and verified, obtain an authenticated **read-only** view or exports of the Supabase schema, grants, RLS policies, RPC definitions, bucket policies and deployed Edge function/configuration. Exclude user rows and secrets. A dashboard URL identifies the project; it does not itself grant administrative access. Repository write access should be established through a normal connection when an implementation branch is needed—do not paste credentials into chat.

Approve or adjust the proposed first milestone after exploring the prototype. Public deployment, paid services, destructive changes and consequential account actions remain approval steps. Routine local implementation choices within the selected milestone can proceed independently.
