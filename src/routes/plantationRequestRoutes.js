import express from 'express';
import { authenticate, checkRole } from '../middleware/authMiddleware.js';
import {
  createPlantationRequest,
  getPendingPlantationRequests,
  approvePlantationRequest,
} from '../controllers/plantationRequestController.js';

const router = express.Router();

router.post('/', createPlantationRequest);
router.get('/', authenticate, checkRole('superadmin'), getPendingPlantationRequests);
router.post('/:requestId/approve', authenticate, checkRole('superadmin'), approvePlantationRequest);

export default router;
