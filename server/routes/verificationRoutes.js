/**
 * Option 4: Crowdsource Verification API Routes
 * Handles user reports, profile claims, reviews, and community verification
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const auth = require('../middleware/auth');

// ===================================
// VERIFICATION REPORTS (Report incorrect info)
// ===================================

/**
 * POST /api/verification/report
 * Submit a report about incorrect provider information
 */
router.post('/report', auth.optional, async (req, res) => {
    try {
        const {
            entity_type,
            entity_id,
            report_type,
            field_reported,
            current_value,
            suggested_value,
            additional_notes,
            reporter_name,
            reporter_email,
            reporter_phone,
            is_anonymous
        } = req.body;

        // Validate required fields
        if (!entity_type || !entity_id || !report_type) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Get entity unique_id
        const entityTable = entity_type === 'doctor' ? 'doctors' : 
                           entity_type === 'hospital' ? 'hospitals' :
                           entity_type === 'lab' ? 'labs' : 'provider_clinics';
        
        const entityResult = await pool.query(
            `SELECT unique_id FROM ${entityTable} WHERE id = $1`,
            [entity_id]
        );
        
        const entity_unique_id = entityResult.rows[0]?.unique_id;

        const result = await pool.query(`
            INSERT INTO verification_reports (
                entity_type, entity_id, entity_unique_id,
                reporter_user_id, reporter_name, reporter_email, reporter_phone,
                is_anonymous, report_type, field_reported,
                current_value, suggested_value, additional_notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING id, created_at
        `, [
            entity_type, entity_id, entity_unique_id,
            req.user?.id || null, 
            is_anonymous ? null : reporter_name,
            is_anonymous ? null : reporter_email,
            is_anonymous ? null : reporter_phone,
            is_anonymous || false,
            report_type, field_reported,
            current_value, suggested_value, additional_notes
        ]);

        res.status(201).json({
            success: true,
            message: 'Report submitted successfully. Our team will review it shortly.',
            report_id: result.rows[0].id
        });

    } catch (error) {
        console.error('Error submitting report:', error);
        res.status(500).json({ error: 'Failed to submit report' });
    }
});

/**
 * GET /api/verification/reports/:entityType/:entityId
 * Get reports for an entity (admin only)
 */
router.get('/reports/:entityType/:entityId', auth.admin, async (req, res) => {
    try {
        const { entityType, entityId } = req.params;
        
        const result = await pool.query(`
            SELECT * FROM verification_reports 
            WHERE entity_type = $1 AND entity_id = $2
            ORDER BY created_at DESC
        `, [entityType, entityId]);

        res.json({ reports: result.rows });
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

// ===================================
// PROFILE CLAIMS
// ===================================

/**
 * POST /api/verification/claim
 * Submit a profile claim request
 */
router.post('/claim', auth.required, async (req, res) => {
    try {
        const {
            entity_type,
            entity_id,
            claimant_name,
            claimant_email,
            claimant_phone,
            claimant_role,
            registration_number,
            license_number,
            medical_council,
            gst_number,
            proof_documents
        } = req.body;

        // Check if already claimed
        const existingClaim = await pool.query(`
            SELECT id, status FROM profile_claims 
            WHERE entity_type = $1 AND entity_id = $2 
            AND status IN ('pending', 'under_review', 'approved')
        `, [entity_type, entity_id]);

        if (existingClaim.rows.length > 0) {
            const status = existingClaim.rows[0].status;
            if (status === 'approved') {
                return res.status(400).json({ error: 'This profile has already been claimed' });
            }
            return res.status(400).json({ error: 'A claim for this profile is already pending' });
        }

        // Get entity unique_id
        const entityTable = entity_type === 'doctor' ? 'doctors' : 
                           entity_type === 'hospital' ? 'hospitals' :
                           entity_type === 'lab' ? 'labs' : 'provider_clinics';
        
        const entityResult = await pool.query(
            `SELECT unique_id FROM ${entityTable} WHERE id = $1`,
            [entity_id]
        );
        
        const entity_unique_id = entityResult.rows[0]?.unique_id;

        const result = await pool.query(`
            INSERT INTO profile_claims (
                entity_type, entity_id, entity_unique_id,
                claimant_user_id, claimant_name, claimant_email, claimant_phone,
                claimant_role, registration_number, license_number,
                medical_council, gst_number, proof_documents
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING id, created_at
        `, [
            entity_type, entity_id, entity_unique_id,
            req.user.id, claimant_name, claimant_email, claimant_phone,
            claimant_role, registration_number, license_number,
            medical_council, gst_number, proof_documents || []
        ]);

        res.status(201).json({
            success: true,
            message: 'Claim submitted successfully. You will be contacted for verification.',
            claim_id: result.rows[0].id
        });

    } catch (error) {
        console.error('Error submitting claim:', error);
        res.status(500).json({ error: 'Failed to submit claim' });
    }
});

/**
 * GET /api/verification/claim/status/:claimId
 * Check claim status
 */
router.get('/claim/status/:claimId', auth.required, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, entity_type, entity_unique_id, status, 
                   rejection_reason, created_at, approved_at
            FROM profile_claims 
            WHERE id = $1 AND claimant_user_id = $2
        `, [req.params.claimId, req.user.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Claim not found' });
        }

        res.json({ claim: result.rows[0] });
    } catch (error) {
        console.error('Error fetching claim status:', error);
        res.status(500).json({ error: 'Failed to fetch claim status' });
    }
});

// ===================================
// REVIEWS & RATINGS
// ===================================

/**
 * POST /api/verification/review
 * Submit a review for a provider
 */
router.post('/review', auth.required, async (req, res) => {
    try {
        const {
            entity_type,
            entity_id,
            overall_rating,
            cleanliness_rating,
            staff_behavior_rating,
            wait_time_rating,
            value_for_money_rating,
            title,
            review_text,
            visit_date,
            treatment_type,
            appointment_id
        } = req.body;

        if (!entity_type || !entity_id || !overall_rating) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Check for existing review
        const existing = await pool.query(`
            SELECT id FROM provider_reviews 
            WHERE entity_type = $1 AND entity_id = $2 AND user_id = $3
        `, [entity_type, entity_id, req.user.id]);

        if (existing.rows.length > 0) {
            return res.status(400).json({ 
                error: 'You have already reviewed this provider',
                existing_review_id: existing.rows[0].id
            });
        }

        // Check if user had an appointment (verified patient)
        let is_verified_patient = false;
        if (appointment_id) {
            const apptCheck = await pool.query(`
                SELECT id FROM appointments 
                WHERE id = $1 AND "userId" = $2
            `, [appointment_id, req.user.id]);
            is_verified_patient = apptCheck.rows.length > 0;
        }

        const entityTable = entity_type === 'doctor' ? 'doctors' : 
                           entity_type === 'hospital' ? 'hospitals' :
                           entity_type === 'lab' ? 'labs' : 'provider_clinics';
        
        const entityResult = await pool.query(
            `SELECT unique_id FROM ${entityTable} WHERE id = $1`,
            [entity_id]
        );
        
        const entity_unique_id = entityResult.rows[0]?.unique_id;

        const result = await pool.query(`
            INSERT INTO provider_reviews (
                entity_type, entity_id, entity_unique_id,
                user_id, is_verified_patient, appointment_id,
                overall_rating, cleanliness_rating, staff_behavior_rating,
                wait_time_rating, value_for_money_rating,
                title, review_text, visit_date, treatment_type,
                is_verified, verification_method
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING id, created_at
        `, [
            entity_type, entity_id, entity_unique_id,
            req.user.id, is_verified_patient, appointment_id || null,
            overall_rating, cleanliness_rating, staff_behavior_rating,
            wait_time_rating, value_for_money_rating,
            title, review_text, visit_date, treatment_type,
            is_verified_patient, is_verified_patient ? 'appointment' : null
        ]);

        res.status(201).json({
            success: true,
            message: 'Review submitted successfully',
            review_id: result.rows[0].id,
            is_verified: is_verified_patient
        });

    } catch (error) {
        console.error('Error submitting review:', error);
        res.status(500).json({ error: 'Failed to submit review' });
    }
});

/**
 * GET /api/verification/reviews/:entityType/:entityId
 * Get reviews for a provider
 */
router.get('/reviews/:entityType/:entityId', async (req, res) => {
    try {
        const { entityType, entityId } = req.params;
        const { page = 1, limit = 10, sort = 'recent' } = req.query;

        const offset = (page - 1) * limit;
        const orderBy = sort === 'rating' ? 'overall_rating DESC' : 'created_at DESC';

        const reviews = await pool.query(`
            SELECT 
                pr.*,
                u."firstName" as reviewer_first_name,
                u."lastName" as reviewer_last_name
            FROM provider_reviews pr
            LEFT JOIN users u ON pr.user_id = u.id
            WHERE pr.entity_type = $1 AND pr.entity_id = $2 AND pr.status = 'active'
            ORDER BY ${orderBy}
            LIMIT $3 OFFSET $4
        `, [entityType, entityId, limit, offset]);

        // Get aggregate stats
        const stats = await pool.query(`
            SELECT 
                COUNT(*) as total_reviews,
                AVG(overall_rating) as avg_rating,
                COUNT(*) FILTER (WHERE is_verified_patient = true) as verified_reviews,
                AVG(cleanliness_rating) as avg_cleanliness,
                AVG(staff_behavior_rating) as avg_staff,
                AVG(wait_time_rating) as avg_wait_time,
                AVG(value_for_money_rating) as avg_value
            FROM provider_reviews
            WHERE entity_type = $1 AND entity_id = $2 AND status = 'active'
        `, [entityType, entityId]);

        res.json({
            reviews: reviews.rows,
            stats: stats.rows[0],
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: parseInt(stats.rows[0].total_reviews)
            }
        });

    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(500).json({ error: 'Failed to fetch reviews' });
    }
});

// ===================================
// COMMUNITY VERIFICATION
// ===================================

/**
 * POST /api/verification/community-vote
 * Submit a community verification vote
 */
router.post('/community-vote', auth.required, async (req, res) => {
    try {
        const {
            entity_type,
            entity_id,
            verification_type,
            vote,
            confidence_level,
            notes,
            last_visit_date
        } = req.body;

        if (!entity_type || !entity_id || !verification_type || !vote) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Upsert vote
        const result = await pool.query(`
            INSERT INTO community_verifications (
                entity_type, entity_id, user_id,
                verification_type, vote, confidence_level,
                notes, last_visit_date
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (entity_type, entity_id, user_id, verification_type)
            DO UPDATE SET 
                vote = EXCLUDED.vote,
                confidence_level = EXCLUDED.confidence_level,
                notes = EXCLUDED.notes,
                last_visit_date = EXCLUDED.last_visit_date,
                created_at = CURRENT_TIMESTAMP
            RETURNING id
        `, [
            entity_type, entity_id, req.user.id,
            verification_type, vote, confidence_level,
            notes, last_visit_date
        ]);

        // Get updated community verification stats
        const stats = await pool.query(`
            SELECT 
                verification_type,
                COUNT(*) FILTER (WHERE vote = 'confirm') as confirmations,
                COUNT(*) FILTER (WHERE vote = 'deny') as denials,
                COUNT(*) FILTER (WHERE vote = 'unsure') as unsure,
                AVG(confidence_level) as avg_confidence
            FROM community_verifications
            WHERE entity_type = $1 AND entity_id = $2
            GROUP BY verification_type
        `, [entity_type, entity_id]);

        res.json({
            success: true,
            message: 'Vote recorded',
            verification_stats: stats.rows
        });

    } catch (error) {
        console.error('Error submitting vote:', error);
        res.status(500).json({ error: 'Failed to submit vote' });
    }
});

/**
 * GET /api/verification/community-stats/:entityType/:entityId
 * Get community verification stats for a provider
 */
router.get('/community-stats/:entityType/:entityId', async (req, res) => {
    try {
        const { entityType, entityId } = req.params;

        const stats = await pool.query(`
            SELECT 
                verification_type,
                COUNT(*) FILTER (WHERE vote = 'confirm') as confirmations,
                COUNT(*) FILTER (WHERE vote = 'deny') as denials,
                COUNT(*) FILTER (WHERE vote = 'unsure') as unsure,
                ROUND(AVG(confidence_level)::numeric, 1) as avg_confidence
            FROM community_verifications
            WHERE entity_type = $1 AND entity_id = $2
            GROUP BY verification_type
        `, [entityType, entityId]);

        // Calculate overall community trust score
        const totalConfirms = stats.rows.reduce((sum, r) => sum + parseInt(r.confirmations), 0);
        const totalDenials = stats.rows.reduce((sum, r) => sum + parseInt(r.denials), 0);
        const total = totalConfirms + totalDenials;
        const trustScore = total > 0 ? Math.round((totalConfirms / total) * 100) : null;

        res.json({
            verification_stats: stats.rows,
            trust_score: trustScore,
            total_votes: total
        });

    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ===================================
// VERIFICATION BADGES
// ===================================

/**
 * GET /api/verification/badges/:entityType/:entityId
 * Get badges for a provider
 */
router.get('/badges/:entityType/:entityId', async (req, res) => {
    try {
        const { entityType, entityId } = req.params;

        const badges = await pool.query(`
            SELECT badge_type, badge_level, awarded_by, awarded_reason, valid_from, valid_until
            FROM verification_badges
            WHERE entity_type = $1 AND entity_id = $2 AND is_active = true
            AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
        `, [entityType, entityId]);

        res.json({ badges: badges.rows });

    } catch (error) {
        console.error('Error fetching badges:', error);
        res.status(500).json({ error: 'Failed to fetch badges' });
    }
});

/**
 * GET /api/verification/summary/:entityType/:entityId
 * Get complete verification summary for a provider
 */
router.get('/summary/:entityType/:entityId', async (req, res) => {
    try {
        const { entityType, entityId } = req.params;

        // Get entity metadata
        const entityTable = entityType === 'doctor' ? 'doctors' : 
                           entityType === 'hospital' ? 'hospitals' :
                           entityType === 'lab' ? 'labs' : 'provider_clinics';
        
        const entity = await pool.query(
            `SELECT id, unique_id, metadata FROM ${entityTable} WHERE id = $1`,
            [entityId]
        );

        if (entity.rows.length === 0) {
            return res.status(404).json({ error: 'Entity not found' });
        }

        // Get badges
        const badges = await pool.query(`
            SELECT badge_type, badge_level FROM verification_badges
            WHERE entity_type = $1 AND entity_id = $2 AND is_active = true
        `, [entityType, entityId]);

        // Get claim status
        const claim = await pool.query(`
            SELECT status FROM profile_claims
            WHERE entity_type = $1 AND entity_id = $2
            ORDER BY created_at DESC LIMIT 1
        `, [entityType, entityId]);

        // Get review stats
        const reviews = await pool.query(`
            SELECT 
                COUNT(*) as total_reviews,
                ROUND(AVG(overall_rating)::numeric, 1) as avg_rating
            FROM provider_reviews
            WHERE entity_type = $1 AND entity_id = $2 AND status = 'active'
        `, [entityType, entityId]);

        // Get community stats
        const community = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE vote = 'confirm') as confirmations,
                COUNT(*) FILTER (WHERE vote = 'deny') as denials
            FROM community_verifications
            WHERE entity_type = $1 AND entity_id = $2
        `, [entityType, entityId]);

        const metadata = entity.rows[0].metadata || {};

        res.json({
            entity_id: entityId,
            unique_id: entity.rows[0].unique_id,
            verification_summary: {
                // Government verification
                nmc_verified: metadata.nmc_verified || false,
                nabh_accredited: metadata.nabh_accredited || false,
                nabl_accredited: metadata.nabl_accredited || false,
                
                // Web verification
                web_verified: metadata.web_verified || false,
                
                // Profile claim
                profile_claimed: claim.rows[0]?.status === 'approved',
                claim_status: claim.rows[0]?.status || null,
                
                // Badges
                badges: badges.rows.map(b => b.badge_type),
                
                // Reviews
                total_reviews: parseInt(reviews.rows[0].total_reviews) || 0,
                avg_rating: parseFloat(reviews.rows[0].avg_rating) || null,
                
                // Community trust
                community_confirmations: parseInt(community.rows[0].confirmations) || 0,
                community_denials: parseInt(community.rows[0].denials) || 0
            }
        });

    } catch (error) {
        console.error('Error fetching verification summary:', error);
        res.status(500).json({ error: 'Failed to fetch verification summary' });
    }
});

module.exports = router;
