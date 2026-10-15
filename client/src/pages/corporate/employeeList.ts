type EmployeeIdentity = {
  id?: string | number | null;
  employeeId?: string | number | null;
  email?: string | null;
};

/** Add a newly-created employee exactly once to the local list. */
export function addEmployeeOnce<T extends EmployeeIdentity>(current: T[], employee: T): T[] {
  const employeeId = String(employee.employeeId || '').trim().toLowerCase();
  const id = String(employee.id || '').trim().toLowerCase();
  const email = String(employee.email || '').trim().toLowerCase();
  const duplicate = current.some((item) => {
    if (employeeId && String(item.employeeId || '').trim().toLowerCase() === employeeId) return true;
    if (id && String(item.id || '').trim().toLowerCase() === id) return true;
    return Boolean(email && String(item.email || '').trim().toLowerCase() === email);
  });
  return duplicate ? current : [employee, ...current];
}
