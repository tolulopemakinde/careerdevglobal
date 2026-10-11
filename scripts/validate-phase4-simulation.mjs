const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

class AtomicLimiterModel {
  constructor() {
    this.rows = new Map();
    this.locks = new Map();
  }
  async consume(key, now, windowMs, maxRequests) {
    const previous = this.locks.get(key) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    this.locks.set(key, previous.then(() => current));
    await previous;
    try {
      const row = this.rows.get(key);
      if (!row || now >= row.started + windowMs) {
        this.rows.set(key, { started: now, count: 1 });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      if (row.count >= maxRequests) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((row.started + windowMs - now) / 1000)) };
      }
      row.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    } finally {
      release();
      if (this.locks.get(key) === current) this.locks.delete(key);
    }
  }
}

class AtomicQuotaModel {
  constructor(limit) {
    this.limit = limit;
    this.count = 0;
    this.lock = Promise.resolve();
  }
  async consume(units) {
    const previous = this.lock;
    let release;
    this.lock = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      if (this.count + units > this.limit) return false;
      this.count += units;
      return true;
    } finally {
      release();
    }
  }
}

const limiter = new AtomicLimiterModel();
const results = await Promise.all(Array.from({ length: 20 }, () => limiter.consume("anonymous:synthetic", 1000, 60_000, 12)));
assert(results.filter((result) => result.allowed).length === 12, "Concurrent limiter model must allow exactly the configured maximum");
assert(results.filter((result) => !result.allowed).every((result) => result.retryAfterSeconds >= 1), "Denied limiter results must have a bounded retry time");
const reset = await limiter.consume("anonymous:synthetic", 61_001, 60_000, 12);
assert(reset.allowed, "Expired limiter windows must reset");

const quota = new AtomicQuotaModel(5);
const quotaResults = await Promise.all(Array.from({ length: 8 }, () => quota.consume(1)));
assert(quotaResults.filter(Boolean).length === 5, "Concurrent shared quota model must not overshoot its limit");

console.log("Phase 4 simulation passed: concurrent limiter and shared-quota models do not overshoot, return retry data, and reset expired windows.");
console.log("This is a deterministic local model test only; it is not evidence of a live Postgres or preview deployment.");
