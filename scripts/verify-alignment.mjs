import assert from "node:assert/strict";
const base =
  process.env.APP_URL ?? "https://threadline-replay.bhackett.workers.dev";
const id = process.argv[2] ?? "maya-leo-workerd";
async function get(path) {
  const r = await fetch(base + "/api" + path);
  assert.equal(r.status, 200);
  return r.json();
}
const pair = await get("/pairs/" + id),
  d = pair.data;
assert.equal(pair.status, "ready");
assert.equal(d.alignment.status, "aligned");
const evidence = await get("/artifacts/" + d.alignment.evidenceArtifactId);
assert.equal(evidence.version, 2);
assert.equal(
  new Set(evidence.frontend.map((r) => r.recordingId)).size,
  d.browsers.length,
);
assert.ok(
  evidence.plan.probes.every((p) => p.path && p.line && p.requestBinding),
);
for (const c of d.correlations) {
  const f = evidence.frontend.find((f) =>
    c.id.startsWith(`${f.recordingId}:${f.id}:`),
  );
  const b = evidence.backend.find(
    (b) => b.point.executionPoint === c.backendPoint.executionPoint,
  );
  assert.ok(f && b);
  assert.equal(f.method, b.method);
  assert.ok(f.bodyHash);
  assert.equal(f.bodyHash, b.bodyHash);
  assert.equal(
    evidence.frontend.filter(
      (x) =>
        x.method === f.method && x.url === f.url && x.bodyHash === f.bodyHash,
    ).length,
    1,
  );
  assert.equal(
    evidence.backend.filter(
      (x) =>
        x.method === b.method && x.url === b.url && x.bodyHash === b.bodyHash,
    ).length,
    1,
  );
}
const questions = await get("/pairs/" + id + "/questions");
let savedPoints = 0;
for (const q of questions) {
  assert.equal(q.context.mappingRevision, d.mappingRevision);
  const detail = await get("/questions/" + q.id);
  for (const t of detail.timelines) {
    assert.equal(t.mapping_revision, d.mappingRevision);
    for (const m of t.markers) {
      assert.ok(Number.isFinite(m.localTime));
      assert.equal(m.unmapped, false);
      savedPoints++;
    }
  }
}
assert.ok(d.shots.every((s) => Number.isFinite(s.localTime) && s.time >= 0));
assert.ok(d.markers.every((m) => m.point.executionPoint));
const example = d.correlations.find((c) => c.frontendPoint);
for (const point of [example.frontendPoint, example.backendPoint]) {
  const r = await fetch(base + "/api/pairs/" + id + "/inspect", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ point }),
  });
  const data = await r.json();
  assert.equal(r.status, 200, JSON.stringify(data));
  assert.ok(data.frames.length);
  assert.ok(data.source.length);
  assert.ok(data.line > 0);
}
console.log(
  JSON.stringify({
    requests: evidence.frontend.length,
    handlerObservations: evidence.backend.length,
    matches: d.correlations.length,
    clocks: d.alignment.clocks.map((c) => ({
      recordingId: c.recordingId,
      model: c.model,
      anchors: c.anchors,
    })),
    screenshots: d.shots.length,
    rebasedSavedPoints: savedPoints,
    inspection: "browser and backend passed",
  }),
);
