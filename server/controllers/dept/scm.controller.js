import Scm from '../../models/dept/scm.model.js';
import { createDeptLogin } from './loginController.js';

export const loginScm = createDeptLogin(Scm, 'scm');
