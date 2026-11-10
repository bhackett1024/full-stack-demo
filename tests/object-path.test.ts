import { expect, it } from "vitest";
import { resolveObjectPath } from "../packages/replay/object-path";

it("resolves nested variables after every pause-local ID changes", async () => {
  const locator = {
    frameIndex: 0,
    scopeIndex: 0,
    name: "channel",
    path: ["members"],
  };
  for (const generation of ["initial", "reconnected"]) {
    const calls: string[] = [];
    const result = await resolveObjectPath(
      [{ scopeChain: [generation + ":scope"], this: {} }] as any,
      locator,
      async (id) => {
        expect(id).toBe(generation + ":scope");
        return {
          bindings: [{ name: "channel", object: generation + ":root" }],
        } as any;
      },
      async (id) => {
        calls.push(id);
        return id.endsWith(":root")
          ? ({
              objectId: id,
              preview: {
                properties: [
                  { name: "members", object: generation + ":child" },
                ],
              },
            } as any)
          : ({
              objectId: id,
              preview: { properties: [{ name: "count", value: 2 }] },
            } as any);
      },
    );
    expect(calls).toEqual([generation + ":root", generation + ":child"]);
    expect(result.preview?.properties?.[0].value).toBe(2);
  }
});

it("resolves this and object-backed scopes without an inspection token", async () => {
  const frames = [
    { scopeChain: ["scope"], this: { object: "receiver" } },
  ] as any;
  const preview = async (id: string) => ({ objectId: id }) as any;
  const scope = async () => ({ object: "global" }) as any;
  expect(
    (
      await resolveObjectPath(
        frames,
        { frameIndex: 0, scopeIndex: 1, name: "this", path: [] },
        scope,
        preview,
      )
    ).objectId,
  ).toBe("receiver");
  expect(
    (
      await resolveObjectPath(
        frames,
        { frameIndex: 0, scopeIndex: 0, name: "scope", path: [] },
        scope,
        preview,
      )
    ).objectId,
  ).toBe("global");
});

it("does not invoke getters or fall back to arbitrary stale object IDs", async () => {
  const frames = [{ scopeChain: ["scope"], this: {} }] as any;
  const scope = async () =>
    ({ bindings: [{ name: "channel", object: "root" }] }) as any;
  const preview = async () =>
    ({
      preview: {
        properties: [{ name: "secret", get: "getter", object: "child" }],
      },
    }) as any;
  await expect(
    resolveObjectPath(
      frames,
      { frameIndex: 0, scopeIndex: 0, name: "channel", path: ["secret"] },
      scope,
      preview,
    ),
  ).rejects.toThrow("Object property is unavailable");
  await expect(
    resolveObjectPath(
      frames,
      { frameIndex: 0, scopeIndex: 0, name: "missing", path: [] },
      scope,
      preview,
    ),
  ).rejects.toThrow("Variable is not an expandable object");
});
