# Local verification

Verified on November 6, 2026 with Wrangler 4.158.0 and local workerd.

- TypeScript passes.
- `npm start` was exercised from the default shell, including Node runtime selection, build, idempotent migrations, workerd startup, and persistent state after a server restart.
- Production Vite build passes.
- 15 unit/contract tests pass; the suite covers opaque points, wrong-recording references, screenshot selection, clock bounds/conflicts, debugger special values, frame switching, MCP initialize/session/SSE behavior, and ambiguous request matching.
- Local HTTP smoke test passes using real workerd bindings: two recording pairs, persistent questions, duplicate submission deduplication, Workflow completion, event cursor resumption, cancellation, and rejected cross-origin writes.
- Browser exercised the checkout recording, question submission, completed transcript, backend marker, pricing source, 96-dollar discounted value, caller-frame switch, and restoration of the selected question/point after reload.

Live Replay and model calls are unverified because the requested local build has no real recordings or credentials. Sample playback is explicit in the UI and persisted events. The initial local verification did not provision cloud resources.


## Cloud deployment — November 6, 2026

Deployed to https://threadline-replay.bhackett.workers.dev with D1, R2, two Workflows, and the ReplaySession Durable Object. Applied both production database migrations. Shared demo password is stored as the APP_PASSWORD Worker secret and in the ignored, owner-readable `.env.deploy-password` file; it is never printed in deployment output. Username is `demo`. Cloudflare Access is now optional.

TypeScript, the production build, and all 17 unit/contract tests pass. The authenticated smoke test against the production URL passes: unauthenticated and incorrect-password requests to the page, API, and static assets return 401; authenticated HTML loads; sample pairs persist; duplicate questions deduplicate; the investigation Workflow completes with timeline and events; exact-point inspection returns expected values; wrong-pair points and cross-origin writes are rejected; cancellation and event resumption work. Sample verification questions remain clearly labelled in the deployed workspace.

Real Replay recordings and Anthropic calls still require credentials and live-data validation.

## Browser sign-in fix — November 6, 2026

Replaced HTTP Basic authentication after the in-app browser reported ERR_INVALID_AUTH_CREDENTIALS. `/login` now serves a normal HTML password form and issues a signed 12-hour HttpOnly/Secure session cookie. No username is required and the existing password is unchanged. Missing document sessions redirect to the login page; API requests return 401 without a WWW-Authenticate challenge. Cross-origin login is rejected.

All 19 unit/contract tests and TypeScript pass. The deployed sign-in page was visibly verified in the in-app browser. Production HTTP checks verify wrong-password and cross-origin rejection, successful form submission, cookie-authenticated page/API access, and the complete sample investigation smoke test. Deployment version: 3509980f-c837-4102-b7d6-c0cef40f7d1f.

## Public demo access — November 6, 2026

At the user's request, deployed PUBLIC_DEMO=true to remove sign-in. The existing shared-demo workspace and sample questions remain available. Verified without credentials: HTML, favicon, status API, and pair list return 200; /login redirects to /. The in-app browser loads both recording pairs without a session. TypeScript passes. Version: def115b9-369c-41be-8648-7d4d4f21e939.

## Multi-browser groups — November 6, 2026

Deployed version 276cc415-e822-4150-b73c-8355e61d3a62. Migration 0003 inserts `maya-leo-workerd` in the public shared workspace. Verified all three supplied recording IDs through Replay RecordingOverview. Imported 16 representative real frames from each browser (32 total), with exact recording IDs, local timestamps, and paint points. Screenshots are hosted with the app; browser offsets remain explicitly unknown, so display is recording-relative rather than a fabricated common wall clock.

TypeScript, build, and all 23 tests pass, including multi-browser membership, equal-timestamp screenshot isolation, independent offsets, and legacy imports. Existing production smoke test passes. `node scripts/smoke-multi.mjs` verifies the named group, both browser screenshot endpoints, backend identity, wrong-browser rejection, and duplicate browser validation. Fixed immutable asset-response headers discovered by that check.

Browser verification: both previews and separately named filmstrips load; selecting Leo's 3530ms frame moves the shared cursor and shows Maya's preceding 3380ms frame, selects Leo as question context, and leaves recording identities intact. Import UI supports additional named browser entries. Live agent investigation and arbitrary debugger queries still require server-side Replay and model credentials.

## Public Replay access — November 7, 2026

Removed the incorrect blanket Replay API-key requirement. Verified anonymous Recording.createSession over the native WebSocket protocol and anonymous RecordingOverview through the actual ReplayMCP client. Public-demo mode never sends a configured Replay credential; private deployments may optionally use one. Preparation has no key gate, and agent runs require only the model credential. Updated connection settings accordingly.

TypeScript, build, and 24 tests pass, including absence of Authorization on MCP initialization, notifications, listing, and cleanup. Deployed f9a393fb-6cb5-419a-b998-1e798327721e. Production status reports public Replay access enabled and authenticated access disabled. A production debugger probe reached Replay without credentials; the selected paint point had no JavaScript frame, so that probe is not evidence of successful frame inspection.

## Automatic preparation and backend progress — November 7, 2026

Deployed 7896acb2-9000-456b-a4da-de886981cb2b. Removed the Prepare recording control. Viewing an unprepared live group automatically claims one preparation Workflow; concurrent starts are guarded by a D1 update. The loading view hides previews, timeline, questions, and inspection until readiness version 2 is saved and questions have loaded. Failures remain on the loading screen with Retry loading.

Researched the actual WarmRecording discovery schema and backend responses plus Recording.processRecordingProgress and Session.processingProgress in the installed Replay protocol. WarmRecording provides broader analysis readiness, phase, region counts, and scan percentage. The Workflow polls it, persists each per-recording response, and reports indexing, initial-preview caching, and request matching as separate stages. The UI displays backend percentages only for scan progress, never a fabricated overall percentage.

Live verification exercised the failure screen, retry, backend progress, indexing, and automatic transition to the workspace. Actual region counts: Maya 10/10, Leo 9/9, workerd 65/65. All 258 screenshot points were indexed, replacing the initial 32-frame import. Both initial preview images were verified decoded in the browser. The screenshot smoke test passes for both recordings. TypeScript/build and all 28 tests pass; tests cover ready gating, unknown progress, and the Cloudflare fetch binding.

Real testing found and fixed two pre-existing live-path issues: the MCP client must bind global fetch in Workers; native Graphics.getPaintContents returned Internal error for these recordings. Screenshot retrieval now uses Replay MCP Screenshot, verifies the exact paint point and expected Replay asset origin, and caches the resulting image in R2. Initial browser previews are cached before readiness is published. Completed preparations are reused on subsequent visits.


## Investigation budget regression (2026-11-07)

Removed screenshot indexes/preparation state from model context, cached the system and conversation prefixes, and bounded model-facing tool excerpts. Budgets now count newly submitted input/output (including cache writes), with cache reads reported separately. A reserved synthesis call replaces the old post-response exception; invalid final markers can be omitted while retaining the answer.

Typecheck, production build, and all 32 tests pass. Retried the previously failed production question “what were the users doing” as run `7b4529d2-f395-487e-8a2b-fddf3748d9a7`: it completed with a supported narrative for both browsers and the backend. The retry exercised the graceful synthesis path and confirmed actual cache reads in Anthropic usage. Final deployment: `2923e0a9-03a1-44e3-86f1-5edb07f43e5b`.
