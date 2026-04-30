/**
 * Normalized API failure for use after {@link apiErrorInterceptor}.
 * Backend errors use `{ message: string, details?: unknown }` per API conventions.
 */
export class ApiClientError extends Error {
  readonly status: number;
  readonly url: string | undefined;
  readonly details: unknown;

  constructor(
    message: string,
    opts: {
      status: number;
      url?: string;
      details?: unknown;
    }
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = opts.status;
    this.url = opts.url;
    this.details = opts.details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isApiClientError(e: unknown): e is ApiClientError {
  return e instanceof ApiClientError;
}
