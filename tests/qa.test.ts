import { expect, it } from "vitest";
import {
  eventCursor,
  layoutPoints,
  filmstripFrames,
} from "../packages/domain/qa";
import { hasObjectReference } from "../packages/replay/protocol";
import { resizeScreenshot } from "../packages/replay/thumbnail";
import type { Marker } from "../packages/domain/types";
import jpeg from "jpeg-js";
import { encode } from "fast-png";
it("validates scalar event cursors without interpreting operator-shaped query keys", () => {
  expect(eventCursor(new URLSearchParams())).toBe(0);
  expect(eventCursor(new URLSearchParams("afterSequence=120"))).toBe(120);
  for (const query of [
    "afterSequence[$ne]=",
    "afterSequence=-1",
    "afterSequence=1.2",
    "afterSequence=",
    "afterSequence=1&afterSequence=2",
    "afterSequence=9007199254740992",
  ])
    expect(() => eventCursor(new URLSearchParams(query))).toThrow(
      "Invalid event cursor",
    );
});
it("lays simultaneous points in separate rows and clamps late points inside the lane", () => {
  const markers = [100, 100, 102, 103, 104, 1000].map(
    (time, i) => ({ id: String(i), time }) as Marker,
  );
  const { points } = layoutPoints(markers, 1000);
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++)
      if (points[i].row === points[j].row)
        expect(points[j].left - points[i].left).toBeGreaterThanOrEqual(17);
  expect(points.at(-1)!.left + 16).toBeLessThanOrEqual(100);
});
it("does not overlap the last two thumbnail timestamps", () => {
  const frames = [0, 100, 200, 300, 400, 500, 526, 535].map((time) => ({
    time,
  }));
  const picked = filmstripFrames(frames, 572, 1);
  for (let i = 1; i < picked.length; i++)
    expect(
      ((picked[i].time - picked[i - 1].time) / 572) * 100,
    ).toBeGreaterThanOrEqual(8);
  expect(picked.at(-1)?.time).toBe(535);
});
it("accepts scope-only and nested property object references but rejects unreferenced IDs", () => {
  const data = {
    scopes: [{ bindings: [{ name: "channel", object: "o1" }] }],
    frames: [{ this: { object: "o2" } }],
    objects: [
      {
        objectId: "o3",
        preview: {
          properties: [
            { name: "child", object: "o4" },
            { name: "arbitrary", value: "o5" },
          ],
        },
      },
    ],
  };
  for (const id of ["o1", "o2", "o3", "o4"])
    expect(hasObjectReference(data, id)).toBe(true);
  expect(hasObjectReference(data, "o5")).toBe(false);
  expect(hasObjectReference(data, "o6")).toBe(false);
});
it("resizes both JPEG and PNG screenshots while preserving aspect ratio", () => {
  const data = new Uint8Array(400 * 200 * 4).fill(255);
  const jpg = jpeg.encode({ width: 400, height: 200, data }, 90).data;
  const png = encode({ width: 400, height: 200, data, channels: 4 });
  for (const bytes of [jpg, png]) {
    const resized = resizeScreenshot(bytes, 192);
    const decoded = jpeg.decode(resized, { useTArray: true });
    expect(decoded.width).toBe(192);
    expect(decoded.height).toBe(96);
    expect(decoded.data[0]).toBeGreaterThan(250);
  }
});
