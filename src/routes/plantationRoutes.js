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
  addGalleryImages,
  deleteGalleryImage,
} from '../controllers/plantationController.js';
import {
  getAvailabilitySettings,
  updateUnavailableDays,
  addClosingDate,
  removeClosingDate,
  getPlantationTimeSlots,
  createPlantationTimeSlot,
  updatePlantationTimeSlot,
  deletePlantationTimeSlot,
  getPlantationSlotAvailability,
} from '../controllers/weeklyScheduleController.js';

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

router.get('/', getPlantations);
router.get('/:id', getPlantationById);
router.get('/:id/experiences', getPlantationExperiences);
router.get('/:id/reviews', getPlantationReviews);
router.get('/:id/availability-settings', getAvailabilitySettings);
router.get('/:id/time-slots', getPlantationTimeSlots);
router.get('/:id/time-slots/availability', getPlantationSlotAvailability);

router.use(authenticate);

const WRITE_ROLES = ['superadmin', 'plantationadmin'];

router.put('/:id/unavailable-days', checkRole(...WRITE_ROLES), updateUnavailableDays);
router.post('/:id/closing-dates', checkRole(...WRITE_ROLES), addClosingDate);
router.delete('/:id/closing-dates/:closeId', checkRole(...WRITE_ROLES), removeClosingDate);
router.post('/:id/time-slots', checkRole(...WRITE_ROLES), createPlantationTimeSlot);
router.put('/:id/time-slots/:slotId', checkRole(...WRITE_ROLES), updatePlantationTimeSlot);
router.delete('/:id/time-slots/:slotId', checkRole(...WRITE_ROLES), deletePlantationTimeSlot);

router.post('/', checkRole(...WRITE_ROLES), upload.single('mainImage'), createPlantation);
router.put('/:id', checkRole(...WRITE_ROLES), upload.single('mainImage'), updatePlantation);
router.put('/:id/publish', checkRole('plantationadmin'), publishPlantation);
router.post('/:id/gallery', checkRole(...WRITE_ROLES), upload.array('images', 20), addGalleryImages);
router.delete('/:id/gallery', checkRole(...WRITE_ROLES), deleteGalleryImage);
router.delete('/:id', checkRole('superadmin'), deletePlantation);

export default router;
