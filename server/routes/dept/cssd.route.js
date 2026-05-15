import express from 'express';
import { loginCSSD } from '../../controllers/dept/cssd.controller.js';
const router = express.Router();

router.post('/login', (req, res, next) => { req.skipAuth = true; next(); }, loginCSSD);

export default router;
