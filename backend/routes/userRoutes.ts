import { Router } from 'express';
import { getUserById, listUsers } from '../controllers/userController.ts';
import { requireAuth } from '../middleware/auth.ts';

const router = Router();

router.use(requireAuth);
router.get('/', listUsers);
router.get('/:id', getUserById);

export default router;
