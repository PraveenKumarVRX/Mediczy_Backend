export async function up(queryInterface, Sequelize) {
  const tables = await queryInterface.showAllTables();
  const hasBeds = tables.includes('beds') || tables.includes('Beds');

  if (!hasBeds) {
    await queryInterface.createTable('beds', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      ward_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'wards', key: 'id' } },
      bed_number: { type: Sequelize.STRING(50), allowNull: false },
      bed_type: { type: Sequelize.STRING(50), defaultValue: 'general' },
      status: { type: Sequelize.STRING(30), defaultValue: 'available' },
      patient_id: { type: Sequelize.INTEGER, allowNull: true },
      gender_restriction: { type: Sequelize.ENUM('male', 'female', 'any'), defaultValue: 'any' },
      is_isolation: { type: Sequelize.BOOLEAN, defaultValue: false },
      current_admission_id: { type: Sequelize.INTEGER, allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('beds', ['organization_id']);
    await queryInterface.addIndex('beds', ['ward_id']);
    await queryInterface.addIndex('beds', ['status']);
    return;
  }

  const tableDesc = await queryInterface.describeTable('beds');

  if (!tableDesc.ward_id) {
    await queryInterface.addColumn('beds', 'ward_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'wards', key: 'id' }
    });
  }
  if (!tableDesc.current_admission_id) {
    await queryInterface.addColumn('beds', 'current_admission_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
  }
  if (!tableDesc.gender_restriction) {
    await queryInterface.addColumn('beds', 'gender_restriction', {
      type: Sequelize.ENUM('male','female','any'),
      defaultValue: 'any'
    });
  }
  if (!tableDesc.is_isolation) {
    await queryInterface.addColumn('beds', 'is_isolation', {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    });
  }
}

export async function down(queryInterface) {
  const cols = ['ward_id','current_admission_id','gender_restriction','is_isolation'];
  for (const col of cols) {
    try { await queryInterface.removeColumn('beds', col); } catch {}
  }
}
