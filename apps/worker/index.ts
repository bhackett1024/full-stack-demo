import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { cacheScreenshot, screenshotResponse } from "./screenshots";
import { eventCursor } from "../../packages/domain/qa";
import { prepared } from "../../packages/domain/preparation";
import { validDemoSession, demoLogin } from "./demo-auth";
import type { Env } from "./env";
import {
  HttpError,
  pairById,
  parsePair,
  parseQuestion,
  questionQuery,
  uid,
  artifact,
} from "./db";
import {
  belongs,
  browserRecordings,
  importSchema,
  questionSchema,
  pointSchema,
} from "../../packages/domain/types";
import { sampleInspection } from "../../packages/domain/samples";
import { replay } from "./replay-session";
export { ReplaySession } from "./replay-session";
export { InvestigationWorkflow, PreparationWorkflow } from "./workflows";
const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
async function identity(request: Request, env: Env) {
  const host = new URL(request.url).hostname;
  if (["127.0.0.1", "localhost", "[::1]"].includes(host))
    return "local-developer";
  if (env.PUBLIC_DEMO === "true") return "shared-demo";
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    if (!env.APP_PASSWORD)
      throw new HttpError(503, "Production access is not configured");
    if (!(await validDemoSession(request, env.APP_PASSWORD)))
      throw new HttpError(401, "Sign in to the demo");
    return "shared-demo";
  }
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new HttpError(401, "Sign in through Cloudflare Access");
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  if (!jwks.has(issuer))
    jwks.set(
      issuer,
      createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)),
    );
  try {
    const verified = await jwtVerify(token, jwks.get(issuer)!, {
      issuer,
      audience: env.ACCESS_AUD,
    });
    if (!verified.payload.sub) throw new Error();
    return verified.payload.sub;
  } catch {
    throw new HttpError(401, "Invalid access identity");
  }
}
async function body(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 100000)
    throw new HttpError(413, "Request too large");
  const text = await request.text();
  if (text.length > 100000) throw new HttpError(413, "Request too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}
async function ownQuestion(env: Env, id: string, owner: string) {
  const row = await env.DB.prepare(
    `${questionQuery} JOIN pairs p ON p.id=q.pair_id WHERE q.id=? AND p.owner=? ORDER BY r.rowid DESC LIMIT 1`,
  )
    .bind(id, owner)
    .first<any>();
  if (!row) throw new HttpError(404, "Question not found");
  return parseQuestion(row);
}
async function ownRun(env: Env, id: string, owner: string) {
  const row = await env.DB.prepare(
    "SELECT r.*,q.pair_id FROM runs r JOIN questions q ON q.id=r.question_id JOIN pairs p ON p.id=q.pair_id WHERE r.id=? AND p.owner=?",
  )
    .bind(id, owner)
    .first<any>();
  if (!row) throw new HttpError(404, "Run not found");
  return row;
}
async function launch(env: Env, runId: string) {
  try {
    await env.INVESTIGATIONS.create({ id: runId, params: { runId } });
  } catch (error) {
    try {
      await (await env.INVESTIGATIONS.get(runId)).status();
    } catch {
      await env.DB.prepare(
        "UPDATE runs SET status='failed',error='Could not start the investigation. Retry the question.' WHERE id=? AND status='queued'",
      )
        .bind(runId)
        .run();
      throw error;
    }
  }
}
async function api(request: Request, env: Env) {
  const url = new URL(request.url),
    path = url.pathname,
    method = request.method,
    owner = await identity(request, env);
  if (!["GET", "HEAD"].includes(method)) {
    const origin = request.headers.get("origin");
    if (
      origin &&
      origin !== env.PUBLIC_ORIGIN &&
      new URL(origin).host !== url.host &&
      !(
        ["localhost", "127.0.0.1"].includes(url.hostname) &&
        ["localhost", "127.0.0.1"].includes(new URL(origin).hostname)
      )
    )
      throw new HttpError(403, "Cross-origin write rejected");
  }
  if (path === "/api/status")
    return {
      replay: true,
      replayAuthenticated: env.PUBLIC_DEMO !== "true" && !!env.REPLAY_API_KEY,
      model: !!env.ANTHROPIC_API_KEY,
      modelId: env.MODEL_ID ?? null,
      storage: "Cloudflare D1 + R2",
      runtime: "workerd",
      owner,
    };
  if (path === "/api/pairs" && method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT p.*,(SELECT COUNT(*) FROM questions q WHERE q.pair_id=p.id) question_count FROM pairs p WHERE owner=? AND mode='live' ORDER BY p.created_at DESC",
    )
      .bind(owner)
      .all();
    return rows.results.map(parsePair);
  }
  if (path === "/api/pairs" && method === "POST") {
    const input = importSchema.parse(await body(request));
    const browsers =
      input.browsers ??
      (input.frontendId
        ? [{ id: input.frontendId, label: "Browser", offset: 0 }]
        : []);
    if (!browsers.length)
      throw new HttpError(400, "Add at least one browser recording");
    if (new Set(browsers.map((b) => b.id)).size !== browsers.length)
      throw new HttpError(400, "Browser recordings must be unique");
    if (browsers.some((b) => b.id === input.backendId))
      throw new HttpError(
        400,
        "Frontend and backend must be distinct recordings",
      );
    for (const edge of input.correlations) {
      if (
        !browsers.some((b) => b.id === edge.frontendPoint.recordingId) ||
        edge.backendPoint.recordingId !== input.backendId ||
        edge.lower > edge.upper
      )
        throw new HttpError(400, "Invalid request correlation");
    }
    const id = uid();
    await env.DB.prepare(
      "INSERT INTO pairs(id,owner,name,app,mode,frontend_id,backend_id,data) VALUES(?,?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        owner,
        input.name,
        input.app,
        "live",
        browsers[0].id,
        input.backendId,
        JSON.stringify({
          browsers,
          duration: 0,
          shots: [],
          markers: [],
          correlations: input.correlations,
          mappingRevision: 1,
          offset: input.offset,
        }),
      )
      .run();
    return { id };
  }
  let match = path.match(/^\/api\/pairs\/([^/]+)(?:\/(.*))?$/);
  if (match) {
    const pair = await pairById(env, decodeURIComponent(match[1]), owner),
      action = match[2];
    if (!action && method === "GET") return pair;
    if (action === "prepare" && method === "POST") {
      if (prepared(pair)) return { ready: true };
      if (pair.status === "preparing") return { status: "preparing" };
      const workflowId = uid();
      const progress = {
        workflowId,
        stage: "Starting Replay",
        updatedAt: new Date().toISOString(),
        recordings: [
          ...browserRecordings(pair).map((b) => ({
            recordingId: b.id,
            label: b.label,
            state: "queued",
          })),
          {
            recordingId: pair.backend_id,
            label: pair.data.backendLabel ?? "Backend",
            state: "queued",
          },
        ],
      };
      const claimed = await env.DB.prepare(
        "UPDATE pairs SET status='preparing', data=json_set(json_remove(data,'$.preparationError'),'$.preparation',json(?)), updated_at=CURRENT_TIMESTAMP WHERE id=? AND status!='preparing' RETURNING id",
      )
        .bind(JSON.stringify(progress), pair.id)
        .first();
      if (!claimed) return { status: "preparing" };
      try {
        await env.PREPARATION.create({
          id: workflowId,
          params: { pairId: pair.id },
        });
      } catch (e) {
        // A timeout may occur after creation; don't start a second Workflow in that case.
        try {
          await (await env.PREPARATION.get(workflowId)).status();
        } catch {
          await env.DB.prepare(
            "UPDATE pairs SET status='error', data=json_set(data,'$.preparationError',?) WHERE id=? AND json_extract(data,'$.preparation.workflowId')=?",
          )
            .bind("Could not start loading. Please retry.", pair.id, workflowId)
            .run();
          throw e;
        }
      }
      return { status: "preparing" };
    }
    if (action === "questions" && method === "GET") {
      const rows = await env.DB.prepare(
        `${questionQuery} WHERE q.pair_id=? AND r.rowid=(SELECT MAX(r2.rowid) FROM runs r2 WHERE r2.question_id=q.id) ORDER BY q.created_at DESC,q.rowid DESC`,
      )
        .bind(pair.id)
        .all();
      return rows.results.map(parseQuestion);
    }
    if (action === "questions" && method === "POST") {
      const input = questionSchema.parse(await body(request));
      if (
        input.context.recordingId &&
        !browserRecordings(pair).some((b) => b.id === input.context.recordingId)
      )
        throw new HttpError(400, "Context browser is outside this group");
      if (input.context.point && !belongs(pair, input.context.point))
        throw new HttpError(400, "Context point is outside this pair");
      if (input.context.mappingRevision !== pair.data.mappingRevision)
        throw new HttpError(409, "Timeline changed. Refresh before asking.");
      if (input.context.time > pair.data.duration)
        throw new HttpError(400, "Context is outside the recording");
      if (pair.mode === "live" && !env.ANTHROPIC_API_KEY)
        throw new HttpError(
          409,
          "Configure the investigation model credential before starting an agent investigation. Public Replay recordings do not need a key.",
        );
      const qid = uid(),
        runId = uid();
      await env.DB.batch([
        env.DB.prepare(
          "INSERT OR IGNORE INTO questions(id,pair_id,text,context,submission_key) VALUES(?,?,?,?,?)",
        ).bind(
          qid,
          pair.id,
          input.text,
          JSON.stringify({
            ...input.context,
            mapping: {
              browsers: pair.data.browsers,
              offset: pair.data.offset,
              uncertainty: pair.data.uncertainty,
              correlations: pair.data.correlations,
              mappingRevision: pair.data.mappingRevision,
            },
          }),
          input.idempotencyKey,
        ),
        env.DB.prepare(
          "INSERT INTO runs(id,question_id) SELECT ?,id FROM questions WHERE id=?",
        ).bind(runId, qid),
      ]);
      const existing = await env.DB.prepare(
        `${questionQuery} WHERE q.pair_id=? AND q.submission_key=? ORDER BY r.rowid DESC LIMIT 1`,
      )
        .bind(pair.id, input.idempotencyKey)
        .first<any>();
      await launch(env, existing.run_id);
      return parseQuestion(existing);
    }
    if (action === "inspect" && method === "POST") {
      const input = z
        .object({
          point: pointSchema,
          frameId: z.string().optional(),
          frameIndex: z.number().int().min(0).optional(),
        })
        .parse(await body(request));
      if (!belongs(pair, input.point))
        throw new HttpError(400, "Point outside this pair");
      if (pair.mode === "sample") {
        if (
          !pair.data.markers.some(
            (m) =>
              m.point.executionPoint === input.point.executionPoint &&
              m.point.recordingId === input.point.recordingId,
          )
        )
          throw new HttpError(400, "Unknown sample point");
        return sampleInspection(input.point, input.frameId);
      }
      // Recordings are immutable. Cache complete inspection snapshots, scoped to
      // the authorized owner/pair. Object expansion uses stable point/path locators
      // and frame selection uses indices, so cached session IDs need not stay alive.
      const cacheKey = `inspections/v1/${encodeURIComponent(owner)}/${pair.id}/${input.point.recordingId}/${input.point.executionPoint}/${input.frameIndex ?? 0}.json`;
      const cacheable = input.frameIndex !== undefined || !input.frameId;
      if (cacheable) {
        const cached = await env.BUCKET.get(cacheKey);
        if (cached) return cached.json();
      }
      const result = await replay(env, owner, input.point.recordingId, {
        action: "inspect",
        point: input.point.executionPoint,
        frameId: input.frameId,
        frameIndex: input.frameIndex,
        preloadObjects: true,
      });
      if (cacheable)
        await env.BUCKET.put(cacheKey, JSON.stringify(result), {
          httpMetadata: { contentType: "application/json" },
        });
      return result;
    }
    if (action === "objects" && method === "POST") {
      const input = z
        .object({
          recordingId: z.string(),
          inspectionToken: z.string(),
          objectId: z.string(),
          point: z.string().optional(),
          locator: z
            .object({
              frameIndex: z.number().int().min(0),
              scopeIndex: z.number().int().min(0),
              name: z.string(),
              path: z.array(z.string()).max(100),
            })
            .optional(),
        })
        .parse(await body(request));
      if (
        !belongs(pair, { recordingId: input.recordingId, executionPoint: "" })
      )
        throw new HttpError(400, "Recording outside pair");
      return replay(env, owner, input.recordingId, {
        action: "object",
        ...input,
      });
    }
    if (action === "screenshot" && method === "GET") {
      const time = Number(url.searchParams.get("time"));
      const recordingId =
        url.searchParams.get("recordingId") ?? pair.frontend_id;
      if (!browserRecordings(pair).some((b) => b.id === recordingId))
        throw new HttpError(404, "Browser not found");
      const shot = pair.data.shots.find(
        (s) =>
          s.time === time &&
          (s.recordingId ?? pair.frontend_id) === recordingId,
      );
      if (!shot?.point) throw new HttpError(404, "Screenshot not found");
      const rawWidth = url.searchParams.get("width");
      const width = rawWidth === null ? undefined : Number(rawWidth);
      if (width !== undefined && ![128, 192, 480, 960].includes(width))
        throw new HttpError(400, "Unsupported screenshot width");
      return screenshotResponse(env, pair, shot, width);
    }
  }
  match = path.match(/^\/api\/questions\/([^/]+)(?:\/(.*))?$/);
  if (match) {
    const question = await ownQuestion(env, match[1], owner);
    if (!match[2] && method === "DELETE") {
      const runs = await env.DB.prepare(
        "SELECT id FROM runs WHERE question_id=? AND status IN ('queued','running')",
      )
        .bind(question.id)
        .all<{ id: string }>();
      // Stop writers before removing their evidence and history. The status guard
      // also stops workflows if termination finds an already-finished instance.
      await env.DB.prepare(
        "UPDATE runs SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE question_id=? AND status IN ('queued','running')",
      )
        .bind(question.id)
        .run();
      await Promise.all(
        runs.results.map(async (run) => {
          try {
            await (await env.INVESTIGATIONS.get(run.id)).terminate();
          } catch {}
        }),
      );
      const investigationArtifacts = await env.DB.prepare(
        "SELECT a.object_key FROM artifacts a JOIN runs r ON substr(a.id,1,length(r.id)+1)=r.id || '-' WHERE r.question_id=? AND a.pair_id=?",
      )
        .bind(question.id, question.pair_id)
        .all<{ object_key: string }>();
      for (let i = 0; i < investigationArtifacts.results.length; i += 1000) {
        await env.BUCKET.delete(
          investigationArtifacts.results
            .slice(i, i + 1000)
            .map((item) => item.object_key),
        );
      }
      await env.DB.batch([
        env.DB.prepare(
          "DELETE FROM artifacts WHERE pair_id=? AND EXISTS (SELECT 1 FROM runs r WHERE r.question_id=? AND substr(artifacts.id,1,length(r.id)+1)=r.id || '-')",
        ).bind(question.pair_id, question.id),
        env.DB.prepare(
          "DELETE FROM events WHERE run_id IN (SELECT id FROM runs WHERE question_id=?)",
        ).bind(question.id),
        env.DB.prepare(
          "DELETE FROM evidence WHERE run_id IN (SELECT id FROM runs WHERE question_id=?)",
        ).bind(question.id),
        env.DB.prepare("DELETE FROM timelines WHERE question_id=?").bind(
          question.id,
        ),
        env.DB.prepare("DELETE FROM runs WHERE question_id=?").bind(
          question.id,
        ),
        env.DB.prepare("DELETE FROM questions WHERE id=?").bind(question.id),
      ]);
      return { deleted: true };
    }
    if (!match[2] && method === "GET") {
      const timelines = await env.DB.prepare(
        "SELECT * FROM timelines WHERE question_id=? ORDER BY revision DESC",
      )
        .bind(question.id)
        .all<any>();
      const detail = {
        ...question,
        timelines: timelines.results.map((t) => ({
          ...t,
          markers: JSON.parse(t.markers),
        })),
      };
      if (url.searchParams.get("events") === "1") {
        const revision = url.searchParams.get("revision");
        const historical =
          revision === null
            ? undefined
            : detail.timelines.find((t) => t.revision === Number(revision));
        if (historical) {
          const run = await ownRun(env, historical.run_id, owner);
          Object.assign(detail, {
            run_id: run.id,
            answer: run.answer,
            status: run.status,
            error: run.error,
          });
        }
        let cursor: number;
        try {
          cursor = eventCursor(url.searchParams);
        } catch {
          throw new HttpError(400, "Invalid event cursor");
        }
        if (url.searchParams.get("runId") !== detail.run_id) cursor = 0;
        const rows = await env.DB.prepare(
          "SELECT * FROM events WHERE run_id=? AND sequence>? ORDER BY sequence LIMIT 100",
        )
          .bind(detail.run_id, cursor)
          .all<any>();
        return {
          ...detail,
          events: rows.results.map((e) => ({
            ...e,
            content: JSON.parse(e.content),
          })),
          hasMore: rows.results.length === 100,
        };
      }
      return detail;
    }
    if (["retry", "timelines"].includes(match[2]) && method === "POST") {
      if (["running", "queued"].includes(question.status))
        throw new HttpError(409, "An investigation is already active");
      const runId = uid();
      await env.DB.prepare("INSERT INTO runs(id,question_id) VALUES(?,?)")
        .bind(runId, question.id)
        .run();
      await launch(env, runId);
      return { runId };
    }
  }
  match = path.match(/^\/api\/runs\/([^/]+)$/);
  if (match && method === "GET") return ownRun(env, match[1], owner);
  match = path.match(/^\/api\/runs\/([^/]+)\/(events|cancel)$/);
  if (match) {
    const run = await ownRun(env, match[1], owner);
    if (match[2] === "events") {
      let seq: number;
      try {
        seq = eventCursor(url.searchParams);
      } catch {
        throw new HttpError(400, "Invalid event cursor");
      }
      const rows = await env.DB.prepare(
        "SELECT * FROM events WHERE run_id=? AND sequence>? ORDER BY sequence LIMIT 100",
      )
        .bind(run.id, seq)
        .all<any>();
      return {
        status: run.status,
        events: rows.results.map((e) => ({
          ...e,
          content: JSON.parse(e.content),
        })),
      };
    }
    if (method === "POST") {
      await env.DB.prepare(
        "UPDATE runs SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('queued','running')",
      )
        .bind(run.id)
        .run();
      try {
        await (await env.INVESTIGATIONS.get(run.id)).terminate();
      } catch {}
      return { status: "cancelled" };
    }
  }
  match = path.match(/^\/api\/artifacts\/([^/]+)$/);
  if (match) {
    const row = await env.DB.prepare(
      "SELECT a.* FROM artifacts a JOIN pairs p ON p.id=a.pair_id WHERE a.id=? AND p.owner=?",
    )
      .bind(match[1], owner)
      .first<any>();
    if (!row) throw new HttpError(404, "Artifact not found");
    const object = await env.BUCKET.get(row.object_key);
    if (!object) throw new HttpError(404, "Artifact missing");
    return new Response(object.body, {
      headers: {
        "Content-Type": row.content_type,
        "Cache-Control": "private,max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  throw new HttpError(404, "Endpoint not found");
}
function secureResponse(response: Response, request: Request) {
  const result = new Response(response.body, response);
  result.headers.set("X-Content-Type-Options", "nosniff");
  result.headers.set("X-Frame-Options", "DENY");
  result.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  result.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  );
  if (new URL(request.url).protocol === "https:")
    result.headers.set("Strict-Transport-Security", "max-age=31536000");
  return result;
}
const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (
        env.PUBLIC_DEMO === "true" &&
        new URL(request.url).pathname === "/login"
      )
        return new Response(null, {
          status: 303,
          headers: { Location: "/", "Cache-Control": "no-store" },
        });
      if (
        new URL(request.url).pathname === "/login" &&
        env.APP_PASSWORD &&
        !(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD)
      )
        return demoLogin(request, env.APP_PASSWORD);
      if (!new URL(request.url).pathname.startsWith("/api/")) {
        await identity(request, env);
        const response = await env.ASSETS.fetch(request).then(
          (r) => new Response(r.body, r),
        );
        response.headers.set(
          "Cache-Control",
          new URL(request.url).pathname.startsWith("/assets/") &&
            !response.headers.get("Content-Type")?.includes("text/html")
            ? "public, max-age=31536000, immutable"
            : "private, no-store",
        );
        response.headers.set("X-Threadline-UI", "2026-11-09-timeline");
        return response;
      }
      const value = await api(request, env);
      const response =
        value instanceof Response
          ? new Response(value.body, value)
          : Response.json(value);
      response.headers.set("X-Content-Type-Options", "nosniff");
      response.headers.set(
        "Cache-Control",
        response.headers.get("Cache-Control") ?? "no-store",
      );
      return response;
    } catch (error) {
      const status =
        error instanceof HttpError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : 500;
      if (
        status === 401 &&
        env.APP_PASSWORD &&
        !(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) &&
        !new URL(request.url).pathname.startsWith("/api/")
      )
        return new Response(null, {
          status: 303,
          headers: { Location: "/login", "Cache-Control": "no-store" },
        });
      return Response.json(
        {
          error:
            error instanceof z.ZodError
              ? error.issues
                  .map((i) => `${i.path.join(".")}: ${i.message}`)
                  .join("; ")
              : error instanceof Error
                ? error.message
                : "Unexpected server error",
        },
        {
          status,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }
  },
};

export default {
  async fetch(request: Request, env: Env) {
    return secureResponse(await worker.fetch(request, env), request);
  },
};
