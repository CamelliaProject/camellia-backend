import express from 'express';
import multer from 'multer';
import { authenticate, checkRole } from '../middleware/authMiddleware.js';
import {
  createPlantationRequest,
  getPendingPlantationRequests,
  approvePlantationRequest,
  rejectPlantationRequest,
} from '../controllers/plantationRequestController.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'plantationImage') {
      cb(null, /^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype));
    } else if (file.fieldname === 'proofDocument') {
      cb(null, /^(image\/(jpeg|jpg|png)|application\/pdf)$/.test(file.mimetype));
    } else {
      cb(null, false);
    }
  },
});

const uploadFields = upload.fields([
  { name: 'plantationImage', maxCount: 1 },
  { name: 'proofDocument',   maxCount: 1 },
]);

router.post('/',                                uploadFields, createPlantationRequest);
router.get('/',    authenticate, checkRole('superadmin'), getPendingPlantationRequests);
router.post('/:requestId/approve', authenticate, checkRole('superadmin'), approvePlantationRequest);
router.post('/:requestId/reject',  authenticate, checkRole('superadmin'), rejectPlantationRequest);

export default router;
