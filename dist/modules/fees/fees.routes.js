"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.feeRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const Class_1 = require("../../models/Class");
const Subject_1 = require("../../models/Subject");
const feeCalculator_1 = require("../../utils/feeCalculator");
const router = (0, express_1.Router)();
const resolveFeeSchema = joi_1.default.object({
    query: joi_1.default.object({
        classId: joi_1.default.string().hex().length(24).required(),
        subjectId: joi_1.default.string().hex().length(24).required()
    })
});
router.use(auth_1.authenticate);
router.get('/resolve', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'parent', 'owner']), (0, validate_1.validate)(resolveFeeSchema), async (req, res, next) => {
    try {
        const [klass, subject] = await Promise.all([
            Class_1.ClassModel.findOne({ _id: req.query.classId, isDeleted: false }).select('className feeAmount branchId assignedSubjects').lean(),
            Subject_1.Subject.findOne({ _id: req.query.subjectId, isDeleted: false, activeStatus: true }).select('title feeAmount classId classIds branchId').lean()
        ]);
        if (!klass)
            return res.status(404).json((0, response_1.createError)('Class not found'));
        if (!subject)
            return res.status(404).json((0, response_1.createError)('Subject not found'));
        const subjectClassIds = new Set([
            subject.classId ? String(subject.classId) : '',
            ...(Array.isArray(subject.classIds) ? subject.classIds.map((id) => String(id)) : [])
        ].filter(Boolean));
        const classSubjectIds = new Set((klass.assignedSubjects ?? []).map((id) => String(id)));
        if (!subjectClassIds.has(String(klass._id)) && !classSubjectIds.has(String(subject._id))) {
            return res.status(400).json((0, response_1.createError)('This subject is not assigned to this class.'));
        }
        const pricing = (0, feeCalculator_1.calculateEnrollmentFee)(klass.feeAmount, subject.feeAmount);
        res.json((0, response_1.createResponse)({
            classId: klass._id,
            subjectId: subject._id,
            className: klass.className,
            subjectName: subject.title,
            classFee: pricing.classFee,
            subjectFee: pricing.subjectFee,
            resolvedFee: pricing.totalFee,
            currency: pricing.currency
        }));
    }
    catch (error) {
        next(error);
    }
});
exports.feeRouter = router;
