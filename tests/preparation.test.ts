import { describe, expect, it } from "vitest";
import {
  prepared,
  PREPARATION_VERSION,
  scanPercent,
  preparationMessage,
} from "../packages/domain/preparation";
import type { Pair } from "../packages/domain/types";
describe("recording loading gate", () => {
  const pair = {
    mode: "live",
    status: "ready",
    data: { shots: [{ time: 0 }] },
  } as Pair;
  it("does not expose manually imported or partial data before preparation", () => {
    expect(prepared(pair)).toBe(false);
    for (const status of ["preparing", "error", "new"])
      expect(
        prepared({
          ...pair,
          status,
          data: { ...pair.data, preparedVersion: PREPARATION_VERSION },
        }),
      ).toBe(false);
  });
  it("opens fully prepared groups and offline samples", () => {
    expect(
      prepared({
        ...pair,
        data: { ...pair.data, preparedVersion: PREPARATION_VERSION },
      }),
    ).toBe(true);
    expect(prepared({ ...pair, mode: "sample" })).toBe(true);
  });
  it("never invents scan progress during unknown phases", () => {
    expect(
      scanPercent({
        recordingId: "r",
        label: "Browser",
        state: "processing",
        phase: "analyzing",
      }),
    ).toBeUndefined();
    expect(
      scanPercent({
        recordingId: "r",
        label: "Browser",
        state: "processing",
        scan: { done: false, percent: null },
      }),
    ).toBeUndefined();
    expect(
      scanPercent({
        recordingId: "r",
        label: "Browser",
        state: "processing",
        scan: { done: false, percent: 42.5 },
      }),
    ).toBe(42.5);
  });
});

it("explains timeouts without displaying internal workflow exceptions", () => {
  expect(
    preparationMessage(
      "WorkflowTimeoutError: Execution timed out after 120000ms",
    ),
  ).toBe(
    "Replay is taking longer than expected to load these recordings. Retry to check its latest progress.",
  );
  expect(preparationMessage("Error: workflow failed")).not.toContain("Error:");
  expect(preparationMessage("Recording not found")).toBe("Recording not found");
});
