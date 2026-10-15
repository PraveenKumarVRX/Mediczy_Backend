/** eMAR safety audit schema. Runtime DDL is intentionally prohibited. */
export async function up(queryInterface, Sequelize) {
  for (const [column, definition] of [
    ['validation_result', { type: Sequelize.JSONB, allowNull: true }],
    ['blocked_reason', { type: Sequelize.TEXT, allowNull: true }],
    ['cosign_by', { type: Sequelize.STRING(128), allowNull: true }],
    ['cosign_at', { type: Sequelize.DATE, allowNull: true }],
    ['override_reason', { type: Sequelize.TEXT, allowNull: true }],
  ]) {
    try { await queryInterface.addColumn('medication_administrations', column, definition); } catch (error) {
      if (!/already exists|duplicate column/i.test(error.message || '')) throw error;
    }
  }
  await queryInterface.createTable('emar_blocked_attempts', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    order_id: { type: Sequelize.BIGINT, allowNull: true },
    admission_id: { type: Sequelize.BIGINT, allowNull: true },
    administered_by: { type: Sequelize.STRING(128), allowNull: true },
    block_reason: { type: Sequelize.TEXT, allowNull: false },
    attempt_data: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
  }).catch((error) => {
    if (!/already exists|duplicate/i.test(error.message || '')) throw error;
  });
  try { await queryInterface.addIndex('emar_blocked_attempts', ['order_id'], { name: 'idx_emar_blocked_order' }); } catch (error) {
    if (!/already exists|duplicate/i.test(error.message || '')) throw error;
  }
}

export async function down(queryInterface) {
  try { await queryInterface.removeIndex('emar_blocked_attempts', 'idx_emar_blocked_order'); } catch (_) {}
  try { await queryInterface.dropTable('emar_blocked_attempts'); } catch (_) {}
  for (const column of ['override_reason', 'cosign_at', 'cosign_by', 'blocked_reason', 'validation_result']) {
    try { await queryInterface.removeColumn('medication_administrations', column); } catch (_) {}
  }
}
