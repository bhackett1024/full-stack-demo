import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const password = process.env.APP_PASSWORD_FILE
  ? readFileSync(process.env.APP_PASSWORD_FILE, "utf8").trim()
  : undefined;
const authHeaders = {};
const base = process.env.APP_URL || "http://127.0.0.1:8791";
async function req(path, data, expected = 200) {
  const r = await fetch(
    base + "/api" + path,
    data === undefined
      ? { headers: authHeaders }
      : {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  const result = await r.json();
  assert.equal(r.status, expected, JSON.stringify(result));
  return result;
}
if (password) {
  for (const path of ["/", "/api/status", "/favicon.svg"]) {
    const denied = await fetch(base + path, { redirect: "manual" });
    assert.equal(denied.status, path.startsWith("/api/") ? 401 : 303);
    assert.equal(denied.headers.has("www-authenticate"), false);
  }
  const form = await fetch(base + "/login");
  assert.equal(form.status, 200);
  assert.match(await form.text(), /type="password"/);
  const login = (value, origin = base) =>
    fetch(base + "/login", {
      method: "POST",
      redirect: "manual",
      headers: { Origin: origin },
      body: new URLSearchParams({ password: value }),
    });
  assert.equal((await login("incorrect-password")).status, 401);
  assert.equal((await login(password, "https://evil.example")).status, 403);
  const signedIn = await login(password);
  assert.equal(signedIn.status, 303);
  const cookie = signedIn.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly; Secure; SameSite=Lax/);
  authHeaders.Cookie = cookie.split(";")[0];
  const page = await fetch(base, { headers: authHeaders });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Full Stack Demo/);
}

await req("/samples", {});
const pairs = await req("/pairs");
assert(pairs.length >= 2);
const checkout = pairs.find((p) => p.frontend_id === "sample-checkout-browser"),
  search = pairs.find((p) => p.frontend_id === "sample-search-browser");
const key = crypto.randomUUID();
const input = {
  text: "Why did the discount disappear? [API smoke test]",
  context: { time: 7400, mappingRevision: 1 },
  idempotencyKey: key,
};
const q = await req(`/pairs/${checkout.id}/questions`, input);
const duplicate = await req(`/pairs/${checkout.id}/questions`, input);
assert.equal(q.id, duplicate.id);
await req(
  `/pairs/${checkout.id}/inspect`,
  { point: search.data.markers[0].point },
  400,
);
const inspection = await req(`/pairs/${checkout.id}/inspect`, {
  point: checkout.data.markers[3].point,
});
assert.match(inspection.source, /total: subtotal/);
assert.equal(
  inspection.scopes[0].values.find((v) => v.name === "discountedTotal").value,
  96,
);
let result;
for (let i = 0; i < 30; i++) {
  result = await req(`/questions/${q.id}`);
  if (["complete", "failed", "cancelled"].includes(result.status)) break;
  await new Promise((r) => setTimeout(r, 700));
}
assert.equal(result.status, "complete", JSON.stringify(result));
assert.equal(result.timelines[0].markers.length, 6);
assert.match(result.answer, /subtotal/);
const events = await req(`/runs/${q.run_id}/events`);
assert(events.events.length >= 8);
assert.equal(
  new Set(events.events.map((e) => e.sequence)).size,
  events.events.length,
);
const incremental = await req(
  `/runs/${q.run_id}/events?afterSequence=${events.events.at(-1).sequence}`,
);
assert.equal(incremental.events.length, 0);
assert(
  !(await req(`/pairs/${search.id}/questions`)).some((x) => x.id === q.id),
);
const cancel = await req(`/pairs/${search.id}/questions`, {
  text: "Why is the result stale? [cancellation smoke test]",
  context: { time: 8400, mappingRevision: 1 },
  idempotencyKey: crypto.randomUUID(),
});
await req(`/runs/${cancel.run_id}/cancel`, {});
assert.equal((await req(`/questions/${cancel.id}`)).status, "cancelled");
const cross = await fetch(base + `/api/pairs/${checkout.id}/questions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: "https://untrusted.example",
    ...authHeaders,
  },
  body: JSON.stringify(input),
});
assert.equal(cross.status, 403);
console.log(
  "PASS: workerd, D1 persistence, two-pair isolation, idempotency, Workflow completion, exact-point inspection, event resume, cancellation, and cross-origin write rejection.",
);
