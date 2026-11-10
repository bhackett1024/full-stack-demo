import { browserRecordings, type Pair } from "./types";

// Recording assets and preparation telemetry belong in storage, not every model prompt.
export function investigationContext(
  pair: Pair,
  question: { text: string; context: any },
) {
  const c = question.context;
  return {
    question: question.text,
    context: {
      time: c.time,
      point: c.point,
      recordingId: c.recordingId,
      screenshotTime: c.screenshotTime,
      mappingRevision: c.mappingRevision,
    },
    recordings: {
      browsers: browserRecordings(pair).map(
        ({ id, label, offset, duration, uncertainty, clock }) => ({
          id,
          label,
          offset,
          duration,
          uncertainty,
          clock,
        }),
      ),
      backend: {
        id: pair.backend_id,
        label: pair.data.backendLabel ?? "Backend",
        offset: pair.data.offset,
        uncertainty: pair.data.uncertainty,
      },
      duration: pair.data.duration,
      mappingRevision: pair.data.mappingRevision,
      correlationCount: pair.data.correlations.length,
    },
    instruction:
      "Investigate the relevant recordings using the current cursor as context. Use RecordingOverview to orient, then focused tools. Use followRequest for correlations. As soon as a relevant execution point is found, call inspectPoint to save it to the timeline before continuing research. Include expressions for all relevant data at that point, or [] if no data is relevant; these are evaluated in the recorded top frame and saved with the point. Finish with publishTimeline; an answer without markers is valid when no debugger points are needed or available.",
  };
}
export function usageCounts(usage: any) {
  return {
    input: usage?.input_tokens ?? 0,
    output: usage?.output_tokens ?? 0,
    cacheWrite: usage?.cache_creation_input_tokens ?? 0,
    cacheRead: usage?.cache_read_input_tokens ?? 0,
  };
}
export function shouldFinish(
  turn: number,
  calls: number,
  tokens: number,
  elapsed: number,
) {
  return (
    turn >= 100 || calls >= 100 || tokens >= 125000 || elapsed >= 19 * 60 * 1000
  );
}
export function cachedMessages(messages: any[]) {
  return messages.map((message, i) => {
    if (i !== messages.length - 1) return message;
    const blocks =
      typeof message.content === "string"
        ? [{ type: "text", text: message.content }]
        : message.content;
    return {
      ...message,
      content: blocks.map((block: any, j: number) =>
        j === blocks.length - 1
          ? { ...block, cache_control: { type: "ephemeral" } }
          : block,
      ),
    };
  });
}
export function modelToolContent(output: any) {
  if (!output.ok) return `Tool failed: ${output.error}`;
  const result = output.result;
  const normalized =
    result?.structuredContent ??
    (Array.isArray(result?.content)
      ? result.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("\n")
      : result);
  const text =
    typeof normalized === "string" ? normalized : JSON.stringify(normalized);
  return text.length > 12000
    ? text.slice(0, 12000) +
        "\n[Result excerpt; narrow the query or paginate for more detail.]"
    : text;
}

// Explicit final descriptions replace draft descriptions for the same execution point.
export function mergeTimelineMarkers(
  saved: import("./types").Marker[],
  incoming: import("./types").Marker[],
) {
  const markers = new Map(
    saved.map((m) => [`${m.point.recordingId}:${m.point.executionPoint}`, m]),
  );
  for (const marker of incoming)
    markers.set(
      `${marker.point.recordingId}:${marker.point.executionPoint}`,
      marker,
    );
  return [...markers.values()];
}
