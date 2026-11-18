import { Router } from 'express';
import { getUserKeys, publishKeys } from '../controllers/keyController.ts';
import { requireAuth } from '../middleware/auth.ts';

const router = Router();

router.use(requireAuth);
router.post('/publish', publishKeys);
router.get('/:userId', getUserKeys);

export default router;
