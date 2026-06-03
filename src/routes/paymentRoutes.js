import express from 'express';
import { authenticate, checkRole } from '../middleware/authMiddleware.js';
import {
  getPayments,
  updatePaymentStatus,
  initiatePayHere,
  payhereNotify,
  savePayHerePayment,
  initiateSubscription,
  confirmSubscriptionPayment,
  initiateSubscriptionRenewal,
  confirmSubscriptionRenewal,
} from '../controllers/paymentController.js';

const router = express.Router();

// PayHere notify — no auth (server-to-server)
router.post('/payhere/notify', payhereNotify);

// Subscription payment — public (link sent via email, no login required)
router.post('/subscription/initiate', initiateSubscription);
router.post('/subscription/confirm', confirmSubscriptionPayment);

// Subscription renewal — public (link sent via email)
router.post('/subscription-renew/initiate', initiateSubscriptionRenewal);
router.post('/subscription-renew/confirm', confirmSubscriptionRenewal);

router.use(authenticate);
router.post('/payhere/initiate', initiatePayHere);
router.post('/payhere/save-payment', savePayHerePayment);

router.get('/', getPayments);
router.patch('/:id/status', checkRole('superadmin', 'plantationadmin'), updatePaymentStatus);

export default router;
