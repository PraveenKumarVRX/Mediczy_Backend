/**
 * Simplified DuckDB Database Connector
 * Fixed version to resolve startup issues
 */

import duckdb from 'duckdb';
import { promisify } from 'util';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

let db = null;
let connection = null;
let isConnected = false;

const DB_PATH = process.env.DUCKDB_PATH || path.join(process.cwd(), 'data', 'analytics.duckdb');
const DB_MEMORY = process.env.DUCKDB_MEMORY === 'true' || true; // Default to memory for stability

/**
 * Connect to DuckDB database
 * @returns {Promise<Object>} DuckDB connection
 */
export async function connectDuckDB() {
  if (isConnected && connection) {
    return connection;
  }

  try {
    // Always use in-memory database for better stability during development
    console.log('🦆 Initializing DuckDB (in-memory mode)...');
    
    db = new duckdb.Database(':memory:', (err) => {
      if (err) {
        console.warn('⚠️  DuckDB initialization warning:', err.message);
        // Don't throw - continue with degraded functionality
      }
    });

    // Create connection
    connection = db.connect();
    
    // Promisify connection methods
    if (connection && typeof connection.all === 'function') {
      connection.allAsync = promisify(connection.all).bind(connection);
      connection.runAsync = promisify(connection.run).bind(connection);
      connection.execAsync = promisify(connection.exec).bind(connection);
    }

    // Test connection with timeout
    const testPromise = connection.allAsync('SELECT 1 as test');
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('DuckDB connection timeout')), 5000)
    );

    await Promise.race([testPromise, timeoutPromise]);
    
    isConnected = true;
    console.log('✅ DuckDB: Connected successfully (in-memory)');

    // Skip extensions for now to avoid issues
    return connection;

  } catch (error) {
    console.warn('⚠️  DuckDB: Connection failed, continuing without analytics database:', error.message);
    isConnected = false;
    // Don't throw - application should continue without DuckDB
    return null;
  }
}

/**
 * Execute DuckDB query with error handling
 */
export async function executeDuckDB(query, params = []) {
  try {
    if (!isConnected || !connection) {
      console.warn('⚠️  DuckDB: Not connected, skipping query');
      return null;
    }

    const normalizedParams = Array.isArray(params) ? params : [];
    const hasPlaceholders = /(\$[1-9]\d*|\?)/.test(query);
    const shouldBindParams = hasPlaceholders && normalizedParams.length > 0;
    const result = shouldBindParams
      ? await connection.allAsync(query, normalizedParams)
      : await connection.allAsync(query);
    return result;
  } catch (error) {
    console.warn('⚠️  DuckDB: Query failed:', error.message);
    return null;
  }
}

/**
 * Close DuckDB connection
 */
export async function closeDuckDB() {
  try {
    if (connection) {
      await new Promise((resolve) => {
        connection.close((err) => {
          if (err) console.warn('⚠️  DuckDB: Close warning:', err.message);
          resolve();
        });
      });
    }
    
    if (db) {
      await new Promise((resolve) => {
        db.close((err) => {
          if (err) console.warn('⚠️  DuckDB: DB close warning:', err.message);
          resolve();
        });
      });
    }
    
    isConnected = false;
    console.log('✅ DuckDB: Disconnected');
  } catch (error) {
    console.warn('⚠️  DuckDB: Disconnect warning:', error.message);
  }
}

/**
 * Get DuckDB status
 */
export function getDuckDBStatus() {
  return {
    connected: isConnected,
    mode: 'in-memory',
    version: duckdb.version || 'unknown'
  };
}

/**
 * Test DuckDB connection
 */
export async function testDuckDB() {
  try {
    if (!isConnected || !connection) {
      return { success: false, message: 'Not connected' };
    }

    const result = await executeDuckDB('SELECT CURRENT_TIMESTAMP as timestamp');
    return { 
      success: true, 
      message: 'DuckDB operational',
      data: result 
    };
  } catch (error) {
    return { 
      success: false, 
      message: error.message 
    };
  }
}

/**
 * Insert data into DuckDB table
 */
export async function insertIntoDuckDB(tableName, data) {
  try {
    if (!isConnected || !connection) {
      console.warn('⚠️  DuckDB: Not connected, skipping insert');
      return false;
    }

    // Create table if not exists (simplified)
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id VARCHAR,
        data JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    await connection.runAsync(createTableQuery);
    
    // Insert data
    const insertQuery = `
      INSERT INTO ${tableName} (id, data) 
      VALUES (?, ?)
    `;
    
    await connection.runAsync(insertQuery, [
      data.id || data._id || Math.random().toString(36).substring(7),
      JSON.stringify(data)
    ]);
    
    return true;
  } catch (error) {
    console.warn(`⚠️  DuckDB: Insert failed for ${tableName}:`, error.message);
    return false;
  }
}

/**
 * Query data from DuckDB
 */
export async function queryDuckDB(tableName, conditions = {}) {
  try {
    if (!isConnected || !connection) {
      console.warn('⚠️  DuckDB: Not connected, skipping query');
      return [];
    }

    let query = `SELECT * FROM ${tableName}`;
    const params = [];
    
    if (Object.keys(conditions).length > 0) {
      const whereClause = Object.keys(conditions)
        .map((key) => `data->>'${key}' = ?`)
        .join(' AND ');
      query += ` WHERE ${whereClause}`;
      params.push(...Object.values(conditions));
    }
    
    const result = await connection.allAsync(query, params);
    return result || [];
  } catch (error) {
    console.warn(`⚠️  DuckDB: Query failed for ${tableName}:`, error.message);
    return [];
  }
}

export default {
  connectDuckDB,
  executeDuckDB,
  closeDuckDB,
  getDuckDBStatus,
  testDuckDB,
  insertIntoDuckDB,
  queryDuckDB
};
