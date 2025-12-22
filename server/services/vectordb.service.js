/**
 * VectorDB Service for Intelligent Notification Routing
 * Uses PostgreSQL pgvector extension for vector similarity search
 * Enables AI-powered notification targeting and personalization
 */

const { sequelize, DataTypes, Sequelize } = require('../config/database');
const logger = require('../config/logger');

// User Preference Embeddings for similarity search
const UserPreferenceVector = sequelize.define('UserPreferenceVector', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    userId: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true
    },
    userType: {
        type: DataTypes.ENUM('patient', 'doctor', 'admin', 'hospital'),
        allowNull: false
    },
    // Embedding vector (stored as array, use pgvector for production)
    embedding: {
        type: DataTypes.ARRAY(DataTypes.FLOAT),
        allowNull: true
    },
    // User preference features (used to generate embedding)
    features: {
        type: DataTypes.JSONB,
        defaultValue: {}
    },
    // Notification engagement metrics
    engagementScore: {
        type: DataTypes.FLOAT,
        defaultValue: 0.5
    },
    preferredChannels: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: ['push', 'in-app']
    },
    preferredTimes: {
        type: DataTypes.JSONB,
        defaultValue: { start: '08:00', end: '21:00' }
    },
    notificationFrequency: {
        type: DataTypes.ENUM('high', 'medium', 'low'),
        defaultValue: 'medium'
    }
}, {
    tableName: 'user_preference_vectors',
    timestamps: true,
    indexes: [
        { fields: ['userId'] },
        { fields: ['userType'] },
        { fields: ['engagementScore'] }
    ]
});

// Notification Template Embeddings for semantic matching
const NotificationTemplateVector = sequelize.define('NotificationTemplateVector', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    templateName: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true
    },
    category: {
        type: DataTypes.STRING(50),
        allowNull: false
    },
    embedding: {
        type: DataTypes.ARRAY(DataTypes.FLOAT),
        allowNull: true
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    targetAudience: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: ['all']
    },
    priority: {
        type: DataTypes.ENUM('critical', 'high', 'medium', 'low'),
        defaultValue: 'medium'
    }
}, {
    tableName: 'notification_template_vectors',
    timestamps: true
});

// Similar Users Cache for recommendations
const SimilarUsersCache = sequelize.define('SimilarUsersCache', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    userId: {
        type: DataTypes.UUID,
        allowNull: false
    },
    similarUserId: {
        type: DataTypes.UUID,
        allowNull: false
    },
    similarityScore: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    computedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'similar_users_cache',
    timestamps: false,
    indexes: [
        { fields: ['userId'] },
        { fields: ['similarUserId'] },
        { fields: ['similarityScore'] }
    ]
});

class VectorDBService {
    constructor() {
        this.initialized = false;
        this.embeddingDimension = 128; // Default embedding size
    }

    async initialize() {
        try {
            // Sync models
            await UserPreferenceVector.sync({ alter: true });
            await NotificationTemplateVector.sync({ alter: true });
            await SimilarUsersCache.sync({ alter: true });

            // Try to enable pgvector extension (optional)
            await this.enablePgVector();

            this.initialized = true;
            logger.info('VectorDB Service initialized');
            return true;
        } catch (error) {
            logger.error('Failed to initialize VectorDB Service:', error);
            return false;
        }
    }

    async enablePgVector() {
        try {
            await sequelize.query('CREATE EXTENSION IF NOT EXISTS vector');
            logger.info('pgvector extension enabled');
            
            // Create vector column if not exists
            await sequelize.query(`
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'user_preference_vectors' 
                        AND column_name = 'embedding_vector'
                    ) THEN
                        ALTER TABLE user_preference_vectors 
                        ADD COLUMN embedding_vector vector(${this.embeddingDimension});
                    END IF;
                END $$;
            `);
        } catch (error) {
            logger.warn('pgvector not available, using array-based similarity:', error.message);
        }
    }

    // Generate embedding from user preferences/behavior
    generateEmbedding(features) {
        // Simple embedding generation (in production, use actual ML model)
        const embedding = new Array(this.embeddingDimension).fill(0);
        
        // Feature extraction
        if (features.appointmentCount) {
            embedding[0] = Math.min(features.appointmentCount / 100, 1);
        }
        if (features.notificationClickRate) {
            embedding[1] = features.notificationClickRate;
        }
        if (features.avgResponseTime) {
            embedding[2] = Math.min(features.avgResponseTime / 3600, 1); // Normalize to hour
        }
        if (features.preferredChannel === 'push') embedding[3] = 1;
        if (features.preferredChannel === 'email') embedding[4] = 1;
        if (features.preferredChannel === 'sms') embedding[5] = 1;
        if (features.preferredChannel === 'whatsapp') embedding[6] = 1;
        
        // Time preferences (hour buckets)
        if (features.activeHours) {
            features.activeHours.forEach(hour => {
                if (hour >= 0 && hour < 24) {
                    embedding[10 + hour] = 1;
                }
            });
        }

        // Normalize embedding
        const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        if (magnitude > 0) {
            for (let i = 0; i < embedding.length; i++) {
                embedding[i] /= magnitude;
            }
        }

        return embedding;
    }

    // Calculate cosine similarity between two embeddings
    cosineSimilarity(embedding1, embedding2) {
        if (!embedding1 || !embedding2) return 0;
        if (embedding1.length !== embedding2.length) return 0;

        let dotProduct = 0;
        let magnitude1 = 0;
        let magnitude2 = 0;

        for (let i = 0; i < embedding1.length; i++) {
            dotProduct += embedding1[i] * embedding2[i];
            magnitude1 += embedding1[i] * embedding1[i];
            magnitude2 += embedding2[i] * embedding2[i];
        }

        magnitude1 = Math.sqrt(magnitude1);
        magnitude2 = Math.sqrt(magnitude2);

        if (magnitude1 === 0 || magnitude2 === 0) return 0;
        return dotProduct / (magnitude1 * magnitude2);
    }

    // Update user preference embedding
    async updateUserEmbedding(userId, userType, features) {
        try {
            const embedding = this.generateEmbedding(features);

            const [preference, created] = await UserPreferenceVector.findOrCreate({
                where: { userId },
                defaults: {
                    userId,
                    userType,
                    embedding,
                    features
                }
            });

            if (!created) {
                preference.embedding = embedding;
                preference.features = { ...preference.features, ...features };
                await preference.save();
            }

            return preference;
        } catch (error) {
            logger.error('Error updating user embedding:', error);
            return null;
        }
    }

    // Find similar users for notification targeting
    async findSimilarUsers(userId, limit = 10) {
        try {
            const userPreference = await UserPreferenceVector.findOne({
                where: { userId }
            });

            if (!userPreference || !userPreference.embedding) {
                return [];
            }

            // Check cache first
            const cached = await SimilarUsersCache.findAll({
                where: {
                    userId,
                    computedAt: {
                        [Sequelize.Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hour cache
                    }
                },
                order: [['similarityScore', 'DESC']],
                limit
            });

            if (cached.length >= limit) {
                return cached.map(c => ({
                    userId: c.similarUserId,
                    similarity: c.similarityScore
                }));
            }

            // Calculate similarity for all users
            const allUsers = await UserPreferenceVector.findAll({
                where: {
                    userId: { [Sequelize.Op.ne]: userId },
                    userType: userPreference.userType
                }
            });

            const similarities = allUsers.map(u => ({
                userId: u.userId,
                similarity: this.cosineSimilarity(userPreference.embedding, u.embedding)
            })).sort((a, b) => b.similarity - a.similarity).slice(0, limit);

            // Update cache
            await SimilarUsersCache.destroy({ where: { userId } });
            await SimilarUsersCache.bulkCreate(
                similarities.map(s => ({
                    userId,
                    similarUserId: s.userId,
                    similarityScore: s.similarity
                }))
            );

            return similarities;
        } catch (error) {
            logger.error('Error finding similar users:', error);
            return [];
        }
    }

    // Find best notification template for user
    async findBestTemplate(userId, category) {
        try {
            const userPreference = await UserPreferenceVector.findOne({
                where: { userId }
            });

            const templates = await NotificationTemplateVector.findAll({
                where: { category }
            });

            if (!userPreference || !templates.length) {
                return templates[0] || null;
            }

            // Score templates by similarity and user engagement
            const scoredTemplates = templates.map(t => ({
                template: t,
                score: this.cosineSimilarity(userPreference.embedding, t.embedding || []) 
                    * userPreference.engagementScore
            })).sort((a, b) => b.score - a.score);

            return scoredTemplates[0]?.template || templates[0];
        } catch (error) {
            logger.error('Error finding best template:', error);
            return null;
        }
    }

    // Get optimal notification time for user
    async getOptimalNotificationTime(userId) {
        try {
            const preference = await UserPreferenceVector.findOne({
                where: { userId }
            });

            if (!preference || !preference.features.activeHours) {
                return { hour: 10, minute: 0 }; // Default morning
            }

            const activeHours = preference.features.activeHours;
            const peakHour = activeHours.reduce((max, hour, _, arr) => {
                const count = arr.filter(h => h === hour).length;
                return count > max.count ? { hour, count } : max;
            }, { hour: 10, count: 0 });

            return { hour: peakHour.hour, minute: 0 };
        } catch (error) {
            logger.error('Error getting optimal time:', error);
            return { hour: 10, minute: 0 };
        }
    }

    // Get recommended channels for user
    async getRecommendedChannels(userId) {
        try {
            const preference = await UserPreferenceVector.findOne({
                where: { userId }
            });

            if (!preference) {
                return ['push', 'in-app'];
            }

            return preference.preferredChannels;
        } catch (error) {
            logger.error('Error getting recommended channels:', error);
            return ['push', 'in-app'];
        }
    }

    // Update engagement score based on notification interaction
    async updateEngagementScore(userId, interacted, channel) {
        try {
            const preference = await UserPreferenceVector.findOne({
                where: { userId }
            });

            if (!preference) return;

            // Update engagement score (exponential moving average)
            const alpha = 0.1;
            const newScore = interacted ? 1 : 0;
            preference.engagementScore = alpha * newScore + (1 - alpha) * preference.engagementScore;

            // Update channel preferences
            if (interacted && channel) {
                const channels = preference.preferredChannels || [];
                if (!channels.includes(channel)) {
                    channels.unshift(channel);
                    preference.preferredChannels = channels.slice(0, 3);
                }
            }

            await preference.save();
        } catch (error) {
            logger.error('Error updating engagement score:', error);
        }
    }

    // Batch target users for notification campaign
    async targetUsersForCampaign(campaign) {
        try {
            const { category, targetAudience, maxUsers = 1000 } = campaign;

            // Get template embedding
            const template = await NotificationTemplateVector.findOne({
                where: { templateName: campaign.templateName }
            });

            // Find users matching criteria
            const whereClause = {};
            if (targetAudience && targetAudience !== 'all') {
                whereClause.userType = targetAudience;
            }

            const users = await UserPreferenceVector.findAll({
                where: {
                    ...whereClause,
                    engagementScore: { [Sequelize.Op.gte]: 0.3 } // Filter low engagement
                },
                order: [['engagementScore', 'DESC']],
                limit: maxUsers
            });

            // Score and sort by template relevance
            const targetedUsers = users.map(u => ({
                userId: u.userId,
                userType: u.userType,
                channels: u.preferredChannels,
                score: template 
                    ? this.cosineSimilarity(u.embedding, template.embedding) * u.engagementScore
                    : u.engagementScore
            })).sort((a, b) => b.score - a.score);

            return targetedUsers;
        } catch (error) {
            logger.error('Error targeting users for campaign:', error);
            return [];
        }
    }

    getStatus() {
        return {
            initialized: this.initialized,
            embeddingDimension: this.embeddingDimension
        };
    }
}

// Export singleton
const vectorDBService = new VectorDBService();

module.exports = {
    VectorDBService,
    vectorDBService,
    UserPreferenceVector,
    NotificationTemplateVector,
    SimilarUsersCache
};
