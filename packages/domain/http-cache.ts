/** Revalidate only after the caller has completed authorization and built its response. */
export async function conditionalJson(request: Request, value: unknown) {
  const body = JSON.stringify(value);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(body),
  );
  const etag =
    '"' +
    Array.from(new Uint8Array(digest), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("") +
    '"';
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-cache",
    ETag: etag,
  };
  return request.headers.get("If-None-Match") === etag
    ? new Response(null, { status: 304, headers })
    : new Response(body, { headers });
}
