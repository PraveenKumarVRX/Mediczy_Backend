import CSSD from '../../models/dept/cssd.model.js';
import { createDeptLogin } from './loginController.js';

export const loginCSSD = createDeptLogin(CSSD, 'cssd', { requireOrganization: true });
