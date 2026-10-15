/**
 * Pharmacy/eMAR dispense governance.
 *
 * The original queue migration predates retry-safe administration callbacks.
 * This migration adds an organization-scoped idempotency key and request hash,
 * and makes the administration link unique where present.  It is deliberately
 * additive so existing pending/dispensed rows remain readable.
 */
export async function up(queryInterface, Sequelize) {
  const table = 'pharmacy_dispense_queue';
  for (const [column, definition] of [
    ['idempotency_key', { type: Sequelize.STRING(128), allowNull: true }],
    ['request_hash', { type: Sequelize.CHAR(64), allowNull: true }],
  ]) {
    try { await queryInterface.addColumn(table, column, definition); } catch (error) {
      if (!/already exists|duplicate column/i.test(error.message || '')) throw error;
    }
  }
  try {
    await queryInterface.addIndex(table, ['organization_id', 'idempotency_key'], {
      name: 'uq_pharmacy_dispense_queue_org_idempotency',
      unique: true,
      where: { idempotency_key: { [Sequelize.Op.ne]: null } },
    });
  } catch (error) {
    if (!/already exists|duplicate/i.test(error.message || '')) throw error;
  }
  try {
    await queryInterface.addIndex(table, ['organization_id', 'administration_id'], {
      name: 'uq_pharmacy_dispense_queue_org_administration',
      unique: true,
      where: { administration_id: { [Sequelize.Op.ne]: null } },
    });
  } catch (error) {
    if (!/already exists|duplicate/i.test(error.message || '')) throw error;
  }
}

export async function down(queryInterface) {
  for (const name of [
    'uq_pharmacy_dispense_queue_org_idempotency',
    'uq_pharmacy_dispense_queue_org_administration',
  ]) {
    try { await queryInterface.removeIndex('pharmacy_dispense_queue', name); } catch (_) { /* already absent */ }
  }
  for (const column of ['request_hash', 'idempotency_key']) {
    try { await queryInterface.removeColumn('pharmacy_dispense_queue', column); } catch (_) { /* already absent */ }
  }
}
