import { describe, expect, it } from "vitest";
import {
  belongs,
  browserRecordings,
  shotsFor,
  screenshotAt,
  displayOffset,
  importSchema,
  type Pair,
} from "../packages/domain/types";
const maya = "66cf5ba6-d6f8-4abf-8275-aad09d56d2f5",
  leo = "d2340e95-4c26-48c2-bb43-5e1c6bc5e4b3",
  backend = "7d323e5e-ed34-463a-8fa6-af195851e929";
const pair = {
  frontend_id: maya,
  backend_id: backend,
  data: {
    browsers: [
      { id: maya, label: "Maya", offset: 0 },
      { id: leo, label: "Leo", offset: 200 },
    ],
    shots: [
      { recordingId: maya, time: 300, point: "maya-frame" },
      { recordingId: leo, time: 300, localTime: 100, point: "leo-frame" },
    ],
  },
} as Pair;
describe("multiple browser recordings", () => {
  it("accepts points from every browser but rejects unrelated recordings", () => {
    for (const recordingId of [maya, leo, backend])
      expect(belongs(pair, { recordingId, executionPoint: "123" })).toBe(true);
    expect(
      belongs(pair, { recordingId: "outside", executionPoint: "123" }),
    ).toBe(false);
  });
  it("does not mix frames when browsers share a timestamp", () => {
    expect(screenshotAt(shotsFor(pair, maya), 300)?.point).toBe("maya-frame");
    expect(screenshotAt(shotsFor(pair, leo), 300)?.point).toBe("leo-frame");
    expect(screenshotAt(shotsFor(pair, leo), 299)).toBeUndefined();
  });
  it("preserves each recording's independent clock mapping", () => {
    expect(displayOffset(pair, maya)).toBe(0);
    expect(displayOffset(pair, leo)).toBe(200);
    expect(displayOffset(pair, backend)).toBeUndefined();
  });
  it("accepts named multi-browser imports and preserves legacy single-browser records", () => {
    expect(
      importSchema.parse({
        name: "Chat",
        app: "Relay",
        browsers: pair.data.browsers,
        backendId: backend,
      }).browsers,
    ).toHaveLength(2);
    expect(browserRecordings({ frontend_id: maya, data: {} } as Pair)).toEqual([
      { id: maya, label: "Browser", offset: 0 },
    ]);
  });
});
