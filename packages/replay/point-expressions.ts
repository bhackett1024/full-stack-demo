import type {
  PointExpression,
  ExpressionResult,
  PointRef,
} from "../domain/types";
import { textResult } from "./mcp";

/** Values are captured in the recorded top-frame scope, never supplied by the model. */
export async function evaluatePointExpressions(
  point: PointRef,
  expressions: PointExpression[],
  evaluate: (args: Record<string, unknown>) => Promise<any>,
): Promise<ExpressionResult[]> {
  return Promise.all(
    expressions.map(async (expression): Promise<ExpressionResult> => {
      try {
        const response = await evaluate({
          recordingId: point.recordingId,
          point: point.executionPoint,
          expression: expression.expression,
          mode: "single-point",
          scope: "frame",
          maxStringLength: 12000,
        });
        if (response.isError) throw new Error(textResult(response));
        const text =
          textResult(response) ||
          JSON.stringify(response.structuredContent ?? response);
        return {
          ...expression,
          status: "complete",
          result:
            text.length > 16000
              ? text.slice(0, 16000) + "\n[Result truncated]"
              : text,
        };
      } catch (error) {
        return {
          ...expression,
          status: "error",
          error: (error instanceof Error ? error.message : String(error)).slice(
            0,
            2000,
          ),
        };
      }
    }),
  );
}
