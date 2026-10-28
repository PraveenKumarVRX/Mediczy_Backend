export type PackageEmployee = {
  id: string; employeeId: string; name: string; email: string;
  department: string; designation: string; isEligible: boolean; enrolledPackages: string[];
};
export function assignmentChanges(initial: string[], selected: string[]) {
  const before=new Set(initial),after=new Set(selected);
  return {addEmployeeIds:[...after].filter(id=>!before.has(id)),removeEmployeeIds:[...before].filter(id=>!after.has(id))};
}
export function selectVisibleEmployees(selected: string[], visible: PackageEmployee[], checked: boolean) {
  const next=new Set(selected);
  for(const employee of visible){if(checked){if(employee.isEligible)next.add(employee.id);}else next.delete(employee.id);}
  return [...next];
}
