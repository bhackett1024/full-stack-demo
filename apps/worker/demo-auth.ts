import { createHash, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
const cookieName = "__Host-threadline";
const key = (password: string) => new TextEncoder().encode(password);
export function validDemoPassword(supplied: string, password: string): boolean {
  return (
    !!password &&
    supplied.length <= 1024 &&
    timingSafeEqual(
      createHash("sha256").update(supplied).digest(),
      createHash("sha256").update(password).digest(),
    )
  );
}
export async function demoSession(password: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("shared-demo")
    .setIssuer("threadline-login")
    .setAudience("threadline")
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(key(password));
}
export async function validDemoSession(
  request: Request,
  password: string,
): Promise<boolean> {
  if (!password) return false;
  const token = (request.headers.get("Cookie") ?? "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key(password), {
      algorithms: ["HS256"],
      issuer: "threadline-login",
      audience: "threadline",
    });
    return payload.sub === "shared-demo";
  } catch {
    return false;
  }
}
function loginPage(error = false) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · Full Stack Demo</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#1f2937;font:16px system-ui;display:grid;place-items:center;min-height:100dvh;padding:24px}main{background:white;border:1px solid #e1e4eb;border-radius:18px;padding:36px;width:100%;max-width:420px;box-shadow:0 12px 50px #2233550a}h1{font-size:28px;margin:0 0 10px}p{color:#64748b;line-height:1.5}label{display:block;font-size:14px;margin:26px 0 8px}input,button{width:100%;padding:13px;border-radius:8px;font:inherit}input{border:1px solid #cbd5e1}button{background:#5146e5;color:white;border:0;margin-top:18px;cursor:pointer}.error{color:#b42318}
  </style></head><body><main><h1>Full Stack Demo</h1><p>Sign in to your replay workspace.</p>${error ? '<p class="error" role="alert">Incorrect password. Please try again.</p>' : ""}<form method="post" action="/login"><label for="password">Demo password</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus maxlength="1024"><button type="submit">Sign in</button></form></main></body></html>`,
    {
      status: error ? 401 : 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
export async function demoLogin(
  request: Request,
  password: string,
): Promise<Response> {
  if (request.method === "GET") return loginPage();
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  if (request.headers.get("Origin") !== new URL(request.url).origin)
    return new Response("Cross-origin login rejected", { status: 403 });
  if (Number(request.headers.get("Content-Length") ?? 0) > 8192)
    return new Response("Request too large", { status: 413 });
  const text = await request.text();
  if (text.length > 8192)
    return new Response("Request too large", { status: 413 });
  const supplied = new URLSearchParams(text).get("password") ?? "";
  if (!validDemoPassword(supplied, password)) return loginPage(true);
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/",
      "Cache-Control": "no-store",
      "Set-Cookie": `${cookieName}=${await demoSession(password)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`,
    },
  });
}
