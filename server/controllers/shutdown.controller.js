/**
 * Shutdown Controller
 * Manages graceful shutdown of all services
 *
 * This is the ONLY place that should register process-level SIGTERM/SIGINT handlers or call
 * process.exit() during shutdown. Individual modules (db/postgres.js, db/redis.js, db/vector.js,
 * db/postgres-sequelize.js, config/redis.js, config/redis-hardened.js, config/kafka.js,
 * config/queues.js, workers/index.js, telemetry.js, services/signup-analytics.service.js,
 * database/index.js) used to each register their own independent SIGTERM/SIGINT handler that called
 * process.exit(0) as soon as THEIR OWN resource finished closing — 11 competing handlers racing each
 * other, PLUS a second, entirely separate top-level gracefulShutdown() in app.js that raced ALL of
 * them (see the comment above this file's import in app.js — that one always won the race in
 * production and did no real cleanup at all, since it only checked global.* variables that are never
 * assigned anywhere). Whichever handler resolved first killed the whole process, sometimes mid-way
 * through another handler's still-in-flight close call, and sometimes hung forever with no fallback if
 * a close() call never resolved. That produced exactly the profile of the leaked/orphaned processes
 * found during the 2026-09-22 OOM investigation: zombies with live DB/Redis connections that neither
 * shut down cleanly nor were ever detected as dead. Every one of those close functions is still
 * exported from its own module — this controller is now the single place that calls them, each
 * wrapped with its own timeout so one hanging resource can't block the rest.
 */
import { closePool as closeLegacyDbPool } from '../database/index.js';
import { closeVectorDB } from '../db/vector.js';
import { closeAllRedisClients } from '../config/redis-hardened.js';
import { closeConfigRedisClient } from '../config/redis.js';
import { disconnectKafka } from '../config/kafka.js';
import { shutdownQueues } from '../config/queues.js';
import { shutdownWorkers } from '../workers/index.js';
import { shutdownTelemetry } from '../telemetry.js';
import { flushOnShutdown as flushSignupAnalytics } from '../services/signup-analytics.service.js';

// Each item below gets this long to close before it's treated as failed and the shutdown moves on —
// a single stuck resource (e.g. a Kafka broker that's unreachable) must never block the others or
// stall the whole sequence past PM2's kill_timeout.
const PER_RESOURCE_TIMEOUT = 5000;

function withTimeout(label, fn) {
  return Promise.race([
    fn().then(() => console.log(`✅ ${label} closed`)),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} close timed out after ${PER_RESOURCE_TIMEOUT}ms`)), PER_RESOURCE_TIMEOUT)
    ),
  ]);
}

class ShutdownController {
  constructor() {
    this.serverController = null;
    this.initializationController = null;
    this.isShuttingDown = false;
    // Must stay comfortably below PM2's kill_timeout (10000ms in ecosystem.config.js for
    // mediczy-server) — otherwise PM2 SIGKILLs the process before this timer ever gets a chance to
    // fire its own clean exit(1), which is exactly how the 2026-09-22 leaked orphans happened.
    this.shutdownTimeout = 8000;
  }

  /**
   * Initialize with required controllers
   */
  initialize(serverController, initializationController) {
    this.serverController = serverController;
    this.initializationController = initializationController;
  }

  /**
   * Perform graceful shutdown
   */
  async gracefulShutdown(signal, exitCode = 0) {
    if (this.isShuttingDown) {
      console.warn('⚠️  Shutdown already in progress...');
      return;
    }

    this.isShuttingDown = true;
    console.log(`\n${signal} received. Starting graceful shutdown...`);

    // Set forced shutdown timeout
    const forceShutdownTimer = setTimeout(() => {
      console.error('❌ Forced shutdown after timeout');
      process.exit(1);
    }, this.shutdownTimeout);

    try {
      // 1. Close HTTP server (stop accepting new connections) — must happen first and fully before
      // anything below, so in-flight requests get to finish against still-open connections.
      if (this.serverController?.getServer()) {
        await this.serverController.close();
      } else {
        console.warn('⚠️ HTTP server not initialized; skipping server.close()');
      }

      // 2. Close every other resource concurrently. Promise.allSettled means one hung or failed
      // close (each already bounded by withTimeout above) never blocks or skips the rest.
      console.log('🔄 Closing workers, queues, caches and database connections...');
      const orchestrator = this.initializationController?.getOrchestrator();

      const results = await Promise.allSettled([
        withTimeout('BullMQ workers', shutdownWorkers),
        withTimeout('BullMQ queues', shutdownQueues),
        withTimeout('Database connections (orchestrator)', () => orchestrator ? orchestrator.closeAll() : Promise.resolve()),
        withTimeout('Legacy DB pool (database/index.js)', closeLegacyDbPool),
        withTimeout('Vector DB', closeVectorDB),
        withTimeout('Hardened Redis clients', closeAllRedisClients),
        withTimeout('Config Redis client', closeConfigRedisClient),
        withTimeout('Kafka producer', disconnectKafka),
        withTimeout('Telemetry', shutdownTelemetry),
        withTimeout('Signup analytics flush', flushSignupAnalytics),
      ]);

      for (const r of results) {
        if (r.status === 'rejected') console.warn('⚠️ ', r.reason?.message || r.reason);
      }

      // Clear the timeout since we completed (even if some individual resources above failed/timed
      // out — they're logged above, but a hung Kafka broker etc. must not prevent the process itself
      // from exiting cleanly within shutdownTimeout).
      clearTimeout(forceShutdownTimer);

      console.log('✅ Graceful shutdown completed');
      process.exit(exitCode);
    } catch (err) {
      console.error('❌ Error during shutdown:', err);
      clearTimeout(forceShutdownTimer);
      process.exit(1);
    }
  }

  /**
   * Register process signal handlers.
   *
   * SIGTERM/SIGINT are owned here exclusively (this is the only module that should register them).
   * uncaughtException/unhandledRejection are deliberately NOT registered here — app.js owns those,
   * because it applies an isCriticalError() filter (a transient ECONNREFUSED shouldn't restart the
   * whole process the way an out-of-memory error should) and sends a monitoring alert before calling
   * back into this.gracefulShutdown(). Registering the same events here too would just reintroduce
   * the double-handler race this consolidation was meant to eliminate.
   */
  registerHandlers() {
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));

    console.log('✅ Shutdown handlers registered');
  }
}

export default new ShutdownController();
