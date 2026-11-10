# Full Stack Demo QA review — 2026-11-07

Reviewed 67 initial reports: 60 addressed by deployed changes; 7 inapplicable to the intended product.

## Changes and verification

- Stopped terminal-run polling, removed duplicate mount requests, combined question detail and event pages, and fetched pair/list data in parallel. Refresh on focus or mutations preserves updates without idle polling.
- Lazy-loaded and memoized Markdown. Initial JavaScript decreased from about 494 KB to 328 KB before compression.
- Fixed inspection object authorization to recognize references in scopes, frames, and nested previews. Browser verification: channel object fields expand after changing to the send frame.
- Assigned crowded timeline points separate rows, retained timestamp anchors, spaced thumbnail timestamps, and disabled point navigation when no candidate exists. Verified all five Leo points have non-overlapping bounding boxes; the POST /api/read point opens its inspector.
- Reserved a fixed 660px inspector area for deep-link loading and async data, with independently scrolling panes.
- Darkened text colors, including syntax highlighting and metadata. DOM contrast check across the inspected workspace found no visible text below 4.5:1. Busy submit controls retain names and busy state.
- Added cached JPEG/PNG screenshot resizing and responsive 128/192px thumbnail and 480/960px preview sources. A reported 145,183-byte screenshot became a 5,470-byte 192px thumbnail; the browser now selects 128px thumbnails at 2x display density.
- Added CSP, HSTS, frame protections, nosniff, a description meta tag, and immutable asset caching.
- Hardened cursor validation against repeated/malformed/operator-shaped parameters. The reported NoSQL-injection mechanism was incorrect: this endpoint uses bound SQLite parameters and LIMIT 100. The malformed request now returns HTTP 400 explicitly.
- Typecheck, production build, and all 38 tests passed. Production version dcb0445d-ca6a-4265-a9c3-09544dca96fb.

## Inapplicable reports

Public access was explicitly requested by the owner. The four unauthenticated-access reports describe that intended behavior; owner scoping remains in private mode. Recorded source paths, loopback origins and stack traces are deliberate debugging evidence from public recordings, not Full Stack Demo hosting secrets. JSON artifact responses have application/json content type; the browser-generated JSON viewer document is not application HTML and cannot be assigned an HTML lang attribute by this endpoint.

## Report disposition

| Report | Status | Title |
|---|---|---|
| bug-mw6ycw67-v2m4 | Fixed | Run events endpoint re-polled every 1.5s with a frozen cursor after the run completes — 91 byte-identical refetches returning empty results |
| bug-mw6yaes7-a64a | Fixed | AI composer submit button loses its accessible name while busy — renders as icon-only spinner with empty textContent and no aria-label (WCAG 4.1.2) |
| bug-mw6y9ru5-foqk | Inapplicable | Pair analysis page renders server filesystem paths (file:///home/ubuntu/recordreplay/relay-chat/src/worker/index.ts) to the client |
| bug-mw6y9fw5-0nax | Fixed | Low contrast text affects <SPAN> "0 points" |
| bug-mw6xy406-rsuj | Fixed | Timeline 'Leo Park' lane renders 5 event pill buttons stacked at the same position so only the topmost is clickable |
| bug-mw6xwbv7-9sm6 | Fixed | Timeline timestamp labels fail WCAG AA contrast: filmstrip timestamps rgb(159,167,147) at 8px on the white section.timeline background measure 2.49:1, and the Q5 question-card timestamp rgb(158,170,144) on rgb(238,244,229) measures 2.17:1 |
| bug-mw6xw4qe-92aj | Fixed | Execution inspector's async data fill swaps its 240px loading placeholder for a 608px grid, pushing form.question-composer down 368px |
| bug-mw6xvxau-c44n | Fixed | Question view loads pair → questions → question → run-events through a serialized 4-round-trip data waterfall on every poll cycle |
| bug-mw6xvru7-j5yd | Fixed | NoSQL operator injection in `afterSequence` on /api/runs/{runId}/events bypasses cursor validation and dumps the full run event stream (internal tool outputs) |
| bug-mw6xvh12-b3ig | Fixed | Source-code token "response =" in the Execution inspector's executing line has 4.29:1 contrast (below 4.5:1 AA) — the executing-line highlight background lightens the backdrop under the code text |
| bug-mw6xv8go-23gc | Fixed | Filmstrip thumbnail labels "00:05.26" and "00:05.35" overlap and occlude each other, making both timestamps illegible |
| bug-mw6xupk7-n6l8 | Fixed | Low contrast text affects <DIV> "Investigating across the recording…" (and 1 more element with the same colors) |
| bug-mw6xubxj-9qvf | Fixed | Low contrast text affects <SPAN> "Queued" (and 4 more elements with the same colors) |
| bug-mw6xtyzx-adaf | Fixed | "Q5" question-number label on the selected investigation card fails AA contrast (2.29:1, pale sage on pale green) |
| bug-mw6xtr78-rtye | Fixed | Low contrast text affects "The investigation will add evidence-backed execution points here." (p >> internal:has-tex |
| bug-mw6xtl90-2sce | Fixed | Execution inspector panel (?point= deep link) inserts 312px of content with no reserved space, pushing question composer and investigations down with no user interaction |
| bug-mw6xtelw-q1pb | Inapplicable | Unauthenticated GET /api/questions/:id returns question data with recording context to any caller (missing authorization check) |
| bug-mw6xt65z-xmou | Inapplicable | GET /api/runs/:id/events returns the full run event history with no authentication (missing authorization check) |
| bug-mw6xsol3-3f15 | Fixed | Workspace setState (setWorkspaceLoaded) triggers 203ms main-thread block: 86 of 87 fibers (all 28 lucide Icons) re-render with zero DOM changes |
| bug-mw6xraq7-14fe | Fixed | Modal helper text "Connect one or more browser recordings to their shared backend." fails WCAG AA contrast: 4.27:1 (rgb(110,125,99) on rgb(251,252,248)) in the Add-a-recording-group dialog |
| bug-mw6xr152-c8bw | Fixed | Modal section header "Clock alignment & request correlations" fails WCAG AA contrast (2.86:1, 10px muted-green text on cream modal) |
| bug-mw6xqurd-ybdd | Fixed | Low contrast text affects <SPAN> "CONNECT THE STACK" |
| bug-mw6xq8k0-2ban | Fixed | Low contrast text affects <LABEL> "Recording name" (and 7 more elements with the same colors) |
| bug-mw6xousz-87g8 | Fixed | Selected question endpoint /api/questions/ffed4d6b-babe-4000-8fbc-fb39416bf752 is re-fetched every 1.5s by an unconditional setInterval poll — 150 identical GETs in one recording |
| bug-mw6xojkb-pcw2 | Fixed | Syntax-highlight keyword tokens in Execution Inspector code view fail WCAG AA contrast (3.02:1 lavender on white) |
| bug-mw6xobca-p4jy | Fixed | Low contrast text affects <SPAN> "const" (and 1 more element with the same colors) |
| bug-mw6xo2h0-ycl1 | Inapplicable | Artifact result page renders raw JSON with internal stack trace, internal host 127.0.0.1:18795 and node_modules source paths to the user |
| bug-mw6xnygu-hbnn | Fixed | Low contrast text affects <DIV> "http://127.0.0.1:18795/src/client/api.ts" (and 1 more element with the same colors) |
| bug-mw6xnsri-juw0 | Fixed | Workspace setState re-renders all 12 Markdown instances (react-markdown re-parse), blocking the main thread for 224ms (~13 dropped frames) |
| bug-mw6xn8f0-mt0c | Fixed | Low contrast text affects <SPAN> "'/api'" |
| bug-mw6xmtil-zyr0 | Fixed | Low contrast text affects <SPAN> "'string'" (and 4 more elements with the same colors) |
| bug-mw6xmlg8-0hpt | Fixed | Header runtime label "frontend" has contrast ratio 2.98:1 (rgb(125, 150, 100) on rgb(241, 246, 233)), below the 4.5:1 AA minimum |
| bug-mw6xlzsy-mta7 | Fixed | Elapsed-time label "00:01.60" in the execution inspector panel header fails WCAG AA contrast (2.32:1, pale green on pale green) |
| bug-mw6xlv8i-9vwq | Fixed | Empty-state helper text "Try another search." fails WCAG AA contrast (3.40:1 on white) |
| bug-mw6xle6b-6rxu | Inapplicable | <html> element served with no lang attribute on the artifacts document page (WCAG 3.1.1 Level A failure) |
| bug-mw6xk3cw-bss3 | Fixed | Expanding the 'channel' recorded variable in the execution inspector's VARIABLES pane fails: backend returns HTTP 500 "Object is not part of this inspection" and the error string is rendered instead of the object's fields |
| bug-mw6xeuzk-fh8y | Fixed | Strict-Transport-Security (HSTS) header absent from the document-root response of threadline-replay.bhackett.workers.dev, leaving the first visit open to SSL-strip downgrade |
| bug-mw6xe394-f7o8 | Fixed | "Previous execution point" button is inert at end of recording — click is a silent no-op and the playback cursor never steps back |
| bug-mw6xdrni-gveq | Inapplicable | Unauthenticated GET of /api/pairs/maya-leo-workerd returns full pair record with owner identity (missing authorization check) |
| bug-mw6xdjko-cmys | Fixed | Missing X-Frame-Options and CSP frame-ancestors on threadline-replay.bhackett.workers.dev allows the page to be embedded in any iframe (hardening: clickjacking is the potential risk class) |
| bug-mw6xddzs-yqoc | Fixed | Missing Content-Security-Policy header on threadline-replay.bhackett.workers.dev — page served with no script/style allowlist |
| bug-mw6xd5fl-qxqu | Inapplicable | Unauthenticated GET /api/pairs returns full recording-pair data with no session or authorization check |
| bug-mw6xce9j-6zr9 | Fixed | Missing X-Content-Type-Options: nosniff on document-root response (GET /) of threadline-replay.bhackett.workers.dev |
| bug-mw6xawk1-ps4b | Fixed | Low contrast text affects <DIV> "Relative time · alignment unknown" (and 1 more element with the same colors) |
| bug-mw6xaocl-ek6a | Fixed | Playback bar labels "/ 00:05.72" and "Screenshot playback" are below WCAG AA contrast (4.40:1 and 4.12:1) on the white stage background |
| bug-mw6xah9v-s52c | Fixed | Low contrast text affects <P> "Browse the browser and backend recordings." |
| bug-mw6x9yk7-ou2e | Fixed | Low contrast text affects <STRONG> "workerd backend" |
| bug-mw6x9rpx-nm47 | Fixed | "Not established" time-alignment value in recordings panel fails WCAG AA contrast (3.37:1 on 11px text) |
| bug-mw6x9kcv-2cuu | Fixed | Low contrast text affects <SPAN> "Maya Chen" (and 1 more element with the same colors) |
| bug-mw6x9cja-n4je | Fixed | Sub-AA contrast (3.39:1) on "Relay Chat / 2 browsers Backend" metadata line on the recording detail page |
| bug-mw6x96fh-rnsj | Fixed | Low contrast text affects <SMALL> "66cf5ba6-d6f8-4abf-8275-aad09d56d2f5" (and 1 more element with the same colors) |
| bug-mw6x8zlq-rrtu | Fixed | 20 images are served much larger than the boxes they are displayed in |
| bug-mw6x8sp6-1muj | Fixed | "Frontend Backend" timeline legend renders at 3.08:1 contrast (8px muted sage text on near-white background) in the Replay workspace |
| bug-mw6x8kq9-ud6m | Fixed | Breadcrumb '/' separator in threadline workspace heading is nearly invisible (1.70:1 vs 3:1 WCAG 1.4.11 minimum) |
| bug-mw6x8fn4-0ckf | Fixed | "All recordings" back-link fails WCAG AA contrast: rgb(138,148,129) on rgb(247,248,245) = 2.97:1 (10px text) |
| bug-mw6x8az8-mkdt | Fixed | Workspace polls /api/pairs/maya-leo-workerd/questions every 2 seconds via setInterval, re-fetching the same list 41 times per session |
| bug-mw6x8456-h9db | Fixed | Sub-AA caption "Times are relative to each recording" renders at 2.51:1 contrast (8px text on near-white aside.recording-context) |
| bug-mw6x7r6a-ybtt | Fixed | Recording ID text on runtime card in recordings sidebar has 2.83:1 contrast (below 4.5:1 AA minimum) |
| bug-mw6x7bgs-i49e | Fixed | Low contrast text affects <SPAN> "TIME ALIGNMENT" |
| bug-mw6x6yb5-3069 | Fixed | 482KB decoded (144KB wire) eager entry bundle index-CMs81GvX.js ships the entire react-markdown/unified pipeline and every view in one un-split chunk loaded at initial page load |
| bug-mw6x4nfl-86rl | Fixed | GET /api/pairs fetched twice on page load — two mount effects in App() both call refresh() |
| bug-mw6x4b4a-jk8x | Fixed | Header subtitle and table headers in threadline recordings page fail WCAG AA contrast — rgb(124, 132, 123) on rgb(247, 248, 245) at 3.62:1 |
| bug-mw6x3nps-zmnc | Fixed | Recording-group row metadata "2 browsers — Backend" fails WCAG AA contrast at 3.59:1 (10px text) |
| bug-mw6x3h9w-epn9 | Fixed | Low contrast text affects <SPAN> "Replay workspace" (and 1 more element with the same colors) |
| bug-mw6x2w51-y1tb | Fixed | Homepage / is served with no <meta name="description"> — its HTML head only has charset, viewport, theme-color, icon and title |
| bug-mw6x2non-eidd | Fixed | Status pill label "Ready" on the Recordings table has 3.95:1 text contrast, below the 4.5:1 WCAG AA minimum |
| bug-mw6x2ba1-200m | Fixed | "Relay Chat" subtitle in Recordings library table fails WCAG AA contrast (3.34:1 on white) |
