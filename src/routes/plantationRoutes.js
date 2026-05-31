import express from 'express';
import multer from 'multer';
import { authenticate, checkRole } from '../middleware/authMiddleware.js';
import {
  getPlantations,
  getPlantationById,
  getPlantationExperiences,
  getPlantationReviews,
  createPlantation,
  updatePlantation,
  deletePlantation,
  publishPlantation,
} from '../controllers/plantationController.js';

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

router.get('/', getPlantations);
router.get('/:id', getPlantationById);
router.get('/:id/experiences', getPlantationExperiences);
router.get('/:id/reviews', getPlantationReviews);

router.use(authenticate);

const WRITE_ROLES = ['superadmin', 'plantationadmin'];

router.post('/', checkRole(...WRITE_ROLES), upload.single('mainImage'), createPlantation);
router.put('/:id', checkRole(...WRITE_ROLES), upload.single('mainImage'), updatePlantation);
router.put('/:id/publish', checkRole('plantationadmin'), publishPlantation);
router.delete('/:id', checkRole('superadmin'), deletePlantation);

export default router;
