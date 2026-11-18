import { Router } from 'express';
import {
  createOrGetConversation,
  listConversations,
} from '../controllers/conversationController.ts';
import { requireAuth } from '../middleware/auth.ts';

const router = Router();

router.use(requireAuth);
router.post('/', createOrGetConversation);
router.get('/', listConversations);

export default router;
