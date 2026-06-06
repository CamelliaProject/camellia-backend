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
  updateExperienceSlot,
  deleteExperienceSlot,
} from '../controllers/experienceController.js';
import {
  getWeeklySlots,
  createWeeklySlot,
  updateWeeklySlot,
  deleteWeeklySlot,
  getExperienceAvailability,
} from '../controllers/weeklyScheduleController.js';

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

router.get('/plantation/:plantationId', getExperiencesByPlantation);
router.get('/:id', getExperienceById);
router.get('/:id/slots', getExperienceSlots);          // legacy (per-date)
router.get('/:id/weekly-slots', getWeeklySlots);
router.get('/:id/availability', getExperienceAvailability); // ?date=YYYY-MM-DD

router.use(authenticate);

const ADMIN_ROLES = ['superadmin', 'plantationadmin'];

router.post('/', checkRole(...ADMIN_ROLES), upload.array('images', 10), createExperience);
router.post('/:id/slots', checkRole(...ADMIN_ROLES), createExperienceSlot);           // legacy
router.post('/:id/weekly-slots', checkRole(...ADMIN_ROLES), createWeeklySlot);
router.put('/:id/weekly-slots/:slotId', checkRole(...ADMIN_ROLES), updateWeeklySlot);
router.put('/:id/slots/:slotId', checkRole(...ADMIN_ROLES), updateExperienceSlot);    // legacy
router.put('/:id', checkRole(...ADMIN_ROLES), upload.array('images', 10), updateExperience);
router.delete('/:id/weekly-slots/:slotId', checkRole(...ADMIN_ROLES), deleteWeeklySlot);
router.delete('/:id/slots/:slotId', checkRole(...ADMIN_ROLES), deleteExperienceSlot); // legacy
router.delete('/:id/images', checkRole(...ADMIN_ROLES), deleteExperienceImage);
router.delete('/:id', checkRole(...ADMIN_ROLES), deleteExperience);

export default router;
