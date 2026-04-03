import { createAnalysisJob, getAnalysisById, getAnalysisHistory } from '../services/analysisService.js';

export function uploadAnalysisController(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please attach an image file.' });
    }

    const job = createAnalysisJob({ userId: req.user.id, file: req.file });
    return res.status(202).json({
      message: 'Analysis queued for processing.',
      job
    });
  } catch (error) {
    return next(error);
  }
}

export function getAnalysisByIdController(req, res) {
  const data = getAnalysisById({ userId: req.user.id, jobId: req.params.id });
  if (!data) {
    return res.status(404).json({ message: 'Analysis job not found.' });
  }

  return res.json(data);
}

export function getHistoryController(req, res) {
  const history = getAnalysisHistory(req.user.id);
  return res.json({ items: history });
}
