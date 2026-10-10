// Token bucket per key (IP or socket): `rate` tokens per `perMs`, up to `burst`.
export class RateLimiter {
  constructor({ rate, perMs, burst = rate, now = Date.now }) {
    this.rate = rate;
    this.perMs = perMs;
    this.burst = burst;
    this.now = now;
    this.buckets = new Map();
  }
  allow(key) {
    const now = this.now();
    let b = this.buckets.get(key);
    if(!b) {
      b = { tokens: this.burst, at: now };
      this.buckets.set(key, b);
    }
    b.tokens = Math.min(this.burst, b.tokens + ((now - b.at) / this.perMs) * this.rate);
    b.at = now;
    if(this.buckets.size > 10000) { this.prune(now); }
    if(b.tokens < 1) { return false; }
    b.tokens -= 1;
    return true;
  }
  prune(now) {
    for(const [k, b] of this.buckets) {
      if(now - b.at > this.perMs * 2) { this.buckets.delete(k); }
    }
  }
}
