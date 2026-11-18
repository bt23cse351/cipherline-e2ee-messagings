import { Router } from 'express';
import {
  getSecurityLogs,
  reportSignatureWarning,
} from '../controllers/messageController.ts';
import { requireAuth } from '../middleware/auth.ts';

const router = Router();

router.use(requireAuth);
router.get('/logs', getSecurityLogs);
router.post('/signature-warning', reportSignatureWarning);

export default router;
