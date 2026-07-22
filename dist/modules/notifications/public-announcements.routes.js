"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicAnnouncementsRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const publicAnnouncementsService_1 = require("../../services/publicAnnouncementsService");
const router = (0, express_1.Router)();
const querySchema = joi_1.default.object({
    query: joi_1.default.object({
        page: joi_1.default.number().integer().min(1).default(1),
        limit: joi_1.default.number().integer().min(1).max(100).default(20),
        search: joi_1.default.string().allow('', null).optional(),
        lang: joi_1.default.string().valid('en', 'fa', 'ps').optional()
    })
});
router.get('/', (0, validate_1.validate)(querySchema), async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        const search = String(req.query.search || '').trim();
        const lang = String(req.query.lang || 'en');
        const result = await (0, publicAnnouncementsService_1.listPublicAnnouncements)({ page, limit, search, lang });
        res.json((0, response_1.createResponse)(result.items, '', {
            page: result.page,
            limit: result.limit,
            total: result.total
        }));
    }
    catch (error) {
        next(error);
    }
});
exports.publicAnnouncementsRouter = router;
