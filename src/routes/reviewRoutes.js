import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import {
  getReviewsByPlantation,
  createReview,
  addReviewReply,
  deleteReviewReply,
} from '../controllers/reviewController.js';

const router = express.Router();

router.get('/plantation/:plantationId', getReviewsByPlantation);
router.use(authenticate);
router.post('/', createReview);
router.post('/:reviewId/replies', addReviewReply);
router.delete('/:reviewId/replies/:replyId', deleteReviewReply);

export default router;
