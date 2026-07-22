import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { randomUUID } from 'crypto';

const uploadRoot = path.resolve(process.cwd(), 'uploads', 'profiles');
const allowedMimeTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);

if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${randomUUID()}${extension}`);
  }
});

function validateImageFile(file: Express.Multer.File) {
  const extension = path.extname(file.originalname).toLowerCase();
  if (!allowedExtensions.has(extension)) {
    throw new Error('Only JPG, JPEG, PNG, and WEBP profile images are allowed');
  }
  if (!allowedMimeTypes.has(file.mimetype.toLowerCase())) {
    throw new Error('Invalid profile image MIME type');
  }
  if (extension === '.svg' || file.mimetype.includes('svg')) {
    throw new Error('SVG files are not allowed for profile images');
  }
}

export const profileImageUpload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    try {
      validateImageFile(file);
      cb(null, true);
    } catch (error) {
      cb(error as Error);
    }
  }
});

export function buildProfileImageUrl(filename: string) {
  return `/uploads/profiles/${filename}`;
}
