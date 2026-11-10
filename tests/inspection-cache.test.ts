import { expect, it } from "vitest";
import {
  InspectionCache,
  type InspectionData,
} from "../apps/web/inspection-cache";
const point = (recordingId: string, executionPoint: string) => ({
  recordingId,
  executionPoint,
});
const data = {} as InspectionData;
function deferred() {
  let resolve!: (v: InspectionData) => void;
  const promise = new Promise<InspectionData>((r) => (resolve = r));
  return { promise, resolve };
}
it("deduplicates preloading and clicks and returns completed snapshots synchronously", async () => {
  let calls = 0;
  const d = deferred();
  const cache = new InspectionCache(() => {
    calls++;
    return d.promise;
  });
  const p = point("a", "1");
  const preload = cache.load(p);
  const click = cache.load(p, 0, true);
  expect(click).toBe(preload);
  expect(calls).toBe(1);
  d.resolve(data);
  await click;
  expect(cache.peek(p)).toBe(data);
  await cache.load(p);
  expect(calls).toBe(1);
});
it("serializes each recording while loading independent recordings concurrently", async () => {
  const calls: string[] = [];
  const gates = [deferred(), deferred(), deferred()];
  const cache = new InspectionCache(async (p) => {
    calls.push(p.recordingId + p.executionPoint);
    return gates[calls.length - 1].promise;
  });
  const a = cache.load(point("a", "1")),
    b = cache.load(point("a", "2")),
    c = cache.load(point("b", "1"));
  expect(calls).toEqual(["a1", "b1"]);
  gates[0].resolve(data);
  await a;
  expect(calls).toEqual(["a1", "b1", "a2"]);
  gates[1].resolve(data);
  gates[2].resolve(data);
  await Promise.all([b, c]);
});
it("prioritizes a clicked point ahead of queued background work", async () => {
  const calls: string[] = [];
  const first = deferred();
  const cache = new InspectionCache(async (p) => {
    calls.push(p.executionPoint);
    return p.executionPoint === "1" ? first.promise : data;
  });
  const tasks = [
    cache.load(point("a", "1")),
    cache.load(point("a", "2")),
    cache.load(point("a", "3")),
  ];
  cache.load(point("a", "3"), 0, true);
  first.resolve(data);
  await Promise.all(tasks);
  expect(calls).toEqual(["1", "3", "2"]);
});
it("retries failures and separates frames and recordings", async () => {
  let calls = 0;
  const cache = new InspectionCache(async () => {
    if (++calls === 1) throw new Error("temporary");
    return data;
  });
  const p = point("a", "1");
  await expect(cache.load(p)).rejects.toThrow("temporary");
  expect(cache.peek(p)).toBeUndefined();
  await cache.load(p);
  await cache.load(p, 1);
  await cache.load(point("b", "1"));
  expect(calls).toBe(4);
});
