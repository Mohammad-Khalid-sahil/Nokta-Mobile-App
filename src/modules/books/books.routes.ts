import { Router } from 'express';
import fs from 'fs';
import Joi from 'joi';
import mongoose from 'mongoose';
import multer from 'multer';
import path from 'path';
import { Book } from '../../models/Book';
import { StationerySale } from '../../models/StationerySale';
import { User } from '../../models/User';
import { authenticate, authorize } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { createResponse, createError } from '../../helpers/response';
import { AuditService } from '../../services/auditService';
import { listRecordFilter } from '../../utils/recordVisibility';

const router = Router();
const auditService = new AuditService();
const bookUploadRoot = path.resolve(process.cwd(), 'uploads', 'books');

if (!fs.existsSync(bookUploadRoot)) {
  fs.mkdirSync(bookUploadRoot, { recursive: true });
}

const upload = multer({
  dest: bookUploadRoot,
  limits: {
    fileSize: 100 * 1024 * 1024
  }
});

const objectId = Joi.string().hex().length(24);

const querySchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().allow('').default(''),
    category: Joi.string().allow('').default(''),
    paymentStatus: Joi.string().valid('paid', 'partial', 'unpaid', '').default(''),
    studentId: objectId.allow('').optional(),
    classId: objectId.allow('').optional(),
    bookId: objectId.allow('').optional(),
    from: Joi.date().optional(),
    to: Joi.date().optional(),
    sortBy: Joi.string().valid('title', 'category', 'stockQuantity', 'price', 'createdAt', 'saleDate', 'totalAmount').default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }).unknown(true)
});

const idSchema = Joi.object({ params: Joi.object({ id: objectId.required() }) });

const bookSchema = Joi.object({
  body: Joi.object({
    title: Joi.string().trim().required(),
    author: Joi.string().trim().allow('').default(''),
    isbn: Joi.string().trim().required(),
    category: Joi.string().trim().allow('').default('General'),
    subject: Joi.alternatives().try(Joi.string().allow(''), Joi.object()).optional(),
    course: Joi.alternatives().try(Joi.string().allow(''), Joi.object()).optional(),
    language: Joi.string().trim().allow('').default(''),
    edition: Joi.string().trim().allow('').default(''),
    publisher: Joi.string().trim().allow('').default(''),
    publicationDate: Joi.date().allow(null, '').optional(),
    stockQuantity: Joi.number().integer().min(0).default(0),
    price: Joi.number().min(0).default(0),
    available: Joi.boolean().optional(),
    description: Joi.alternatives().try(Joi.string().allow(''), Joi.object()).optional(),
    coverImage: Joi.string().trim().allow('').default(''),
    coverUrl: Joi.string().trim().allow('').default(''),
    fileUrl: Joi.string().trim().allow('').default(''),
    fileName: Joi.string().trim().allow('').default(''),
    fileOriginalName: Joi.string().trim().allow('').default(''),
    fileMimeType: Joi.string().trim().allow('').default(''),
    fileType: Joi.string().trim().allow('').default(''),
    fileSize: Joi.number().min(0).default(0),
    localizedTitle: Joi.object().optional(),
    localizedDescription: Joi.object().optional(),
    branchId: objectId.allow(null, '').optional()
  })
});

const updateBookSchema = Joi.object({
  body: bookSchema.extract('body').fork(['title', 'isbn'], (schema) => schema.optional())
});

const saleSchema = Joi.object({
  body: Joi.object({
    bookId: objectId.required(),
    studentId: objectId.allow(null, '').optional(),
    quantity: Joi.number().integer().min(1).required(),
    unitPrice: Joi.number().min(0).optional(),
    paymentStatus: Joi.string().valid('paid', 'partial', 'unpaid').default('paid'),
    paidAmount: Joi.number().min(0).optional(),
    saleDate: Joi.date().optional(),
    notes: Joi.string().trim().allow('').default('')
  })
});

router.use(authenticate);

function getBranchFilter(req: any) {
  const role = req.user?.canonicalRole ?? req.user?.role;
  if (['super_admin', 'admin', 'owner', 'system_automation'].includes(role)) {
    return {};
  }

  return req.user?.branchId ? { branchId: new mongoose.Types.ObjectId(req.user.branchId) } : {};
}

function buildDateFilter(query: any) {
  const filter: Record<string, Date> = {};
  if (query.from) filter.$gte = new Date(query.from);
  if (query.to) filter.$lte = new Date(query.to);
  return Object.keys(filter).length ? { saleDate: filter } : {};
}

async function recordAudit(req: any, action: string, target: string, metadata: Record<string, unknown> = {}) {
  if (!req.user?.userId) return;
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

function serializeBook(book: any) {
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

function safeDownloadName(book: any) {
  const original = String(book.fileOriginalName || book.fileName || `${book.title || 'book'}.${book.fileType || 'pdf'}`);
  const sanitized = original.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  return sanitized || 'book.pdf';
}

function fileTypeFromMime(mimeType: string, name: string) {
  const extension = path.extname(name).replace('.', '').toLowerCase();
  if (extension) return extension.toUpperCase();
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('word')) return 'DOCX';
  if (mimeType.includes('epub')) return 'EPUB';
  return mimeType ? mimeType.split('/').pop()?.toUpperCase() || '' : '';
}

function mimeTypeFromName(name: string) {
  const extension = path.extname(name).toLowerCase();
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

function uploadedBookFile(req: any) {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const file = files?.file?.[0] ?? files?.bookFile?.[0];
  if (!file) return {};
  const extension = path.extname(file.originalname);
  const storedName = `${file.filename}${extension}`;
  const storedPath = path.join(bookUploadRoot, storedName);
  fs.renameSync(file.path, storedPath);
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

function uploadedCoverFile(req: any) {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const file = files?.cover?.[0] ?? files?.coverImage?.[0];
  if (!file) return {};
  const extension = path.extname(file.originalname);
  const storedName = `cover-${file.filename}${extension}`;
  const storedPath = path.join(bookUploadRoot, storedName);
  fs.renameSync(file.path, storedPath);
  return {
    coverImage: `/uploads/books/${storedName}`,
    coverUrl: `/uploads/books/${storedName}`
  };
}

function multipartBookUpload(req: any, _res: any, next: any) {
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'bookFile', maxCount: 1 },
    { name: 'cover', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 }
  ])(req, _res, (error: unknown) => {
    if (error) return next(error);
    req.body = {
      ...req.body,
      ...uploadedBookFile(req),
      ...uploadedCoverFile(req)
    };
    return next();
  });
}

function serializeSale(sale: any) {
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

router.get('/summary', authorize(['super_admin', 'admin', 'branch_manager', 'librarian', 'teacher', 'student', 'parent', 'owner']), async (req, res, next) => {
  try {
    const branchFilter = getBranchFilter(req);
    const [inventory, sales] = await Promise.all([
      Book.aggregate([
        { $match: { isDeleted: false, ...branchFilter } },
        { $group: { _id: null, totalBooks: { $sum: 1 }, totalStock: { $sum: '$stockQuantity' }, inventoryValue: { $sum: { $multiply: ['$stockQuantity', '$price'] } } } }
      ]),
      StationerySale.aggregate([
        { $match: { isDeleted: false, ...branchFilter } },
        { $group: { _id: '$paymentStatus', total: { $sum: '$totalAmount' }, paid: { $sum: '$paidAmount' }, count: { $sum: 1 } } }
      ])
    ]);

    res.json(createResponse({
      totalBooks: inventory[0]?.totalBooks ?? 0,
      totalStock: inventory[0]?.totalStock ?? 0,
      inventoryValue: inventory[0]?.inventoryValue ?? 0,
      salesTotal: sales.reduce((sum, item) => sum + (item.total ?? 0), 0),
      paidSales: sales.reduce((sum, item) => sum + (item.paid ?? 0), 0),
      pendingSales: sales.reduce((sum, item) => sum + Math.max(0, (item.total ?? 0) - (item.paid ?? 0)), 0),
      salesByStatus: sales
    }));
  } catch (error) {
    next(error);
  }
});

router.get('/sales', authorize(['super_admin', 'admin', 'branch_manager', 'librarian', 'owner']), validate(querySchema), async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const sortBy = String(req.query.sortBy || 'saleDate');
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const filter: any = { ...listRecordFilter(req.user), ...getBranchFilter(req), ...buildDateFilter(req.query) };

    if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
    if (req.query.studentId) filter.studentId = req.query.studentId;
    if (req.query.bookId) filter.bookId = req.query.bookId;

    if (req.query.classId) {
      const students = await User.find({ classId: req.query.classId, role: 'student', isDeleted: false }).select('_id').lean();
      filter.studentId = { $in: students.map((student: any) => student._id) };
    }

    const [sales, total] = await Promise.all([
      StationerySale.find(filter)
        .populate('bookId', 'title isbn')
        .populate('studentId', 'name firstName lastName email')
        .sort({ [sortBy]: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      StationerySale.countDocuments(filter)
    ]);

    res.json(createResponse(sales.map(serializeSale), '', { page, limit, total }));
  } catch (error) {
    next(error);
  }
});

router.post('/sales', authorize(['super_admin', 'admin', 'branch_manager', 'librarian']), validate(saleSchema), async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    let createdSale: any;
    await session.withTransaction(async () => {
      const book = await Book.findOne({ _id: req.body.bookId, isDeleted: false, ...getBranchFilter(req) }).session(session);
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

      const [sale] = await StationerySale.create([{
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
    res.status(201).json(createResponse(createdSale, 'Book sale recorded'));
  } catch (error: any) {
    if (error.statusCode) {
      return res.status(error.statusCode).json(createError(error.message));
    }
    next(error);
  } finally {
    session.endSession();
  }
});

router.get('/sales/:id/receipt', authorize(['super_admin', 'admin', 'branch_manager', 'librarian', 'owner', 'student', 'parent']), validate(idSchema), async (req, res, next) => {
  try {
    const sale = await StationerySale.findOne({ _id: req.params.id, isDeleted: false, ...getBranchFilter(req) })
      .populate('bookId', 'title isbn category')
      .populate('studentId', 'name firstName lastName email')
      .populate('soldBy', 'name email')
      .lean();

    if (!sale) {
      return res.status(404).json(createError('Book sale receipt not found'));
    }

    res.json(createResponse({ ...serializeSale(sale), academy: 'Nokta Academy', generatedAt: new Date().toISOString() }));
  } catch (error) {
    next(error);
  }
});

router.post('/', authorize(['super_admin', 'admin', 'branch_manager', 'librarian', 'teacher']), multipartBookUpload, validate(bookSchema), async (req, res, next) => {
  try {
    const branchId = req.body.branchId || req.user?.branchId || null;
    const book = await Book.create({ ...req.body, branchId, available: req.body.available ?? req.body.stockQuantity > 0 });
    await recordAudit(req, 'BOOK_CREATE', String(book._id), { title: book.title });
    res.status(201).json(createResponse(serializeBook(book.toObject()), 'Book added'));
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json(createError('A book with this ISBN already exists in this branch'));
    }
    next(error);
  }
});

router.get('/', authorize(['super_admin', 'admin', 'branch_manager', 'librarian', 'teacher', 'student', 'parent', 'owner']), validate(querySchema), async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const search = String(req.query.search || '').trim();
    const sortBy = String(req.query.sortBy || 'createdAt');
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const filter: any = { isDeleted: false, ...getBranchFilter(req) };
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { author: { $regex: search, $options: 'i' } },
        { isbn: { $regex: search, $options: 'i' } }
      ];
    }
    if (req.query.category) filter.category = req.query.category;

    const [books, total] = await Promise.all([
      Book.find(filter).lean().sort({ [sortBy]: sortOrder }).skip((page - 1) * limit).limit(limit),
      Book.countDocuments(filter)
    ]);
    res.json(createResponse(books.map(serializeBook), '', { page, limit, total }));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/download', authorize(['super_admin', 'admin', 'branch_manager', 'librarian', 'teacher', 'student', 'parent', 'owner']), validate(idSchema), async (req, res, next) => {
  try {
    const book = await Book.findOne({ _id: req.params.id, isDeleted: false, ...getBranchFilter(req) }).lean() as any;
    if (!book) {
      return res.status(404).json(createError('Book not found'));
    }

    const fileUrl = String(book.fileUrl || '').trim();
    const storedName = String(book.fileName || '').trim();
    if (!fileUrl && !storedName) {
      return res.status(404).json(createError('Book file is not available'));
    }

    if (/^https?:\/\//i.test(fileUrl)) {
      return res.redirect(fileUrl);
    }

    const candidates = [
      fileUrl ? path.resolve(process.cwd(), fileUrl.replace(/^\/+/, '')) : '',
      fileUrl ? path.resolve(bookUploadRoot, path.basename(fileUrl)) : '',
      storedName ? path.resolve(bookUploadRoot, path.basename(storedName)) : '',
      storedName ? path.resolve(process.cwd(), 'uploads', 'books', path.basename(storedName)) : ''
    ].filter(Boolean);

    const resolvedPath = candidates.find((candidate) => {
      const normalized = path.normalize(candidate);
      const root = path.normalize(bookUploadRoot);
      return normalized.toLowerCase().startsWith(root.toLowerCase()) && fs.existsSync(normalized);
    });

    if (!resolvedPath) {
      return res.status(404).json(createError('Book file is not available'));
    }

    const filename = safeDownloadName(book);
    res.setHeader('Content-Type', book.fileMimeType || mimeTypeFromName(filename));
    res.setHeader('Content-Length', String(book.fileSize || fs.statSync(resolvedPath).size));
    return res.download(resolvedPath, filename);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authorize(['super_admin', 'admin', 'branch_manager', 'librarian', 'teacher', 'student', 'parent', 'owner']), validate(idSchema), async (req, res, next) => {
  try {
    const book = await Book.findOne({ _id: req.params.id, isDeleted: false, ...getBranchFilter(req) }).lean();
    if (!book) {
      return res.status(404).json(createError('Book not found'));
    }
    res.json(createResponse(serializeBook(book)));
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authorize(['super_admin', 'admin', 'branch_manager', 'librarian']), validate(idSchema), multipartBookUpload, validate(updateBookSchema), async (req, res, next) => {
  try {
    const update = { ...req.body };
    if (update.stockQuantity !== undefined && update.available === undefined) {
      update.available = Number(update.stockQuantity) > 0;
    }

    const book = await Book.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false, ...getBranchFilter(req) },
      update,
      { new: true, runValidators: true }
    ).lean();

    if (!book) {
      return res.status(404).json(createError('Book not found'));
    }

    await recordAudit(req, 'BOOK_UPDATE', String(req.params.id), { fields: Object.keys(update) });
    res.json(createResponse(serializeBook(book), 'Book updated'));
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json(createError('A book with this ISBN already exists in this branch'));
    }
    next(error);
  }
});

router.delete('/:id', authorize(['super_admin', 'admin']), validate(idSchema), async (req, res, next) => {
  try {
    const book = await Book.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false, ...getBranchFilter(req) },
      { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.userId ?? null },
      { new: true }
    ).lean();

    if (!book) {
      return res.status(404).json(createError('Book not found'));
    }

    const deletedBook = Array.isArray(book) ? book[0] : book;
    await recordAudit(req, 'BOOK_DELETE', String(req.params.id), { title: deletedBook?.title ?? '' });
    res.json(createResponse(null, 'Book deleted'));
  } catch (error) {
    next(error);
  }
});

export const bookRouter = router;
