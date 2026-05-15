import express from 'express';
import { loginFinance } from '../../controllers/dept/finance.controller.js';
const router = express.Router();

router.post('/login', (req, res, next) => { req.skipAuth = true; next(); }, loginFinance);

export default router;
