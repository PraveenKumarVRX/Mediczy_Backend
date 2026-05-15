import Biomedical from '../../models/dept/biomedical.model.js';
import { createDeptLogin } from './loginController.js';

export const loginBiomedical = createDeptLogin(Biomedical, 'biomedical');
