// Deprecated MariaDB model: Use intelligent DB adapters.
const error = () => { throw new Error('Deprecated MariaDB VitalsRecord model. Use intelligent vitals adapter instead.'); };
export default {
  findOne: error,
  findByPk: error,
  findAll: error,
  create: error,
  update: error,
  destroy: error
};
