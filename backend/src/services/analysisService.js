import path from 'node:path';
import { v4 as uuid } from 'uuid';
import { readDb, writeDb } from '../models/database.js';
import { enqueue } from './queueService.js';

function mockInference(fileName) {
  const confidence = Number((0.55 + Math.random() * 0.42).toFixed(3));
  const finding = confidence > 0.75 ? 'Potential pulmonary nodule' : 'No acute cardiopulmonary finding';

  return {
    confidence,
    explanation:
      confidence > 0.75
        ? 'Model attention highlights a focal opacity pattern requiring clinician follow-up. Correlate with symptoms and prior imaging.'
        : 'No dominant suspicious pattern was detected by the screening model in this image. Continue clinical correlation.',
    metadata: {
      model: 'DenseNet121 chest x-ray screening',
      modelVersion: '1.0.0',
      processedAt: new Date().toISOString(),
      sourceFileName: fileName
    },
    disclaimer: 'This output is AI-assisted screening support only and not a medical diagnosis.'
  };
}

function completeJob(jobId) {
  const db = readDb();
  const job = db.analysisJobs.find((candidate) => candidate.id === jobId);
  if (!job || job.status !== 'processing') {
    return;
  }

  const now = new Date().toISOString();
  const generated = mockInference(job.fileName);
  const result = {
    id: uuid(),
    jobId,
    userId: job.userId,
    confidence: generated.confidence,
    explanation: generated.explanation,
    metadata: generated.metadata,
    disclaimer: generated.disclaimer,
    heatmapUrl: null,
    createdAt: now,
    updatedAt: now
  };

  job.status = 'completed';
  job.resultId = result.id;
  job.updatedAt = now;
  job.completedAt = now;

  db.results.push(result);
  writeDb(db);
}

export function createAnalysisJob({ userId, file }) {
  const db = readDb();
  const now = new Date().toISOString();

  const job = {
    id: uuid(),
    userId,
    status: 'processing',
    fileName: file.originalname,
    filePath: file.path,
    mimeType: file.mimetype,
    fileSize: file.size,
    resultId: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null
  };

  db.analysisJobs.push(job);
  writeDb(db);

  enqueue(
    () =>
      new Promise((resolve) => {
        const delayMs = 1400 + Math.round(Math.random() * 1800);
        setTimeout(() => {
          completeJob(job.id);
          resolve();
        }, delayMs);
      })
  );

  return {
    ...job,
    filePath: path.basename(job.filePath)
  };
}

export function getAnalysisById({ userId, jobId }) {
  const db = readDb();
  const job = db.analysisJobs.find((candidate) => candidate.id === jobId && candidate.userId === userId);
  if (!job) return null;

  const result = job.resultId ? db.results.find((candidate) => candidate.id === job.resultId) ?? null : null;

  return {
    ...job,
    filePath: path.basename(job.filePath),
    result
  };
}

export function getAnalysisHistory(userId) {
  const db = readDb();
  return db.analysisJobs
    .filter((job) => job.userId === userId)
    .map((job) => ({
      ...job,
      filePath: path.basename(job.filePath),
      result: job.resultId ? db.results.find((candidate) => candidate.id === job.resultId) ?? null : null
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
