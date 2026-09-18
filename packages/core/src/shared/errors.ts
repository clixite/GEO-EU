/**
 * Error taxonomy. Codes are stable strings so the CLI, admin UI and audit ledger can
 * classify failures without parsing messages. Messages never contain secrets.
 */
export type ErrorCode =
  | 'validation'
  | 'not_found'
  | 'conflict'
  | 'policy_denied'
  | 'approval_required'
  | 'provider_unavailable'
  | 'provider_error'
  | 'network_blocked'
  | 'integrity'
  | 'unsupported'
  | 'internal';

export class EvidentiaError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'EvidentiaError';
    this.code = code;
    this.details = details;
  }

  toJSON(): { code: ErrorCode; message: string; details: Record<string, unknown> } {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export function isEvidentiaError(error: unknown): error is EvidentiaError {
  return error instanceof EvidentiaError;
}

export function policyDenied(message: string, details: Record<string, unknown> = {}): EvidentiaError {
  return new EvidentiaError('policy_denied', message, details);
}

export function notFound(kind: string, id: string): EvidentiaError {
  return new EvidentiaError('not_found', `${kind} not found`, { kind, id });
}
