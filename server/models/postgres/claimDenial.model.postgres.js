/**
 * Claim Denial Model
 * Insurer/TPA denial tracking + appeal workflow for insurance claims.
 * Formalized 2026-08-15 from a runtime-created table with no FK integrity —
 * see server/migrations/20260815-claim-denials-integrity.migration.js.
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const ClaimDenial = sequelize.define('ClaimDenial', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true
  },
  hospitalId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'hospital_id'
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'organization_id',
    references: {
      model: 'tenants',
      key: 'id'
    }
  },
  claimId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'claim_id',
    references: {
      model: 'insurance_claims',
      key: 'id'
    }
  },
  claimNumber: {
    type: DataTypes.STRING(80),
    allowNull: true,
    field: 'claim_number'
  },
  patientId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'patient_id'
  },
  denialCode: {
    type: DataTypes.STRING(40),
    allowNull: true,
    field: 'denial_code'
  },
  denialReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'denial_reason'
  },
  deniedAmount: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: true,
    defaultValue: 0,
    field: 'denied_amount'
  },
  status: {
    // Deliberately unconstrained (no isIn validator): the original raw-SQL
    // table allowed any string here and callers (billing UI, AI-brain tools)
    // already pass free-form resolution values — typical values are open,
    // appeal_drafted, appealed, resolved, upheld, overturned.
    type: DataTypes.STRING(30),
    defaultValue: 'open',
  },
  appealLetter: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'appeal_letter'
  },
  appealedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'appealed_at'
  },
  appealedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'appealed_by'
  },
  resolvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'resolved_at'
  },
  resolutionNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'resolution_notes'
  }
}, {
  tableName: 'claim_denials',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['hospital_id', 'status'] },
    { fields: ['organization_id', 'status'] },
    { fields: ['claim_id'] }
  ]
});

ClaimDenial.associate = (models) => {
  ClaimDenial.belongsTo(models.InsuranceClaim, {
    foreignKey: 'claim_id',
    as: 'claim'
  });
  ClaimDenial.belongsTo(models.Tenant, {
    foreignKey: 'organization_id',
    as: 'organization'
  });
};

export default ClaimDenial;
