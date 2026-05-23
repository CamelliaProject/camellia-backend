import express from 'express';
import { authenticate, checkRole } from '../middleware/authMiddleware.js';
import {
  createPaymentIntent,
  getPayments,
  updatePaymentStatus,
} from '../controllers/paymentController.js';

const router = express.Router();

router.use(authenticate);
router.post('/', createPaymentIntent);
router.get('/', getPayments);
router.patch('/:id/status', checkRole('superadmin', 'plantationadmin'), updatePaymentStatus);

export default router;
