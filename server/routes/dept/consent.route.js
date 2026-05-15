import express from 'express';
import { loginConsent } from '../../controllers/dept/consent.controller.js';
const router = express.Router();

router.post('/login', (req, res, next) => { req.skipAuth = true; next(); }, loginConsent);

export default router;
