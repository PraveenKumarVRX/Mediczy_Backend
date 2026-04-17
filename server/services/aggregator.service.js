/**
 * Aggregator Service
 * Manages multi-level organizational hierarchy: Aggregator → Corporate → Employees → Wellness Partners
 * 
 * Supported Aggregator Types:
 * - Broker: Insurance broker aggregating corporates and partner networks
 * - TPA: Third-party administrator managing claims and authorizations
 * - Insurance Company: Direct insurance provider
 * - Hospital Network: Hospital-based healthcare network
 */

import { sequelize } from '../models/index.js';

class AggregatorService {
  /**
   * Get aggregator profile with network statistics
   */
  async getAggregatorProfile(aggregatorId, aggregatorType) {
    try {
      const query = `
        SELECT 
          ab.id,
          ab.broker_name as name,
          ab.email,
          ab.phone_number,
          ab.irdai_license_number as license_number,
          ab.commission_percentage,
          ab.active_policies_count,
          ab.total_premium_facilitated,
          ab.service_areas,
          ab.status,
          ab.is_verified,
          (SELECT COUNT(*) FROM corporates WHERE aggregator_id = ab.id) as corporates_count,
          (SELECT COUNT(*) FROM aggregator_wellness_network 
           WHERE aggregator_id = ab.id AND network_status = 'active') as active_partners,
          (SELECT COUNT(*) FROM aggregator_wellness_network 
           WHERE aggregator_id = ab.id AND network_status = 'pending') as pending_partners
        FROM insurance_brokers ab
        WHERE ab.id = $1 AND ab.status = 'active'
      `;

      const result = await sequelize.query(query, {
        bind: [aggregatorId],
        type: sequelize.QueryTypes.SELECT,
      });

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error('Error fetching aggregator profile:', error);
      throw error;
    }
  }

  /**
   * Get all corporates under an aggregator
   */
  async getAggregatorCorporates(aggregatorId, options = {}) {
    const { limit = 50, offset = 0, status = 'all' } = options;

    try {
      let query = `
        SELECT 
          c.id,
          c.companyName as name,
          c.email,
          c.phoneNumber as phone,
          c.industry,
          c.employeeCount,
          c.packageType,
          c.packageAmount,
          c.status,
          c.createdAt,
          c.onboarded_by,
          (SELECT COUNT(*) FROM users WHERE corporate_id = c.id) as employees_count,
          (SELECT COUNT(*) FROM corporate_employees WHERE corporate_id = c.id AND isActive = true) as active_employees
        FROM corporates c
        WHERE c.aggregator_id = $1
      `;

      const params = [aggregatorId];

      if (status !== 'all') {
        query += ' AND c.status = $2';
        params.push(status);
      }

      query += ` ORDER BY c.createdAt DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await sequelize.query(query, {
        bind: params,
        type: sequelize.QueryTypes.SELECT,
      });

      return result;
    } catch (error) {
      console.error('Error fetching aggregator corporates:', error);
      throw error;
    }
  }

  /**
   * Get wellness partners in aggregator's network
   */
  async getWellnessPartners(aggregatorId, aggregatorType, options = {}) {
    const { partnerType = 'all', status = 'active', limit = 50, offset = 0 } = options;

    try {
      let query = `
        SELECT 
          awn.id as network_id,
          awn.wellness_provider_type,
          awn.wellness_provider_id,
          awn.network_status,
          awn.commission_percentage,
          awn.contract_start_date,
          awn.contract_end_date,
          awn.service_categories,
          awn.coverage_areas,
          awn.contact_person,
          CASE 
            WHEN awn.wellness_provider_type = 'hospital' THEN h.hospital_name
            WHEN awn.wellness_provider_type = 'clinic' THEN c.name
            WHEN awn.wellness_provider_type = 'lab' THEN l.name
            WHEN awn.wellness_provider_type = 'pharmacy' THEN p.name
            WHEN awn.wellness_provider_type = 'ambulance' THEN a.providerName
            WHEN awn.wellness_provider_type = 'homecare' THEN hc.name
          END as provider_name,
          CASE 
            WHEN awn.wellness_provider_type = 'hospital' THEN h.email
            WHEN awn.wellness_provider_type = 'clinic' THEN c.email
            WHEN awn.wellness_provider_type = 'lab' THEN l.email
            WHEN awn.wellness_provider_type = 'pharmacy' THEN p.email
            WHEN awn.wellness_provider_type = 'ambulance' THEN a.email
            WHEN awn.wellness_provider_type = 'homecare' THEN hc.email
          END as provider_email
        FROM aggregator_wellness_network awn
        LEFT JOIN hospitals h ON awn.wellness_provider_type = 'hospital' AND awn.wellness_provider_id = h.id
        LEFT JOIN clinics c ON awn.wellness_provider_type = 'clinic' AND awn.wellness_provider_id = c.id
        LEFT JOIN labs l ON awn.wellness_provider_type = 'lab' AND awn.wellness_provider_id = l.id
        LEFT JOIN pharmacies p ON awn.wellness_provider_type = 'pharmacy' AND awn.wellness_provider_id = p.id
        LEFT JOIN ambulances a ON awn.wellness_provider_type = 'ambulance' AND awn.wellness_provider_id = a.id
        LEFT JOIN homecare_providers hc ON awn.wellness_provider_type = 'homecare' AND awn.wellness_provider_id = hc.id
        WHERE awn.aggregator_id = $1 AND awn.aggregator_type = $2
      `;

      const params = [aggregatorId, aggregatorType];

      if (partnerType !== 'all') {
        query += ' AND awn.wellness_provider_type = $3';
        params.push(partnerType);
      }

      if (status !== 'all') {
        query += ` AND awn.network_status = $${params.length + 1}`;
        params.push(status);
      }

      query += ` ORDER BY awn.createdAt DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await sequelize.query(query, {
        bind: params,
        type: sequelize.QueryTypes.SELECT,
      });

      return result;
    } catch (error) {
      console.error('Error fetching wellness partners:', error);
      throw error;
    }
  }

  /**
   * Add wellness partner to aggregator's network
   */
  async addWellnessPartner(aggregatorId, aggregatorType, partnerData) {
    try {
      const {
        wellnessProviderType,
        wellnessProviderId,
        commissionPercentage = 0,
        contractStartDate,
        contractEndDate,
        serviceCategories = [],
        coverageAreas = {},
        contactPerson = {},
      } = partnerData;

      const query = `
        INSERT INTO aggregator_wellness_network (
          aggregator_id,
          aggregator_type,
          wellness_provider_type,
          wellness_provider_id,
          network_status,
          commission_percentage,
          contract_start_date,
          contract_end_date,
          service_categories,
          coverage_areas,
          contact_person,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
        ON CONFLICT (aggregator_id, aggregator_type, wellness_provider_type, wellness_provider_id)
        DO UPDATE SET 
          network_status = EXCLUDED.network_status,
          commission_percentage = EXCLUDED.commission_percentage,
          service_categories = EXCLUDED.service_categories,
          updated_at = NOW()
        RETURNING *;
      `;

      const result = await sequelize.query(query, {
        bind: [
          aggregatorId,
          aggregatorType,
          wellnessProviderType,
          wellnessProviderId,
          'active',
          commissionPercentage,
          contractStartDate,
          contractEndDate,
          JSON.stringify(serviceCategories),
          JSON.stringify(coverageAreas),
          JSON.stringify(contactPerson),
        ],
        type: sequelize.QueryTypes.INSERT,
      });

      return result[0];
    } catch (error) {
      console.error('Error adding wellness partner:', error);
      throw error;
    }
  }

  /**
   * Get employees of a corporate
   */
  async getCorporateEmployees(corporateId, options = {}) {
    const { isActive = true, limit = 50, offset = 0 } = options;

    try {
      let query = `
        SELECT 
          u.id,
          u.firstName,
          u.lastName,
          u.email,
          u.phoneNumber,
          u.role,
          ce.employeeId,
          ce.department,
          ce.designation,
          ce.joiningDate,
          ce.dependents,
          ce.isActive
        FROM users u
        JOIN corporate_employees ce ON u.id = ce.userId
        WHERE ce.corporate_id = $1
      `;

      const params = [corporateId];

      if (isActive !== null) {
        query += ' AND ce.isActive = $2';
        params.push(isActive);
      }

      query += ` ORDER BY u.createdAt DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await sequelize.query(query, {
        bind: params,
        type: sequelize.QueryTypes.SELECT,
      });

      return result;
    } catch (error) {
      console.error('Error fetching corporate employees:', error);
      throw error;
    }
  }

  /**
   * Get wellness partners accessible to a corporate
   */
  async getCorporateAccessiblePartners(corporateId, options = {}) {
    try {
      // Get corporate's tenant_id
      const corporateQuery = `SELECT tenant_id, aggregator_id FROM corporates WHERE id = $1`;
      const corporate = await sequelize.query(corporateQuery, {
        bind: [corporateId],
        type: sequelize.QueryTypes.SELECT,
      });

      if (!corporate || corporate.length === 0) {
        throw new Error('Corporate not found');
      }

      const { tenant_id: tenantId, aggregator_id: aggregatorId } = corporate[0];

      // Get partners this corporate can access via tenant partnerships
      const query = `
        SELECT DISTINCT
          h.id,
          h.hospital_name as name,
          h.email,
          h.phone_number as phone,
          'hospital' as type,
          h.specializations,
          h.network_type,
          h.rating,
          h.status
        FROM hospitals h
        JOIN tenants t ON h.tenant_id = t.id
        JOIN tenant_partners tp ON t.id = tp.partner_tenant_id
        WHERE tp.corporate_tenant_id = $1 AND tp.status = 'active'
        
        UNION
        
        SELECT DISTINCT
          l.id,
          l.name,
          l.email,
          l.phoneNumber as phone,
          'lab' as type,
          l.services as specializations,
          'network' as network_type,
          l.rating,
          l.status
        FROM labs l
        WHERE l.aggregator_id = $2 AND l.aggregator_type = 'broker' AND l.status = 'active'
        
        UNION
        
        SELECT DISTINCT
          p.id,
          p.name,
          p.email,
          p.phoneNumber as phone,
          'pharmacy' as type,
          p.services as specializations,
          'network' as network_type,
          p.rating,
          p.status
        FROM pharmacies p
        WHERE p.aggregator_id = $2 AND p.aggregator_type = 'broker' AND p.status = 'active'
        
        ORDER BY type, name
      `;

      const result = await sequelize.query(query, {
        bind: [tenantId, aggregatorId],
        type: sequelize.QueryTypes.SELECT,
      });

      return result;
    } catch (error) {
      console.error('Error fetching accessible partners:', error);
      throw error;
    }
  }

  /**
   * Get network statistics for an aggregator
   */
  async getNetworkStatistics(aggregatorId, aggregatorType) {
    try {
      const query = `
        SELECT 
          $1::VARCHAR as aggregator_id,
          $2::VARCHAR as aggregator_type,
          COUNT(DISTINCT awn.wellness_provider_id) FILTER (WHERE awn.network_status = 'active') as active_partners,
          COUNT(DISTINCT awn.wellness_provider_id) FILTER (WHERE awn.network_status = 'pending') as pending_partners,
          COUNT(DISTINCT CASE WHEN awn.wellness_provider_type = 'hospital' THEN awn.wellness_provider_id END) as hospital_count,
          COUNT(DISTINCT CASE WHEN awn.wellness_provider_type = 'clinic' THEN awn.wellness_provider_id END) as clinic_count,
          COUNT(DISTINCT CASE WHEN awn.wellness_provider_type = 'lab' THEN awn.wellness_provider_id END) as lab_count,
          COUNT(DISTINCT CASE WHEN awn.wellness_provider_type = 'pharmacy' THEN awn.wellness_provider_id END) as pharmacy_count,
          COUNT(DISTINCT CASE WHEN awn.wellness_provider_type = 'ambulance' THEN awn.wellness_provider_id END) as ambulance_count,
          COUNT(DISTINCT CASE WHEN awn.wellness_provider_type = 'homecare' THEN awn.wellness_provider_id END) as homecare_count,
          COALESCE(AVG(awn.commission_percentage), 0) as avg_commission_percentage,
          COUNT(DISTINCT c.id) as total_corporate_clients,
          COUNT(DISTINCT CASE WHEN ce.isActive = true THEN ce.userId END) as total_active_employees
        FROM aggregator_wellness_network awn
        LEFT JOIN corporates c ON c.aggregator_id = awn.aggregator_id
        LEFT JOIN corporate_employees ce ON c.id = ce.corporate_id
        WHERE awn.aggregator_id = $1 AND awn.aggregator_type = $2
        GROUP BY aggregator_id, aggregator_type
      `;

      const result = await sequelize.query(query, {
        bind: [aggregatorId, aggregatorType],
        type: sequelize.QueryTypes.SELECT,
      });

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error('Error fetching network statistics:', error);
      throw error;
    }
  }

  /**
   * Log aggregator action for audit trail
   */
  async logAggregatorAction(aggregatorId, aggregatorType, userId, actionData) {
    try {
      const {
        actionType,
        entityType,
        entityId,
        changes = {},
        ipAddress = null,
      } = actionData;

      const query = `
        INSERT INTO aggregator_action_logs (
          aggregator_id,
          aggregator_type,
          user_id,
          action_type,
          entity_type,
          entity_id,
          changes,
          ip_address,
          "timestamp"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `;

      await sequelize.query(query, {
        bind: [
          aggregatorId,
          aggregatorType,
          userId,
          actionType,
          entityType,
          entityId,
          JSON.stringify(changes),
          ipAddress,
        ],
        type: sequelize.QueryTypes.INSERT,
      });
    } catch (error) {
      console.error('Error logging aggregator action:', error);
      throw error;
    }
  }
}

export default new AggregatorService();
