import { Router } from 'express';
import {
  getAnalysisByIdController,
  getHistoryController,
  uploadAnalysisController
} from '../controllers/analysisController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { uploadSingleScan } from '../middleware/uploadMiddleware.js';

const router = Router();

router.post('/upload', requireAuth, uploadSingleScan, uploadAnalysisController);
router.get('/history', requireAuth, getHistoryController);
router.get('/:id', requireAuth, getAnalysisByIdController);

export default router;
