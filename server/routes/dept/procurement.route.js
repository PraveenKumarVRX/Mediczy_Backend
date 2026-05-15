import express from 'express';
import { loginProcurement } from '../../controllers/dept/procurement.controller.js';
const router = express.Router();

router.post('/login', (req, res, next) => { req.skipAuth = true; next(); }, loginProcurement);

export default router;
