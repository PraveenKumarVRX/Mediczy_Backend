// Generate tokens using jsonwebtoken
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');

const SECRET = 'ad7a94954fc3bdb4adce9a23b516778b2ce1d945ec068cbbf093aa82535a95ab37350ed908cae1874029aefd6696fd7a67153f4a279a7b3229b11be064f05052';

const adminToken = jwt.sign(
  { id: 20, userId: 20, role: 'admin', email: 'admin@mediczy.com', userType: 'admin' },
  SECRET,
  { expiresIn: '1d', algorithm: 'HS256' }
);

const doctorToken = jwt.sign(
  { id: 95, userId: 95, role: 'doctor', email: 'test.doctor@mediczy.com', userType: 'doctor' },
  SECRET,
  { expiresIn: '1d', algorithm: 'HS256' }
);

const nurseToken = jwt.sign(
  { id: 100, userId: 100, role: 'nurse', email: 'nurse@mediczy.com', userType: 'nurse' },
  SECRET,
  { expiresIn: '1d', algorithm: 'HS256' }
);

console.log('ADMIN=' + adminToken);
console.log('DOCTOR=' + doctorToken);
console.log('NURSE=' + nurseToken);
