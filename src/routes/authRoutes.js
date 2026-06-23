import express from 'express';
import {
  adminLogin,
  changePlantationAdminPassword,
  forgotPlantationAdminPassword,
  resetPlantationAdminPassword,
} from '../controllers/authController.js';
import { authenticate, checkRole } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/admin-login', adminLogin);
router.put('/change-password', authenticate, checkRole('plantationadmin'), changePlantationAdminPassword);
router.post('/forgot-password', forgotPlantationAdminPassword);
router.post('/reset-password', resetPlantationAdminPassword);

export default router;
