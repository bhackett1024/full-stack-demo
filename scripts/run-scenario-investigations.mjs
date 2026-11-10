import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const base =
  process.env.APP_URL ?? "https://threadline-replay.bhackett.workers.dev";
const drafts = JSON.parse(
  await readFile(
    new URL("../data/scenario-investigations.json", import.meta.url),
    "utf8",
  ),
);
const scenarios = JSON.parse(
  await readFile(
    new URL("../data/relay-chat-scenarios.json", import.meta.url),
    "utf8",
  ),
);
const ledgerURL = new URL(
  "../.outputs/scenario-investigation-runs.json",
  import.meta.url,
);
await mkdir(new URL("../.outputs/", import.meta.url), { recursive: true });
let ledger;
try {
  ledger = JSON.parse(await readFile(ledgerURL, "utf8"));
} catch {
  ledger = {};
}
const save = () => writeFile(ledgerURL, JSON.stringify(ledger, null, 2));
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
  if (!r.ok) throw Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}
const guidance =
  "Add relevant execution points as soon as you find them. Include frontend triggers and backend handlers/writes, label the browser or user for each point, and explicitly explain their relationships using recorded network-request evidence. Follow the resulting browser updates where recorded. Do not infer causality from timestamps alone. If an action was not exercised, explicitly report that and trace the closest relevant observed interaction instead of inventing events.";
const initial = await api("/pairs");
for (const [name] of drafts) {
  const scenario = scenarios.find((s) => s.name === name);
  const p = initial.find((p) => p.backend_id === scenario.backendId);
  if (!p) throw Error(`Missing ${name}`);
  ledger[name] ??= { pairId: p.id, questions: [] };
  if (p.status !== "ready" && p.status !== "preparing") {
    console.log("Preparing " + name);
    await api(`/pairs/${p.id}/prepare`, {});
  }
}
await save();
let cycles = 0;
while (true) {
  const pairs = await api("/pairs");
  let outstanding = 0;
  for (const [name, ...questions] of drafts) {
    const entry = ledger[name],
      p = pairs.find((p) => p.id === entry.pairId);
    if (p.status !== "ready" && !process.argv.includes("--launch-unprepared")) {
      outstanding++;
      console.log(
        `${name}: ${p.status} — ${p.data.preparation?.stage ?? p.data.preparationError ?? ""}`,
      );
      continue;
    }
    const existing = await api(`/pairs/${p.id}/questions`);
    for (let i = 0; i < questions.length; i++) {
      const text = questions[i] + "\n\n" + guidance;
      let q = existing.find((q) => q.text === text);
      entry.questions[i] ??= { idempotencyKey: randomUUID() };
      await save();
      if (!q) {
        q = await api(`/pairs/${p.id}/questions`, {
          text,
          idempotencyKey: entry.questions[i].idempotencyKey,
          context: {
            time: 0,
            mappingRevision: p.data.mappingRevision,
            recordingId: p.data.browsers[0].id,
          },
        });
        console.log(`Launched ${name} #${i + 1}: ${q.id}`);
      }
      Object.assign(entry.questions[i], {
        id: q.id,
        runId: q.run_id,
        status: q.status,
        url: `${base}/#${p.id}?q=${q.id}`,
      });
    }
  }
  await save();
  if (!outstanding) {
    console.log("All 20 investigations created and launched.");
    console.log(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(ledger).map(([k, v]) => [
            k,
            v.questions.map((q) => q.status),
          ]),
        ),
      ),
    );
    break;
  }
  if (++cycles >= 90)
    throw Error(
      "Preparation still outstanding; resume this idempotent script to continue.",
    );
  await new Promise((r) => setTimeout(r, 20000));
}
