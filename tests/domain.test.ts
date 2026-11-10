import { describe, it, expect } from "vitest";
import {
  offsetBounds,
  screenshotAt,
  pointSchema,
  belongs,
  questionSchema,
} from "../packages/domain/types";
import { sampleData, sampleInspection } from "../packages/domain/samples";
import { displayValue, mergeData } from "../packages/replay/protocol";
import { ReplayMCP, resolvePointLink } from "../packages/replay/mcp";
describe("independent recording identities", () => {
  it("preserves execution points larger than Number.MAX_SAFE_INTEGER", () => {
    expect(
      pointSchema.parse({
        recordingId: "front",
        executionPoint: "99999999999999999999999999",
      }).executionPoint,
    ).toBe("99999999999999999999999999");
  });
  it("rejects context from a different recording", () => {
    expect(
      belongs({ frontend_id: "front", backend_id: "back" } as any, {
        recordingId: "other",
        executionPoint: "1",
      }),
    ).toBe(false);
  });
  it("does not substitute a future screenshot", () => {
    expect(screenshotAt([{ time: 100 }, { time: 300 }], 250)?.time).toBe(100);
    expect(screenshotAt([{ time: 100 }], 99)).toBeUndefined();
  });
  it("bounds clock alignment by transit time", () => {
    expect(
      offsetBounds([
        {
          frontendSend: 100,
          frontendReceive: 190,
          backendReceive: 80,
          backendSend: 130,
        },
      ]),
    ).toEqual({ lower: 20, upper: 60, offset: 40, uncertainty: 20 });
  });
  it("rejects contradictory timing anchors", () => {
    expect(
      offsetBounds([
        {
          frontendSend: 100,
          frontendReceive: 190,
          backendReceive: 80,
          backendSend: 130,
        },
        {
          frontendSend: 100,
          frontendReceive: 190,
          backendReceive: 0,
          backendSend: 30,
        },
      ]),
    ).toBeNull();
  });
  it("rejects negative cursor times and missing idempotency keys", () => {
    expect(
      questionSchema.safeParse({
        text: "Why?",
        context: { time: -1, mappingRevision: 1 },
      }).success,
    ).toBe(false);
  });
});
describe("debugger state", () => {
  it("preserves special values and missing state", () => {
    expect(displayValue({})).toBe("undefined");
    expect(displayValue({ unavailable: true })).toBe("(unavailable)");
    expect(displayValue({ value: null })).toBe(null);
    expect(displayValue({ bigint: "99999999999999" })).toBe("99999999999999n");
    expect(displayValue({ unserializableNumber: "NaN" })).toBe("NaN");
  });
  it("merges expanded objects without dropping existing pause data", () => {
    const data: any = { objects: [{ objectId: "a", className: "Object" }] };
    mergeData(data, {
      objects: [
        { objectId: "a", className: "Object", preview: { properties: [] } },
        { objectId: "b", className: "Array" },
      ],
    });
    expect(data.objects).toHaveLength(2);
    expect(data.objects[0].preview).toBeDefined();
  });
  it("has distinct source and variables for selected caller frames", () => {
    const p = sampleData("checkout").markers[3].point;
    const first = sampleInspection(p);
    const caller = sampleInspection(p, "1");
    expect(first.source).toContain("total: subtotal");
    expect(caller.source).not.toBe(first.source);
    expect(caller.scopes[0].values[0].name).toBe("context");
  });
});
describe("MCP adapter", () => {
  it("does not persist unresolved session aliases", () => {
    expect(
      resolvePointLink({
        url: "https://app.replay.io/recording/a?point=Point:42",
      }),
    ).toBeNull();
    expect(
      resolvePointLink({
        url: "https://app.replay.io/recording/a?point=999999999999999999",
      }),
    ).toBe("999999999999999999");
    expect(
      resolvePointLink({ url: "https://attacker.example/?point=123" }),
    ).toBeNull();
  });
  it("initializes, propagates session identity, and reads streamed JSON-RPC", async () => {
    const seen: any[] = [];
    const transport: any = async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      seen.push({ body, headers: init.headers });
      if (body.method === "notifications/initialized")
        return new Response(null, { status: 202 });
      if (body.method === "initialize")
        return Response.json(
          {
            jsonrpc: "2.0",
            id: body.id,
            result: { protocolVersion: "2025-03-26", capabilities: {} },
          },
          { headers: { "Mcp-Session-Id": "session-test" } },
        );
      return new Response(
        `event: message\r\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "GetStack" }] } })}\r\n\r\n`,
        { headers: { "Content-Type": "text/event-stream" } },
      );
    };
    const client = new ReplayMCP("test-key", transport);
    expect(await client.tools()).toEqual([{ name: "GetStack" }]);
    expect(seen[2].headers["Mcp-Session-Id"]).toBe("session-test");
    expect(seen[1].body.id).toBeUndefined();
  });
});
