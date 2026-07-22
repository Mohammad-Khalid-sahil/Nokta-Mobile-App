"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.coursesController = void 0;
const response_1 = require("../../helpers/response");
const courses_service_1 = require("./courses.service");
const publicCatalogService_1 = require("../../services/publicCatalogService");
const courseService = new courses_service_1.CourseService();
exports.coursesController = {
    publicHome: async (req, res, next) => {
        try {
            const { items, meta } = await courseService.list(req.query, true, true);
            res.json((0, response_1.createResponse)(items, '', meta));
        }
        catch (error) {
            next(error);
        }
    },
    publicList: async (req, res, next) => {
        try {
            const { items, meta } = await courseService.list(req.query, true);
            res.json((0, response_1.createResponse)(items, '', meta));
        }
        catch (error) {
            next(error);
        }
    },
    publicGetById: async (req, res, next) => {
        try {
            const course = await (0, publicCatalogService_1.getPublicCourseById)(req.params.id, String(req.query.lang || 'en'));
            if (!course)
                return res.status(404).json((0, response_1.createError)('Course not found'));
            res.json((0, response_1.createResponse)(course));
        }
        catch (error) {
            next(error);
        }
    },
    list: async (req, res, next) => {
        try {
            const { items, meta } = await courseService.list(req.query);
            res.json((0, response_1.createResponse)(items, '', meta));
        }
        catch (error) {
            next(error);
        }
    },
    create: async (req, res) => {
        try {
            const course = await courseService.create(req);
            res.status(201).json((0, response_1.createResponse)(course, 'Course created successfully'));
        }
        catch (error) {
            if (/duplicate key/i.test(error?.message ?? ''))
                return res.status(409).json((0, response_1.createError)('Course slug already exists'));
            res.status(400).json((0, response_1.createError)(error?.message || 'Failed to create course'));
        }
    },
    getById: async (req, res, next) => {
        try {
            const course = await courseService.getById(req.params.id, String(req.query.lang || 'en'));
            if (!course)
                return res.status(404).json((0, response_1.createError)('Course not found'));
            res.json((0, response_1.createResponse)(course));
        }
        catch (error) {
            next(error);
        }
    },
    update: async (req, res) => {
        try {
            const course = await courseService.update(req);
            if (!course)
                return res.status(404).json((0, response_1.createError)('Course not found'));
            res.json((0, response_1.createResponse)(course, 'Course updated successfully'));
        }
        catch (error) {
            res.status(400).json((0, response_1.createError)(error?.message || 'Failed to update course'));
        }
    },
    remove: async (req, res) => {
        try {
            const course = await courseService.softDelete(req);
            if (!course)
                return res.status(404).json((0, response_1.createError)('Course not found'));
            res.json((0, response_1.createResponse)({}, 'Course deleted successfully'));
        }
        catch (error) {
            res.status(400).json((0, response_1.createError)(error?.message || 'Failed to delete course'));
        }
    }
};
