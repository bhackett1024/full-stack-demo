import { describe, expect, it } from "vitest";
import {
  investigationContext,
  shouldFinish,
  mergeTimelineMarkers,
  usageCounts,
  cachedMessages,
  modelToolContent,
} from "../packages/domain/investigation";
import type { Pair } from "../packages/domain/types";
describe("investigation context and finishing", () => {
  it("keeps the prompt bounded independently of screenshot count and preparation telemetry", () => {
    const pair = {
      frontend_id: "browser",
      backend_id: "server",
      data: {
        duration: 5000,
        correlations: [],
        mappingRevision: 2,
        shots: Array.from({ length: 10000 }, () => ({
          point: "huge-point",
          time: 50,
        })),
        preparation: { payload: "x".repeat(100000) },
      },
    } as unknown as Pair;
    const question = {
      text: "What happened?",
      context: { time: 100, mappingRevision: 2, mapping: pair.data },
    };
    const text = JSON.stringify(investigationContext(pair, question));
    expect(text.length).toBeLessThan(1500);
    expect(text).not.toContain("huge-point");
    expect(text).not.toContain("preparation");
    expect(text).toContain("browser");
    expect(text).toContain("server");
  });
  it("reserves a concluding turn instead of throwing away a completed response", () => {
    expect(shouldFinish(5, 10, 150001, 10000)).toBe(true);
    expect(shouldFinish(100, 0, 0, 0)).toBe(true);
    expect(shouldFinish(2, 100, 0, 0)).toBe(true);
    expect(shouldFinish(2, 10, 20000, 60000)).toBe(false);
    expect(shouldFinish(40, 99, 20000, 60000)).toBe(false);
    expect(shouldFinish(14, 38, 20000, 60000)).toBe(false);
  });
  it("records cache usage separately and does not mutate durable conversation history", () => {
    expect(
      usageCounts({
        input_tokens: 100,
        output_tokens: 20,
        cache_read_input_tokens: 1000,
        cache_creation_input_tokens: 200,
      }),
    ).toEqual({ input: 100, output: 20, cacheRead: 1000, cacheWrite: 200 });
    const messages = [
      { role: "user", content: "question" },
      { role: "assistant", content: [{ type: "text", text: "progress" }] },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "t1", content: "evidence" },
        ],
      },
    ];
    const prepared = cachedMessages(messages);
    expect(prepared.at(-1).content[0].cache_control).toEqual({
      type: "ephemeral",
    });
    expect(messages.at(-1)?.content).toEqual([
      { type: "tool_result", tool_use_id: "t1", content: "evidence" },
    ]);
  });
  it("strips MCP envelope metadata and bounds large model-facing results", () => {
    expect(
      modelToolContent({
        ok: true,
        result: {
          _meta: { operator: "secret-internal" },
          content: [{ type: "text", text: "Evidence" }],
        },
      }),
    ).toBe("Evidence");
    expect(
      modelToolContent({ ok: true, result: "x".repeat(50000) }).length,
    ).toBeLessThan(12200);
    expect(
      modelToolContent({
        ok: true,
        result: { evidenceId: "e1", point: { executionPoint: "123" } },
      }),
    ).toContain('"evidenceId":"e1"');
  });
});

it("retains saved points when final publication omits markers and deduplicates revised labels", () => {
  const marker = {
    id: "a",
    point: { recordingId: "browser", executionPoint: "123" },
    time: 1,
    runtime: "frontend" as const,
    label: "Initial",
    description: "Initial",
    evidenceIds: ["e1"],
  };
  expect(mergeTimelineMarkers([marker], [])).toEqual([marker]);
  const updated = { ...marker, id: "final", label: "Updated" };
  expect(mergeTimelineMarkers([marker], [updated])).toEqual([updated]);
  expect(
    mergeTimelineMarkers(
      [marker],
      [
        {
          ...marker,
          id: "backend",
          point: { recordingId: "server", executionPoint: "123" },
        },
      ],
    ),
  ).toHaveLength(2);
});
