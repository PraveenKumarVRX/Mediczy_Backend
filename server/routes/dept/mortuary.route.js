import express from 'express';
import { loginMortuary } from '../../controllers/dept/mortuary.controller.js';
const router = express.Router();

router.post('/login', (req, res, next) => { req.skipAuth = true; next(); }, loginMortuary);

export default router;
