export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('wards', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    organization_id: { type: Sequelize.INTEGER, allowNull: false },
    name: { type: Sequelize.STRING(100), allowNull: false },
    ward_type: {
      type: Sequelize.ENUM('general','private','semi_private','icu','nicu','picu','step_down','recovery','ot','er','day_care'),
      defaultValue: 'general'
    },
    floor: { type: Sequelize.INTEGER, allowNull: true },
    capacity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 10 },
    charge_per_day: { type: Sequelize.DECIMAL(10,2), defaultValue: 0 },
    gender_restriction: { type: Sequelize.ENUM('male','female','any'), defaultValue: 'any' },
    infection_cohort: { type: Sequelize.STRING(50), allowNull: true },
    active: { type: Sequelize.BOOLEAN, defaultValue: true },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
  });
  await queryInterface.addIndex('wards', ['organization_id']);
  await queryInterface.addIndex('wards', ['ward_type']);
}

export async function down(queryInterface) {
  await queryInterface.dropTable('wards');
}
