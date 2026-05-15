import Queue from '../../models/dept/queue.model.js';
import { createDeptLogin } from './loginController.js';

export const loginQueue = createDeptLogin(Queue, 'queue');
