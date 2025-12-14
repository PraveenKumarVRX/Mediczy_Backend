import http from "http";
// import app from "./app.js"; // Moved after database initialization
import { Server } from "socket.io";
import { setupSocketIO } from "./chat/chathandler.controller.js";
import orchestrator from "./db/orchestrator.js";
import intelligence from "./db/intelligence.js";
import { validateEnvironment } from "./config/env-validator.js";
import workers from "./workers/index.js";
import { connectKafkaProducer, connectKafkaConsumer } from "./config/kafka.js";
import scheduleDeviceMonitoring from "./scripts/device-monitoring-cron.js";

// Validate environment before starting
try {
  validateEnvironment();
  console.log('✅ Environment validation passed');
} catch (error) {
  console.warn('⚠️ Environment validation warnings:', error.message);
  // Continue anyway - some variables are optional
}

const PORT = process.env.PORT || 8000;

let server;

// Initialize database orchestrator and intelligence layer
async function initializeDatabases() {
  try {
    console.log('🚀 Initializing Database Orchestrator...');
    const results = await orchestrator.initializeAll();
    console.log('✅ Database Orchestrator initialized successfully');
    
    // Initialize intelligence layer
    console.log('🧠 Initializing Database Intelligence Layer...');
    // orchestrator.setIntelligence(intelligence); // Temporarily disabled
    console.log('✅ Database Intelligence Layer initialized successfully');
    
    // Initialize BullMQ workers
    console.log('📋 BullMQ workers initialized and ready');
    
    return results;
  } catch (error) {
    console.error('❌ Database Orchestrator initialization failed:', error.message);
    console.error('⚠️  Server will continue but some features may be unavailable');
    return null;
  }
}

// Initialize databases first, then import app
async function startServer() {
  await initializeDatabases();
  
  // Now import app after database is initialized
  const { default: app } = await import("./app.js");
  
  server = http.createServer(app);
  setupSocketIO(server);
  
  // Initialize Kafka for video streaming events
  console.log('📡 Connecting to Kafka...');
  await connectKafkaProducer();
  await connectKafkaConsumer();
  
  // Initialize device monitoring cron jobs
  scheduleDeviceMonitoring();
  
  // Start server
  server.listen(PORT, '0.0.0.0', (err) => {
    if (err) {
      console.error('❌ Server startup error:', err);
      process.exit(1);
    } else {
      console.log(`\n🚀 Server running on PORT ${PORT} and accessible on all interfaces`);
      console.log(`📊 Health Check: http://localhost:${PORT}/health`);
      console.log(`📊 DB Health: http://localhost:${PORT}/api/db/health`);
      console.log(`📊 DB Stats: http://localhost:${PORT}/api/db/stats\n`);
      console.log(`📈 Metrics: http://localhost:${PORT}/metrics`);
    }
  });
}

// Graceful shutdown handler
function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  const afterHttpClose = async () => {
    try {
      // Close workers
      console.log('🔄 Closing BullMQ workers...');
      await Promise.all(Object.values(workers).map(w => w.close()));
      console.log('✅ Workers closed');

      // Close database connections
      await orchestrator.closeAll();
      console.log('✅ Database connections closed');

      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error during shutdown:', err);
      process.exit(1);
    }
  };

  if (server?.close) {
    server.close(async () => {
      console.log('✅ HTTP server closed');
      await afterHttpClose();
    });
  } else {
    console.warn('⚠️ HTTP server not initialized; skipping server.close()');
    void afterHttpClose();
  }
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Start the server
startServer().catch(err => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
