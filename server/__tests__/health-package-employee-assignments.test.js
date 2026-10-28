import {jest} from '@jest/globals';
const query=jest.fn(),tx={},transaction=jest.fn(async fn=>fn(tx));
jest.unstable_mockModule('../db/postgres-sequelize.js',()=>({postgresSequelize:{query,transaction,QueryTypes:{SELECT:'SELECT'}}}));
const {updatePackageEmployeeAssignments:update}=await import('../services/health-package-employee-assignments.service.js');
const p={id:'sales',corporate_id:45,name:'Sales',is_active:true,max_users:1,features:{tests:['CBC']},metadata:{validityPeriod:'1 Year'}};
beforeEach(()=>{query.mockReset();transaction.mockClear();});
test('swaps employees in a full package, changing only that corporate/package',async()=>{
 query.mockResolvedValueOnce([p]).mockResolvedValueOnce([{userId:1,status:'active'}]).mockResolvedValueOnce([{userId:2}]).mockResolvedValueOnce([{userId:1}]).mockResolvedValueOnce([{userId:2}]);
 expect(await update('sales',{addEmployeeIds:[2],removeEmployeeIds:[1]})).toEqual({added:1,removed:1,enrolled:1});
 expect(query.mock.calls.every(([,options])=>options.transaction===tx)).toBe(true);
 const removal=query.mock.calls.find(([sql])=>sql.startsWith('UPDATE user_health_packages'));
 expect(removal[1].replacements).toEqual({packageId:'sales',corporateId:45,ids:[1]});
 const insert=query.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO user_health_packages'));
 expect(insert[0].split('DO UPDATE')[1]).not.toMatch(/"usedAt"\s*=|"validFrom"\s*=|"validTo"\s*=/);
});
test('allows removals without additions, including an empty final selection',async()=>{
 query.mockResolvedValueOnce([p]).mockResolvedValueOnce([{userId:1,status:'active'}]).mockResolvedValueOnce([{userId:1}]);
 expect(await update('sales',{removeEmployeeIds:[1]})).toEqual({added:0,removed:1,enrolled:0});
});
test('adding at capacity is rejected before any write',async()=>{
 query.mockResolvedValueOnce([p]).mockResolvedValueOnce([{userId:1,status:'active'}]).mockResolvedValueOnce([{userId:2}]);
 await expect(update('sales',{addEmployeeIds:[2]})).rejects.toMatchObject({status:409});
 expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT')||sql.startsWith('UPDATE'))).toBe(false);
});
test('rejects additions outside the corporate',async()=>{
 query.mockResolvedValueOnce([p]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
 await expect(update('sales',{addEmployeeIds:[99]})).rejects.toMatchObject({status:400});
});
test('keeps concurrent or hidden employees when applying an explicit removal',async()=>{
 query.mockResolvedValueOnce([{...p,max_users:3}]).mockResolvedValueOnce([{userId:1,status:'active'},{userId:2,status:'active'},{userId:3,status:'active'}]).mockResolvedValueOnce([{userId:1}]);
 expect(await update('sales',{removeEmployeeIds:[1]})).toMatchObject({enrolled:2});
 expect(query.mock.calls.at(-1)[1].replacements.ids).toEqual([1]);
});
test.each([{addEmployeeIds:'all'},{addEmployeeIds:[-1]},{addEmployeeIds:[1],removeEmployeeIds:[1]}])('rejects malformed/ambiguous changes %j',async patch=>{
 await expect(update('sales',patch)).rejects.toMatchObject({status:400});expect(transaction).not.toHaveBeenCalled();
});
test('unchanged existing assignments are not renewed or rewritten',async()=>{
 query.mockResolvedValueOnce([p]).mockResolvedValueOnce([{userId:1,status:'active'}]);
 expect(await update('sales',{addEmployeeIds:[1]})).toEqual({added:0,removed:0,enrolled:1});expect(query).toHaveBeenCalledTimes(2);
});
