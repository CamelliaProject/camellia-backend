import express from 'express';
import {
  getAll,
  getById,
  createResource,
  updateResource,
  deleteResource,
} from '../controllers/resourceController.js';
import { authenticate, checkRole } from '../middleware/authMiddleware.js';
import multer from 'multer';

// memory storage multer instance
const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

// Public endpoints
router.get('/', getAll);
router.get('/:id', getById);

// Apply authentication for all restricted routes below
router.use(authenticate);

const WRITE_ROLES = ['superadmin', 'plantationadmin'];

// Restricted endpoints - require auth + role checks. File uploads handled in memory.
router.post('/', checkRole(...WRITE_ROLES), upload.single('file'), createResource);
router.put('/:id', checkRole(...WRITE_ROLES), upload.single('file'), updateResource);
router.delete('/:id', checkRole(...WRITE_ROLES), deleteResource);

export default router;
