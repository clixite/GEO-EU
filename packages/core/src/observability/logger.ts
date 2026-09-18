import { sha256 } from '../shared/hash.ts';
import { type Clock, systemClock } from '../shared/clock.ts';

/**
 * Structured JSON logger with mandatory redaction.
 *
 * - Secret-looking keys (token, secret, password, authorization, cookie, api key…)
 *   are replaced with "[REDACTED]".
 * - Prompt/response payload keys are never logged verbatim: they are replaced by
 *   `{ sha256, length }` so incidents can be correlated without leaking content.
 * - Values that look like bearer tokens or provider API keys are masked wherever
 *   they appear.
 * - Correlation fields (correlationId, requestId, jobId, tenantId) are carried by
 *   child loggers so every line of a workflow can be joined.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LogContext {
  correlationId?: string;
  requestId?: string;
  jobId?: string;
  tenantId?: string;
  component?: string;
}

export interface LogRecord extends LogContext {
  ts: string;
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
}

export type LogSink = (record: LogRecord) => void;

// Anchored at the end of the key so counters such as `inputTokens` or `token_estimate` are not redacted.
const SECRET_KEY = /(token|secret|password|passwd|authorization|cookie|api[-_]?key|credential|private[-_]?key)$/i;
const PAYLOAD_KEY = /^(prompt|messages|completion|response|response_text|responseText|system|content|input|input_text|inputText|body|text|answer|evidence|query|question|draft|excerpt|html|markdown|passage)$/i;
const SECRET_VALUE = /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{8,}|AKIA[0-9A-Z]{12,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})/g;
const MAX_STRING = 2000;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[TRUNCATED]';
  if (typeof value === 'string') {
    const masked = value.replace(SECRET_VALUE, '[REDACTED]');
    return masked.length > MAX_STRING ? { sha256: sha256(masked), length: masked.length, head: masked.slice(0, 120) } : masked;
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(k)) out[k] = '[REDACTED]';
      else if (PAYLOAD_KEY.test(k) && typeof v === 'string') out[k] = { sha256: sha256(v), length: v.length };
      else if (PAYLOAD_KEY.test(k) && v && typeof v === 'object')
        out[k] = { sha256: sha256(JSON.stringify(v)), length: JSON.stringify(v).length };
      else out[k] = redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export class Logger {
  readonly #sink: LogSink;
  readonly #min: number;
  readonly #ctx: LogContext;
  readonly #clock: Clock;

  constructor(options: { sink?: LogSink; level?: LogLevel; context?: LogContext; clock?: Clock } = {}) {
    this.#sink = options.sink ?? ((r) => process.stderr.write(JSON.stringify(r) + '\n'));
    this.#min = LEVELS[options.level ?? 'info'];
    this.#ctx = options.context ?? {};
    this.#clock = options.clock ?? systemClock;
  }

  child(context: LogContext): Logger {
    return new Logger({
      sink: this.#sink,
      level: (Object.keys(LEVELS) as LogLevel[]).find((l) => LEVELS[l] === this.#min) ?? 'info',
      context: { ...this.#ctx, ...context },
      clock: this.#clock,
    });
  }

  #emit(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
    if (LEVELS[level] < this.#min) return;
    const record: LogRecord = {
      ts: this.#clock.now().toISOString(),
      level,
      msg,
      ...this.#ctx,
      ...(data ? (redact(data) as Record<string, unknown>) : {}),
    };
    this.#sink(record);
  }

  debug(msg: string, data?: Record<string, unknown>): void {
    this.#emit('debug', msg, data);
  }
  info(msg: string, data?: Record<string, unknown>): void {
    this.#emit('info', msg, data);
  }
  warn(msg: string, data?: Record<string, unknown>): void {
    this.#emit('warn', msg, data);
  }
  error(msg: string, data?: Record<string, unknown>): void {
    this.#emit('error', msg, data);
  }
}

/** Collects records in memory; for tests and for the admin "recent events" view. */
export function memorySink(): { sink: LogSink; records: LogRecord[] } {
  const records: LogRecord[] = [];
  return { sink: (r) => records.push(r), records };
}
