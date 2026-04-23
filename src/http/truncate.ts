const DEFAULT_MAX_BYTES = 50_000;

/**
 * Truncate a string to fit within a byte limit, appending a marker if truncated.
 */
export function truncateResponse(
  text: string,
  maxBytes: number = DEFAULT_MAX_BYTES
): string {
  const encoded = Buffer.from(text, "utf8");
  if (encoded.length <= maxBytes) return text;
  const truncated = encoded.subarray(0, maxBytes).toString("utf8");
  return truncated + `\n\n[Response truncated: exceeded ${maxBytes} byte limit]`;
}
