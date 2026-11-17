/**
 * Format error message for streaming to client
 * Uses the --MSG= format that the client understands
 * Wrapped in --START-- and --END-- markers required by client stream processor
 */
export function formatChaiStreamingError(error: { code: string; message: string; statusCode: number }): string {
  return `--START--\n--MSG=${error.message}--\n--END--`;
}

/**
 * Create a streaming error response
 * Converts an error into a ReadableStream response that the client can process
 */
export function createChaiStreamingErrorResponse(errorCode: string, errorMessage: string): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(errorMessage));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-AI-Error": "true",
      "X-AI-Error-Code": errorCode,
    },
  });
}

/**
 * Check if streaming response is missing the text stream
 */
export function isChaiMissingTextStream(response: any): boolean {
  return response?._streamingResponse && response?._streamResult && !response._streamResult?.textStream;
}
