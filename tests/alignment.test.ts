import { expect, it } from "vitest";
import {
  alignRecordings,
  bodyFingerprint,
  canonicalJSON,
  type RequestSpan,
} from "../packages/domain/stitching";
import {
  handlerPlanSchema,
  probeExpression,
  parseHandlerHits,
  parseRequestDetail,
} from "../packages/replay/request-evidence";
const span = (
  recordingId: string,
  id: string,
  start: number,
  end?: number,
  bodyHash?: string,
): RequestSpan => ({
  recordingId,
  id,
  start,
  end,
  bodyHash,
  method: "POST",
  url: "https://recorded.test/api/messages",
  point: { recordingId, executionPoint: id },
});
it("derives independent browser offsets against the same backend clock", () => {
  const f = [
    span("maya", "1", 100, 125, "a"),
    span("maya", "2", 200, 225, "b"),
    span("leo", "3", 100, 130, "c"),
    span("leo", "4", 200, 230, "d"),
  ];
  const b = [
    span("backend", "11", 345, undefined, "a"),
    span("backend", "12", 450, undefined, "b"),
    span("backend", "13", 1200, undefined, "c"),
    span("backend", "14", 1305, undefined, "d"),
  ];
  const result = alignRecordings(f, b, ["maya", "leo"]);
  expect(result.correlations).toHaveLength(4);
  expect(result.clocks[0]).toMatchObject({
    status: "aligned",
    lower: 225,
    upper: 245,
    offset: 235,
    uncertainty: 10,
  });
  expect(result.clocks[1]).toMatchObject({
    status: "aligned",
    lower: 1075,
    upper: 1100,
    offset: 1087.5,
  });
});
it("does not align repeated URLs or empty payloads", async () => {
  expect(await bodyFingerprint({})).toBeUndefined();
  expect(await bodyFingerprint("{}")).toBeUndefined();
  expect(
    alignRecordings([span("f", "1", 100, 120)], [span("b", "2", 110)], ["f"])
      .clocks[0].status,
  ).toBe("unmatched");
});
it("checks uniqueness across ALL browsers, not separately per browser", () => {
  expect(
    alignRecordings(
      [span("a", "1", 100, 120, "same"), span("b", "2", 100, 120, "same")],
      [span("s", "3", 110, undefined, "same")],
      ["a", "b"],
    ).correlations,
  ).toHaveLength(0);
});
it("rejects duplicate backend handling and retries rather than picking a hit", () => {
  expect(
    alignRecordings(
      [span("a", "1", 100, 120, "same")],
      [
        span("s", "3", 110, undefined, "same"),
        span("s", "4", 111, undefined, "same"),
      ],
      ["a"],
    ).correlations,
  ).toHaveLength(0);
});
it("does not claim synchronization from one anchor", () => {
  expect(
    alignRecordings(
      [span("a", "1", 100, 120, "a")],
      [span("s", "3", 110, undefined, "a")],
      ["a"],
    ).clocks[0],
  ).toMatchObject({ status: "insufficient", anchors: 1 });
});
it("rejects contradictory matched event ordering rather than hiding outliers", () => {
  const r = alignRecordings(
    [span("a", "1", 100, 120, "a"), span("a", "2", 200, 220, "b")],
    [span("s", "3", 110, undefined, "a"), span("s", "4", 99, undefined, "b")],
    ["a"],
  );
  expect(r.clocks[0].status).toBe("conflict");
  expect(r.clocks[0].offset).toBeUndefined();
});
it("handles negative offsets and refuses unfinished requests", () => {
  const r = alignRecordings(
    [
      span("a", "1", 100, 120, "a"),
      span("a", "2", 200, 220, "b"),
      span("a", "3", 300, undefined, "c"),
    ],
    [
      span("s", "4", 50, undefined, "a"),
      span("s", "5", 150, undefined, "b"),
      span("s", "6", 250, undefined, "c"),
    ],
    ["a"],
  );
  expect(r.clocks[0].offset).toBe(-60);
  expect(r.correlations).toHaveLength(2);
});
it("normalizes JSON object keys but preserves arrays and URL query semantics", async () => {
  expect(await bodyFingerprint('{"b":2,"a":1}')).toBe(
    await bodyFingerprint({ a: 1, b: 2 }),
  );
  expect(canonicalJSON([1, 2])).not.toBe(canonicalJSON([2, 1]));
  const f = { ...span("a", "1", 1, 2, "a"), url: "https://site/x?a=1&a=2" };
  const b = {
    ...span("s", "2", 1, undefined, "a"),
    url: "https://site/x?a=2&a=1",
  };
  expect(alignRecordings([f], [b], ["a"]).correlations).toHaveLength(0);
});
it("never uses trace ID alone across different parent spans", () => {
  const f = {
    ...span("a", "1", 100, 120),
    traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1111111111111111-01",
  };
  const b = {
    ...span("b", "2", 110),
    traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-2222222222222222-01",
  };
  expect(alignRecordings([f], [b], ["a"]).correlations).toHaveLength(0);
});
it("parses recorded request payloads without storing alias points as stable references", () => {
  expect(
    parseRequestDetail(
      'Initiated at Point:12 @ 1603.00ms\n<requestBody>\n{"clientId":"x"}\n</requestBody>',
    ),
  ).toEqual({ point: "Point:12", body: { clientId: "x" } });
});
it("accepts only binding identifiers, never model-provided executable code", () => {
  expect(() =>
    handlerPlanSchema.parse({
      probes: [
        {
          path: "worker.js",
          line: 3,
          requestBinding: 'req; fetch("evil")',
          style: "fetch",
          reason: "x",
        },
      ],
    }),
  ).toThrow();
  expect(
    probeExpression({
      path: "worker.js",
      line: 3,
      requestBinding: "req",
      bodyBinding: "payload",
      style: "fetch",
      reason: "x",
    }),
  ).toContain("body:payload");
});
it("drops invalid probe hits and hashes payloads instead of persisting raw bodies", async () => {
  const r = await parseHandlerHits(
    "backend",
    {
      path: "worker.js",
      line: 3,
      requestBinding: "req",
      bodyBinding: "payload",
      style: "fetch",
      reason: "x",
    },
    {
      hits: [
        {
          point: "123",
          timeMs: 32,
          result: JSON.stringify({
            method: "POST",
            url: "/api/messages",
            body: { clientId: "x" },
          }),
        },
        { point: "124", timeMs: 33, result: "ReferenceError: not initialized" },
      ],
    },
  );
  expect(r).toHaveLength(1);
  expect(r[0].bodyHash).toHaveLength(64);
  expect(JSON.stringify(r)).not.toContain("clientId");
});

import { mapClock } from "../packages/domain/stitching";
import { displayTime, recordingTime } from "../packages/domain/types";
it("uses real sample event timing to discover a nonconstant mapping without hardcoded IDs or routes", () => {
  const f = [
    span("maya", "1", 1603, 1628, "a"),
    span("maya", "2", 3254, 3271, "b"),
    span("maya", "3", 5202, 5219, "c"),
    span("leo", "4", 2002, 2021, "d"),
    span("leo", "5", 4187, 4205, "e"),
  ];
  const b = [
    span("backend", "11", 1846.8815028901734, undefined, "a"),
    span("backend", "12", 3505.202216066482, undefined, "b"),
    span("backend", "13", 5445.137157107232, undefined, "c"),
    span("backend", "14", 2682.86, undefined, "d"),
    span("backend", "15", 5308.404494382023, undefined, "e"),
  ];
  const result = alignRecordings(f, b, ["maya", "leo"]);
  for (const clock of result.clocks) {
    expect(clock).toMatchObject({
      status: "aligned",
      model: clock.recordingId === "maya" ? "offset" : "events",
    });
    for (const p of clock.points ?? []) {
      expect(mapClock(clock, p.localTime)).toBeCloseTo(p.sharedTime);
      expect(mapClock(clock, p.sharedTime, true)).toBeCloseTo(p.localTime);
    }
    for (const time of [0, 500, 2100, 4000, 6000])
      expect(mapClock(clock, mapClock(clock, time), true)).toBeCloseTo(time);
  }
  const pair: any = {
    backend_id: "backend",
    data: {
      offset: 10,
      browsers: result.clocks.map((c) => ({
        id: c.recordingId,
        clock: c,
        offset: c.offset! + 10,
      })),
    },
  };
  const local = 3500;
  expect(
    recordingTime(pair, "maya", displayTime(pair, "maya", local)),
  ).toBeCloseTo(local);
  expect(displayTime(pair, "backend", local)).toBe(3510);
});
it("supports overlapping requests without confusing dispatch order with completion order", () => {
  const result = alignRecordings(
    [
      span("a", "1", 100, 200, "a"),
      span("a", "2", 110, 130, "b"),
      span("a", "3", 1000, 1020, "c"),
    ],
    [
      span("s", "4", 300, undefined, "a"),
      span("s", "5", 310, undefined, "b"),
      span("s", "6", 1500, undefined, "c"),
    ],
    ["a"],
  );
  expect(result.clocks[0]).toMatchObject({
    status: "aligned",
    model: "events",
  });
  for (const p of result.clocks[0].points!) {
    expect(p.localTime).toBeGreaterThanOrEqual(p.localStart);
    expect(p.localTime).toBeLessThanOrEqual(p.localEnd);
  }
});
it("retains network requests without JS initiators for uniqueness and alignment", () => {
  const a = { ...span("a", "1", 100, 120, "x"), point: undefined };
  const b = span("a", "2", 200, 220, "y");
  const backend = [
    span("s", "3", 110, undefined, "x"),
    span("s", "4", 210, undefined, "y"),
  ];
  const result = alignRecordings([a, b], backend, ["a"]);
  expect(result.clocks[0].status).toBe("aligned");
  expect(result.correlations[0].frontendPoint).toBeUndefined();
  expect(result.correlations[0].frontendRecordingId).toBe("a");
  expect(
    alignRecordings(
      [
        a,
        {
          ...a,
          id: "duplicate",
          point: { recordingId: "a", executionPoint: "5" },
        },
      ],
      backend,
      ["a"],
    ).correlations,
  ).toHaveLength(0);
});
it("uses propagated IDs to disambiguate otherwise identical payloads", () => {
  const f = [
    { ...span("a", "1", 100, 120, "same"), requestId: "one" },
    { ...span("a", "2", 200, 220, "same"), requestId: "two" },
  ];
  const b = [
    { ...span("s", "3", 110, undefined, "same"), requestId: "one" },
    { ...span("s", "4", 210, undefined, "same"), requestId: "two" },
  ];
  const result = alignRecordings(f, b, ["a"]);
  expect(result.correlations).toHaveLength(2);
  expect(result.clocks[0].status).toBe("aligned");
});
it("rejects conflicting identity evidence and many-to-one matches", () => {
  const f = [{ ...span("a", "1", 100, 120, "x"), requestId: "one" }];
  const b = [
    { ...span("s", "3", 110, undefined, "y"), requestId: "one" },
    span("s", "4", 111, undefined, "x"),
  ];
  expect(alignRecordings(f, b, ["a"]).correlations).toHaveLength(0);
  const fronts = [
    { ...span("a", "1", 100, 120), requestId: "one" },
    span("b", "2", 100, 120, "x"),
  ];
  const backs = [{ ...span("s", "3", 110, undefined, "x"), requestId: "one" }];
  expect(alignRecordings(fronts, backs, ["a", "b"]).correlations).toHaveLength(
    0,
  );
});
