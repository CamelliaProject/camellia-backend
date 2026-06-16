import express from 'express';
import { authenticate, checkRole } from '../middleware/authMiddleware.js';
import {
  getPlantationBookings,
  updateBookingStatus,
  getPlantationReviews,
  addReviewReply,
  getPlantationPayments,
  getSubscriptions,
  getSubscriptionEarnings,
} from '../controllers/adminController.js';
import { getAllPlantationsForAdmin } from '../controllers/plantationController.js';

const router = express.Router();
router.use(authenticate);

router.get('/plantations', checkRole('superadmin'), getAllPlantationsForAdmin);
router.get('/subscriptions', checkRole('superadmin'), getSubscriptions);
router.get('/subscription-earnings', checkRole('superadmin'), getSubscriptionEarnings);

router.get('/bookings/:plantationId', checkRole('superadmin', 'plantationadmin'), getPlantationBookings);
router.put('/bookings/:plantationId/:bookingId', checkRole('superadmin', 'plantationadmin'), updateBookingStatus);
router.get('/payments/:plantationId', checkRole('superadmin', 'plantationadmin'), getPlantationPayments);
router.get('/reviews/:plantationId', checkRole('superadmin', 'plantationadmin'), getPlantationReviews);
router.post('/reviews/:plantationId/:reviewId/reply', checkRole('superadmin', 'plantationadmin'), addReviewReply);

export default router;
