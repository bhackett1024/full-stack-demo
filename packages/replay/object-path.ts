import type { Frame, Scope, Object as ReplayObject } from "@replayio/protocol";

export type ObjectLocator = {
  frameIndex: number;
  scopeIndex: number;
  name: string;
  path: string[];
};

// Object and scope IDs belong to a pause. Resolve stable coordinates against
// the current pause so a released session never invalidates an open inspector.
export async function resolveObjectPath(
  frames: Frame[],
  locator: ObjectLocator,
  getScope: (id: string) => Promise<Scope | undefined>,
  getPreview: (id: string) => Promise<ReplayObject | undefined>,
) {
  const { frameIndex, scopeIndex, name, path } = locator;
  const frame = frames[frameIndex];
  if (!frame)
    throw new Error("Stack frame unavailable at this execution point");
  const chain = frame.originalScopeChain ?? frame.scopeChain;
  let object: string | undefined;
  if (scopeIndex === chain.length && name === "this")
    object = frame.this.object;
  else {
    const id = chain[scopeIndex];
    if (!id) throw new Error("Variable scope unavailable");
    const scope = await getScope(id);
    object =
      scope?.bindings?.find((v) => v.name === name)?.object ??
      (name === "scope" ? scope?.object : undefined);
  }
  if (!object) throw new Error("Variable is not an expandable object");
  let preview = await getPreview(object);
  for (const name of path) {
    const property = preview?.preview?.properties?.find((p) => p.name === name);
    if (!property?.object || property.get)
      throw new Error("Object property is unavailable");
    preview = await getPreview(property.object);
  }
  if (!preview) throw new Error("Object preview is unavailable");
  return preview;
}
