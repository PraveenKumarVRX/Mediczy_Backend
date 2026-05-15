import BloodBank from '../../models/dept/bloodBank.model.js';
import { createDeptLogin } from './loginController.js';

export const loginBloodBank = createDeptLogin(BloodBank, 'blood_bank');
