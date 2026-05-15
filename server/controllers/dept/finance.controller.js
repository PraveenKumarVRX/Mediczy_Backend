import Finance from '../../models/dept/finance.model.js';
import { createDeptLogin } from './loginController.js';

export const loginFinance = createDeptLogin(Finance, 'finance');
