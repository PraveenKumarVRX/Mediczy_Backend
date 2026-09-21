import Dietary from '../../models/dept/dietary.model.js';
import { createDeptLogin } from './loginController.js';

export const loginDietary = createDeptLogin(Dietary, 'dietary', { requireOrganization: true });
