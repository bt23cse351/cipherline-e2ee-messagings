import { Router } from 'express';
import {
  getMessages,
  markMessageRead,
  sendMessage,
} from '../controllers/messageController.ts';
import { requireAuth } from '../middleware/auth.ts';

const router = Router();

router.use(requireAuth);
router.get('/:conversationId', getMessages);
router.post('/', sendMessage);
router.patch('/:id/read', markMessageRead);

export default router;
