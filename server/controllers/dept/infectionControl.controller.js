import InfectionControl from '../../models/dept/infectionControl.model.js';
import { createDeptLogin } from './loginController.js';

export const loginInfectionControl = createDeptLogin(InfectionControl, 'infection_control');
