export class KastError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'KastError';
  }
}

export class QuoteStaleError extends KastError {
  constructor(expiresAt: number) {
    super(`Quote expired at ${new Date(expiresAt).toISOString()}`, 'QUOTE_STALE');
  }
}

export class InsufficientGasError extends KastError {
  constructor(chain: string, required: bigint, actual: bigint) {
    super(
      `Insufficient gas on ${chain}: need ${required}, have ${actual}`,
      'INSUFFICIENT_GAS',
    );
  }
}
