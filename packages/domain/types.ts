import { mapClock } from "./stitching";
import { z } from "zod";
export const pointSchema = z.object({
  recordingId: z.string().min(1).max(200),
  executionPoint: z.string().min(1).max(500),
});
export type PointRef = z.infer<typeof pointSchema>;
export const pointExpressionSchema = z.object({
  expression: z.string().trim().min(1).max(2000),
  label: z.string().max(120).optional(),
});
export const expressionResultSchema = pointExpressionSchema.extend({
  status: z.enum(["pending", "complete", "error"]),
  result: z.string().max(16500).optional(),
  error: z.string().max(2000).optional(),
});
export type PointExpression = z.infer<typeof pointExpressionSchema>;
export type ExpressionResult = z.infer<typeof expressionResultSchema>;
export const markerSchema = z.object({
  id: z.string().min(1).max(100),
  point: pointSchema,
  time: z.number().finite().nonnegative(),
  label: z.string().min(1).max(200),
  description: z.string().max(2000),
  runtime: z.enum(["frontend", "backend"]),
  evidenceIds: z.array(z.string()).min(1).max(20),
  expressions: z.array(expressionResultSchema).max(8).optional(),
  localTime: z.number().optional(),
  unmapped: z.boolean().optional(),
});
export type Marker = z.infer<typeof markerSchema>;
export type BrowserRecording = {
  id: string;
  label: string;
  offset?: number;
  clock?: import("./stitching").ClockAlignment;
  duration?: number;
  uncertainty?: number;
  error?: string;
};
export type Shot = {
  recordingId?: string;
  localTime?: number;
  time: number;
  point?: string;
  artifactId?: string;
  url?: string;
  stage?: number;
};
export type Correlation = {
  id: string;
  frontendPoint?: PointRef;
  frontendRecordingId?: string;
  backendPoint: PointRef;
  label: string;
  method: "explicit" | "manual" | "inferred";
  lower: number;
  upper: number;
  frontendTime?: number;
  backendTime?: number;
  evidence?: {
    kind: string;
    fingerprint: string;
    source?: { path: string; line: number };
  };
};
export type PairData = {
  alignment?: {
    status: "aligned" | "partial" | "unmatched";
    clocks: import("./stitching").ClockAlignment[];
    evidenceArtifactId?: string;
    diagnostics: string[];
  };
  preparedVersion?: number;
  preparation?: import("./preparation").Preparation;
  browsers?: BrowserRecording[];
  backendLabel?: string;
  duration: number;
  shots: Shot[];
  markers: Marker[];
  correlations: Correlation[];
  mappingRevision: number;
  offset?: number;
  uncertainty?: number;
  preparationError?: string;
  overview?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
};
export type Pair = {
  id: string;
  name: string;
  app: string;
  mode: "sample" | "live";
  frontend_id: string;
  backend_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  question_count?: number;
  data: PairData;
};
export type Context = {
  time: number;
  point?: PointRef;
  mappingRevision: number;
  screenshotTime?: number;
  recordingId?: string;
};
export type Question = {
  id: string;
  pair_id: string;
  text: string;
  context: Context;
  created_at: string;
  run_id: string;
  status: string;
  answer?: string;
  error?: string;
};
export type ConversationEvent = {
  sequence: number;
  kind: string;
  content: any;
  created_at: string;
};
export type Inspection = {
  point: PointRef;
  frames: {
    id: string;
    name: string;
    source: string;
    line: number;
    column?: number;
  }[];
  selectedFrame: string;
  source: string;
  line: number;
  scopes: {
    name: string;
    values: {
      name: string;
      value: unknown;
      objectId?: string;
      locator?: {
        frameIndex: number;
        scopeIndex: number;
        name: string;
        path: string[];
      };
      unavailable?: boolean;
    }[];
  }[];
  objects?: Record<string, unknown>;
  objectPreviews?: Record<string, any>;
  warning?: string;
};
export const importSchema = z.object({
  name: z.string().trim().min(1).max(100),
  app: z.string().trim().min(1).max(100),
  frontendId: z.string().uuid().optional(),
  browsers: z
    .array(
      z.object({
        id: z.string().uuid(),
        label: z.string().trim().min(1).max(100),
        offset: z.number().finite().nonnegative().optional(),
      }),
    )
    .min(1)
    .max(12)
    .optional(),
  backendId: z.string().uuid(),
  offset: z.number().finite().optional(),
  correlations: z
    .array(
      z.object({
        id: z.string(),
        frontendPoint: pointSchema,
        backendPoint: pointSchema,
        label: z.string(),
        method: z.enum(["explicit", "manual", "inferred"]),
        lower: z.number().finite(),
        upper: z.number().finite(),
      }),
    )
    .max(500)
    .default([]),
});
export const questionSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  idempotencyKey: z.string().uuid(),
  context: z.object({
    time: z.number().finite().nonnegative(),
    point: pointSchema.optional(),
    mappingRevision: z.number().int().nonnegative(),
    screenshotTime: z.number().finite().nonnegative().optional(),
    recordingId: z.string().optional(),
  }),
});
export function belongs(pair: Pair, point: PointRef) {
  return (
    browserRecordings(pair).some((b) => b.id === point.recordingId) ||
    point.recordingId === pair.backend_id
  );
}
export function browserRecordings(pair: Pair): BrowserRecording[] {
  return pair.data?.browsers?.length
    ? pair.data.browsers
    : [{ id: pair.frontend_id, label: "Browser", offset: 0 }];
}
export function shotsFor(pair: Pair, recordingId: string) {
  return pair.data.shots.filter(
    (s) => (s.recordingId ?? pair.frontend_id) === recordingId,
  );
}
export function displayOffset(pair: Pair, recordingId: string) {
  return recordingId === pair.backend_id
    ? pair.data.offset
    : browserRecordings(pair).find((b) => b.id === recordingId)?.offset;
}

export function screenshotAt(shots: Shot[], time: number) {
  return shots.filter((s) => s.time <= time).sort((a, b) => b.time - a.time)[0];
}
export function offsetBounds(
  anchors: {
    frontendSend: number;
    frontendReceive: number;
    backendReceive: number;
    backendSend: number;
  }[],
) {
  if (!anchors.length) return null;
  const lower = Math.max(
    ...anchors.map((a) => a.frontendSend - a.backendReceive),
  );
  const upper = Math.min(
    ...anchors.map((a) => a.frontendReceive - a.backendSend),
  );
  return lower <= upper
    ? {
        lower,
        upper,
        offset: (lower + upper) / 2,
        uncertainty: (upper - lower) / 2,
      }
    : null;
}
export function formatTime(ms: number) {
  return `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, "0")}:${((ms / 1000) % 60).toFixed(2).padStart(5, "0")}`;
}

export function displayTime(pair: Pair, recordingId: string, local: number) {
  if (recordingId === pair.backend_id) return local + (pair.data.offset ?? 0);
  const browser = browserRecordings(pair).find((b) => b.id === recordingId);
  return browser?.clock?.status === "aligned"
    ? mapClock(browser.clock, local) + (pair.data.offset ?? 0)
    : local + (browser?.offset ?? 0);
}
export function recordingTime(pair: Pair, recordingId: string, shared: number) {
  if (recordingId === pair.backend_id) return shared - (pair.data.offset ?? 0);
  const browser = browserRecordings(pair).find((b) => b.id === recordingId);
  return browser?.clock?.status === "aligned"
    ? mapClock(browser.clock, shared - (pair.data.offset ?? 0), true)
    : shared - (browser?.offset ?? 0);
}
