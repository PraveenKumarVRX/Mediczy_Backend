/**
 * DuckDB Analytics Service
 * High-performance OLAP analytics for notification and event data
 * Uses DuckDB for fast analytical queries and PostgreSQL sync
 */

const path = require('path');
const fs = require('fs');
const { sequelize } = require('../config/database');
const logger = require('../config/logger');

// DuckDB module (optional)
let duckdb = null;
let db = null;

const DUCKDB_PATH = path.join(__dirname, '../../data/analytics.duckdb');

class DuckDBAnalyticsService {
    constructor() {
        this.initialized = false;
        this.syncInterval = null;
    }

    async initialize() {
        try {
            // Try to load DuckDB
            duckdb = require('duckdb');
            
            // Ensure data directory exists
            const dataDir = path.dirname(DUCKDB_PATH);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            // Connect to DuckDB
            db = new duckdb.Database(DUCKDB_PATH);
            
            // Create analytics tables
            await this.createTables();
            
            // Start sync from PostgreSQL
            this.startSync();
            
            this.initialized = true;
            logger.info('DuckDB Analytics Service initialized');
            return true;
        } catch (error) {
            logger.warn('DuckDB not available, analytics will use PostgreSQL:', error.message);
            return false;
        }
    }

    async createTables() {
        if (!db) return;

        const tables = [
            `CREATE TABLE IF NOT EXISTS notification_events (
                id VARCHAR PRIMARY KEY,
                event_type VARCHAR,
                user_id VARCHAR,
                user_type VARCHAR,
                channel VARCHAR,
                status VARCHAR,
                workflow_name VARCHAR,
                processing_time_ms INTEGER,
                created_at TIMESTAMP,
                hour_of_day INTEGER,
                day_of_week INTEGER,
                success BOOLEAN
            )`,
            `CREATE TABLE IF NOT EXISTS appointment_analytics (
                id VARCHAR PRIMARY KEY,
                doctor_id VARCHAR,
                patient_id VARCHAR,
                status VARCHAR,
                consultation_type VARCHAR,
                duration_minutes INTEGER,
                amount DECIMAL(10,2),
                created_at TIMESTAMP,
                completed_at TIMESTAMP,
                rating INTEGER
            )`,
            `CREATE TABLE IF NOT EXISTS user_engagement (
                id VARCHAR PRIMARY KEY,
                user_id VARCHAR,
                user_type VARCHAR,
                event_type VARCHAR,
                session_id VARCHAR,
                device_type VARCHAR,
                platform VARCHAR,
                duration_seconds INTEGER,
                created_at TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS payment_analytics (
                id VARCHAR PRIMARY KEY,
                user_id VARCHAR,
                amount DECIMAL(10,2),
                payment_method VARCHAR,
                status VARCHAR,
                gateway VARCHAR,
                created_at TIMESTAMP,
                completed_at TIMESTAMP
            )`
        ];

        for (const sql of tables) {
            db.run(sql);
        }
        
        logger.info('DuckDB analytics tables created');
    }

    // Insert notification event
    async logNotificationEvent(event) {
        if (!db) return this.logToPostgres('notification_events', event);

        const now = new Date();
        const sql = `
            INSERT INTO notification_events 
            (id, event_type, user_id, user_type, channel, status, workflow_name, processing_time_ms, created_at, hour_of_day, day_of_week, success)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.run(sql, [
            event.id || require('uuid').v4(),
            event.eventType,
            event.userId,
            event.userType,
            event.channel,
            event.status,
            event.workflowName,
            event.processingTimeMs,
            now.toISOString(),
            now.getHours(),
            now.getDay(),
            event.status === 'sent'
        ]);
    }

    // Insert appointment analytics
    async logAppointmentEvent(appointment) {
        if (!db) return this.logToPostgres('appointment_analytics', appointment);

        const sql = `
            INSERT INTO appointment_analytics 
            (id, doctor_id, patient_id, status, consultation_type, duration_minutes, amount, created_at, completed_at, rating)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                status = excluded.status,
                completed_at = excluded.completed_at,
                rating = excluded.rating
        `;

        db.run(sql, [
            appointment.id,
            appointment.doctorId,
            appointment.patientId,
            appointment.status,
            appointment.consultationType,
            appointment.durationMinutes,
            appointment.amount,
            appointment.createdAt,
            appointment.completedAt,
            appointment.rating
        ]);
    }

    // Insert user engagement event
    async logUserEngagement(event) {
        if (!db) return this.logToPostgres('user_engagement', event);

        const sql = `
            INSERT INTO user_engagement 
            (id, user_id, user_type, event_type, session_id, device_type, platform, duration_seconds, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.run(sql, [
            event.id || require('uuid').v4(),
            event.userId,
            event.userType,
            event.eventType,
            event.sessionId,
            event.deviceType,
            event.platform,
            event.durationSeconds,
            new Date().toISOString()
        ]);
    }

    // Query notification analytics
    async getNotificationAnalytics(options = {}) {
        const { timeRange = '24h', groupBy = 'hour' } = options;

        if (!db) return this.getNotificationAnalyticsFromPostgres(options);

        const interval = timeRange === '24h' ? "INTERVAL '24 hours'" : "INTERVAL '7 days'";
        const groupColumn = groupBy === 'hour' ? 'hour_of_day' : 'day_of_week';

        const sql = `
            SELECT 
                ${groupColumn} as time_group,
                event_type,
                channel,
                COUNT(*) as total_count,
                SUM(CASE WHEN success THEN 1 ELSE 0 END) as success_count,
                AVG(processing_time_ms) as avg_processing_time
            FROM notification_events
            WHERE created_at >= NOW() - ${interval}
            GROUP BY ${groupColumn}, event_type, channel
            ORDER BY time_group, total_count DESC
        `;

        return new Promise((resolve, reject) => {
            db.all(sql, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // Query appointment analytics
    async getAppointmentAnalytics(options = {}) {
        const { timeRange = '7d', doctorId } = options;

        if (!db) return this.getAppointmentAnalyticsFromPostgres(options);

        const interval = timeRange === '24h' ? "INTERVAL '24 hours'" : "INTERVAL '7 days'";
        const doctorFilter = doctorId ? `AND doctor_id = '${doctorId}'` : '';

        const sql = `
            SELECT 
                DATE_TRUNC('day', created_at) as date,
                status,
                consultation_type,
                COUNT(*) as appointment_count,
                SUM(amount) as total_revenue,
                AVG(duration_minutes) as avg_duration,
                AVG(rating) as avg_rating
            FROM appointment_analytics
            WHERE created_at >= NOW() - ${interval} ${doctorFilter}
            GROUP BY DATE_TRUNC('day', created_at), status, consultation_type
            ORDER BY date DESC
        `;

        return new Promise((resolve, reject) => {
            db.all(sql, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // Query user engagement
    async getUserEngagementAnalytics(options = {}) {
        const { timeRange = '7d', userType } = options;

        if (!db) return this.getUserEngagementFromPostgres(options);

        const interval = timeRange === '24h' ? "INTERVAL '24 hours'" : "INTERVAL '7 days'";
        const typeFilter = userType ? `AND user_type = '${userType}'` : '';

        const sql = `
            SELECT 
                event_type,
                platform,
                device_type,
                COUNT(DISTINCT user_id) as unique_users,
                COUNT(*) as total_events,
                AVG(duration_seconds) as avg_session_duration
            FROM user_engagement
            WHERE created_at >= NOW() - ${interval} ${typeFilter}
            GROUP BY event_type, platform, device_type
            ORDER BY total_events DESC
        `;

        return new Promise((resolve, reject) => {
            db.all(sql, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // Sync data from PostgreSQL (for historical data)
    startSync() {
        // Sync every hour
        this.syncInterval = setInterval(() => this.syncFromPostgres(), 60 * 60 * 1000);
        
        // Initial sync
        this.syncFromPostgres();
    }

    async syncFromPostgres() {
        if (!db) return;

        try {
            // Sync recent notification events
            const [notificationEvents] = await sequelize.query(`
                SELECT * FROM notification_events 
                WHERE created_at >= NOW() - INTERVAL '1 day'
                LIMIT 10000
            `);

            for (const event of notificationEvents) {
                await this.logNotificationEvent(event);
            }

            logger.info(`Synced ${notificationEvents.length} notification events to DuckDB`);
        } catch (error) {
            logger.error('Error syncing to DuckDB:', error);
        }
    }

    // Fallback to PostgreSQL
    async logToPostgres(table, data) {
        try {
            await sequelize.query(`
                INSERT INTO ${table} 
                (${Object.keys(data).join(', ')})
                VALUES (${Object.keys(data).map((_, i) => `$${i + 1}`).join(', ')})
            `, {
                bind: Object.values(data)
            });
        } catch (error) {
            logger.error(`Error logging to PostgreSQL ${table}:`, error);
        }
    }

    async getNotificationAnalyticsFromPostgres(options) {
        const { timeRange = '24h' } = options;
        const interval = timeRange === '24h' ? '24 hours' : '7 days';

        const [results] = await sequelize.query(`
            SELECT 
                EXTRACT(HOUR FROM created_at) as hour,
                event_type,
                channel,
                COUNT(*) as total,
                AVG(processing_time_ms) as avg_time
            FROM notification_events
            WHERE created_at >= NOW() - INTERVAL '${interval}'
            GROUP BY EXTRACT(HOUR FROM created_at), event_type, channel
            ORDER BY hour
        `);

        return results;
    }

    async getAppointmentAnalyticsFromPostgres(options) {
        const { timeRange = '7d' } = options;
        const interval = timeRange === '24h' ? '24 hours' : '7 days';

        const [results] = await sequelize.query(`
            SELECT 
                DATE_TRUNC('day', "createdAt") as date,
                status,
                "consultationType",
                COUNT(*) as count,
                SUM(amount) as revenue
            FROM appointments
            WHERE "createdAt" >= NOW() - INTERVAL '${interval}'
            GROUP BY DATE_TRUNC('day', "createdAt"), status, "consultationType"
            ORDER BY date DESC
        `);

        return results;
    }

    async getUserEngagementFromPostgres(options) {
        const [results] = await sequelize.query(`
            SELECT 
                'login' as event_type,
                COUNT(DISTINCT id) as unique_users,
                COUNT(*) as total_events
            FROM users
            WHERE "lastLogin" >= NOW() - INTERVAL '7 days'
        `);

        return results;
    }

    async close() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        if (db) {
            db.close();
        }
        logger.info('DuckDB Analytics Service closed');
    }

    getStatus() {
        return {
            initialized: this.initialized,
            duckdbAvailable: !!db,
            dbPath: DUCKDB_PATH
        };
    }
}

// Export singleton
const analyticsService = new DuckDBAnalyticsService();

module.exports = {
    DuckDBAnalyticsService,
    analyticsService
};
