export interface HttpTimeouts {
  readonly connectTimeoutMs: number;
  readonly requestTimeoutMs: number;
}

function positiveMilliseconds(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

/**
 * Bound response-header establishment separately from the complete request.
 * The request signal remains attached to the response body after this returns.
 */
export async function fetchWithTimeouts(
  operation: (signal: AbortSignal) => Promise<Response>,
  timeouts: HttpTimeouts,
): Promise<Response> {
  const connectTimeoutMs = positiveMilliseconds(timeouts.connectTimeoutMs, "server connection timeout");
  const requestTimeoutMs = positiveMilliseconds(timeouts.requestTimeoutMs, "server request timeout");
  if (connectTimeoutMs > requestTimeoutMs) {
    throw new Error("server connection timeout must not exceed request timeout");
  }
  const requestSignal = AbortSignal.timeout(requestTimeoutMs);
  const connection = new AbortController();
  const timer = setTimeout(() => {
    connection.abort(new Error("server connection timeout exceeded"));
  }, connectTimeoutMs);
  try {
    return await operation(AbortSignal.any([connection.signal, requestSignal]));
  } finally {
    clearTimeout(timer);
  }
}
