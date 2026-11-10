# Full Stack Demo — full-stack Replay workspace

A local-first demo for exploring paired browser and backend recordings. The application backend runs in **Cloudflare workerd**, through Wrangler: D1 stores pairs, questions, evidence and transcripts; R2 caches artifacts; Workflows run investigations; a Durable Object manages Replay debugger sessions.

## Run locally

```sh
npm install
npm start
```

Open **http://127.0.0.1:8791**. `npm start` builds the UI, applies local D1 migrations, and starts workerd. It selects an available Node 22+ runtime when macOS has multiple Node installations. Otherwise install Node 22.13+ and retry. No Cloudflare account or credentials are needed for samples. Port 8791 intentionally avoids another local service using the usual 8787.

Click **Load sample recordings** to add two illustrative pairs. The checkout example follows a disappearing discount; the search example follows an out-of-order response. Sample screens, values, and investigation transcripts are clearly labelled fixtures. They are not real captured recordings or model-generated answers.

`npm run dev` starts the same workerd backend plus Vite with UI hot reload at **http://127.0.0.1:5179**. The backend remains on 8791. Stop the servers with Ctrl+C. Do not run `npm start` and `npm run dev` concurrently.

Local state persists in `.wrangler/state/` across reloads and server restarts. No browser localStorage is used for application records.

## Use the app

1. Open a pair from the recording table.
2. Scrub or play the screenshot timeline; the timestamp is the current question context.
3. Ask a question. A persisted Workflow runs independently of the browser tab.
4. Select a saved question to see its answer, agent activity, and annotated timeline.
5. Click a marker or evidence row to inspect source, stack frames, and expandable variables.
6. Change stack frames to inspect their scopes. Share/copy the browser URL to return to that question and point.
7. Stop an active investigation or run it again to create a new timeline revision.

Every point is identified by recording ID plus an opaque execution-point string. Request connections and clock uncertainty are separate from point identity. Unknown backend alignment never moves the screenshot cursor or puts a falsely precise point on the shared timeline.

## Add real recordings later

Use **Add recording pair**, supplying a frontend and backend Replay UUID. Optional advanced fields accept a manual clock offset and correlation-edge JSON. Pair records are editable data, not hardcoded frontend routes.

Copy `.env.example` to `.dev.vars` and supply server-side values:

```text
REPLAY_API_KEY=...
ANTHROPIC_API_KEY=...
MODEL_ID=claude-sonnet-4-6
```

Restart workerd, open the recording group. Its recordings prepare automatically behind a progress screen. Connection settings show which credentials are configured without exposing their values. The current model adapter uses Anthropic's Messages API; changing providers requires another adapter, not just a model-name change.

Replay MCP supplies investigation tools. The native Replay protocol supplies paint points, screenshots, recorded sources, stacks, scopes, object previews, and verified point timestamps. MCP shorthand point aliases must resolve through GetPointLink before publication; unresolved references are rejected. A marker's timestamp is derived from debugger evidence, not trusted from the model.

No real recording IDs or credentials were supplied during this implementation. Consequently, the live adapter is implemented against the published protocol/types and mock contract tests, **not verified end-to-end against Replay or a model provider**. Backend runtime compatibility and point-alias resolution remain the first live-data checks. The public Replay Node runtime is an older alpha; the application does not claim to record arbitrary modern Node or Workers execution itself.

### Stitching and capture contract

Manual correlation edges use:

```json
[
  {
    "id": "checkout-request-1",
    "frontendPoint": { "recordingId": "<frontend UUID>", "executionPoint": "<exact point>" },
    "backendPoint": { "recordingId": "<backend UUID>", "executionPoint": "<exact point>" },
    "label": "POST /api/checkout",
    "method": "manual",
    "lower": 280,
    "upper": 320
  }
]
```

Bounds are backend-to-frontend offset bounds in milliseconds. Supplying an offset establishes a manual display-time mapping; edge bounds alone do not silently manufacture an exact clock offset.

Automatic matching uses Replay MCP `NetworkRequest` evidence and executed backend handler code. A source-discovery pass uses `ListSources`, `SearchSources`, and `ReadSource` to select handler locations and existing request/body bindings. Only validated identifiers are accepted; the app generates read-only `Logpoint` expressions and paginates their hits. No recorder modifications or application-specific annotation format are required.

A deterministic matcher compares HTTP method, path/query, and canonical JSON payload fingerprints (or explicit request/full trace-span IDs). Payload values are hashed before evidence is persisted. Request identities must be unique across **all** browsers and observed backend handlers. Duplicate/retried requests remain ambiguous. At least two independent matches are required for each browser.

Where a constant clock offset satisfies every matched request's send/receive interval, that offset and its uncertainty are stored. Where recording clocks do not progress at the same rate, compatible ordered matches define an **event-aligned** monotone display mapping. Times between these matches are interpolated; times outside the matched range are extrapolated and labeled estimated. This mapping is for replay navigation, not a claim of measured cross-runtime latency. Incompatible ordering is rejected. The UI links the evidence artifact containing request fingerprints, actual execution points, source locations, matches, clock anchors, and diagnostics.

The same mapping is applied to screenshots, playback, saved investigation points, and question context. Updating preparation rebases saved display times atomically while preserving recording-local times and exact execution points. Imported manual offsets are not treated as independently verified evidence by automatic preparation.

## Verification

```sh
npm run check           # TypeScript
npm test                # Point identity, clock alignment, matching, values, MCP transport
npm run build           # Production frontend bundle
npm run test:integration # With workerd running; creates labelled local test questions
```

The integration test exercises real local D1/Workflows, two-pair isolation, question idempotency, event cursors, exact-point inspection, cancellation, and cross-origin write rejection. Browser verification covers question submission, marker selection, source/stack/value display, changing frames, and reload/deep-link persistence. Samples do not count as proof of live Replay compatibility.

## Repository map

- `apps/web/`: responsive React workspace and debugger UI.
- `apps/worker/`: authenticated API, SQL persistence, Workflows, Replay session Durable Object.
- `packages/domain/`: validated contracts, stitching logic, explicitly labelled sample data.
- `packages/replay/`: Streamable HTTP MCP client and protocol value normalization.
- `migrations/`: immutable local/production D1 migrations.
- `scripts/`: local startup and integration smoke test.
- `tests/`: unit and transport contract coverage.
- `docs/implementation-plan.md`: research and original design.

## Operational boundaries

The inspector exposes inspectable variables from recorded scopes and lazily expands object previews. Getters are not invoked automatically. Missing/optimized-out values and unavailable source/runtime features are not fabricated. Ephemeral object handles expire with pauses; reselect the point to reopen an expired inspection. Whole-heap materialization and arbitrary deeply nested object expansion are not promised.

Live runs allow 100 evidence-tool calls plus a reserved final publication. They begin final synthesis after 125k new input/output tokens (including cache writes, excluding reused cache reads), 100 tool calls, or 19 minutes, reserving the concluding model call instead of discarding its answer. Model context includes recording identities and clock metadata, not screenshot indexes or preparation telemetry. Prompt caching reuses stable prefixes; per-turn usage records new input, cache writes, cache reads, and output separately. Tool results are persisted with deterministic logical IDs; large results are stored in private R2 and linked in the transcript. External calls can be charged twice after an uncertain failure; this is not exactly-once billing. Output is public assistant progress/tool activity, never hidden model reasoning.

The UI uses durable event polling rather than token streaming. Backend annotation compatibility, real-recording cold-load latency, and screenshot indexing on very long recordings remain unmeasured. The current index is designed for bounded demos; it does not virtualize millions of events. Session lifetime is bounded and reconnected on demand.

The deployed site uses `PUBLIC_DEMO="true"`: visitors open the shared demo workspace without signing in. `/login` redirects to the app. To require authentication in another deployment, remove that flag.

Production can optionally use a shared demo login: set `APP_PASSWORD` with `wrangler secret put APP_PASSWORD`; the sign-in page accepts that password and establishes a secure 12-hour session. Everyone using that login shares the same workspace. All document, asset, and API requests require authentication. Local loopback development remains credential-free. Cloudflare Access (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`) is optional and takes precedence when configured, providing separate per-user workspaces.

Deploy with Node 22.13+: enable R2 in the account, provision the configured bucket and D1 database, apply `wrangler d1 migrations apply DB --remote`, and run `npm run deploy`. The configured D1 UUID belongs to the initial deployment account; replace it when deploying elsewhere. Set Replay and Anthropic secrets only when enabling real recordings. Do not expose the local development server to the network.

## Multiple browser recordings

Recording groups accept up to 12 named browser recordings and one backend. The import form accepts Replay URLs or UUIDs. Each browser has independent screenshot, duration, and optional start-offset metadata. Preview panels and timestamp-positioned screenshot lanes share one cursor; selecting a browser sets question context while investigations retain access to every recording in the group. Screenshot caches and point validation include the recording ID, so equal timestamps across browsers cannot collide. Existing single-browser records remain supported.

The deployed `maya-leo-workerd` group contains the user-supplied Maya Chen and Leo Park browser recordings and workerd backend. Migration 0003 adds this group with 16 real captured frames per browser, hosted as static assets. Its view uses recording-relative elapsed times because no shared clock anchors were supplied or verified; it does not claim the sessions started simultaneously. Preparing public recordings indexes their complete paint streams without a Replay key. Public recording preparation and debugger calls do not require a Replay key. Agent investigations require an Anthropic credential. Public-demo deployments always use anonymous Replay access, even if a Replay key is configured; private deployments can optionally authenticate for private recordings. The connected Replay tool was used to manually import this group's initial screenshot data.


## Automatic loading and progress

Opening an unprepared live group starts an idempotent preparation Workflow. The workspace stays hidden until all recordings are ready, screenshot indexes and backend capabilities have loaded, correlations have been processed, and saved questions have been fetched. Imported preview frames do not bypass this gate. Completed indexes are reused. A failed load displays the error and a retry action instead of partial content.

The backend polls Replay MCP `WarmRecording` with `waitSeconds: 0` for each recording and persists the returned phase, region counts, and scan percentage in D1. The UI polls that state every two seconds. Percentage bars describe the backend's region scan only; phases without a backend percentage use an indeterminate bar. Indexing and request-matching stages are reported separately rather than converted into fake percentages.

Research: the connected Replay server's WarmRecording tool schema and live responses (including starting/processing/ready and region scan counts), plus the installed `@replayio/protocol` Recording.processRecordingProgress and Session.processingProgress declarations. Native processing percentages refer to their specific processing operations; WarmRecording also describes analysis readiness, so it is the readiness source for this app. See https://static.replay.io/protocol/ and https://docs.replay.io/basics/replay-mcp/overview.

Relevant points are saved to a draft timeline immediately by `inspectPoint`, visible during investigation, and retained when the final answer is published.
