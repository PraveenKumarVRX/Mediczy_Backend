export const BENEFICIARY_RELATIONS = Object.freeze(['self', 'spouse', 'child', 'parent', 'parent_in_law', 'sibling']);
export function eligibleRelations(metadata = {}) {
  const configured = metadata.eligibleRelations;
  return configured === undefined ? ['self'] : (Array.isArray(configured) ? [...new Set(configured.filter(r => BENEFICIARY_RELATIONS.includes(r)))] : []);
}
export function validRelations(relations) {
  return Array.isArray(relations) && relations.length > 0 && relations.every(r => BENEFICIARY_RELATIONS.includes(r));
}
