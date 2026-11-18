import { Router } from 'express';
import { getMe, login, logout, register } from '../controllers/authController.ts';
import { requireAuth } from '../middleware/auth.ts';
import { authRateLimiter } from '../middleware/rateLimit.ts';

const router = Router();

router.post('/register', authRateLimiter, register);
router.post('/login', authRateLimiter, login);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, getMe);

export default router;
