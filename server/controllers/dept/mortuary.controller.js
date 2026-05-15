import Mortuary from '../../models/dept/mortuary.model.js';
import { createDeptLogin } from './loginController.js';

export const loginMortuary = createDeptLogin(Mortuary, 'mortuary');
