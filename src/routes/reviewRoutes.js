import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authMiddleware.js';
import {
  getReviewsByPlantation,
  createReview,
  uploadReviewImage,
  addReviewReply,
  deleteReviewReply,
  getMyReviews,
  reactToReview,
  reactToReply,
} from '../controllers/reviewController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Public
router.get('/plantation/:plantationId', getReviewsByPlantation);
router.patch('/:reviewId/helpful', reactToReview);
router.patch('/:reviewId/replies/:replyId/helpful', reactToReply);

// Authenticated
router.use(authenticate);
router.get('/my-reviews', getMyReviews);
router.post('/upload-image', upload.single('image'), uploadReviewImage);
router.post('/', createReview);
router.post('/:reviewId/replies', addReviewReply);
router.delete('/:reviewId/replies/:replyId', deleteReviewReply);

export default router;
