import jwt from 'jsonwebtoken';
const secret = process.env.JWT_SECRET;
const corpToken = jwt.sign({ id: 3, role: 'corporate', userType: 'corporate', corporateId: 3, userId: 3 }, secret, { expiresIn: '1h' });
const hrToken   = jwt.sign({ id: 7231, role: 'corporate_admin', userType: 'corporate', organization_id: 3, corporateId: 3 }, secret, { expiresIn: '1h' });
// Use a user with an active membership plan
const userToken = jwt.sign({ id: 6183, role: 'user', type: 'patient', userId: 6183 }, secret, { expiresIn: '1h' });
console.log(JSON.stringify({ corpToken, hrToken, userToken }));
process.exit(0);
