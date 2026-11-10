import type { Value, PauseData } from "@replayio/protocol";
export function displayValue(v: Value): unknown {
  if (v.unavailable) return "(unavailable)";
  if (v.uninitialized) return "(uninitialized)";
  if (v.object) return { objectId: v.object };
  if (v.bigint !== undefined) return `${v.bigint}n`;
  if (v.symbol) return v.symbol;
  if (v.unserializableNumber) return v.unserializableNumber;
  return "value" in v ? v.value : "undefined";
}
export function mergeData(target: PauseData, addition: PauseData | undefined) {
  if (!addition) return;
  for (const key of ["frames", "scopes", "objects"] as const) {
    const id =
      key === "frames" ? "frameId" : key === "scopes" ? "scopeId" : "objectId";
    const map = new Map((target[key] ?? []).map((v: any) => [v[id], v]));
    for (const v of addition[key] ?? []) map.set((v as any)[id], v);
    (target as any)[key] = [...map.values()];
  }
}

// Scope bindings and properties can reference objects before a preview is materialized.
export function hasObjectReference(data: unknown, objectId: string): boolean {
  if (!data || typeof data !== "object") return false;
  if (Array.isArray(data))
    return data.some((value) => hasObjectReference(value, objectId));
  return Object.entries(data).some(
    ([key, value]) =>
      ((key === "object" || key === "objectId") && value === objectId) ||
      (typeof value === "object" && hasObjectReference(value, objectId)),
  );
}
