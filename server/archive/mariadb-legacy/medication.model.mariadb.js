// Deprecated MariaDB model: Use intelligent DB adapters.
const error = () => { throw new Error('Deprecated MariaDB Medication model. Use intelligent medication adapter instead.'); };
export default {
  findOne: error,
  findByPk: error,
  findAll: error,
  create: error,
  update: error,
  destroy: error
};
