import express from 'express';
import { loginQueue } from '../../controllers/dept/queue.controller.js';
const router = express.Router();

	router.post('/login', (req, res, next) => { req.skipAuth = true; next(); }, loginQueue);

export default router;
