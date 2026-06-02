import express from 'express';
import { authenticate, checkRole } from '../middleware/authMiddleware.js';
import { createContactRequest, getContactRequests, resolveContactRequest } from '../controllers/contactController.js';

const router = express.Router();

router.post('/', createContactRequest);                                                          // public
router.get('/', authenticate, checkRole('superadmin'), getContactRequests);                      // super admin
router.patch('/:id/resolve', authenticate, checkRole('superadmin'), resolveContactRequest);      // super admin

export default router;
