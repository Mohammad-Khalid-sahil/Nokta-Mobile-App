"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookRouter = void 0;
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const joi_1 = __importDefault(require("joi"));
const mongoose_1 = __importDefault(require("mongoose"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const Book_1 = require("../../models/Book");
const StationerySale_1 = require("../../models/StationerySale");
const User_1 = require("../../models/User");
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const auditService_1 = require("../../services/auditService");
const recordVisibility_1 = require("../../utils/recordVisibility");
const router = (0, express_1.Router)();
const auditService = new auditService_1.AuditService();
const bookUploadRoot = path_1.default.resolve(process.cwd(), 'uploads', 'books');
if (!fs_1.default.existsSync(bookUploadRoot)) {
    fs_1.default.mkdirSync(bookUploadRoot, { recursive: true });
}
const upload = (0, multer_1.default)({
    dest: bookUploadRoot,
    limits: {
        fileSize: 100 * 1024 * 1024
    }
});
const objectId = joi_1.default.string().hex().length(24);
const querySchema = joi_1.default.object({
    query: joi_1.default.object({
        page: joi_1.default.number().integer().min(1).default(1),
        limit: joi_1.default.number().integer().min(1).max(100).default(20),
        search: joi_1.default.string().allow('').default(''),
        category: joi_1.default.string().allow('').default(''),
        paymentStatus: joi_1.default.string().valid('paid', 'partial', 'unpaid', '').default(''),
        studentId: objectId.allow('').optional(),
        classId: objectId.allow('').optional(),
        bookId: objectId.allow('').optional(),
        from: joi_1.default.date().optional(),
        to: joi_1.default.date().optional(),
        sortBy: joi_1.default.string().valid('title', 'category', 'stockQuantity', 'price', 'createdAt', 'saleDate', 'totalAmount').default('createdAt'),
        sortOrder: joi_1.default.string().valid('asc', 'desc').default('desc')
    }).unknown(true)
});
const idSchema = joi_1.default.object({ params: joi_1.default.object({ id: objectId.required() }) });
const bookSchema = joi_1.default.object({
    body: joi_1.default.object({
        title: joi_1.default.string().trim().required(),
        author: joi_1.default.string().trim().allow('').default(''),
        isbn: joi_1.default.string().trim().required(),
        category: joi_1.default.string().trim().allow('').default('General'),
        subject: joi_1.default.alternatives().try(joi_1.default.string().allow(''), joi_1.default.object()).optional(),
        course: joi_1.default.alternatives().try(joi_1.default.string().allow(''), joi_1.default.object()).optional(),
        language: joi_1.default.string().trim().allow('').default(''),
        edition: joi_1.default.string().trim().allow('').default(''),
        publisher: joi_1.default.string().trim().allow('').default(''),
        publicationDate: joi_1.default.date().allow(null, '').optional(),
        stockQuantity: joi_1.default.number().integer().min(0).default(0),
        price: joi_1.default.number().min(0).default(0),
        available: joi_1.default.boolean().optional(),
        description: joi_1.default.alternatives().try(joi_1.default.string().allow(''), joi_1.default.object()).optional(),
        coverImage: joi_1.default.string().trim().allow('').default(''),
        coverUrl: joi_1.default.string().trim().allow('').default(''),
        fileUrl: joi_1.default.string().trim().allow('').default(''),
        fileName: joi_1.default.string().trim().allow('').default(''),
        fileOriginalName: joi_1.default.string().trim().allow('').default(''),
        fileMimeType: joi_1.default.string().trim().allow('').default(''),
        fileType: joi_1.default.string().trim().allow('').default(''),
        fileSize: joi_1.default.number().min(0).default(0),
        localizedTitle: joi_1.default.object().optional(),
        localizedDescription: joi_1.default.object().optional(),
        branchId: objectId.allow(null, '').optional()
    })
});
const updateBookSchema = joi_1.default.object({
    body: bookSchema.extract('body').fork(['title', 'isbn'], (schema) => schema.optional())
});
const saleSchema = joi_1.default.object({
    body: joi_1.default.object({
        bookId: objectId.required(),
        studentId: objectId.allow(null, '').optional(),
        quantity: joi_1.default.number().integer().min(1).required(),
        unitPrice: joi_1.default.number().min(0).optional(),
        paymentStatus: joi_1.default.string().valid('paid', 'partial', 'unpaid').default('paid'),
        paidAmount: joi_1.default.number().min(0).optional(),
        saleDate: joi_1.default.date().optional(),
        notes: joi_1.default.string().trim().allow('').default('')
    })
});
router.use(auth_1.authenticate);
function getBranchFilter(req) {
    const role = req.user?.canonicalRole ?? req.user?.role;
    if (['super_admin', 'admin', 'owner', 'system_automation'].includes(role)) {
        return {};
    }
    return req.user?.branchId ? { branchId: new mongoose_1.default.Types.ObjectId(req.user.branchId) } : {};
}
function buildDateFilter(query) {
    const filter = {};
    if (query.from)
        filter.$gte = new Date(query.from);
    if (query.to)
        filter.$lte = new Date(query.to);
    return Object.keys(filter).length ? { saleDate: filter } : {};
}
async function recordAudit(req, action, target, metadata = {}) {
    if (!req.user?.userId)
        return;
    await auditService.recordAction({
        actorId: req.user.userId,
        branchId: req.user.branchId ?? null,
        action,
        target,
        targetType: 'book',
        metadata,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? ''
    });
}
function serializeBook(book) {
    const fileUrl = book.fileUrl || '';
    const fileName = book.fileName || book.fileOriginalName || '';
    const fileMimeType = book.fileMimeType || mimeTypeFromName(fileName || fileUrl);
    const fileType = book.fileType || fileTypeFromMime(fileMimeType, fileName || fileUrl);
    const fileSize = Number(book.fileSize ?? 0);
    return {
        ...book,
        stockQuantity: Number(book.stockQuantity ?? 0),
        price: Number(book.price ?? 0),
        available: Boolean(book.available) && Number(book.stockQuantity ?? 0) > 0,
        fileUrl,
        fileName,
        fileOriginalName: book.fileOriginalName || fileName,
        fileMimeType,
        fileType,
        fileSize,
        downloadable: Boolean(fileUrl || fileName)
    };
}
function safeDownloadName(book) {
    const original = String(book.fileOriginalName || book.fileName || `${book.title || 'book'}.${book.fileType || 'pdf'}`);
    const sanitized = original.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
    return sanitized || 'book.pdf';
}
function fileTypeFromMime(mimeType, name) {
    const extension = path_1.default.extname(name).replace('.', '').toLowerCase();
    if (extension)
        return extension.toUpperCase();
    if (mimeType.includes('pdf'))
        return 'PDF';
    if (mimeType.includes('word'))
        return 'DOCX';
    if (mimeType.includes('epub'))
        return 'EPUB';
    return mimeType ? mimeType.split('/').pop()?.toUpperCase() || '' : '';
}
function mimeTypeFromName(name) {
    const extension = path_1.default.extname(name).toLowerCase();
    switch (extension) {
        case '.pdf':
            return 'application/pdf';
        case '.epub':
            return 'application/epub+zip';
        case '.doc':
            return 'application/msword';
        case '.docx':
            return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        case '.ppt':
            return 'application/vnd.ms-powerpoint';
        case '.pptx':
            return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        default:
            return 'application/octet-stream';
    }
}
function uploadedBookFile(req) {
    const files = req.files;
    const file = files?.file?.[0] ?? files?.bookFile?.[0];
    if (!file)
        return {};
    const extension = path_1.default.extname(file.originalname);
    const storedName = `${file.filename}${extension}`;
    const storedPath = path_1.default.join(bookUploadRoot, storedName);
    fs_1.default.renameSync(file.path, storedPath);
    return {
        fileUrl: `/uploads/books/${storedName}`,
        fileName: storedName,
        fileOriginalName: file.originalname,
        fileMimeType: file.mimetype || mimeTypeFromName(file.originalname),
        fileType: fileTypeFromMime(file.mimetype || '', file.originalname),
        fileSize: file.size,
        uploadedAt: new Date()
    };
}
function uploadedCoverFile(req) {
    const files = req.files;
    const file = files?.cover?.[0] ?? files?.coverImage?.[0];
    if (!file)
        return {};
    const extension = path_1.default.extname(file.originalname);
    const storedName = `cover-${file.filename}${extension}`;
    const storedPath = path_1.default.join(bookUploadRoot, storedName);
    fs_1.default.renameSync(file.path, storedPath);
    return {
        coverImage: `/uploads/books/${storedName}`,
        coverUrl: `/uploads/books/${storedName}`
    };
}
function multipartBookUpload(req, _res, next) {
    upload.fields([
        { name: 'file', maxCount: 1 },
        { name: 'bookFile', maxCount: 1 },
        { name: 'cover', maxCount: 1 },
        { name: 'coverImage', maxCount: 1 }
    ])(req, _res, (error) => {
        if (error)
            return next(error);
        req.body = {
            ...req.body,
            ...uploadedBookFile(req),
            ...uploadedCoverFile(req)
        };
        return next();
    });
}
function serializeSale(sale) {
    const student = sale.studentId && typeof sale.studentId === 'object' ? sale.studentId : null;
    const book = sale.bookId && typeof sale.bookId === 'object' ? sale.bookId : null;
    return {
        ...sale,
        bookId: book?._id ?? sale.bookId,
        bookTitle: book?.title ?? sale.title,
        studentId: student?._id ?? sale.studentId,
        studentName: student?.name ?? [student?.firstName, student?.lastName].filter(Boolean).join(' ') ?? '',
        balanceAmount: Math.max(0, Number(sale.totalAmount ?? 0) - Number(sale.paidAmount ?? 0))
    };
}
router.get('/summary', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'librarian', 'teacher', 'student', 'parent', 'owner']), async (req, res, next) => {
    try {
        const branchFilter = getBranchFilter(req);
        const [inventory, sales] = await Promise.all([
            Book_1.Book.aggregate([
                { $match: { isDeleted: false, ...branchFilter } },
                { $group: { _id: null, totalBooks: { $sum: 1 }, totalStock: { $sum: '$stockQuantity' }, inventoryValue: { $sum: { $multiply: ['$stockQuantity', '$price'] } } } }
            ]),
            StationerySale_1.StationerySale.aggregate([
                { $match: { isDeleted: false, ...branchFilter } },
                { $group: { _id: '$paymentStatus', total: { $sum: '$totalAmount' }, paid: { $sum: '$paidAmount' }, count: { $sum: 1 } } }
            ])
        ]);
        res.json((0, response_1.createResponse)({
            totalBooks: inventory[0]?.totalBooks ?? 0,
            totalStock: inventory[0]?.totalStock ?? 0,
            inventoryValue: inventory[0]?.inventoryValue ?? 0,
            salesTotal: sales.reduce((sum, item) => sum + (item.total ?? 0), 0),
            paidSales: sales.reduce((sum, item) => sum + (item.paid ?? 0), 0),
            pendingSales: sales.reduce((sum, item) => sum + Math.max(0, (item.total ?? 0) - (item.paid ?? 0)), 0),
            salesByStatus: sales
        }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/sales', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'librarian', 'owner']), (0, validate_1.validate)(querySchema), async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        const sortBy = String(req.query.sortBy || 'saleDate');
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
        const filter = { ...(0, recordVisibility_1.listRecordFilter)(req.user), ...getBranchFilter(req), ...buildDateFilter(req.query) };
        if (req.query.paymentStatus)
            filter.paymentStatus = req.query.paymentStatus;
        if (req.query.studentId)
            filter.studentId = req.query.studentId;
        if (req.query.bookId)
            filter.bookId = req.query.bookId;
        if (req.query.classId) {
            const students = await User_1.User.find({ classId: req.query.classId, role: 'student', isDeleted: false }).select('_id').lean();
            filter.studentId = { $in: students.map((student) => student._id) };
        }
        const [sales, total] = await Promise.all([
            StationerySale_1.StationerySale.find(filter)
                .populate('bookId', 'title isbn')
                .populate('studentId', 'name firstName lastName email')
                .sort({ [sortBy]: sortOrder })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            StationerySale_1.StationerySale.countDocuments(filter)
        ]);
        res.json((0, response_1.createResponse)(sales.map(serializeSale), '', { page, limit, total }));
    }
    catch (error) {
        next(error);
    }
});
router.post('/sales', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'librarian']), (0, validate_1.validate)(saleSchema), async (req, res, next) => {
    const session = await mongoose_1.default.startSession();
    try {
        let createdSale;
        await session.withTransaction(async () => {
            const book = await Book_1.Book.findOne({ _id: req.body.bookId, isDeleted: false, ...getBranchFilter(req) }).session(session);
            if (!book) {
                throw Object.assign(new Error('Book not found'), { statusCode: 404 });
            }
            if (book.stockQuantity < req.body.quantity) {
                throw Object.assign(new Error('Not enough stock for this sale'), { statusCode: 400 });
            }
            const unitPrice = req.body.unitPrice ?? book.price ?? 0;
            const totalAmount = unitPrice * req.body.quantity;
            const paidAmount = req.body.paidAmount ?? (req.body.paymentStatus === 'paid' ? totalAmount : 0);
            const receiptNumber = `BOOK-${Date.now().toString(36).toUpperCase()}-${String(book._id).slice(-4).toUpperCase()}`;
            book.stockQuantity -= req.body.quantity;
            book.available = book.stockQuantity > 0;
            await book.save({ session });
            const [sale] = await StationerySale_1.StationerySale.create([{
                    branchId: book.branchId ?? req.user?.branchId ?? null,
                    bookId: book._id,
                    studentId: req.body.studentId || null,
                    soldBy: req.user?.userId ?? null,
                    receiptNumber,
                    title: book.title,
                    quantity: req.body.quantity,
                    unitPrice,
                    totalAmount,
                    paymentStatus: req.body.paymentStatus,
                    paidAmount,
                    notes: req.body.notes,
                    saleDate: req.body.saleDate ?? new Date()
                }], { session });
            createdSale = sale;
        });
        await recordAudit(req, 'BOOK_SALE_CREATE', String(createdSale._id), { totalAmount: createdSale.totalAmount, quantity: createdSale.quantity });
        res.status(201).json((0, response_1.createResponse)(createdSale, 'Book sale recorded'));
    }
    catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json((0, response_1.createError)(error.message));
        }
        next(error);
    }
    finally {
        session.endSession();
    }
});
router.get('/sales/:id/receipt', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'librarian', 'owner', 'student', 'parent']), (0, validate_1.validate)(idSchema), async (req, res, next) => {
    try {
        const sale = await StationerySale_1.StationerySale.findOne({ _id: req.params.id, isDeleted: false, ...getBranchFilter(req) })
            .populate('bookId', 'title isbn category')
            .populate('studentId', 'name firstName lastName email')
            .populate('soldBy', 'name email')
            .lean();
        if (!sale) {
            return res.status(404).json((0, response_1.createError)('Book sale receipt not found'));
        }
        res.json((0, response_1.createResponse)({ ...serializeSale(sale), academy: 'Nokta Academy', generatedAt: new Date().toISOString() }));
    }
    catch (error) {
        next(error);
    }
});
router.post('/', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'librarian', 'teacher']), multipartBookUpload, (0, validate_1.validate)(bookSchema), async (req, res, next) => {
    try {
        const branchId = req.body.branchId || req.user?.branchId || null;
        const book = await Book_1.Book.create({ ...req.body, branchId, available: req.body.available ?? req.body.stockQuantity > 0 });
        await recordAudit(req, 'BOOK_CREATE', String(book._id), { title: book.title });
        res.status(201).json((0, response_1.createResponse)(serializeBook(book.toObject()), 'Book added'));
    }
    catch (error) {
        if (error?.code === 11000) {
            return res.status(409).json((0, response_1.createError)('A book with this ISBN already exists in this branch'));
        }
        next(error);
    }
});
router.get('/', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'librarian', 'teacher', 'student', 'parent', 'owner']), (0, validate_1.validate)(querySchema), async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        const search = String(req.query.search || '').trim();
        const sortBy = String(req.query.sortBy || 'createdAt');
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
        const filter = { isDeleted: false, ...getBranchFilter(req) };
        if (search) {
            filter.$or = [
                { title: { $regex: search, $options: 'i' } },
                { author: { $regex: search, $options: 'i' } },
                { isbn: { $regex: search, $options: 'i' } }
            ];
        }
        if (req.query.category)
            filter.category = req.query.category;
        const [books, total] = await Promise.all([
            Book_1.Book.find(filter).lean().sort({ [sortBy]: sortOrder }).skip((page - 1) * limit).limit(limit),
            Book_1.Book.countDocuments(filter)
        ]);
        res.json((0, response_1.createResponse)(books.map(serializeBook), '', { page, limit, total }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/:id/download', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'librarian', 'teacher', 'student', 'parent', 'owner']), (0, validate_1.validate)(idSchema), async (req, res, next) => {
    try {
        const book = await Book_1.Book.findOne({ _id: req.params.id, isDeleted: false, ...getBranchFilter(req) }).lean();
        if (!book) {
            return res.status(404).json((0, response_1.createError)('Book not found'));
        }
        const fileUrl = String(book.fileUrl || '').trim();
        const storedName = String(book.fileName || '').trim();
        if (!fileUrl && !storedName) {
            return res.status(404).json((0, response_1.createError)('Book file is not available'));
        }
        if (/^https?:\/\//i.test(fileUrl)) {
            return res.redirect(fileUrl);
        }
        const candidates = [
            fileUrl ? path_1.default.resolve(process.cwd(), fileUrl.replace(/^\/+/, '')) : '',
            fileUrl ? path_1.default.resolve(bookUploadRoot, path_1.default.basename(fileUrl)) : '',
            storedName ? path_1.default.resolve(bookUploadRoot, path_1.default.basename(storedName)) : '',
            storedName ? path_1.default.resolve(process.cwd(), 'uploads', 'books', path_1.default.basename(storedName)) : ''
        ].filter(Boolean);
        const resolvedPath = candidates.find((candidate) => {
            const normalized = path_1.default.normalize(candidate);
            const root = path_1.default.normalize(bookUploadRoot);
            return normalized.toLowerCase().startsWith(root.toLowerCase()) && fs_1.default.existsSync(normalized);
        });
        if (!resolvedPath) {
            return res.status(404).json((0, response_1.createError)('Book file is not available'));
        }
        const filename = safeDownloadName(book);
        res.setHeader('Content-Type', book.fileMimeType || mimeTypeFromName(filename));
        res.setHeader('Content-Length', String(book.fileSize || fs_1.default.statSync(resolvedPath).size));
        return res.download(resolvedPath, filename);
    }
    catch (error) {
        next(error);
    }
});
router.get('/:id', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'librarian', 'teacher', 'student', 'parent', 'owner']), (0, validate_1.validate)(idSchema), async (req, res, next) => {
    try {
        const book = await Book_1.Book.findOne({ _id: req.params.id, isDeleted: false, ...getBranchFilter(req) }).lean();
        if (!book) {
            return res.status(404).json((0, response_1.createError)('Book not found'));
        }
        res.json((0, response_1.createResponse)(serializeBook(book)));
    }
    catch (error) {
        next(error);
    }
});
router.put('/:id', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'librarian']), (0, validate_1.validate)(idSchema), multipartBookUpload, (0, validate_1.validate)(updateBookSchema), async (req, res, next) => {
    try {
        const update = { ...req.body };
        if (update.stockQuantity !== undefined && update.available === undefined) {
            update.available = Number(update.stockQuantity) > 0;
        }
        const book = await Book_1.Book.findOneAndUpdate({ _id: req.params.id, isDeleted: false, ...getBranchFilter(req) }, update, { new: true, runValidators: true }).lean();
        if (!book) {
            return res.status(404).json((0, response_1.createError)('Book not found'));
        }
        await recordAudit(req, 'BOOK_UPDATE', String(req.params.id), { fields: Object.keys(update) });
        res.json((0, response_1.createResponse)(serializeBook(book), 'Book updated'));
    }
    catch (error) {
        if (error?.code === 11000) {
            return res.status(409).json((0, response_1.createError)('A book with this ISBN already exists in this branch'));
        }
        next(error);
    }
});
router.delete('/:id', (0, auth_1.authorize)(['super_admin', 'admin']), (0, validate_1.validate)(idSchema), async (req, res, next) => {
    try {
        const book = await Book_1.Book.findOneAndUpdate({ _id: req.params.id, isDeleted: false, ...getBranchFilter(req) }, { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.userId ?? null }, { new: true }).lean();
        if (!book) {
            return res.status(404).json((0, response_1.createError)('Book not found'));
        }
        const deletedBook = Array.isArray(book) ? book[0] : book;
        await recordAudit(req, 'BOOK_DELETE', String(req.params.id), { title: deletedBook?.title ?? '' });
        res.json((0, response_1.createResponse)(null, 'Book deleted'));
    }
    catch (error) {
        next(error);
    }
});
exports.bookRouter = router;
