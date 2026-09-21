import Procurement from '../../models/dept/procurement.model.js';
import { createDeptLogin } from './loginController.js';

export const loginProcurement = createDeptLogin(Procurement, 'procurement', { requireOrganization: true });
