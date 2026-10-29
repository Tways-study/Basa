export class BudgetExceededError extends Error {
  constructor(readonly limit: number) {
    super(`Stopped: this scan reached its limit of ${limit} model calls`);
    this.name = "BudgetExceededError";
  }
}

/** Counts every model HTTP attempt for one pipeline run. MAX_MODEL_CALLS_PER_SCAN is the cost guard. */
export class CallBudget {
  private used = 0;
  constructor(private readonly limit: number) {}

  take(): void {
    if (this.used >= this.limit) throw new BudgetExceededError(this.limit);
    this.used += 1;
  }

  get calls(): number {
    return this.used;
  }
}
