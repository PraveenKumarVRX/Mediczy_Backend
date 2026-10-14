import { describe, expect, it } from 'vitest';
import { addEmployeeOnce } from './employeeList';

describe('addEmployeeOnce', () => {
  it('puts a new employee first', () => {
    expect(addEmployeeOnce([{ employeeId: '1' }], { employeeId: '2' }).map((e) => e.employeeId)).toEqual(['2', '1']);
  });
  it('never lists the same employee ID twice', () => {
    const out = addEmployeeOnce([{ employeeId: '12', id: '12' }, { employeeId: '3' }], { employeeId: '12', id: '12' });
    expect(out.map((e) => e.employeeId)).toEqual(['12', '3']);
  });
});
