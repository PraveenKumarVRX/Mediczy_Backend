import { Router } from 'express';
import { sequelize } from '../db/mariadb.js';
import { QueryTypes } from 'sequelize';

const router = Router();

// Get all hospitals (public - for users to view)
router.get('/hospitals', async (req, res) => {
  try {
    const { 
      city, 
      state, 
      pincode, 
      search,
      page = 1, 
      limit = 20,
      is_spn // Filter for SPN hospitals
    } = req.query;

    const offset = (page - 1) * limit;
    let whereClause = 'WHERE 1=1';
    const replacements = {};

    if (city) {
      whereClause += ' AND city LIKE :city';
      replacements.city = `%${city}%`;
    }

    if (state) {
      whereClause += ' AND state LIKE :state';
      replacements.state = `%${state}%`;
    }

    if (pincode) {
      whereClause += ' AND pincode = :pincode';
      replacements.pincode = pincode;
    }

    if (search) {
      whereClause += ' AND (name LIKE :search OR address LIKE :search)';
      replacements.search = `%${search}%`;
    }

    if (is_spn === 'true') {
      whereClause += ' AND is_spn = true';
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM hospitals ${whereClause}`;
    const [countResult] = await sequelize.query(countQuery, {
      replacements,
      type: QueryTypes.SELECT
    });

    // Get hospitals
    const query = `
      SELECT 
        id,
        name,
        address,
        city,
        state,
        pincode,
        phone,
        mobile,
        email,
        entity_type,
        google_place_id,
        is_spn,
        active
      FROM hospitals 
      ${whereClause}
      ORDER BY 
        CASE WHEN is_spn = true THEN 0 ELSE 1 END,
        name
      LIMIT :limit OFFSET :offset
    `;

    const hospitals = await sequelize.query(query, {
      replacements: { ...replacements, limit: parseInt(limit), offset },
      type: QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: hospitals,
      pagination: {
        total: countResult.total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult.total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching hospitals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch hospitals'
    });
  }
});

// Get hospital by ID (public)
router.get('/hospitals/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [hospital] = await sequelize.query(
      `SELECT 
        id,
        name,
        address,
        city,
        state,
        pincode,
        phone,
        mobile,
        email,
        entity_type,
        google_place_id,
        is_spn,
        active,
        created_at
      FROM hospitals 
      WHERE id = :id`,
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );

    if (!hospital) {
      return res.status(404).json({
        success: false,
        error: 'Hospital not found'
      });
    }

    res.json({
      success: true,
      data: hospital
    });
  } catch (error) {
    console.error('Error fetching hospital:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch hospital details'
    });
  }
});

// Get hospital by Google Place ID (public)
router.get('/hospitals/place/:placeId', async (req, res) => {
  try {
    const { placeId } = req.params;

    const [hospital] = await sequelize.query(
      `SELECT 
        id,
        name,
        address,
        city,
        state,
        pincode,
        phone,
        mobile,
        email,
        entity_type,
        google_place_id,
        is_spn,
        active
      FROM hospitals 
      WHERE google_place_id = :placeId`,
      {
        replacements: { placeId },
        type: QueryTypes.SELECT
      }
    );

    if (!hospital) {
      return res.status(404).json({
        success: false,
        error: 'Hospital not found'
      });
    }

    res.json({
      success: true,
      data: hospital
    });
  } catch (error) {
    console.error('Error fetching hospital by place ID:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch hospital details'
    });
  }
});

// Get SPN hospitals only (public)
router.get('/hospitals/spn/list', async (req, res) => {
  try {
    const { city, state, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE is_spn = true AND active = true';
    const replacements = {};

    if (city) {
      whereClause += ' AND city LIKE :city';
      replacements.city = `%${city}%`;
    }

    if (state) {
      whereClause += ' AND state LIKE :state';
      replacements.state = `%${state}%`;
    }

    const countQuery = `SELECT COUNT(*) as total FROM hospitals ${whereClause}`;
    const [countResult] = await sequelize.query(countQuery, {
      replacements,
      type: QueryTypes.SELECT
    });

    const query = `
      SELECT 
        id,
        name,
        address,
        city,
        state,
        pincode,
        phone,
        mobile,
        email,
        google_place_id
      FROM hospitals 
      ${whereClause}
      ORDER BY name
      LIMIT :limit OFFSET :offset
    `;

    const hospitals = await sequelize.query(query, {
      replacements: { ...replacements, limit: parseInt(limit), offset },
      type: QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: hospitals,
      pagination: {
        total: countResult.total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult.total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching SPN hospitals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch SPN hospitals'
    });
  }
});

// Get hospital statistics (public)
router.get('/hospitals/stats/overview', async (req, res) => {
  try {
    const [stats] = await sequelize.query(
      `SELECT 
        COUNT(*) as total_hospitals,
        SUM(CASE WHEN is_spn = true THEN 1 ELSE 0 END) as spn_hospitals,
        SUM(CASE WHEN has_admin_access = true THEN 1 ELSE 0 END) as hospitals_with_admin,
        COUNT(DISTINCT state) as states_covered,
        COUNT(DISTINCT city) as cities_covered
      FROM hospitals 
      WHERE active = true`,
      { type: QueryTypes.SELECT }
    );

    const stateStats = await sequelize.query(
      `SELECT 
        state,
        COUNT(*) as total,
        SUM(CASE WHEN is_spn = true THEN 1 ELSE 0 END) as spn_count
      FROM hospitals 
      WHERE active = true AND state IS NOT NULL AND state != ''
      GROUP BY state 
      ORDER BY total DESC 
      LIMIT 10`,
      { type: QueryTypes.SELECT }
    );

    res.json({
      success: true,
      data: {
        overview: stats,
        topStates: stateStats
      }
    });
  } catch (error) {
    console.error('Error fetching hospital statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

export default router;
