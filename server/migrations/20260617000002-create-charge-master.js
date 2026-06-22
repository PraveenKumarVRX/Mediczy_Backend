/** GAP-BIL-001 — IP charge master */
export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('charge_master', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    organization_id: { type: Sequelize.INTEGER, allowNull: false },
    code: { type: Sequelize.STRING(50), allowNull: false },
    name: { type: Sequelize.STRING(200), allowNull: false },
    category: {
      type: Sequelize.ENUM('bed_day', 'procedure', 'nursing', 'ot_package', 'lab', 'pharmacy', 'misc'),
      allowNull: false,
    },
    unit_price: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    tax_percent: { type: Sequelize.DECIMAL(5, 2), defaultValue: 0 },
    insurance_payable: { type: Sequelize.BOOLEAN, defaultValue: true },
    active: { type: Sequelize.BOOLEAN, defaultValue: true },
    metadata: { type: Sequelize.JSONB, defaultValue: {} },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
  });
  await queryInterface.addIndex('charge_master', ['organization_id', 'code'], { unique: true });
  await queryInterface.addIndex('charge_master', ['category']);
}

export async function down(queryInterface) {
  await queryInterface.dropTable('charge_master');
}
