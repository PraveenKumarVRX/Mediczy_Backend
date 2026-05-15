import express from 'express';
import { loginInfectionControl } from '../../controllers/dept/infectionControl.controller.js';
const router = express.Router();

router.post('/login', (req, res, next) => { req.skipAuth = true; next(); }, loginInfectionControl);

export default router;
