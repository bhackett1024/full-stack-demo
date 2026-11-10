import { describe, expect, it, vi } from "vitest";
import { evaluatePointExpressions } from "../packages/replay/point-expressions";
import { markerSchema } from "../packages/domain/types";

const point = { recordingId: "backend", executionPoint: "123456789" };
const content = (text: string) => ({ content: [{ type: "text", text }] });
describe("point expressions", () => {
  it("evaluates each expression in the exact recorded top frame and preserves order", async () => {
    const evaluate = vi.fn(async ({ expression }) =>
      content(expression === "user.id" ? "maya" : "false"),
    );
    const expressions = [
      { expression: "user.id", label: "User" },
      { expression: "allowed" },
    ];
    const results = await evaluatePointExpressions(
      point,
      expressions,
      evaluate,
    );
    expect(results).toEqual([
      { ...expressions[0], status: "complete", result: "maya" },
      { ...expressions[1], status: "complete", result: "false" },
    ]);
    for (let i = 0; i < expressions.length; i++)
      expect(evaluate.mock.calls[i][0]).toEqual({
        recordingId: "backend",
        point: "123456789",
        expression: expressions[i].expression,
        mode: "single-point",
        scope: "frame",
        maxStringLength: 12000,
      });
    const marker = {
      id: "m",
      point,
      time: 1,
      runtime: "backend",
      label: "Authorization",
      description: "Authorization decision",
      evidenceIds: ["e"],
      expressions: results,
    };
    expect(
      markerSchema.parse(JSON.parse(JSON.stringify(marker))).expressions,
    ).toEqual(results);
  });
  it("preserves successful values when another expression or its transport fails", async () => {
    const results = await evaluatePointExpressions(
      point,
      [
        { expression: "missing" },
        { expression: "timeout" },
        { expression: "count" },
      ],
      async ({ expression }) => {
        if (expression === "missing")
          return { ...content("ReferenceError: missing"), isError: true };
        if (expression === "timeout") throw new Error("Request timed out");
        return content("0");
      },
    );
    expect(results.map((r) => r.status)).toEqual([
      "error",
      "error",
      "complete",
    ]);
    expect(results[0].error).toContain("ReferenceError");
    expect(results[1].error).toBe("Request timed out");
    expect(results[2].result).toBe("0");
  });
  it("does not evaluate anything when no data is relevant", async () => {
    const evaluate = vi.fn();
    expect(await evaluatePointExpressions(point, [], evaluate)).toEqual([]);
    expect(evaluate).not.toHaveBeenCalled();
  });
  it("bounds durable values and errors so large results cannot break timeline publication", async () => {
    const results = await evaluatePointExpressions(
      point,
      [{ expression: "large" }, { expression: "error" }],
      async ({ expression }) => {
        if (expression === "error") throw new Error("e".repeat(50000));
        return content("x".repeat(50000));
      },
    );
    expect(results[0].result).toHaveLength(16019);
    expect(results[0].result).toContain("[Result truncated]");
    expect(results[1].error).toHaveLength(2000);
  });
});
