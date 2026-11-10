import { resolveObjectPath } from "../../packages/replay/object-path";
import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import type { PauseData, Source } from "@replayio/protocol";
import {
  displayValue,
  mergeData,
  hasObjectReference,
} from "../../packages/replay/protocol";

export class ReplaySession extends DurableObject<Env> {
  private socket?: WebSocket;
  private sessionId?: string;
  private recordingId?: string;
  private next = 1;
  private generation = crypto.randomUUID();
  private pending = new Map<
    number,
    {
      resolve: (v: any) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private events: { method: string; params: any }[] = [];
  private sources = new Map<string, Source>();
  private pauses = new Map<
    string,
    { id: string; data: PauseData; token: string }
  >();
  private queue: Promise<unknown> = Promise.resolve();
  private async rpc(
    method: string,
    params: unknown = {},
    pauseId?: string,
  ): Promise<any> {
    if (!this.socket) throw new Error("Replay connection closed");
    const id = this.next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Replay ${method} timed out`));
      }, 300000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket!.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(this.sessionId ? { sessionId: this.sessionId } : {}),
          ...(pauseId ? { pauseId } : {}),
        }),
      );
    });
  }
  private reset() {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("Replay disconnected; retry inspection"));
    }
    this.pending.clear();
    this.socket = undefined;
    this.sessionId = undefined;
    this.pauses.clear();
    this.sources.clear();
    this.generation = crypto.randomUUID();
  }
  private async connectReplay(recordingId: string) {
    if (this.socket && this.recordingId === recordingId && this.sessionId)
      return;
    this.recordingId = recordingId;
    const response = await fetch("https://dispatch.replay.io", {
      headers: { Upgrade: "websocket" },
    });
    const socket = response.webSocket;
    if (!socket) throw new Error("Replay did not accept WebSocket upgrade");
    this.socket = socket;
    socket.accept();
    socket.addEventListener("message", (e) => {
      try {
        const message = JSON.parse(String(e.data));
        const pending = this.pending.get(message.id);
        if (pending) {
          this.pending.delete(message.id);
          clearTimeout(pending.timer);
          message.error
            ? pending.reject(new Error(message.error.message))
            : pending.resolve(message.result);
        } else if (message.method) {
          if (message.method === "Debugger.newSources")
            for (const s of message.params.sources)
              this.sources.set(s.sourceId, s);
          if (message.method === "Debugger.newSource")
            this.sources.set(
              message.params.source.sourceId,
              message.params.source,
            );
          if (this.events.length < 100000) this.events.push(message);
        }
      } catch {}
    });
    socket.addEventListener("close", () => this.reset());
    socket.addEventListener("error", () => this.reset());
    if (this.env.PUBLIC_DEMO !== "true" && this.env.REPLAY_API_KEY)
      await this.rpc("Authentication.setAccessToken", {
        accessToken: this.env.REPLAY_API_KEY,
      });
    this.sessionId = (
      await this.rpc("Recording.createSession", { recordingId })
    ).sessionId;
    await this.rpc("Debugger.findSources");
  }
  private async pause(point: string) {
    let pause = this.pauses.get(point);
    if (!pause) {
      const p = await this.rpc("Session.createPause", { point });
      const frames = await this.rpc("Pause.getAllFrames", {}, p.pauseId);
      const data: PauseData = {};
      mergeData(data, frames.data);
      data.frames = frames.frames
        .map((id: string) => data.frames?.find((f) => f.frameId === id))
        .filter(Boolean);
      pause = {
        id: p.pauseId,
        data,
        token: `${this.generation}:${crypto.randomUUID()}`,
      };
      this.pauses.set(point, pause);
      if (this.pauses.size > 8) {
        const [oldPoint, old] = this.pauses.entries().next().value!;
        await this.rpc("Session.releasePause", { pauseId: old.id });
        this.pauses.delete(oldPoint);
      }
    }
    return pause;
  }
  async fetch(request: Request): Promise<Response> {
    const task = this.queue.then(() => this.handle(request));
    this.queue = task.catch(() => {});
    return task;
  }
  private async objectCacheKey(point: string, locator: unknown) {
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify([point, locator])),
    );
    return (
      "object:" +
      Array.from(new Uint8Array(bytes), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("")
    );
  }
  private async saveObject(key: string, value: unknown) {
    if (
      value &&
      new TextEncoder().encode(JSON.stringify(value)).byteLength < 120000
    )
      await this.ctx.storage.put(key, value);
  }
  private async fullPreview(
    p: { id: string; data: PauseData },
    object: string,
  ) {
    mergeData(
      p.data,
      (
        await this.rpc(
          "Pause.getObjectPreview",
          { object, level: "full" },
          p.id,
        )
      ).data,
    );
    return p.data.objects?.find((o) => o.objectId === object);
  }
  private async handle(request: Request) {
    try {
      const body: any = await request.json();
      const objectCacheKey =
        body.action === "object" && body.point && body.locator
          ? await this.objectCacheKey(body.point, body.locator)
          : undefined;
      if (objectCacheKey) {
        const cached = await this.ctx.storage.get(objectCacheKey);
        if (cached) return Response.json(cached);
      }
      await this.ctx.storage.setAlarm(Date.now() + 360000);
      await this.connectReplay(body.recordingId);
      let result: any;
      if (body.action === "index") {
        this.events = [];
        await this.rpc("Graphics.findPaints");
        const paints = this.events
          .filter((e) => e.method === "Graphics.paintPoints")
          .flatMap((e) => e.params.paints);
        const endpoint = await this.rpc("Session.getEndpoint");
        const build = await this.rpc("Session.getBuildId");
        result = {
          paints,
          endpoint: endpoint.endpoint,
          buildId: build.buildId,
        };
      } else if (body.action === "capabilities") {
        result = {
          buildId: (await this.rpc("Session.getBuildId")).buildId,
          endpoint: (await this.rpc("Session.getEndpoint")).endpoint,
          sources: this.sources.size,
        };
      } else if (body.action === "screenshot") {
        result = await this.rpc("Graphics.getPaintContents", {
          point: body.point,
          mimeType: "image/jpeg",
          resizeHeight: body.height ?? 720,
        });
      } else if (body.action === "inspect") {
        const p = await this.pause(body.point);
        const findPointsId = crypto.randomUUID();
        this.events = [];
        await this.rpc("Session.findPoints", {
          findPointsId,
          pointSelector: { kind: "points", points: [body.point] },
        });
        const timestamp = this.events
          .filter(
            (e) =>
              e.method === "Session.findPointsResults" &&
              e.params.findPointsId === findPointsId,
          )
          .flatMap((e) => e.params.points)
          .find((p: any) => p.point === body.point)?.time;
        const frames = p.data.frames ?? [];
        const selected =
          body.frameIndex !== undefined
            ? frames[body.frameIndex]
            : (frames.find((f) => f.frameId === body.frameId) ?? frames[0]);
        if (!selected)
          throw new Error("No JavaScript frame is available at this point");
        for (const scope of selected.originalScopeChain ?? selected.scopeChain)
          mergeData(
            p.data,
            (await this.rpc("Pause.getScope", { scope }, p.id)).data,
          );
        const location = selected.location[selected.location.length - 1];
        const source = await this.rpc("Debugger.getSourceContents", {
          sourceId: location.sourceId,
        });
        result = {
          point: { recordingId: body.recordingId, executionPoint: body.point },
          inspectionToken: p.token,
          localTime: timestamp,
          frames: frames.map((f) => {
            const l = f.location[f.location.length - 1];
            return {
              id: f.frameId,
              name: f.originalFunctionName ?? f.functionName ?? f.type,
              source: this.sources.get(l.sourceId)?.url ?? l.sourceId,
              line: l.line,
              column: l.column,
            };
          }),
          selectedFrame: selected.frameId,
          source: source.contents,
          line: location.line,
          scopes: (selected.originalScopeChain ?? selected.scopeChain)
            .map((id) => {
              const scope = p.data.scopes?.find((s) => s.scopeId === id);
              return {
                name: scope?.type ?? "Scope",
                values:
                  scope?.bindings?.map((v) => ({
                    name: v.name,
                    value: displayValue(v),
                    objectId: v.object,
                    unavailable: v.unavailable,
                  })) ??
                  (scope?.object
                    ? [
                        {
                          name: "scope",
                          value: { objectId: scope.object },
                          objectId: scope.object,
                        },
                      ]
                    : [{ name: "scope", value: "(unavailable)" }]),
              };
            })
            .concat([
              {
                name: "Frame",
                values: [
                  {
                    name: "this",
                    value: displayValue(selected.this),
                    objectId: selected.this.object,
                    unavailable: selected.this.unavailable,
                  },
                ],
              },
            ]),
          objects: Object.fromEntries(
            (p.data.objects ?? []).map((o) => [o.objectId, o]),
          ),
        };
        result.objectPreviews = {};
        const roots = result.scopes
          .flatMap((scope: any, scopeIndex: number) =>
            scope.values.map((value: any) => {
              value.locator = {
                frameIndex: frames.indexOf(selected),
                scopeIndex,
                name: value.name,
                path: [],
              };
              return value;
            }),
          )
          .filter((value: any) => value.objectId);
        // Preload visible roots while the inspector is loading. Nested objects use
        // stable variable paths, never expired pause-local object identifiers.
        for (let i = 0; body.preloadObjects && i < roots.length; i += 8) {
          await Promise.all(
            roots.slice(i, i + 8).map(async (value: any) => {
              const key = await this.objectCacheKey(body.point, value.locator);
              const cached = await this.ctx.storage.get(key);
              try {
                const preview =
                  cached ?? (await this.fullPreview(p, value.objectId));
                if (preview) {
                  result.objectPreviews[value.objectId] = preview;
                  if (!cached) await this.saveObject(key, preview);
                }
              } catch {
                /* Allow a failed preview to retry when expanded. */
              }
            }),
          );
        }
      } else if (body.action === "object" && body.point && body.locator) {
        const p = await this.pause(body.point);
        result = await resolveObjectPath(
          p.data.frames ?? [],
          body.locator,
          async (scope) => {
            mergeData(
              p.data,
              (await this.rpc("Pause.getScope", { scope }, p.id)).data,
            );
            return p.data.scopes?.find((s) => s.scopeId === scope);
          },
          (object) => this.fullPreview(p, object),
        );
        if (objectCacheKey) await this.saveObject(objectCacheKey, result);
      } else if (body.action === "object") {
        const p = [...this.pauses.values()].find(
          (p) => p.token === body.inspectionToken,
        );
        if (!p)
          return Response.json(
            { error: "Inspection expired. Reselect the execution point." },
            { status: 409 },
          );
        if (!hasObjectReference(p.data, body.objectId))
          throw new Error("Object is not part of this inspection");
        mergeData(
          p.data,
          (
            await this.rpc(
              "Pause.getObjectPreview",
              { object: body.objectId, level: "full" },
              p.id,
            )
          ).data,
        );
        result = p.data.objects?.find((o) => o.objectId === body.objectId);
      } else throw new Error("Unknown inspection action");
      this.events = [];
      await this.ctx.storage.setAlarm(Date.now() + 60000);
      return Response.json(result);
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "Replay request failed" },
        { status: 502 },
      );
    }
  }
  async alarm() {
    if (this.socket) {
      try {
        if (this.sessionId)
          await this.rpc("Recording.releaseSession", {
            sessionId: this.sessionId,
          });
      } catch {}
      this.socket?.close();
    }
    this.reset();
  }
}
export async function replay(
  env: Env,
  scope: string,
  recordingId: string,
  body: Record<string, unknown>,
) {
  const stub = env.REPLAY_SESSIONS.get(
    env.REPLAY_SESSIONS.idFromName(`${scope}:${recordingId}`),
  );
  const response = await stub.fetch("https://internal/replay", {
    method: "POST",
    body: JSON.stringify({ ...body, recordingId }),
  });
  const value: any = await response.json();
  if (!response.ok) throw new Error(value.error ?? "Replay inspection failed");
  return value;
}
