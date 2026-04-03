import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '')}`;
    cb(null, safeName);
  }
});

const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/jpg', 'application/dicom']);

function fileFilter(_req, file, cb) {
  if (!allowedTypes.has(file.mimetype)) {
    cb(new Error('Unsupported file type. Use PNG, JPEG, or DICOM.'));
    return;
  }
  cb(null, true);
}

export const uploadSingleScan = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 12 * 1024 * 1024
  }
}).single('scan');
