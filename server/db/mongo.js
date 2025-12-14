/**
 * MongoDB Database Connector
 * Document database for flexible/unstructured data
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

let isConnected = false;

/**
 * Connect to MongoDB database
 * @returns {Promise<void>}
 */
export async function connectMongoDB() {
  if (isConnected) {
    console.log("✅ MongoDB: Using existing connection");
    return mongoose.connection;
  }

  try {
    const uri = process.env.MONGO_URI || process.env.MONGOOSE_URI;
    if (!uri) {
      throw new Error("MONGO_URI is not defined in .env file");
    }

    const options = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: parseInt(process.env.MONGO_POOL_MAX) || 10,
      minPoolSize: parseInt(process.env.MONGO_POOL_MIN) || 0,
      retryWrites: true,
      w: 'majority',
    };

    await mongoose.connect(uri, options);
    isConnected = true;
    console.log("✅ MongoDB: Connected successfully");

    // Connection event handlers
    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB: Connection error:", err.message);
      isConnected = false;
    });

    mongoose.connection.on("disconnected", () => {
      console.log("⚠️  MongoDB: Disconnected");
      isConnected = false;
      
      // Auto-reconnect after delay
      setTimeout(() => {
        if (!isConnected) {
          console.log("⏳ MongoDB: Attempting to reconnect...");
          connectMongoDB().catch(err => 
            console.error("❌ MongoDB: Reconnection failed:", err.message)
          );
        }
      }, 5000);
    });

    mongoose.connection.on("reconnected", () => {
      console.log("✅ MongoDB: Reconnected successfully");
      isConnected = true;
    });

    return mongoose.connection;

  } catch (error) {
    console.error("❌ MongoDB: Connection error:", error.message);
    isConnected = false;
    
    // Retry after delay
    setTimeout(() => {
      if (!isConnected) {
        console.log("⏳ MongoDB: Retrying connection...");
        connectMongoDB().catch(err => 
          console.error("❌ MongoDB: Retry failed:", err.message)
        );
      }
    }, 5000);
    
    throw error;
  }
}

/**
 * Close MongoDB connection
 */
export async function closeMongoDB() {
  try {
    await mongoose.connection.close();
    isConnected = false;
    console.log("✅ MongoDB: Connection closed");
  } catch (err) {
    console.error("❌ MongoDB: Error closing connection:", err);
    throw err;
  }
}

/**
 * Get MongoDB connection status
 */
export function getMongoDBStatus() {
  return {
    connected: isConnected,
    readyState: mongoose.connection.readyState,
    readyStateText: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState],
    host: mongoose.connection.host,
    name: mongoose.connection.name,
    models: Object.keys(mongoose.connection.models),
  };
}

/**
 * Test MongoDB connection
 */
export async function testMongoDB() {
  try {
    if (!isConnected) {
      await connectMongoDB();
    }
    await mongoose.connection.db.admin().ping();
    return { success: true, message: 'MongoDB connection successful' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * Get MongoDB collection stats
 */
export async function getMongoDBStats() {
  try {
    const db = mongoose.connection.db;
    const stats = await db.stats();
    return {
      success: true,
      stats: {
        collections: stats.collections,
        dataSize: stats.dataSize,
        storageSize: stats.storageSize,
        indexes: stats.indexes,
        indexSize: stats.indexSize,
      }
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

// Graceful shutdown handlers
process.on("SIGINT", async () => {
  await closeMongoDB();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeMongoDB();
  process.exit(0);
});

export { mongoose };
export default mongoose;
