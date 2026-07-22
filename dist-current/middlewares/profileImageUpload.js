"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileImageUpload = void 0;
exports.buildProfileImageUrl = buildProfileImageUrl;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const multer_1 = __importDefault(require("multer"));
const crypto_1 = require("crypto");
const uploadRoot = path_1.default.resolve(process.cwd(), 'uploads', 'profiles');
const allowedMimeTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
if (!fs_1.default.existsSync(uploadRoot)) {
    fs_1.default.mkdirSync(uploadRoot, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadRoot),
    filename: (_req, file, cb) => {
        const extension = path_1.default.extname(file.originalname).toLowerCase();
        cb(null, `${Date.now()}-${(0, crypto_1.randomUUID)()}${extension}`);
    }
});
function validateImageFile(file) {
    const extension = path_1.default.extname(file.originalname).toLowerCase();
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
exports.profileImageUpload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 2 * 1024 * 1024,
        files: 1
    },
    fileFilter: (_req, file, cb) => {
        try {
            validateImageFile(file);
            cb(null, true);
        }
        catch (error) {
            cb(error);
        }
    }
});
function buildProfileImageUrl(filename) {
    return `/uploads/profiles/${filename}`;
}
