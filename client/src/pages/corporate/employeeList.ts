/** Prepend a newly created employee, replacing any row with the same employee ID instead of duplicating it. */
export function addEmployeeOnce<T extends { employeeId?: string; id?: string }>(list: T[], created: T): T[] {
  const key = created.employeeId || created.id;
  return [created, ...list.filter((e) => (e.employeeId || e.id) !== key)];
}
