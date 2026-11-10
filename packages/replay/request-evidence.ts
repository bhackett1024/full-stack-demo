import { z } from "zod";
import { bodyFingerprint, type RequestSpan } from "../domain/stitching";
// Model discovery selects observed source locations and identifiers, never code
// to execute. Expressions below are generated from validated binding names.
const binding = z
  .string()
  .regex(/^[A-Za-z_$][\w$]*$/)
  .max(100);
export const handlerPlanSchema = z.object({
  probes: z
    .array(
      z.object({
        path: z.string().min(1),
        line: z.number().int().positive(),
        requestBinding: binding,
        style: z.enum(["fetch", "node"]),
        bodyBinding: binding.optional(),
        reason: z.string().max(500),
      }),
    )
    .min(1)
    .max(12),
});
export type HandlerProbe = z.infer<typeof handlerPlanSchema>["probes"][number];
export function probeExpression(p: HandlerProbe) {
  const r = p.requestBinding;
  const body =
    p.bodyBinding ?? (p.style === "node" ? `${r}.body` : "undefined");
  return `({method:${r}.method,url:${p.style === "node" ? `(${r}.originalUrl || ${r}.url)` : r + ".url"},body:${body},requestId:${p.style === "fetch" ? `${r}.headers.get("x-request-id")` : `${r}.headers?.["x-request-id"]`},traceparent:${p.style === "fetch" ? `${r}.headers.get("traceparent")` : `${r}.headers?.traceparent`}})`;
}
export function parseRequestDetail(text: string) {
  const point = text.match(/Initiated at (\S+) @/)?.[1];
  const raw = text.match(/<requestBody>\s*([\s\S]*?)\s*<\/requestBody>/)?.[1];
  let body: unknown = raw;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {}
  }
  return { point, body };
}
export async function parseHandlerHits(
  recordingId: string,
  probe: HandlerProbe,
  result: any,
): Promise<RequestSpan[]> {
  const spans: RequestSpan[] = [];
  for (const hit of result.hits ?? []) {
    try {
      const data =
        typeof hit.result === "string" ? JSON.parse(hit.result) : hit.result;
      if (
        !data ||
        typeof data.method !== "string" ||
        typeof data.url !== "string" ||
        !Number.isFinite(hit.timeMs) ||
        !/^\d+$/.test(hit.point)
      )
        continue;
      const bodyHash = await bodyFingerprint(data.body);
      spans.push({
        id: hit.point,
        recordingId,
        method: data.method.toUpperCase(),
        url: data.url,
        start: hit.timeMs,
        point: { recordingId, executionPoint: hit.point },
        bodyHash,
        source: { path: probe.path, line: probe.line },
        requestId: data.requestId ?? undefined,
        traceparent: data.traceparent ?? undefined,
      });
    } catch {
      /* Invalid/TDZ expression results are not evidence. */
    }
  }
  return spans;
}
