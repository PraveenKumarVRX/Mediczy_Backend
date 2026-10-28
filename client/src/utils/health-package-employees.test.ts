import {describe,it,expect} from 'vitest';
import {assignmentChanges,selectVisibleEmployees,type PackageEmployee} from './health-package-employees';
const employees:PackageEmployee[]=[{id:'1',name:'Sales employee',employeeId:'S1',email:'',department:'Sales',designation:'Sales Officer',isEligible:true,enrolledPackages:['sales']},{id:'2',name:'New joiner',employeeId:'P1',email:'',department:'Sales',designation:'New Joinee',isEligible:true,enrolledPackages:['sales','pre-employment']}];
describe('package-specific employee selection',()=>{
 it('allows deselecting someone already assigned to Sales',()=>expect(assignmentChanges(['1','2'],['1'])).toEqual({addEmployeeIds:[],removeEmployeeIds:['2']}));
 it('deselects only the visible pre-employment/new-joiner group',()=>expect(selectVisibleEmployees(['1','2'],[employees[1]],false)).toEqual(['1']));
 it('keeps hidden selections when selecting a filtered list',()=>expect(selectVisibleEmployees(['1'],[employees[1]],true)).toEqual(['1','2']));
 it('allows removing every employee from just this package',()=>expect(assignmentChanges(['1','2'],[])).toEqual({addEmployeeIds:[],removeEmployeeIds:['1','2']}));
 it('does not select an inactive unassigned roster member',()=>expect(selectVisibleEmployees([], [{...employees[0],isEligible:false}],true)).toEqual([]));
});
