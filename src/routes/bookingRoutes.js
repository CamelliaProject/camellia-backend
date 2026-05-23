import express from 'express';
import { authenticate, checkRole } from '../middleware/authMiddleware.js';
import {
  createBooking,
  getBookings,
  getBookingById,
  updateBookingStatus,
  cancelBooking,
} from '../controllers/bookingController.js';

const router = express.Router();

router.use(authenticate);

router.post('/', createBooking);
router.get('/', getBookings);
router.get('/:id', getBookingById);
router.patch('/:id/status', checkRole('superadmin', 'plantationadmin'), updateBookingStatus);
router.delete('/:id', cancelBooking);

export default router;
