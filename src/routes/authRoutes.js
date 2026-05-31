import express from 'express';
import { sendOtp, verifyOtp, resetPassword, adminLogin, changePlantationAdminPassword } from '../controllers/authController.js';
import { authenticate, checkRole } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);
router.post('/admin-login', adminLogin);
router.put('/change-password', authenticate, checkRole('plantationadmin'), changePlantationAdminPassword);

export default router;
