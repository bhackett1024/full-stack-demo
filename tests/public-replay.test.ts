import { expect, it } from "vitest";
import { ReplayMCP } from "../packages/replay/mcp";
it("omits Authorization on all anonymous MCP requests, including session cleanup", async () => {
  const requests: RequestInit[] = [];
  const transport: typeof fetch = async (_url, init) => {
    requests.push(init!);
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    const body = JSON.parse(String(init?.body));
    if (body.method === "notifications/initialized")
      return new Response(null, { status: 202 });
    return Response.json(
      {
        jsonrpc: "2.0",
        id: body.id,
        result: body.method === "tools/list" ? { tools: [] } : {},
      },
      { headers: { "Mcp-Session-Id": "test-session" } },
    );
  };
  const client = new ReplayMCP(undefined, transport);
  await client.tools();
  await client.close();
  expect(requests).toHaveLength(4);
  for (const request of requests)
    expect(new Headers(request.headers).has("Authorization")).toBe(false);
});
it("binds the default fetch transport for Cloudflare Workers", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async function (this: unknown, _input, init) {
    expect(this).toBe(globalThis);
    const body = JSON.parse(String(init?.body));
    if (body.method === "notifications/initialized")
      return new Response(null, { status: 202 });
    return Response.json({
      jsonrpc: "2.0",
      id: body.id,
      result: body.method === "tools/list" ? { tools: [] } : {},
    });
  };
  try {
    await new ReplayMCP().tools();
  } finally {
    globalThis.fetch = original;
  }
});
