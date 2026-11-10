import assert from "node:assert/strict";
const base =
  process.env.APP_URL || "https://threadline-replay.bhackett.workers.dev";
const p = await (await fetch(base + "/api/pairs/maya-leo-workerd")).json();
assert.deepEqual(
  p.data.browsers.map((b) => b.label),
  ["Maya Chen", "Leo Park"],
);
assert.equal(p.backend_id, "7d323e5e-ed34-463a-8fa6-af195851e929");
assert(p.data.shots.length >= 32);
for (const b of p.data.browsers) {
  const shot = p.data.shots.filter((s) => s.recordingId === b.id).at(-1);
  const r = await fetch(
    base +
      `/api/pairs/${p.id}/screenshot?recordingId=${b.id}&time=${shot.time}`,
  );
  assert.equal(
    r.status,
    200,
    await r
      .clone()
      .text()
      .then((t) => (r.ok ? "" : t)),
  );
  assert.match(r.headers.get("content-type"), /image/);
  assert((await r.arrayBuffer()).byteLength > 1000);
}
const outside = await fetch(
  base + `/api/pairs/${p.id}/screenshot?recordingId=outside&time=377`,
);
assert.equal(outside.status, 404);
const duplicate = await fetch(base + "/api/pairs", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Invalid duplicate",
    app: "Test",
    backendId: p.backend_id,
    browsers: [p.data.browsers[0], p.data.browsers[0]],
  }),
});
assert.equal(duplicate.status, 400);
console.log(
  "PASS: named multi-browser group, backend identity, real frames, per-browser screenshot routing, and invalid browser rejection.",
);
