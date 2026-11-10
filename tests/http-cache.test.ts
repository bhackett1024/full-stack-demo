import { expect, it } from "vitest";
import { conditionalJson } from "../packages/domain/http-cache";
it("revalidates unchanged snapshots without sending the body, and sends changed status/points", async () => {
  const request = new Request("https://example.com/api/questions/q");
  const value = { status: "running", markers: [], events: [] };
  const first = await conditionalJson(request, value);
  expect(first.status).toBe(200);
  expect(first.headers.get("Cache-Control")).toBe("private, no-cache");
  const conditional = new Request(request, {
    headers: { "If-None-Match": first.headers.get("ETag")! },
  });
  const same = await conditionalJson(conditional, value);
  expect(same.status).toBe(304);
  expect(await same.text()).toBe("");
  const changed = await conditionalJson(conditional, {
    ...value,
    status: "complete",
    markers: [{ id: "point" }],
  });
  expect(changed.status).toBe(200);
  expect(((await changed.json()) as { markers: unknown[] }).markers).toEqual([
    { id: "point" },
  ]);
});
