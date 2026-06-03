import express from 'express';
import { adminLogin, changePlantationAdminPassword } from '../controllers/authController.js';
import { authenticate, checkRole } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/admin-login', adminLogin);
router.put('/change-password', authenticate, checkRole('plantationadmin'), changePlantationAdminPassword);

export default router;
