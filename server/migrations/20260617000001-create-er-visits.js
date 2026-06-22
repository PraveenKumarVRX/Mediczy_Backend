/** GAP-MIG-003 / GAP-IPD-005 — ER visits table */
export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('er_visits', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    organization_id: { type: Sequelize.INTEGER, allowNull: false },
    patient_id: { type: Sequelize.INTEGER, allowNull: true },
    temp_id: { type: Sequelize.STRING(32), allowNull: true },
    patient_name: { type: Sequelize.STRING(200), allowNull: true },
    age: { type: Sequelize.INTEGER, allowNull: true },
    gender: { type: Sequelize.STRING(20), allowNull: true },
    phone: { type: Sequelize.STRING(20), allowNull: true },
    triage_level: { type: Sequelize.STRING(20), allowNull: true, defaultValue: 'yellow' },
    chief_complaint: { type: Sequelize.TEXT, allowNull: true },
    mlc_case: { type: Sequelize.BOOLEAN, defaultValue: false },
    injury_type: { type: Sequelize.STRING(100), allowNull: true },
    brought_by: { type: Sequelize.STRING(200), allowNull: true },
    arrival_time: { type: Sequelize.DATE, allowNull: true },
    triage_time: { type: Sequelize.DATE, allowNull: true },
    disposition: { type: Sequelize.STRING(50), allowNull: true },
    admission_id: { type: Sequelize.INTEGER, allowNull: true },
    status: { type: Sequelize.STRING(20), defaultValue: 'active' },
    metadata: { type: Sequelize.JSONB, defaultValue: {} },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
  });
  await queryInterface.addIndex('er_visits', ['organization_id']);
  await queryInterface.addIndex('er_visits', ['status']);
  await queryInterface.addIndex('er_visits', ['triage_level']);
  await queryInterface.addIndex('er_visits', ['patient_id']);
}

export async function down(queryInterface) {
  await queryInterface.dropTable('er_visits');
}
