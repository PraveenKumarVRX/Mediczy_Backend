/** GAP-IPD-004 — eMAR → pharmacy dispense queue */
export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('pharmacy_dispense_queue', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    organization_id: { type: Sequelize.INTEGER, allowNull: false },
    admission_id: { type: Sequelize.INTEGER, allowNull: false },
    patient_id: { type: Sequelize.INTEGER, allowNull: false },
    medication_order_id: { type: Sequelize.INTEGER, allowNull: true },
    administration_id: { type: Sequelize.INTEGER, allowNull: true },
    drug_name: { type: Sequelize.STRING(200), allowNull: false },
    dose: { type: Sequelize.STRING(100), allowNull: true },
    route: { type: Sequelize.STRING(50), allowNull: true },
    status: {
      type: Sequelize.ENUM('pending', 'dispensed', 'cancelled'),
      defaultValue: 'pending',
    },
    dispensed_by: { type: Sequelize.INTEGER, allowNull: true },
    dispensed_at: { type: Sequelize.DATE, allowNull: true },
    billing_line_id: { type: Sequelize.INTEGER, allowNull: true },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
  });
  await queryInterface.addIndex('pharmacy_dispense_queue', ['organization_id', 'status']);
  await queryInterface.addIndex('pharmacy_dispense_queue', ['admission_id']);
}

export async function down(queryInterface) {
  await queryInterface.dropTable('pharmacy_dispense_queue');
}
