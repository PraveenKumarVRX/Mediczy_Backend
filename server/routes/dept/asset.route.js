import express from 'express';
import { loginAsset } from '../../controllers/dept/asset.controller.js';
const router = express.Router();

router.post('/login', (req, res, next) => { req.skipAuth = true; next(); }, loginAsset);

export default router;
