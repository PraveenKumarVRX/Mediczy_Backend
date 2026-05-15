import Asset from '../../models/dept/asset.model.js';
import { createDeptLogin } from './loginController.js';

export const loginAsset = createDeptLogin(Asset, 'asset');
