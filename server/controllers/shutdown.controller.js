/**
 * Shutdown Controller
 * Manages graceful shutdown of all services
 */
class ShutdownController {
  constructor() {
    this.serverController = null;
    this.initializationController = null;
    this.isShuttingDown = false;
    this.shutdownTimeout = 30000; // 30 seconds
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
  async gracefulShutdown(signal) {
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
      // 1. Close HTTP server (stop accepting new connections)
      if (this.serverController?.getServer()) {
        await this.serverController.close();
      } else {
        console.warn('⚠️ HTTP server not initialized; skipping server.close()');
      }

      // 2. Close BullMQ workers
      console.log('🔄 Closing BullMQ workers...');
      const workers = this.initializationController?.getWorkers();
      if (workers) {
        await Promise.all(Object.values(workers).map(w => w.close()));
        console.log('✅ Workers closed');
      }

      // 3. Close database connections
      console.log('🔄 Closing database connections...');
      const orchestrator = this.initializationController?.getOrchestrator();
      if (orchestrator) {
        await orchestrator.closeAll();
        console.log('✅ Database connections closed');
      }

      // Clear the timeout since we completed successfully
      clearTimeout(forceShutdownTimer);

      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error during shutdown:', err);
      clearTimeout(forceShutdownTimer);
      process.exit(1);
    }
  }

  /**
   * Register process signal handlers
   */
  registerHandlers() {
    // Graceful shutdown signals
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (err) => {
      console.error('❌ Uncaught Exception:', err);
      this.gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      this.gracefulShutdown('UNHANDLED_REJECTION');
    });

    console.log('✅ Shutdown handlers registered');
  }
}

export default new ShutdownController();
