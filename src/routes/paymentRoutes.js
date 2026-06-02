import express from 'express';
import { authenticate, checkRole } from '../middleware/authMiddleware.js';
import {
  createPaymentIntent,
  getPayments,
  updatePaymentStatus,
  initiatePayHere,
  payhereNotify,
  savePayHerePayment,
} from '../controllers/paymentController.js';

const router = express.Router();

// PayHere notify is called server-to-server by PayHere — no auth
router.post('/payhere/notify', payhereNotify);

router.use(authenticate);
router.post('/payhere/initiate', initiatePayHere);
router.post('/payhere/save-payment', savePayHerePayment);

router.post('/', createPaymentIntent);
router.get('/', getPayments);
router.patch('/:id/status', checkRole('superadmin', 'plantationadmin'), updatePaymentStatus);

export default router;
