"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CourseService = void 0;
exports.serializeCourse = serializeCourse;
const Course_1 = require("../../models/Course");
const Subject_1 = require("../../models/Subject");
const User_1 = require("../../models/User");
function toLocalized(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const record = value;
        return {
            en: String(record.en ?? '').trim(),
            fa: String(record.fa ?? record.en ?? '').trim(),
            ps: String(record.ps ?? record.en ?? '').trim()
        };
    }
    const text = String(value ?? '').trim();
    return { en: text, fa: text, ps: text };
}
function normalizeId(value) {
    return value === '' || value === undefined ? null : value;
}
function normalizeIdArray(value) {
    if (Array.isArray(value))
        return value.filter(Boolean);
    if (typeof value === 'string')
        return value.split(',').map((item) => item.trim()).filter(Boolean);
    return [];
}
function pickLocalized(value, language = 'en') {
    if (!value || typeof value !== 'object')
        return String(value ?? '');
    return value[language] || value.en || value.fa || value.ps || '';
}
function serializeCourse(course, language = 'en') {
    const teacher = course?.teacher ?? course?.instructor;
    const category = course?.category ?? course?.academicCategory ?? 'general';
    const branch = course?.branch ?? course?.branchId ?? null;
    const gallery = Array.isArray(course?.galleryImages) ? course.galleryImages : [];
    const imageUrl = course?.imageUrl ||
        course?.thumbnailUrl ||
        (gallery.length > 0 ? gallery[0] : '') ||
        '';
    return {
        ...course,
        imageUrl,
        titleText: pickLocalized(course?.title, language),
        descriptionText: pickLocalized(course?.description, language),
        requirementsText: pickLocalized(course?.requirements, language),
        learningOutcomesText: pickLocalized(course?.learningOutcomes, language),
        teacher: teacher?._id ?? teacher ?? null,
        instructor: teacher?._id ?? teacher ?? null,
        teacherName: teacher?.name ?? '',
        instructorName: teacher?.name ?? '',
        category,
        academicCategory: category,
        branch: branch?._id ?? branch ?? null,
        branchId: branch?._id ?? branch ?? null,
        subjectNames: Array.isArray(course?.subjects) ? course.subjects.map((subject) => subject?.title).filter(Boolean).join(', ') : ''
    };
}
class CourseService {
    normalizePayload(req, body) {
        const payload = { ...body };
        const teacherId = body.teacher ?? body.instructor;
        const branchId = body.branch ?? body.branchId;
        payload.teacher = normalizeId(teacherId);
        payload.instructor = normalizeId(teacherId);
        payload.branchId = normalizeId(branchId) ?? req.user?.branchId ?? null;
        payload.category = body.category ?? body.academicCategory ?? 'general';
        payload.academicCategory = payload.category;
        for (const key of ['title', 'description', 'requirements', 'learningOutcomes']) {
            if (Object.prototype.hasOwnProperty.call(body, key)) {
                payload[key] = toLocalized(body[key]);
            }
        }
        if (Object.prototype.hasOwnProperty.call(body, 'subjects'))
            payload.subjects = normalizeIdArray(body.subjects);
        if (Object.prototype.hasOwnProperty.call(body, 'startDate'))
            payload.startDate = body.startDate ? new Date(body.startDate) : null;
        if (Object.prototype.hasOwnProperty.call(body, 'endDate'))
            payload.endDate = body.endDate ? new Date(body.endDate) : null;
        return payload;
    }
    async assertRelations(payload) {
        const teacherId = payload.teacher ?? payload.instructor;
        const [teacher, subjectCount] = await Promise.all([
            teacherId ? User_1.User.findOne({ _id: teacherId, role: 'teacher', isDeleted: false }).lean() : Promise.resolve(null),
            payload.subjects?.length ? Subject_1.Subject.countDocuments({ _id: { $in: payload.subjects }, isDeleted: false }) : Promise.resolve(0)
        ]);
        if (teacherId && !teacher)
            throw new Error('Selected teacher does not exist');
        if (payload.subjects?.length && subjectCount !== payload.subjects.length)
            throw new Error('One or more selected subjects do not exist');
    }
    async list(query, publicOnly = false, homeOnly = false) {
        const page = Number(query.page || 1);
        const limit = Number(query.limit || (homeOnly ? 6 : 20));
        const search = String(query.search || '').trim();
        const language = String(query.lang || 'en');
        const filter = { isDeleted: false };
        if (publicOnly) {
            filter.status = 'active';
            filter.visibility = 'public';
            filter.$or = [
                { enrollmentStatus: 'open' },
                { registrationOpen: true }
            ];
        }
        if (homeOnly) {
            // Home page shows all active public offerings, not only featured items.
            delete filter.featured;
        }
        if (query.status)
            filter.status = query.status;
        if (query.visibility)
            filter.visibility = query.visibility;
        if (query.featured !== undefined)
            filter.featured = query.featured;
        if (query.category)
            filter.$or = [{ category: query.category }, { academicCategory: query.category }];
        if (search) {
            const searchClauses = [
                { slug: { $regex: search, $options: 'i' } },
                { 'title.en': { $regex: search, $options: 'i' } },
                { 'title.fa': { $regex: search, $options: 'i' } },
                { 'title.ps': { $regex: search, $options: 'i' } },
                { category: { $regex: search, $options: 'i' } },
                { academicCategory: { $regex: search, $options: 'i' } }
            ];
            filter.$and = [...(filter.$and ?? []), { $or: searchClauses }];
        }
        const sortBy = String(query.sortBy || 'createdAt');
        const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
        const [courses, total] = await Promise.all([
            Course_1.Course.find(filter)
                .populate('teacher', 'name email')
                .populate('instructor', 'name email')
                .populate('subjects', 'title code')
                .sort({ featured: -1, [sortBy]: sortOrder })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Course_1.Course.countDocuments(filter)
        ]);
        return { items: courses.map((course) => serializeCourse(course, language)), meta: { page, limit, total } };
    }
    async create(req) {
        const payload = this.normalizePayload(req, req.body);
        payload.createdBy = req.user?.userId ?? null;
        payload.updatedBy = req.user?.userId ?? null;
        await this.assertRelations(payload);
        const course = await Course_1.Course.create(payload);
        const saved = await Course_1.Course.findById(course._id).populate('teacher', 'name email').populate('instructor', 'name email').populate('subjects', 'title code').lean();
        return serializeCourse(saved, String(req.query.lang || 'en'));
    }
    async getById(id, language = 'en') {
        const course = await Course_1.Course.findOne({ _id: id, isDeleted: false }).populate('teacher', 'name email').populate('instructor', 'name email').populate('subjects', 'title code').lean();
        return course ? serializeCourse(course, language) : null;
    }
    async update(req) {
        const payload = this.normalizePayload(req, req.body);
        payload.updatedBy = req.user?.userId ?? null;
        await this.assertRelations(payload);
        const course = await Course_1.Course.findOneAndUpdate({ _id: req.params.id, isDeleted: false }, payload, { new: true, runValidators: true })
            .populate('teacher', 'name email')
            .populate('instructor', 'name email')
            .populate('subjects', 'title code')
            .lean();
        return course ? serializeCourse(course, String(req.query.lang || 'en')) : null;
    }
    async softDelete(req) {
        return Course_1.Course.findOneAndUpdate({ _id: req.params.id, isDeleted: false }, { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.userId ?? null, updatedBy: req.user?.userId ?? null, status: 'archived' }, { new: true }).lean();
    }
}
exports.CourseService = CourseService;
