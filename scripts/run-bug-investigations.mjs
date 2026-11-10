import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const base = "https://threadline-replay.bhackett.workers.dev";
const bugs = JSON.parse(
  await readFile(
    new URL("../data/bug-investigations.json", import.meta.url),
    "utf8",
  ),
);
const groups = JSON.parse(
  await readFile(
    new URL("../data/relay-chat-scenarios.json", import.meta.url),
    "utf8",
  ),
);
const ledgerFile = new URL(
  "../.outputs/bug-investigation-runs.json",
  import.meta.url,
);
let ledger;
try {
  ledger = JSON.parse(await readFile(ledgerFile, "utf8"));
} catch {
  ledger = {};
}
const save = () => writeFile(ledgerFile, JSON.stringify(ledger, null, 2));
async function api(path, body) {
  const r = await fetch(
    base + "/api" + path,
    body
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  if (!r.ok) throw Error(`${r.status}: ${await r.text()}`);
  return r.json();
}
const pairs = await api("/pairs");
for (const bug of bugs) {
  const definition = groups.find((g) => g.name === bug.scenario);
  const pair = pairs.find((p) => p.backend_id === definition.backendId);
  if (!pair) throw Error("Missing " + bug.scenario);
  const text =
    bug.question +
    "\n\nRecord exact execution points incrementally as soon as relevant evidence is found, including both frontend triggers/updates and backend handlers. Use only observed evidence and do not infer cross-recording causality from timestamps alone. Publish a timeline and clearly identify any unavailable recordings or unverified links.";
  ledger[bug.scenario] ??= { idempotencyKey: randomUUID() };
  await save();
  const existing = await api(`/pairs/${pair.id}/questions`);
  const q =
    existing.find((q) => q.text === text) ??
    (await api(`/pairs/${pair.id}/questions`, {
      text,
      idempotencyKey: ledger[bug.scenario].idempotencyKey,
      context: {
        time: 0,
        mappingRevision: pair.data.mappingRevision,
        recordingId: pair.data.browsers[0].id,
      },
    }));
  Object.assign(ledger[bug.scenario], {
    id: q.id,
    runId: q.run_id,
    pairId: pair.id,
    status: q.status,
    url: `${base}/#${pair.id}?q=${q.id}`,
  });
  await save();
  console.log(
    JSON.stringify({ scenario: bug.scenario, ...ledger[bug.scenario] }),
  );
}
