/**
 * Aggregator Controller
 * Handles multi-level organizational hierarchy operations
 * Routes for: Aggregator management, Corporate clients, Wellness partners
 */

import AggregatorService from '../services/aggregator.service.js';

class AggregatorController {
  /**
   * GET /api/aggregators/profile
   * Get aggregator profile with network statistics
   */
  static getProfile = async (req, res) => {
    try {
      const { aggregatorId, aggregatorType } = req.user;

      if (!aggregatorId || !aggregatorType) {
        return res.status(403).json({
          success: false,
          message: 'Not an aggregator user',
          code: 'NOT_AGGREGATOR',
        });
      }

      const profile = await AggregatorService.getAggregatorProfile(
        aggregatorId,
        aggregatorType
      );

      if (!profile) {
        return res.status(404).json({
          success: false,
          message: 'Aggregator not found',
        });
      }

      res.json({
        success: true,
        aggregator: profile,
      });
    } catch (error) {
      console.error('Error fetching aggregator profile:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching aggregator profile',
        error: error.message,
      });
    }
  };

  /**
   * GET /api/aggregators/corporates
   * List all corporate clients under aggregator
   */
  static getCorporates = async (req, res) => {
    try {
      const { aggregatorId, aggregatorType } = req.user;
      const { limit = 50, offset = 0, status = 'all' } = req.query;

      if (!aggregatorId) {
        return res.status(403).json({
          success: false,
          message: 'Not an aggregator user',
        });
      }

      const corporates = await AggregatorService.getAggregatorCorporates(
        aggregatorId,
        {
          limit: parseInt(limit),
          offset: parseInt(offset),
          status,
        }
      );

      res.json({
        success: true,
        data: corporates,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: corporates.length,
        },
      });
    } catch (error) {
      console.error('Error fetching corporates:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching corporate clients',
        error: error.message,
      });
    }
  };

  /**
   * GET /api/aggregators/wellness-partners
   * Get aggregator's wellness network partners
   */
  static getWellnessPartners = async (req, res) => {
    try {
      const { aggregatorId, aggregatorType } = req.user;
      const {
        partnerType = 'all',
        status = 'active',
        limit = 50,
        offset = 0,
      } = req.query;

      if (!aggregatorId) {
        return res.status(403).json({
          success: false,
          message: 'Not an aggregator user',
        });
      }

      const partners = await AggregatorService.getWellnessPartners(
        aggregatorId,
        aggregatorType,
        {
          partnerType,
          status,
          limit: parseInt(limit),
          offset: parseInt(offset),
        }
      );

      res.json({
        success: true,
        data: partners,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: partners.length,
        },
      });
    } catch (error) {
      console.error('Error fetching wellness partners:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching wellness partners',
        error: error.message,
      });
    }
  };

  /**
   * POST /api/aggregators/wellness-partners
   * Add wellness partner to aggregator's network
   */
  static addWellnessPartner = async (req, res) => {
    try {
      const { aggregatorId, aggregatorType, id: userId } = req.user;

      if (!aggregatorId) {
        return res.status(403).json({
          success: false,
          message: 'Not an aggregator user',
        });
      }

      const {
        wellnessProviderType,
        wellnessProviderId,
        commissionPercentage,
        contractStartDate,
        contractEndDate,
        serviceCategories,
        coverageAreas,
        contactPerson,
      } = req.body;

      if (!wellnessProviderType || !wellnessProviderId) {
        return res.status(400).json({
          success: false,
          message: 'Partner type and ID are required',
        });
      }

      const newPartner = await AggregatorService.addWellnessPartner(
        aggregatorId,
        aggregatorType,
        {
          wellnessProviderType,
          wellnessProviderId,
          commissionPercentage,
          contractStartDate,
          contractEndDate,
          serviceCategories,
          coverageAreas,
          contactPerson,
        }
      );

      // Log action
      await AggregatorService.logAggregatorAction(
        aggregatorId,
        aggregatorType,
        userId,
        {
          actionType: 'add_partner',
          entityType: wellnessProviderType,
          entityId: wellnessProviderId,
          changes: {
            commission: commissionPercentage,
            contractStart: contractStartDate,
            contractEnd: contractEndDate,
          },
          ipAddress: req.ip,
        }
      );

      res.status(201).json({
        success: true,
        message: 'Partner added successfully',
        data: newPartner,
      });
    } catch (error) {
      console.error('Error adding wellness partner:', error);
      res.status(500).json({
        success: false,
        message: 'Error adding wellness partner',
        error: error.message,
      });
    }
  };

  /**
   * GET /api/aggregators/network-statistics
   * Get network statistics and analytics
   */
  static getNetworkStatistics = async (req, res) => {
    try {
      const { aggregatorId, aggregatorType } = req.user;

      if (!aggregatorId) {
        return res.status(403).json({
          success: false,
          message: 'Not an aggregator user',
        });
      }

      const statistics = await AggregatorService.getNetworkStatistics(
        aggregatorId,
        aggregatorType
      );

      res.json({
        success: true,
        data: statistics,
      });
    } catch (error) {
      console.error('Error fetching network statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching network statistics',
        error: error.message,
      });
    }
  };

  /**
   * GET /api/corporates/:corporateId/employees
   * Get employees of a corporate
   */
  static getCorporateEmployees = async (req, res) => {
    try {
      const { corporateId } = req.params;
      const { aggregatorId } = req.user;
      const { isActive = true, limit = 50, offset = 0 } = req.query;

      // Verify user is authorized (corporate admin or aggregator admin)
      if (!aggregatorId && req.user.corporate_id !== parseInt(corporateId)) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this corporate employees',
        });
      }

      const employees = await AggregatorService.getCorporateEmployees(
        parseInt(corporateId),
        {
          isActive: isActive === 'true',
          limit: parseInt(limit),
          offset: parseInt(offset),
        }
      );

      res.json({
        success: true,
        data: employees,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: employees.length,
        },
      });
    } catch (error) {
      console.error('Error fetching corporate employees:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching corporate employees',
        error: error.message,
      });
    }
  };

  /**
   * GET /api/corporates/:corporateId/wellness-partners
   * Get wellness partners accessible to corporate
   */
  static getCorporateAccessiblePartners = async (req, res) => {
    try {
      const { corporateId } = req.params;

      // Verify user is corporate employee or aggregator
      if (
        req.user.corporate_id !== parseInt(corporateId) &&
        !req.user.aggregatorId
      ) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this corporate partners',
        });
      }

      const partners =
        await AggregatorService.getCorporateAccessiblePartners(
          parseInt(corporateId)
        );

      res.json({
        success: true,
        data: partners,
      });
    } catch (error) {
      console.error('Error fetching corporate accessible partners:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching corporate accessible partners',
        error: error.message,
      });
    }
  };

  /**
   * GET /api/aggregators/action-logs
   * Get audit logs for aggregator actions
   */
  static getActionLogs = async (req, res) => {
    try {
      const { aggregatorId, aggregatorType } = req.user;
      const { limit = 100, offset = 0, actionType = null } = req.query;

      if (!aggregatorId) {
        return res.status(403).json({
          success: false,
          message: 'Not an aggregator user',
        });
      }

      let query = `
        SELECT * FROM aggregator_action_logs
        WHERE aggregator_id = $1 AND aggregator_type = $2
      `;

      const params = [aggregatorId, aggregatorType];

      if (actionType) {
        query += ` AND action_type = $3`;
        params.push(actionType);
      }

      query += ` ORDER BY "timestamp" DESC LIMIT $${params.length + 1} OFFSET $${
        params.length + 2
      }`;
      params.push(parseInt(limit), parseInt(offset));

      const { sequelize } = require('../models/index.js');
      const logs = await sequelize.query(query, {
        bind: params,
        type: sequelize.QueryTypes.SELECT,
      });

      res.json({
        success: true,
        data: logs,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: logs.length,
        },
      });
    } catch (error) {
      console.error('Error fetching action logs:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching action logs',
        error: error.message,
      });
    }
  };
}

export default AggregatorController;
