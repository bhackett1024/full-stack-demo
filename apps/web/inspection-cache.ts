import type { Inspection, PointRef } from "../../packages/domain/types";
export type InspectionData = Inspection & { inspectionToken?: string };
export const inspectionKey = (point: PointRef, frameIndex = 0) =>
  `${point.recordingId}:${point.executionPoint}:${frameIndex}`;
/** One request per recording: Replay's pause/session state must not race. */
export class InspectionCache {
  private values = new Map<string, InspectionData>();
  private pending = new Map<string, Promise<InspectionData>>();
  private active = new Set<string>();
  private queue: {
    key: string;
    recording: string;
    run: () => Promise<void>;
  }[] = [];
  constructor(
    private fetcher: (
      point: PointRef,
      frameIndex: number,
    ) => Promise<InspectionData>,
  ) {}
  peek(point: PointRef, frameIndex = 0) {
    return this.values.get(inspectionKey(point, frameIndex));
  }
  load(
    point: PointRef,
    frameIndex = 0,
    priority = false,
  ): Promise<InspectionData> {
    const key = inspectionKey(point, frameIndex),
      value = this.values.get(key);
    if (value) return Promise.resolve(value);
    const existing = this.pending.get(key);
    if (existing) {
      if (priority) {
        const i = this.queue.findIndex((j) => j.key === key);
        if (i >= 0) this.queue.unshift(...this.queue.splice(i, 1));
      }
      return existing;
    }
    let resolve!: (v: InspectionData) => void, reject!: (e: unknown) => void;
    const promise = new Promise<InspectionData>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    this.pending.set(key, promise);
    const job = {
      key,
      recording: point.recordingId,
      run: async () => {
        try {
          const result = await this.fetcher(point, frameIndex);
          this.values.set(key, result);
          resolve(result);
        } catch (e) {
          reject(e);
        } finally {
          this.pending.delete(key);
          this.active.delete(point.recordingId);
          this.drain();
        }
      },
    };
    if (priority) this.queue.unshift(job);
    else this.queue.push(job);
    this.drain();
    return promise;
  }
  private drain() {
    for (let i = 0; i < this.queue.length;) {
      const job = this.queue[i];
      if (this.active.has(job.recording)) {
        i++;
        continue;
      }
      this.queue.splice(i, 1);
      this.active.add(job.recording);
      void job.run();
    }
  }
}
