/**
 * ITEM-04: Reusable circuit breaker for external service calls.
 *
 * State machine: CLOSED → (threshold failures) → OPEN → (cooldown ms) → HALF-OPEN → CLOSED
 *
 * Usage:
 *   const cb = new CircuitBreaker({ name: 'abdm', threshold: 3, cooldownMs: 60_000 });
 *   if (cb.isOpen()) throw new Error('abdm circuit open');
 *   try {
 *     const result = await fetchSomething();
 *     cb.onSuccess();
 *     return result;
 *   } catch (err) {
 *     cb.onFailure();
 *     throw err;
 *   }
 */

export class CircuitBreaker {
  constructor({ threshold = 3, cooldownMs = 60_000, name = 'unknown' } = {}) {
    this.threshold  = threshold;
    this.cooldownMs = cooldownMs;
    this.name       = name;
    this.failures   = 0;
    this.openUntil  = 0;
  }

  isOpen() {
    return Date.now() < this.openUntil;
  }

  onSuccess() {
    this.failures  = 0;
    this.openUntil = 0;
  }

  onFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.openUntil = Date.now() + this.cooldownMs;
      this.failures  = 0;
      console.warn(`[CircuitBreaker] ${this.name} OPEN for ${this.cooldownMs / 1000}s`);
    }
  }

  /** Wrap an async call with circuit breaker logic */
  async call(fn) {
    if (this.isOpen()) {
      throw new Error(`${this.name} circuit open — cooling down`);
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  get state() {
    if (this.isOpen()) return 'OPEN';
    if (this.failures > 0) return 'HALF-OPEN';
    return 'CLOSED';
  }

  toJSON() {
    return {
      name:       this.name,
      state:      this.state,
      failures:   this.failures,
      threshold:  this.threshold,
      openUntil:  this.openUntil ? new Date(this.openUntil).toISOString() : null,
      cooldownMs: this.cooldownMs,
    };
  }
}

// ── Pre-built singletons for shared services ──────────────────────────────────
export const abdmCircuitBreaker  = new CircuitBreaker({ name: 'abdm-gateway', threshold: 3, cooldownMs: 60_000 });
export const sftpCircuitBreaker  = new CircuitBreaker({ name: 'sftp',         threshold: 3, cooldownMs: 60_000 });

export default CircuitBreaker;
