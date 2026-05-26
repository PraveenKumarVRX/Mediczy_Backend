export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('ip_admissions', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    organization_id: { type: Sequelize.INTEGER, allowNull: false },
    patient_id: { type: Sequelize.INTEGER, allowNull: false },
    uhid: { type: Sequelize.STRING(30), allowNull: true },
    admission_number: { type: Sequelize.STRING(30), allowNull: true },
    admission_type: {
      type: Sequelize.ENUM('elective','emergency','op_converted','corporate','day_care'),
      allowNull: false,
      defaultValue: 'elective'
    },
    admission_datetime: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    admitting_doctor_id: { type: Sequelize.INTEGER, allowNull: true },
    admission_diagnosis: { type: Sequelize.TEXT, allowNull: true },
    icd10_codes: { type: Sequelize.JSONB, defaultValue: [] },
    ward_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'wards', key: 'id' } },
    bed_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'beds', key: 'id' } },
    insurance_claim_id: { type: Sequelize.INTEGER, allowNull: true },
    corporate_account_id: { type: Sequelize.INTEGER, allowNull: true },
    referral_doctor: { type: Sequelize.STRING(200), allowNull: true },
    referral_source: { type: Sequelize.ENUM('self','doctor','er','opd','corporate','ambulance','transfer'), defaultValue: 'self' },
    expected_los_days: { type: Sequelize.INTEGER, allowNull: true },
    discharge_datetime: { type: Sequelize.DATE, allowNull: true },
    discharge_type: {
      type: Sequelize.ENUM('routine','ama','transfer','death','absconded'),
      allowNull: true
    },
    discharge_summary_id: { type: Sequelize.INTEGER, allowNull: true },
    status: {
      type: Sequelize.ENUM('pre_admitted','admitted','in_ot','in_icu','discharged','cancelled'),
      defaultValue: 'admitted'
    },
    mlc_case: { type: Sequelize.BOOLEAN, defaultValue: false },
    mlc_number: { type: Sequelize.STRING(50), allowNull: true },
    deposit_amount: { type: Sequelize.DECIMAL(12,2), defaultValue: 0 },
    package_id: { type: Sequelize.INTEGER, allowNull: true },
    source_consultation_id: { type: Sequelize.INTEGER, allowNull: true },
    source_er_id: { type: Sequelize.INTEGER, allowNull: true },
    notes: { type: Sequelize.TEXT, allowNull: true },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
  });

  await queryInterface.addIndex('ip_admissions', ['organization_id']);
  await queryInterface.addIndex('ip_admissions', ['patient_id']);
  await queryInterface.addIndex('ip_admissions', ['status']);
  await queryInterface.addIndex('ip_admissions', ['admission_datetime']);
  await queryInterface.addIndex('ip_admissions', ['bed_id']);
  await queryInterface.addIndex('ip_admissions', ['ward_id']);
}

export async function down(queryInterface) {
  await queryInterface.dropTable('ip_admissions');
}
