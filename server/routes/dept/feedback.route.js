import express from 'express';
import { loginFeedback } from '../../controllers/dept/feedback.controller.js';
const router = express.Router();

router.post('/login', (req, res, next) => { req.skipAuth = true; next(); }, loginFeedback);

export default router;
