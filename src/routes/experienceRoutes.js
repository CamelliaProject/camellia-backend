import express from 'express';
import multer from 'multer';
import { authenticate, checkRole } from '../middleware/authMiddleware.js';
import {
  getExperiencesByPlantation,
  getExperienceById,
  getExperienceSlots,
  createExperience,
  updateExperience,
  deleteExperience,
  deleteExperienceImage,
  createExperienceSlot,
} from '../controllers/experienceController.js';

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

router.get('/plantation/:plantationId', getExperiencesByPlantation);
router.get('/:id', getExperienceById);
router.get('/:id/slots', getExperienceSlots);

router.use(authenticate);

const ADMIN_ROLES = ['superadmin', 'plantationadmin'];

router.post('/', checkRole(...ADMIN_ROLES), upload.array('images', 10), createExperience);
router.post('/:id/slots', checkRole(...ADMIN_ROLES), createExperienceSlot);
router.put('/:id', checkRole(...ADMIN_ROLES), upload.array('images', 10), updateExperience);
router.delete('/:id/images', checkRole(...ADMIN_ROLES), deleteExperienceImage);
router.delete('/:id', checkRole(...ADMIN_ROLES), deleteExperience);

export default router;
