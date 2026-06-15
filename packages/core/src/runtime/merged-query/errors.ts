export type MergedQueryPhase = 'merged-query';

export class MergedQueryError extends Error {
  constructor(
    public readonly phase: MergedQueryPhase,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'MergedQueryError';
  }
}
