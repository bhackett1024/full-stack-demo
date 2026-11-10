import { describe, expect, it } from "vitest";
import {
  demoLogin,
  demoSession,
  validDemoSession,
} from "../apps/worker/demo-auth";
const password = "test-password-with-enough-entropy";
const post = (value: string, origin = "https://demo.example") =>
  new Request("https://demo.example/login", {
    method: "POST",
    headers: { Origin: origin },
    body: new URLSearchParams({ password: value }),
  });
describe("demo sign in", () => {
  it("shows a form without browser authentication challenges", async () => {
    const response = await demoLogin(
      new Request("https://demo.example/login"),
      password,
    );
    expect(response.status).toBe(200);
    expect(response.headers.has("WWW-Authenticate")).toBe(false);
    expect(await response.text()).toContain('type="password"');
  });
  it("rejects incorrect passwords and cross-origin sign in", async () => {
    expect((await demoLogin(post("wrong"), password)).status).toBe(401);
    expect(
      (await demoLogin(post(password, "https://evil.example"), password))
        .status,
    ).toBe(403);
  });
  it("sets a secure session cookie on successful sign in", async () => {
    const response = await demoLogin(post(password), password);
    expect(response.status).toBe(303);
    const cookie = response.headers.get("Set-Cookie")!;
    expect(cookie).toContain("HttpOnly; Secure; SameSite=Lax");
    expect(
      await validDemoSession(
        new Request("https://demo.example", {
          headers: { Cookie: cookie.split(";")[0] },
        }),
        password,
      ),
    ).toBe(true);
  });
  it("rejects missing, tampered and rotated-password sessions", async () => {
    expect(
      await validDemoSession(new Request("https://demo.example"), password),
    ).toBe(false);
    const token = await demoSession(password);
    const request = (value: string) =>
      new Request("https://demo.example", {
        headers: { Cookie: `__Host-threadline=${value}` },
      });
    expect(await validDemoSession(request(token + "tampered"), password)).toBe(
      false,
    );
    expect(await validDemoSession(request(token), "rotated-password")).toBe(
      false,
    );
  });
});
