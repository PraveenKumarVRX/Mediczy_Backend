import express from 'express';
import { loginBloodBank } from '../../controllers/dept/bloodBank.controller.js';
const router = express.Router();

 router.post('/login', (req, res, next) => { req.skipAuth = true; next(); }, loginBloodBank);

export default router;
