export async function up(queryInterface, Sequelize) {
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
