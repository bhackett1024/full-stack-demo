import type { Pair } from "./types";
export const PREPARATION_VERSION = 4;
export type RecordingProgress = {
  recordingId: string;
  label: string;
  state: string;
  phase?: string;
  elapsedMs?: number;
  regions?: { total: number | null; scanned: number; basicDataDone?: number };
  scan?: { done: boolean; percent: number | null };
  instrumentEngine?: { state: string };
  error?: string;
};
export type Preparation = {
  workflowId: string;
  stage: string;
  recordings: RecordingProgress[];
  updatedAt: string;
};
export function prepared(pair: Pair) {
  return (
    pair.mode === "sample" ||
    (pair.status === "ready" &&
      pair.data.preparedVersion === PREPARATION_VERSION)
  );
}
export function scanPercent(progress: RecordingProgress): number | undefined {
  const n = progress.scan?.percent;
  return typeof n === "number" && Number.isFinite(n)
    ? Math.max(0, Math.min(100, n))
    : undefined;
}
