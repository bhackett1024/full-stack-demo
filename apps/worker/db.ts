import type { Env } from "./env";
import type { Pair, Question } from "../../packages/domain/types";
export const uid = () => crypto.randomUUID();
export function parsePair(row: any): Pair {
  return { ...row, data: JSON.parse(row.data) };
}
export async function pairById(env: Env, id: string, owner?: string) {
  const row = await env.DB.prepare(
    `SELECT * FROM pairs WHERE id=?${owner ? " AND owner=?" : ""}`,
  )
    .bind(...(owner ? [id, owner] : [id]))
    .first();
  if (!row || row.mode === "sample")
    throw new HttpError(404, "Recording group not found");
  return parsePair(row);
}
export function parseQuestion(row: any): Question {
  return { ...row, context: JSON.parse(row.context) };
}
export const questionQuery = `SELECT q.*, r.id run_id, r.status, r.answer, r.error FROM questions q JOIN runs r ON r.question_id=q.id`;
export async function event(
  env: Env,
  runId: string,
  logicalId: string,
  kind: string,
  content: unknown,
) {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO events(run_id,logical_id,kind,content) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM runs WHERE id=? AND status NOT IN ('cancelled','failed'))",
  )
    .bind(runId, logicalId, kind, JSON.stringify(content), runId)
    .run();
}
export async function active(env: Env, runId: string) {
  const r = await env.DB.prepare("SELECT status FROM runs WHERE id=?")
    .bind(runId)
    .first<{ status: string }>();
  return r?.status === "running" || r?.status === "queued";
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function artifact(
  env: Env,
  pairId: string,
  id: string,
  body: string | ArrayBuffer,
  contentType: string,
) {
  const key = `${pairId}/${id}`;
  await env.BUCKET.put(key, body, { httpMetadata: { contentType } });
  await env.DB.prepare(
    "INSERT OR IGNORE INTO artifacts(id,pair_id,object_key,content_type) VALUES(?,?,?,?)",
  )
    .bind(id, pairId, key, contentType)
    .run();
  return id;
}
