export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('adt_events', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    organization_id: { type: Sequelize.INTEGER, allowNull: false },
    admission_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'ip_admissions', key: 'id' } },
    patient_id: { type: Sequelize.INTEGER, allowNull: false },
    event_type: { type: Sequelize.STRING(10), allowNull: false }, // A01 admit, A02 transfer, A03 discharge, A04 register, A11 cancel-admit, A13 cancel-discharge
    from_location: { type: Sequelize.JSONB, allowNull: true },
    to_location: { type: Sequelize.JSONB, allowNull: true },
    performed_by: { type: Sequelize.INTEGER, allowNull: true },
    reason: { type: Sequelize.TEXT, allowNull: true },
    event_datetime: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    metadata: { type: Sequelize.JSONB, defaultValue: {} }
  });

  await queryInterface.addIndex('adt_events', ['admission_id']);
  await queryInterface.addIndex('adt_events', ['patient_id']);
  await queryInterface.addIndex('adt_events', ['event_type']);
  await queryInterface.addIndex('adt_events', ['event_datetime']);
}

export async function down(queryInterface) {
  await queryInterface.dropTable('adt_events');
}
