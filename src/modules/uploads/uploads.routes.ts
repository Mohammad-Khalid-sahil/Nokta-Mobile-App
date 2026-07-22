import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { createError, createResponse } from '../../helpers/response';
import { profileImageUpload, buildProfileImageUrl } from '../../middlewares/profileImageUpload';
import { User } from '../../models/User';
import { resolveHttpStatus } from '../../utils/httpErrors';

const router = Router();

router.post(
  '/profile-image',
  authenticate,
  authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'parent', 'owner']),
  profileImageUpload.single('profileImage'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json(createError('Profile image file is required'));
      }

      const imageUrl = buildProfileImageUrl(req.file.filename);
      const targetUserId = String(req.body.userId || req.user?.userId || '');

      if (targetUserId && targetUserId !== req.user?.userId && !['super_admin', 'admin', 'branch_manager'].includes(String(req.user?.role))) {
        return res.status(403).json(createError('Forbidden'));
      }

      if (targetUserId) {
        await User.findByIdAndUpdate(targetUserId, { profileImage: imageUrl });
      }

      return res.status(201).json(createResponse({ profileImage: imageUrl }, 'Profile image uploaded'));
    } catch (error) {
      return res.status(resolveHttpStatus(error)).json(createError(error instanceof Error ? error.message : 'Profile image upload failed'));
    }
  }
);

export const uploadsRouter = router;
