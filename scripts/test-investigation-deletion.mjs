import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const base = "http://127.0.0.1:8791";
const prefix = `delete-test-${crypto.randomUUID()}`;
const dir = mkdtempSync(join(tmpdir(), "investigation-delete-"));
const id = (suffix) => `${prefix}-${suffix}`;
function sql(query) {
  const file = join(dir, "query.sql");
  writeFileSync(file, query);
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "node_modules/wrangler/bin/wrangler.js",
        "d1",
        "execute",
        "DB",
        "--local",
        "--file",
        file,
        "--json",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          WRANGLER_SEND_METRICS: "false",
          WRANGLER_LOG_PATH: join(process.cwd(), ".wrangler/logs"),
        },
      },
    ),
  );
}
async function request(path, method = "GET", origin) {
  return fetch(base + "/api" + path, {
    method,
    headers: origin ? { Origin: origin } : {},
  });
}
try {
  sql(`
    INSERT INTO pairs(id,owner,name,app,mode,frontend_id,backend_id,data) VALUES('${id("pair")}','local-developer','Deletion test','Test','live','browser','backend','{}'),('${id("private")}','another-owner','Private test','Test','live','browser','backend','{}');
    INSERT INTO questions(id,pair_id,text,context,submission_key) VALUES('${id("question")}','${id("pair")}','Delete test','{}','a'),('${id("keep")}','${id("pair")}','Keep test','{}','b'),('${id("private-question")}','${id("private")}','Private test','{}','c');
    INSERT INTO runs(id,question_id,status) VALUES('${id("old")}','${id("question")}','complete'),('${id("active")}','${id("question")}','running'),('${id("keep-run")}','${id("keep")}','complete'),('${id("private-run")}','${id("private-question")}','complete');
    INSERT INTO events(run_id,logical_id,kind,content) VALUES('${id("old")}','e','tool','{}'),('${id("active")}','e','tool','{}');
    INSERT INTO evidence(id,run_id,recording_id,label,data) VALUES('${id("evidence")}','${id("old")}','browser','Test','{}');
    INSERT INTO timelines(id,question_id,run_id,revision,mapping_revision,markers) VALUES('${id("t1")}','${id("question")}','${id("old")}',1,1,'[]'),('${id("t2")}','${id("question")}','${id("active")}',2,1,'[]');
    INSERT INTO artifacts(id,pair_id,object_key,content_type) VALUES('${id("old")}-tool-result','${id("pair")}','${prefix}/result','application/json'),('${id("shared-artifact")}','${id("pair")}','${prefix}/shared','application/json');
  `);
  assert.equal(
    (await request(`/questions/${id("private-question")}`, "DELETE")).status,
    404,
  );
  assert.equal(
    (
      await request(
        `/questions/${id("question")}`,
        "DELETE",
        "https://untrusted.example",
      )
    ).status,
    403,
  );
  const removed = await request(`/questions/${id("question")}`, "DELETE");
  assert.equal(removed.status, 200, await removed.text());
  for (const path of [
    `/questions/${id("question")}`,
    `/runs/${id("old")}`,
    `/runs/${id("active")}`,
    `/runs/${id("old")}/events`,
  ])
    assert.equal((await request(path)).status, 404, path);
  assert.equal(
    (await request(`/questions/${id("question")}`, "DELETE")).status,
    404,
  );
  assert.equal((await request(`/questions/${id("keep")}`)).status, 200);
  assert.equal((await request(`/pairs/${id("pair")}`)).status, 200);
  const list = await (await request(`/pairs/${id("pair")}/questions`)).json();
  assert.deepEqual(
    list.map((q) => q.id),
    [id("keep")],
  );
  const result = sql(
    `SELECT (SELECT count(*) FROM evidence WHERE id='${id("evidence")}')+(SELECT count(*) FROM timelines WHERE question_id='${id("question")}')+(SELECT count(*) FROM events WHERE run_id IN ('${id("old")}','${id("active")}'))+(SELECT count(*) FROM artifacts WHERE id='${id("old")}-tool-result') AS remaining, (SELECT count(*) FROM questions WHERE id='${id("private-question")}') AS private_kept,(SELECT count(*) FROM artifacts WHERE id='${id("shared-artifact")}') AS shared_kept;`,
  );
  assert.deepEqual(result[0].results[0], {
    remaining: 0,
    private_kept: 1,
    shared_kept: 1,
  });
  console.log(
    "PASS: local workerd deletion, revision/evidence/event/artifact cleanup, active-run handling, ownership and origin checks, and unrelated data preservation.",
  );
} finally {
  sql(
    `DELETE FROM artifacts WHERE pair_id IN ('${id("pair")}','${id("private")}'); DELETE FROM events WHERE run_id IN (SELECT id FROM runs WHERE question_id IN ('${id("question")}','${id("keep")}','${id("private-question")}')); DELETE FROM evidence WHERE id='${id("evidence")}'; DELETE FROM timelines WHERE question_id='${id("question")}'; DELETE FROM runs WHERE question_id IN ('${id("question")}','${id("keep")}','${id("private-question")}'); DELETE FROM questions WHERE pair_id IN ('${id("pair")}','${id("private")}'); DELETE FROM pairs WHERE id IN ('${id("pair")}','${id("private")}');`,
  );
  rmSync(dir, { recursive: true });
}
