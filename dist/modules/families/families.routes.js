"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.familyRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const Family_1 = require("../../models/Family");
const User_1 = require("../../models/User");
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const pagination_1 = require("../../validators/pagination");
const fieldSchemas_1 = require("../../validators/fieldSchemas");
const router = (0, express_1.Router)();
const familySchema = joi_1.default.object({
    body: joi_1.default.object({
        guardianName: (0, fieldSchemas_1.personNameField)(true),
        guardianEmail: joi_1.default.string().email().required(),
        guardianPhone: (0, fieldSchemas_1.afghanPhoneField)(true),
        students: joi_1.default.array().items(joi_1.default.string().hex().length(24)).default([]),
        notes: joi_1.default.string().allow('', null)
    })
});
router.use(auth_1.authenticate);
router.post('/', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher']), (0, validate_1.validate)(familySchema), async (req, res, next) => {
    try {
        const family = await Family_1.Family.create(req.body);
        res.status(201).json((0, response_1.createResponse)(family, 'Family created'));
    }
    catch (error) {
        next(error);
    }
});
router.get('/', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher', 'family_student', 'parent', 'owner']), (0, validate_1.validate)(pagination_1.paginationSchema), async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        const search = String(req.query.search || '').trim();
        const filter = {};
        if (search)
            filter.guardianName = { $regex: search, $options: 'i' };
        if (req.user?.canonicalRole === 'parent' || req.user?.role === 'family_student') {
            const currentUser = await User_1.User.findById(req.user.userId).lean();
            if (!currentUser?.familyId) {
                return res.json((0, response_1.createResponse)([], '', { page, limit, total: 0 }));
            }
            filter._id = currentUser.familyId;
        }
        const [families, total] = await Promise.all([
            Family_1.Family.find(filter).lean().skip((page - 1) * limit).limit(limit),
            Family_1.Family.countDocuments(filter)
        ]);
        res.json((0, response_1.createResponse)(families, '', { page, limit, total }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/:id', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher', 'family_student', 'parent', 'owner']), async (req, res, next) => {
    try {
        const family = await Family_1.Family.findById(req.params.id).lean();
        if (!family)
            return res.status(404).json((0, response_1.createError)('Family not found'));
        if (req.user?.canonicalRole === 'parent' || req.user?.role === 'family_student') {
            const currentUser = await User_1.User.findById(req.user.userId).lean();
            if (!currentUser?.familyId?.toString() || family._id.toString() !== currentUser.familyId.toString()) {
                return res.status(403).json((0, response_1.createError)('Access denied'));
            }
        }
        res.json((0, response_1.createResponse)(family));
    }
    catch (error) {
        next(error);
    }
});
exports.familyRouter = router;
