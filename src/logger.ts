export type LogFormat = "text" | "json";
export type LogFields = Record<string, unknown>;

export interface Logger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

function formatFields(fields: LogFields): string {
  const entries = Object.entries(fields);
  if (entries.length === 0) return "";
  return " " + entries.map(([key, value]) => `${key}=${value}`).join(" ");
}

/**
 * device-sdk's logging, switchable between a human-readable text format
 * (the existing `[device-sdk] event field=value ...` style) and one-line
 * JSON — set via `LOG_FORMAT=json` for ingestion by a monitoring tool or
 * when running many device-sdk instances at once, where parsing text
 * lines is more work than reading already-structured JSON.
 */
export function createLogger(format: LogFormat): Logger {
  if (format === "json") {
    return {
      info: (event, fields = {}) => console.log(JSON.stringify({ level: "info", event, ...fields })),
      warn: (event, fields = {}) => console.warn(JSON.stringify({ level: "warn", event, ...fields })),
      error: (event, fields = {}) => console.error(JSON.stringify({ level: "error", event, ...fields })),
    };
  }
  return {
    info: (event, fields = {}) => console.log(`[device-sdk] ${event}${formatFields(fields)}`),
    warn: (event, fields = {}) => console.warn(`[device-sdk] WARNING: ${event}${formatFields(fields)}`),
    error: (event, fields = {}) => console.error(`[device-sdk] ERROR: ${event}${formatFields(fields)}`),
  };
}
