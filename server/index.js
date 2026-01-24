/**
 * Mediczy API Server Entry Point
 * 
 * This is a minimal entry point that delegates to controllers:
 * - InitializationController: Handles all startup logic (DB, Kafka, cron jobs)
 * - ServerController: Manages HTTP server and Socket.IO
 * - ShutdownController: Handles graceful shutdown
 */

import initializationController from "./controllers/initialization.controller.js";
import serverController from "./controllers/server.controller.js";
import shutdownController from "./controllers/shutdown.controller.js";

/**
 * Main application startup
 */
async function startApplication() {
  try {
    // 1. Initialize all services (DB, Kafka, cron jobs, workers)
    await initializationController.initializeAll();
    
    // 2. Import app after database is initialized
    const { default: app } = await import("./app.js");
    
    // 3. Create and configure HTTP server with Socket.IO
    await serverController.createServer(app);
    
    // 4. Make Socket.IO available globally and on Express app for routes
    global.io = serverController.getIO();
    app.set('io', global.io);  // Make io available via req.app.get('io')
    
    // 5. Start listening on configured port
    await serverController.start();
    
    // 6. Register shutdown handlers
    shutdownController.initialize(serverController, initializationController);
    shutdownController.registerHandlers();
    
  } catch (err) {
    console.error('❌ Fatal error during startup:', err);
    process.exit(1);
  }
}

// Start the application
startApplication();
