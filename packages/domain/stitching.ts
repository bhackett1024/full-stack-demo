import type { Correlation, PointRef } from "./types";

export type RequestSpan = {
  id: string;
  recordingId: string;
  method: string;
  url: string;
  start: number;
  end?: number;
  point?: PointRef;
  bodyHash?: string;
  requestId?: string;
  traceparent?: string;
  source?: { path: string; line: number };
};
export type ClockAlignment = {
  recordingId: string;
  status: "aligned" | "unmatched" | "insufficient" | "conflict";
  anchors: number;
  model?: "offset" | "events";
  points?: {
    localTime: number;
    sharedTime: number;
    localStart: number;
    localEnd: number;
  }[];
  offset?: number;
  uncertainty?: number;
  lower?: number;
  upper?: number;
  reason?: string;
};
export function requestPath(url: string) {
  const u = new URL(url, "https://recorded.invalid");
  // Preserve query order: reordering duplicate query keys can change semantics.
  return u.pathname + u.search;
}
export function canonicalJSON(value: unknown): string {
  if (Array.isArray(value))
    return "[" + value.map(canonicalJSON).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonicalJSON(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "null";
}
export async function bodyFingerprint(
  body: unknown,
): Promise<string | undefined> {
  if (
    body === undefined ||
    body === null ||
    body === "" ||
    (typeof body === "object" && Object.keys(body).length === 0)
  )
    return undefined;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {}
  }
  const canonical = canonicalJSON(body);
  if (canonical === "{}" || canonical === "[]" || canonical === "null")
    return undefined;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
function identities(r: RequestSpan) {
  const prefix = `${r.method.toUpperCase()} ${requestPath(r.url)} `;
  const keys: string[] = [];
  if (r.requestId) keys.push(prefix + "request:" + r.requestId);
  if (
    r.traceparent &&
    /^[a-f\d]{2}-[a-f\d]{32}-[a-f\d]{16}-[a-f\d]{2}$/i.test(r.traceparent)
  )
    keys.push(
      prefix +
        "span:" +
        r.traceparent.toLowerCase().split("-").slice(1, 3).join(":"),
    );
  if (r.bodyHash) keys.push(prefix + "body:" + r.bodyHash);
  return keys;
}
// Handler observations are points *inside* request handling, not invented
// request start/end spans. Browser send/receive bound the handler's timestamp.
export function alignRecordings(
  frontend: RequestSpan[],
  backend: RequestSpan[],
  browserIds: string[],
) {
  const correlations: Correlation[] = [];
  const unmatched: string[] = [];
  const grouped = (rows: RequestSpan[]) => {
    const map = new Map<string, RequestSpan[]>();
    for (const r of rows) {
      for (const k of identities(r)) map.set(k, [...(map.get(k) ?? []), r]);
    }
    return map;
  };
  const fs = grouped(frontend),
    bs = grouped(backend);
  for (const f of frontend) {
    const candidates = identities(f).filter(
      (key) => fs.get(key)?.length === 1 && bs.get(key)?.length === 1,
    );
    const targets = new Set(candidates.map((key) => bs.get(key)![0].id));
    const key = candidates[0];
    if (
      !key ||
      targets.size !== 1 ||
      !Number.isFinite(f.start) ||
      !Number.isFinite(f.end) ||
      f.end! < f.start
    ) {
      unmatched.push(`${f.recordingId}:${f.id}`);
      continue;
    }
    const b = bs.get(key)![0];
    if (!Number.isFinite(b.start) || !b.point) continue;
    correlations.push({
      id: `${f.recordingId}:${f.id}:${b.id}`,
      frontendPoint: f.point,
      frontendRecordingId: f.recordingId,
      backendPoint: b.point,
      label: `${f.method} ${requestPath(f.url)}`,
      method: "explicit",
      lower: f.start - b.start,
      upper: f.end! - b.start,
      frontendTime: f.start,
      backendTime: b.start,
      evidence: {
        kind: key.includes(" body:")
          ? "payload"
          : key.includes(" span:")
            ? "trace-span"
            : "request-id",
        fingerprint: key,
        source: b.source,
      },
    });
  }
  // Independently unique identifiers must still yield a one-to-one join.
  const counts = new Map<string, number>();
  for (const c of correlations)
    counts.set(
      c.backendPoint.executionPoint,
      (counts.get(c.backendPoint.executionPoint) ?? 0) + 1,
    );
  for (let i = correlations.length - 1; i >= 0; i--)
    if (counts.get(correlations[i].backendPoint.executionPoint)! > 1) {
      unmatched.push(correlations[i].id);
      correlations.splice(i, 1);
    }
  const clocks: ClockAlignment[] = browserIds.map((recordingId) => {
    const anchors = correlations.filter(
      (c) => c.frontendRecordingId === recordingId,
    );
    if (anchors.length < 2)
      return {
        recordingId,
        status: anchors.length ? "insufficient" : "unmatched",
        anchors: anchors.length,
        reason: anchors.length
          ? "Only one unique request match; need independent corroboration."
          : "No unique request identity or payload matches.",
      };
    const lower = Math.max(...anchors.map((a) => -a.upper)),
      upper = Math.min(...anchors.map((a) => -a.lower));
    if (lower > upper) {
      const points = anchors
        .map((a) => ({
          localTime: (a.lower + a.upper) / 2 + a.backendTime!,
          sharedTime: a.backendTime!,
          localStart: a.lower + a.backendTime!,
          localEnd: a.upper + a.backendTime!,
        }))
        .sort((a, b) => a.sharedTime - b.sharedTime);
      // Concurrent requests can overlap. Select monotone locations *within*
      // their observed intervals instead of rejecting reordered midpoints.
      const lows = points.map((p) => p.localStart),
        highs = points.map((p) => p.localEnd);
      for (let i = 1; i < lows.length; i++)
        lows[i] = Math.max(lows[i], lows[i - 1] + 1e-6);
      for (let i = highs.length - 2; i >= 0; i--)
        highs[i] = Math.min(highs[i], highs[i + 1] - 1e-6);
      points.forEach((p, i) => {
        p.localTime = (lows[i] + highs[i]) / 2;
      });
      if (
        lows.some((v, i) => v > highs[i]) ||
        points.some(
          (p, i) =>
            i > 0 &&
            (p.localTime <= points[i - 1].localTime ||
              p.sharedTime <= points[i - 1].sharedTime),
        )
      )
        return {
          recordingId,
          status: "conflict",
          anchors: anchors.length,
          reason:
            "Matched handler ordering is not compatible with a monotone recording clock.",
        };
      return {
        recordingId,
        status: "aligned",
        model: "events",
        anchors: anchors.length,
        points,
        offset: points[0].sharedTime - points[0].localTime,
        reason:
          "Recording clocks do not have a constant offset. Display times interpolate matched events; elapsed time between anchors is approximate.",
      };
    }
    return {
      recordingId,
      status: "aligned",
      model: "offset",
      anchors: anchors.length,
      lower,
      upper,
      offset: (lower + upper) / 2,
      uncertainty: (upper - lower) / 2,
    };
  });
  return { clocks, correlations, unmatched };
}

// Interpolate only between observed anchors. Outside them use a unit slope and
// explicitly label the display as extrapolated, never a measured clock offset.
export function mapClock(
  clock: ClockAlignment | undefined,
  time: number,
  inverse = false,
): number {
  if (clock?.status !== "aligned") return time;
  if (clock.model !== "events" || !clock.points?.length)
    return time + (inverse ? -1 : 1) * (clock.offset ?? 0);
  const points = clock.points.map((p) => ({
    x: inverse ? p.sharedTime : p.localTime,
    y: inverse ? p.localTime : p.sharedTime,
  }));
  if (time <= points[0].x) return points[0].y + time - points[0].x;
  const last = points[points.length - 1];
  if (time >= last.x) return last.y + time - last.x;
  const i = points.findIndex((p) => p.x >= time),
    a = points[i - 1],
    b = points[i];
  return a.y + ((time - a.x) * (b.y - a.y)) / (b.x - a.x);
}
