"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../../middlewares/auth");
const response_1 = require("../../helpers/response");
const profileImageUpload_1 = require("../../middlewares/profileImageUpload");
const User_1 = require("../../models/User");
const httpErrors_1 = require("../../utils/httpErrors");
const router = (0, express_1.Router)();
router.post('/profile-image', auth_1.authenticate, (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'parent', 'owner']), profileImageUpload_1.profileImageUpload.single('profileImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json((0, response_1.createError)('Profile image file is required'));
        }
        const imageUrl = (0, profileImageUpload_1.buildProfileImageUrl)(req.file.filename);
        const targetUserId = String(req.body.userId || req.user?.userId || '');
        if (targetUserId && targetUserId !== req.user?.userId && !['super_admin', 'admin', 'branch_manager'].includes(String(req.user?.role))) {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        if (targetUserId) {
            await User_1.User.findByIdAndUpdate(targetUserId, { profileImage: imageUrl });
        }
        return res.status(201).json((0, response_1.createResponse)({ profileImage: imageUrl }, 'Profile image uploaded'));
    }
    catch (error) {
        return res.status((0, httpErrors_1.resolveHttpStatus)(error)).json((0, response_1.createError)(error instanceof Error ? error.message : 'Profile image upload failed'));
    }
});
exports.uploadsRouter = router;
