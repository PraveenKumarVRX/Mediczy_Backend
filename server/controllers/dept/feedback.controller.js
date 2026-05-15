import Feedback from '../../models/dept/feedback.model.js';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../../config/auth.config.js';

export const loginFeedback = async (req, res) => {
  const { email, password } = req.body;
  const user = await Feedback.findOne({ where: { email } });
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: user.id, role: 'feedback' }, JWT_CONFIG.SECRET, { expiresIn: JWT_CONFIG.EXPIRY.NORMAL });
  res.json({ token, user });
};
