export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('medication_orders', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    organization_id: { type: Sequelize.INTEGER, allowNull: false },
    admission_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'ip_admissions', key: 'id' } },
    patient_id: { type: Sequelize.INTEGER, allowNull: false },
    prescribed_by: { type: Sequelize.INTEGER, allowNull: true },
    drug_name: { type: Sequelize.STRING(200), allowNull: false },
    drug_code: { type: Sequelize.STRING(50), allowNull: true },
    dose: { type: Sequelize.STRING(50), allowNull: true },
    dose_unit: { type: Sequelize.STRING(20), allowNull: true },
    route: {
      type: Sequelize.ENUM('oral','iv','im','sc','topical','inhaled','sublingual','rectal','ng_tube','other'),
      defaultValue: 'oral'
    },
    frequency: { type: Sequelize.STRING(50), allowNull: true },
    frequency_hours: { type: Sequelize.INTEGER, allowNull: true },
    start_datetime: { type: Sequelize.DATE, allowNull: true },
    end_datetime: { type: Sequelize.DATE, allowNull: true },
    prn: { type: Sequelize.BOOLEAN, defaultValue: false },
    order_status: {
      type: Sequelize.ENUM('active','discontinued','completed','on_hold','pending'),
      defaultValue: 'active'
    },
    stop_reason: { type: Sequelize.TEXT, allowNull: true },
    drug_interaction_alerts: { type: Sequelize.JSONB, defaultValue: [] },
    special_instructions: { type: Sequelize.TEXT, allowNull: true },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
  });

  await queryInterface.createTable('medication_administrations', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    order_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'medication_orders', key: 'id' } },
    admission_id: { type: Sequelize.INTEGER, allowNull: false },
    administered_by: { type: Sequelize.INTEGER, allowNull: true },
    scheduled_time: { type: Sequelize.DATE, allowNull: false },
    administered_time: { type: Sequelize.DATE, allowNull: true },
    dose_given: { type: Sequelize.STRING(50), allowNull: true },
    route_used: { type: Sequelize.STRING(50), allowNull: true },
    site: { type: Sequelize.STRING(100), allowNull: true },
    outcome: {
      type: Sequelize.ENUM('given','not_given','refused','held','late'),
      defaultValue: 'given'
    },
    not_given_reason: { type: Sequelize.TEXT, allowNull: true },
    nurse_notes: { type: Sequelize.TEXT, allowNull: true },
    barcode_verified: { type: Sequelize.BOOLEAN, defaultValue: false },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
  });

  await queryInterface.addIndex('medication_orders', ['organization_id']);
  await queryInterface.addIndex('medication_orders', ['admission_id']);
  await queryInterface.addIndex('medication_orders', ['patient_id']);
  await queryInterface.addIndex('medication_orders', ['order_status']);
  await queryInterface.addIndex('medication_administrations', ['order_id']);
  await queryInterface.addIndex('medication_administrations', ['admission_id']);
  await queryInterface.addIndex('medication_administrations', ['scheduled_time']);
  await queryInterface.addIndex('medication_administrations', ['outcome']);
}

export async function down(queryInterface) {
  await queryInterface.dropTable('medication_administrations');
  await queryInterface.dropTable('medication_orders');
}
