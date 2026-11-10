import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { z } from "zod";
const base =
  process.env.APP_URL ?? "https://threadline-replay.bhackett.workers.dev";
const scenarios = z
  .array(
    z.object({
      name: z.string(),
      backendId: z.string().uuid(),
      browsers: z
        .array(z.tuple([z.string(), z.string().uuid()]))
        .min(1)
        .max(12),
    }),
  )
  .parse(
    JSON.parse(
      await readFile(
        new URL("../data/relay-chat-scenarios.json", import.meta.url),
        "utf8",
      ),
    ),
  );
assert.equal(scenarios.length, 10);
const ids = scenarios.flatMap((s) => [
  s.backendId,
  ...s.browsers.map((b) => b[1]),
]);
assert.equal(new Set(ids).size, ids.length);
async function api(path, body) {
  const response = await fetch(
    base + "/api" + path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  if (!response.ok)
    throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}
const existing = await api("/pairs");
for (const scenario of [...scenarios].reverse()) {
  const browsers = scenario.browsers.map(([label, id]) => ({ id, label }));
  const found = existing.find((p) => p.backend_id === scenario.backendId);
  if (found) {
    assert.equal(found.name, scenario.name);
    assert.deepEqual(
      found.data.browsers.map(({ id, label }) => ({ id, label })),
      browsers,
    );
    console.log(`Already present: ${scenario.name}`);
    continue;
  }
  const result = await api("/pairs", {
    name: scenario.name,
    app: "Relay Chat",
    backendId: scenario.backendId,
    browsers,
  });
  console.log(`Added: ${scenario.name} — ${result.id}`);
}
const result = await api("/pairs");
for (const s of scenarios) {
  const matches = result.filter((p) => p.backend_id === s.backendId);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, s.name);
  assert.deepEqual(
    matches[0].data.browsers.map((b) => [b.label, b.id]),
    s.browsers,
  );
}
console.log(
  `Verified ${scenarios.length} groups, ${ids.length} recordings (${ids.length - scenarios.length} browsers and ${scenarios.length} backends).`,
);
