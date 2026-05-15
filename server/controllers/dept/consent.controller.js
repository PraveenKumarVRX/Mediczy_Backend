import Consent from '../../models/dept/consent.model.js';
import { createDeptLogin } from './loginController.js';

export const loginConsent = createDeptLogin(Consent, 'consent');
