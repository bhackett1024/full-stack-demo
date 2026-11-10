import { resizeScreenshot } from "../../packages/replay/thumbnail";
import type { Env } from "./env";
import { ReplayMCP, structuredResult } from "../../packages/replay/mcp";
import { artifact } from "./db";
import type { Pair, Shot } from "../../packages/domain/types";
import { recordingTime } from "../../packages/domain/types";

export async function cacheScreenshot(env: Env, pair: Pair, shot: Shot) {
  const recordingId = shot.recordingId ?? pair.frontend_id;
  const id = `${pair.id}-shot-${recordingId}-${shot.time}`;
  const existing = await env.DB.prepare(
    "SELECT object_key FROM artifacts WHERE id=? AND pair_id=?",
  )
    .bind(id, pair.id)
    .first<{ object_key: string }>();
  if (existing) return { id, key: existing.object_key };
  const client = new ReplayMCP(
    env.PUBLIC_DEMO === "true" ? undefined : env.REPLAY_API_KEY,
  );
  try {
    const result = structuredResult(
      await client.call("Screenshot", {
        recordingId,
        timestamp:
          shot.localTime ?? recordingTime(pair, recordingId, shot.time),
        format: "json",
      }),
    );
    if (shot.point && result.paintPoint !== shot.point)
      throw new Error("Replay returned a different screenshot execution point");
    const url = new URL(result.url);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "static.replay.io" ||
      !url.pathname.includes(`/${recordingId}/`)
    )
      throw new Error("Replay returned an unexpected screenshot URL");
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.startsWith("image/"))
      throw new Error("Replay screenshot could not be loaded");
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 20_000_000)
      throw new Error("Replay screenshot is too large");
    await artifact(env, pair.id, id, bytes, contentType);
    return { id, key: `${pair.id}/${id}` };
  } finally {
    await client.close();
  }
}

export async function screenshotResponse(
  env: Env,
  pair: Pair,
  shot: Shot,
  width?: number,
): Promise<Response> {
  const variantKey = `${pair.id}/thumbnail-v1-${shot.recordingId ?? pair.frontend_id}-${shot.time}-${width}.jpg`;
  if (width) {
    const variant = await env.BUCKET.get(variantKey);
    if (variant)
      return new Response(variant.body, {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "private,max-age=86400",
        },
      });
  }
  let source: Response;
  if (shot.url?.startsWith("/recordings/"))
    source = await env.ASSETS.fetch(
      new Request(`https://assets.internal${shot.url}`),
    );
  else {
    const cached = await cacheScreenshot(env, pair, shot);
    const object = await env.BUCKET.get(cached.key);
    if (!object) throw new Error("Screenshot not cached");
    source = new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType ?? "image/jpeg",
      },
    });
  }
  if (!source.ok) throw new Error("Screenshot could not be loaded");
  if (!width)
    return new Response(source.body, {
      headers: {
        "Content-Type": source.headers.get("Content-Type") ?? "image/jpeg",
        "Cache-Control": "private,max-age=3600",
      },
    });
  const bytes = new Uint8Array(await source.arrayBuffer());
  const resized = resizeScreenshot(bytes, width);
  await env.BUCKET.put(variantKey, resized, {
    httpMetadata: { contentType: "image/jpeg" },
  });
  return new Response(new Uint8Array(resized).buffer, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private,max-age=86400",
    },
  });
}
