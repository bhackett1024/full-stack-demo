import type { Marker } from "./types";

export function eventCursor(params: URLSearchParams) {
  if (
    [...params.keys()].some(
      (key) => key.startsWith("afterSequence") && key !== "afterSequence",
    ) ||
    params.getAll("afterSequence").length > 1
  )
    throw new Error("Invalid event cursor");
  const raw = params.get("afterSequence") ?? "0";
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value))
    throw new Error("Invalid event cursor");
  return value;
}

// Allocate rows by horizontal extent so even simultaneous points remain clickable.
export function layoutPoints(markers: Marker[], duration: number) {
  const ends: number[] = [];
  const points = [...markers]
    .sort((a, b) => a.time - b.time)
    .map((marker) => {
      const left = Math.min(
        84,
        Math.max(0, (marker.time / (duration || 1)) * 100),
      );
      let row = ends.findIndex((end) => end + 1 <= left);
      if (row < 0) row = ends.length;
      ends[row] = left + 16;
      return {
        marker,
        left,
        row,
        anchor: Math.min(
          100,
          Math.max(0, (marker.time / (duration || 1)) * 100),
        ),
      };
    });
  return { points, height: 28 + Math.max(1, ends.length) * 28 };
}
export function filmstripFrames<T extends { time: number }>(
  frames: T[],
  duration: number,
  zoom: number,
) {
  const gap = 8 / zoom;
  const position = (time: number) =>
    Math.min(100 - 6 / zoom, (time / (duration || 1)) * 100);
  const picked: T[] = [];
  for (const frame of frames) {
    if (
      !picked.length ||
      position(frame.time) - position(picked.at(-1)!.time) >= gap
    )
      picked.push(frame);
  }
  const last = frames.at(-1);
  if (last && picked.at(-1) !== last) {
    if (picked.length > 1) picked.pop();
    if (
      !picked.length ||
      position(last.time) - position(picked.at(-1)!.time) >= gap
    )
      picked.push(last);
  }
  return picked;
}
