const endpoint = "https://dispatch.replay.io/nut/mcp";
export class ReplayMCP {
  private session: string | undefined;
  private nextId = 1;
  private initialized = false;
  constructor(
    private key?: string,
    private transport: typeof fetch = fetch.bind(globalThis),
  ) {}
  private async rpc(
    method: string,
    params: unknown,
    notification = false,
  ): Promise<any> {
    const id = this.nextId++;
    const response = await this.transport(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(this.key ? { Authorization: `Bearer ${this.key}` } : {}),
        "MCP-Protocol-Version": "2025-03-26",
        ...(this.session ? { "Mcp-Session-Id": this.session } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        ...(!notification ? { id } : {}),
        method,
        params,
      }),
      signal: AbortSignal.timeout(300000),
    });
    if (!response.ok)
      throw new Error(`Replay MCP ${method}: HTTP ${response.status}`);
    this.session = response.headers.get("Mcp-Session-Id") ?? this.session;
    if (notification || response.status === 202) return null;
    let payload: any;
    if (response.headers.get("content-type")?.includes("text/event-stream")) {
      if (!response.body) throw new Error("Empty MCP stream");
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value ?? new Uint8Array(), {
            stream: !done,
          });
          if (buffer.length > 8_000_000)
            throw new Error(
              "MCP response exceeds the 8 MB limit; narrow the query",
            );
          buffer = buffer.replace(/\r\n/g, "\n");
          let boundary;
          while ((boundary = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const data = block
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trimStart())
              .join("\n");
            if (data) {
              const message = JSON.parse(data);
              if (message.id === id) {
                payload = message;
                break;
              }
            }
          }
          if (payload || done) break;
        }
      } finally {
        await reader.cancel();
      }
    } else payload = await response.json();
    if (!payload) throw new Error("Replay MCP ended without a response");
    if (payload.error) throw new Error(`Replay MCP: ${payload.error.message}`);
    return payload.result;
  }
  async init() {
    if (!this.initialized) {
      await this.rpc("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "threadline", version: "0.1.0" },
      });
      await this.rpc("notifications/initialized", {}, true);
      this.initialized = true;
    }
  }
  async tools() {
    await this.init();
    const all: any[] = [];
    let cursor;
    do {
      const result = await this.rpc("tools/list", cursor ? { cursor } : {});
      all.push(...result.tools);
      cursor = result.nextCursor;
    } while (cursor);
    return all;
  }
  async call(name: string, args: Record<string, unknown>) {
    await this.init();
    const result = await this.rpc("tools/call", { name, arguments: args });
    if (result.isError)
      throw new Error(
        `Replay tool ${name} failed: ${textResult(result).slice(0, 500)}`,
      );
    return result;
  }
  async close() {
    if (this.session)
      await this.transport(endpoint, {
        method: "DELETE",
        headers: {
          ...(this.key ? { Authorization: `Bearer ${this.key}` } : {}),
          "Mcp-Session-Id": this.session,
        },
      }).catch(() => {});
  }
}
export function textResult(result: any): string {
  return (result.content ?? [])
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("\n");
}
export function structuredResult(result: any): any {
  if (result.structuredContent) return result.structuredContent;
  const text = textResult(result).trim();
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return { text };
  }
}
export function resolvePointLink(result: any): string | null {
  const text = JSON.stringify(result);
  for (const match of text.matchAll(/https?:[^\s"<>]+/g)) {
    try {
      const url = new URL(match[0].replace(/\\/g, ""));
      if (url.hostname !== "app.replay.io") continue;
      const point =
        url.searchParams.get("point") ?? url.searchParams.get("executionPoint");
      if (point && !point.startsWith("Point:")) return point;
    } catch {}
  }
  return null;
}
export const allowedTools = new Set([
  "RecordingOverview",
  "ConsoleMessages",
  "UserInteractions",
  "NetworkRequest",
  "ListSources",
  "SearchSources",
  "ReadSource",
  "DescribePoint",
  "GetStack",
  "Logpoint",
  "Annotations",
  "UncaughtException",
  "ReactException",
  "ReactRenders",
  "ReactComponentTree",
  "Evaluate",
  "GetPointLink",
]);
