import { Router } from 'express';
import Joi from 'joi';
import { Result } from '../../models/Result';
import { Student } from '../../models/Student';
import { User } from '../../models/User';
import { Exam } from '../../models/Exam';
import { LearningResource } from '../../models/LearningResource';
import { Book } from '../../models/Book';
import { scheduleResultInsightGeneration } from '../ai-results/scheduleResultInsight';
import { authenticate, authorize } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { createResponse, createError } from '../../helpers/response';
import {
  EXAM_PASS_PERCENT,
  EXAM_SCORE_MAX,
  deriveExamGrade,
  isExamPassed,
  resolveUnifiedExamScore
} from '../../utils/examScore';
import { buildStudyRecommendation } from '../../services/studyRecommendationService';

const router = Router();

const resultSchema = Joi.object({
  body: Joi.object({
    student: Joi.string().hex().length(24).required(),
    exam: Joi.string().hex().length(24).required(),
    score: Joi.number().min(0).max(EXAM_SCORE_MAX).required(),
    remarks: Joi.string().allow('', null).optional(),
    gradedBy: Joi.string().hex().length(24).optional()
  })
});

const resultQuerySchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().allow('', null).optional(),
    lang: Joi.string().valid('en', 'fa', 'ps').optional()
  })
});

const updateResultSchema = Joi.object({
  body: Joi.object({
    score: Joi.number().min(0).max(EXAM_SCORE_MAX).optional(),
    remarks: Joi.string().allow('', null).optional(),
    lang: Joi.string().valid('en', 'fa', 'ps').optional()
  }).min(1)
});

function compactDate(value: unknown) {
  if (!value) return '';
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function buildAcademicRecommendation(result: any, language = 'en') {
  const score = Number(result?.score || 0);
  const percentage = Math.round(score);
  const subjectName = result?.exam?.subject?.title || 'this subject';
  const band =
    percentage >= 85 ? 'excellent' : percentage >= 60 ? 'good' : 'needs_improvement';

  const copy: Record<string, Record<string, any>> = {
    en: {
      excellent: {
        title: 'Excellent performance.',
        message: 'Excellent performance.',
        resources: ['Advanced materials.'],
        studyPlan: ['Advanced materials.']
      },
      good: {
        title: 'Good progress.',
        message: 'Good progress.',
        resources: ['Practice and revision.'],
        studyPlan: ['Practice and revision.']
      },
      needs_improvement: {
        title: 'Needs improvement.',
        message: 'Needs improvement.',
        resources: ['Basic lessons', 'Practice exercises', 'Related books'],
        studyPlan: ['Basic lessons', 'Practice exercises', 'Related books']
      }
    },
    fa: {
      excellent: {
        title: 'عملکرد عالی.',
        message: 'عملکرد عالی.',
        resources: ['مواد پیشرفته.'],
        studyPlan: ['مواد پیشرفته.']
      },
      good: {
        title: 'پیشرفت خوب.',
        message: 'پیشرفت خوب.',
        resources: ['تمرین و مرور.'],
        studyPlan: ['تمرین و مرور.']
      },
      needs_improvement: {
        title: 'نیازمند بهبود.',
        message: 'نیازمند بهبود.',
        resources: ['درس‌های پایه', 'تمرین‌های عملی', 'کتاب‌های مرتبط'],
        studyPlan: ['درس‌های پایه', 'تمرین‌های عملی', 'کتاب‌های مرتبط']
      }
    },
    ps: {
      excellent: {
        title: 'غوره کارکرد.',
        message: 'غوره کارکرد.',
        resources: ['پرمختللي مواد.'],
        studyPlan: ['پرمختللي مواد.']
      },
      good: {
        title: 'ښه پرمختګ.',
        message: 'ښه پرمختګ.',
        resources: ['تمرین او تکرار.'],
        studyPlan: ['تمرین او تکرار.']
      },
      needs_improvement: {
        title: 'ښه والي ته اړتیا لري.',
        message: 'ښه والي ته اړتیا لري.',
        resources: ['بنسټیز درسونه', 'تمریني تمرینونه', 'اړوند کتابونه'],
        studyPlan: ['بنسټیز درسونه', 'تمریني تمرینونه', 'اړوند کتابونه']
      }
    }
  };

  const selected = (copy[language] ?? copy.en)[band];

  return {
    percentage,
    status: band,
    subjectName,
    title: selected.title,
    message: selected.message,
    resources: selected.resources,
    studyPlan: selected.studyPlan
  };
}

async function buildTargetedLearningResources(result: any, language = 'en') {
  const subjectId = result?.exam?.subject?._id ?? result?.exam?.subject ?? result?.subjectId ?? null;
  const classId = result?.exam?.class?._id ?? result?.exam?.class ?? result?.classId ?? null;
  const branchId = result?.student?.branchId ?? null;

  const localizedLabel: Record<string, Record<string, string>> = {
    en: { video: 'Video', book: 'Book', link: 'Link', document: 'Document' },
    fa: { video: 'ویدیو', book: 'کتاب', link: 'لینک', document: 'سند' },
    ps: { video: 'ویډیو', book: 'کتاب', link: 'لینک', document: 'سند' }
  };
  const labels = localizedLabel[language] ?? localizedLabel.en;

  const resourceFilter: any = { published: true };
  if (subjectId) resourceFilter.subjectId = subjectId;
  if (classId) resourceFilter.$or = [{ classId }, { classId: null }];
  if (branchId) resourceFilter.$and = [{ $or: [{ branchId }, { branchId: null }] }];

  const [learningResources, books] = await Promise.all([
    LearningResource.find(resourceFilter)
      .select('title type url description')
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean<any[]>(),
    Book.find(subjectId ? { available: true, isDeleted: false, title: { $regex: String(result?.exam?.subject?.title || ''), $options: 'i' } } : { available: true, isDeleted: false })
      .select('title author category price')
      .sort({ updatedAt: -1 })
      .limit(3)
      .lean<any[]>()
  ]);

  const mappedResources = learningResources.map((item) => ({
    title: item.title,
    kind: item.type,
    kindLabel: labels[item.type] ?? item.type,
    description: item.description || '',
    url: item.url || ''
  }));

  const mappedBooks = books.map((item) => ({
    title: item.title,
    kind: 'book',
    kindLabel: labels.book,
    description: item.author ? `${item.author}${item.category ? ` • ${item.category}` : ''}` : (item.category || ''),
    url: ''
  }));

  return [...mappedResources, ...mappedBooks].slice(0, 8);
}

async function resolveStudentContext(studentIdentifier: string) {
  const directUser = await User.findOne({ _id: studentIdentifier, role: 'student', isDeleted: false }).lean<any>();
  if (directUser) {
    const studentRecord = directUser.studentId
      ? await Student.findOne({ studentId: directUser.studentId, isDeleted: false }).lean<any>()
      : null;

    return {
      studentUser: directUser,
      studentRecord
    };
  }

  const studentRecord = await Student.findOne({ _id: studentIdentifier, isDeleted: false }).lean<any>();
  if (!studentRecord) {
    return null;
  }

  const linkedUser = await User.findOne({ studentId: studentRecord.studentId, role: 'student', isDeleted: false }).lean<any>();
  if (!linkedUser) {
    return null;
  }

  return {
    studentUser: linkedUser,
    studentRecord
  };
}

async function serializeResult(result: any, language = 'en') {
  const studentName =
    result?.student?.name ??
    [result?.student?.firstName, result?.student?.lastName].filter(Boolean).join(' ').trim();
  const aiRecommendation = buildAcademicRecommendation(result, language);
  const recommendedResources = await buildTargetedLearningResources(result, language);
  const score = Number(result?.score ?? 0);
  const percentage = Number(score.toFixed(2));
  const passed = isExamPassed(score);
  const examId = result?.exam?._id ?? result?.exam ?? null;
  const rank = examId
    ? (await Result.countDocuments({
      exam: examId,
      score: { $gt: score },
      isDeleted: { $ne: true }
    })) + 1
    : null;

  const {
    classroomActivityScore: _a,
    attendanceScore: _b,
    midtermScore: _c,
    finalExamScore: _d,
    scoreComponents: _e,
    ...rest
  } = result ?? {};

  return {
    ...rest,
    id: String(result?._id ?? result?.id ?? ''),
    _id: String(result?._id ?? result?.id ?? ''),
    studentName: studentName || result?.student?.email || '',
    examName: result?.exam?.title ?? '',
    examTitle: result?.exam?.title ?? '',
    examType: result?.exam?.examType ?? '',
    examDate: compactDate(result?.exam?.date),
    date: compactDate(result?.publishedAt ?? result?.createdAt ?? result?.exam?.date),
    subjectName: result?.exam?.subject?.title ?? '',
    className: result?.exam?.class?.className ?? result?.exam?.class?.name ?? '',
    teacherName: result?.exam?.teacherId?.name ?? result?.gradedBy?.name ?? '',
    correctedBy: result?.gradedBy?.name ?? '',
    gradedByName: result?.gradedBy?.name ?? '',
    score,
    totalScore: score,
    maximumScore: EXAM_SCORE_MAX,
    maxScore: EXAM_SCORE_MAX,
    totalMarks: EXAM_SCORE_MAX,
    passingMarks: EXAM_PASS_PERCENT,
    percentage,
    percent: percentage,
    grade: result?.grade ?? deriveExamGrade(score),
    passed,
    status: passed ? 'passed' : 'failed',
    rank,
    aiRecommendation,
    aiSuggestedResources: recommendedResources,
    aiRecommendationTitle: aiRecommendation.title,
    aiRecommendationMessage: aiRecommendation.message
  };
}

router.use(authenticate);

router.post('/', authorize(['super_admin', 'admin', 'branch_manager', 'teacher']), validate(resultSchema), async (req, res, next) => {
  try {
    const [studentContext, exam] = await Promise.all([
      resolveStudentContext(req.body.student),
      Exam.findById(req.body.exam).lean<any>()
    ]);

    const studentUser = studentContext?.studentUser ?? null;
    const studentRecord = studentContext?.studentRecord ?? null;

    if (!studentUser || Array.isArray(studentUser)) {
      return res.status(404).json(createError('Student not found'));
    }

    if (!exam || Array.isArray(exam)) {
      return res.status(404).json(createError('Exam not found'));
    }

    if (
      req.user?.canonicalRole === 'teacher' &&
      exam.teacherId &&
      String(exam.teacherId) !== String(req.user.userId)
    ) {
      return res.status(403).json(createError('Access denied'));
    }

    const studentClassId = studentRecord?.classId ?? studentUser.classId ?? null;
    const studentSubjectId = studentRecord?.subjectId ?? studentUser.subjectId ?? null;

    if (studentClassId && exam.class && String(studentClassId) !== String(exam.class)) {
      return res.status(400).json(createError('Student is not assigned to the selected exam class'));
    }

    if (studentSubjectId && exam.subject && String(studentSubjectId) !== String(exam.subject)) {
      return res.status(400).json(createError('Student is not assigned to the selected exam subject'));
    }

    const resolved = resolveUnifiedExamScore(req.body as Record<string, unknown>);
    if (resolved.score < 0 || resolved.score > EXAM_SCORE_MAX) {
      return res.status(400).json(createError('Score must be between 0 and 100'));
    }

    const grade = deriveExamGrade(resolved.score);
    const result = await Result.create({
      student: studentUser._id,
      exam: exam._id,
      classId: exam.class ?? studentClassId ?? null,
      subjectId: exam.subject ?? studentSubjectId ?? null,
      teacherId: exam.teacherId ?? req.user?.userId ?? null,
      score: resolved.score,
      remarks: req.body.remarks ?? '',
      grade,
      gradedBy: req.body.gradedBy ?? req.user?.userId ?? null
    });

    const populated = await Result.findById(result._id)
      .populate('student', 'name firstName lastName email studentId assignedTeacherId familyId parentProfileId')
      .populate({
        path: 'exam',
        select: 'title date totalMarks examType subject class teacherId',
        populate: [
          { path: 'subject', select: 'title code' },
          { path: 'class', select: 'className name classCode' },
          { path: 'teacherId', select: 'name email' }
        ]
      })
      .populate('gradedBy', 'name email')
      .lean();

    scheduleResultInsightGeneration(String(result._id), req.user?.userId ?? null);

    const language = String(req.query.lang || req.body.lang || 'en');
    res.status(201).json(createResponse(await serializeResult(populated, language), 'Result created'));
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json(createError('Result already exists for this student and exam'));
    }
    next(error);
  }
});

router.get('/', authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']), validate(resultQuerySchema), async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const search = String(req.query.search || '').trim();
    const filter: any = {};

    if (search) {
      filter.score = { $gte: Number(search) || 0 };
    }

    if (req.user?.canonicalRole === 'student') {
      filter.student = req.user.userId;
    }

    if (req.user?.canonicalRole === 'parent' || req.user?.role === 'family_student') {
      const familyUser = await User.findById(req.user.userId).select('familyId parentProfileId').lean<any>();
      const linkedStudents = await Student.find({
        isDeleted: false,
        ...(familyUser?.familyId ? { familyId: familyUser.familyId } : {}),
        ...(!familyUser?.familyId && familyUser?.parentProfileId ? { parentProfileId: familyUser.parentProfileId } : {})
      }).select('studentId').lean<any[]>();
      const children = linkedStudents.length
        ? await User.find({ role: 'student', isDeleted: false, studentId: { $in: linkedStudents.map((item) => item.studentId).filter(Boolean) } }).select('_id').lean()
        : [];
      filter.student = { $in: children.map((child: any) => child._id) };
    }

    if (req.user?.canonicalRole === 'teacher') {
      const linkedStudents = await Student.find({ teacherId: req.user.userId, isDeleted: false }).select('studentId').lean<any[]>();
      const students = linkedStudents.length
        ? await User.find({ role: 'student', isDeleted: false, studentId: { $in: linkedStudents.map((item) => item.studentId).filter(Boolean) } }).select('_id').lean()
        : [];
      filter.student = { $in: students.map((student: any) => student._id) };
    }

    const [results, total] = await Promise.all([
      Result.find(filter)
        .populate('student', 'name firstName lastName email studentId assignedTeacherId familyId parentProfileId')
        .populate({
          path: 'exam',
          select: 'title date totalMarks examType subject class teacherId',
          populate: [
            { path: 'subject', select: 'title code' },
            { path: 'class', select: 'className name classCode' },
            { path: 'teacherId', select: 'name email' }
          ]
        })
        .populate('gradedBy', 'name email')
        .lean()
        .skip((page - 1) * limit)
        .limit(limit),
      Result.countDocuments(filter)
    ]);

    const language = String(req.query.lang || 'en');
    const serializedResults = await Promise.all(results.map((result) => serializeResult(result, language)));
    res.json(createResponse(serializedResults, '', { page, limit, total }));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/ai-recommendation', authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']), async (req, res, next) => {
  try {
    const result = await Result.findById(req.params.id)
      .populate('student', 'name firstName lastName email studentId familyId parentProfileId assignedTeacherId')
      .populate({
        path: 'exam',
        select: 'title date totalMarks examType subject class teacherId',
        populate: [
          { path: 'subject', select: 'title code description' },
          { path: 'class', select: 'className name classCode' },
          { path: 'teacherId', select: 'name email' }
        ]
      })
      .populate('gradedBy', 'name email')
      .lean();

    if (!result) return res.status(404).json(createError('Result not found'));

    if (req.user?.canonicalRole === 'student' && (result as any).student._id.toString() !== req.user.userId) {
      return res.status(403).json(createError('Access denied'));
    }

    if (req.user?.canonicalRole === 'teacher' && (result as any).student.assignedTeacherId?.toString() !== req.user.userId) {
      return res.status(403).json(createError('Access denied'));
    }
    if (req.user?.canonicalRole === 'parent' || req.user?.role === 'family_student') {
      const familyUser = await User.findById(req.user.userId).select('familyId parentProfileId').lean<any>();
      const studentRecord = await Student.findOne({ studentId: (result as any).student?.studentId, isDeleted: false }).select('familyId parentProfileId').lean<any>();
      const resultStudent = (result as any).student ?? {};
      const linkedByFamily = familyUser?.familyId && (
        (studentRecord?.familyId && String(studentRecord.familyId) === String(familyUser.familyId)) ||
        (resultStudent?.familyId && String(resultStudent.familyId) === String(familyUser.familyId))
      );
      const linkedByParentProfile = !familyUser?.familyId && familyUser?.parentProfileId && (
        (studentRecord?.parentProfileId && String(studentRecord.parentProfileId) === String(familyUser.parentProfileId)) ||
        (resultStudent?.parentProfileId && String(resultStudent.parentProfileId) === String(familyUser.parentProfileId))
      );
      if (!linkedByFamily && !linkedByParentProfile) {
        return res.status(403).json(createError('Access denied'));
      }
    }

    const language = String(req.body?.lang || req.query.lang || 'en');
    const recommendation = await buildStudyRecommendation({ result, language });

    res.json(createResponse({
      resultId: req.params.id,
      studentName: (result as any).student?.name ?? [(result as any).student?.firstName, (result as any).student?.lastName].filter(Boolean).join(' '),
      subjectName: recommendation.subjectName,
      score: recommendation.score,
      totalMarks: (result as any).exam?.totalMarks ?? 100,
      reason: recommendation.reason,
      analysis: recommendation.analysis,
      actions: recommendation.actions,
      books: recommendation.books,
      courses: recommendation.courses,
      lessons: recommendation.lessons,
      exercises: recommendation.exercises,
      resources: recommendation.resources,
      studyPlan: recommendation.studyPlan,
      recommendations: recommendation.recommendations,
      recommendation: {
        title: recommendation.title,
        message: recommendation.message,
        reason: recommendation.reason,
        percentage: recommendation.score,
        status: recommendation.performanceBand,
        subjectName: recommendation.subjectName,
        resources: recommendation.resources.map((item) => item.title),
        studyPlan: recommendation.studyPlan,
        actions: recommendation.actions,
        analysis: recommendation.analysis,
        books: recommendation.books,
        courses: recommendation.courses,
        lessons: recommendation.lessons,
        exercises: recommendation.exercises,
        suggestedResources: recommendation.suggestedResources
      }
    }, 'AI recommendation generated successfully'));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']), async (req, res, next) => {
  try {
    const result = await Result.findById(req.params.id)
      .populate('student', 'name firstName lastName email studentId familyId parentProfileId assignedTeacherId')
      .populate({
        path: 'exam',
        select: 'title date totalMarks examType subject class teacherId',
        populate: [
          { path: 'subject', select: 'title code' },
          { path: 'class', select: 'className name classCode' },
          { path: 'teacherId', select: 'name email' }
        ]
      })
      .populate('gradedBy', 'name email')
      .lean();

    if (!result) return res.status(404).json(createError('Result not found'));

    if (req.user?.canonicalRole === 'student' && (result as any).student._id.toString() !== req.user.userId) {
      return res.status(403).json(createError('Access denied'));
    }

    if (req.user?.canonicalRole === 'parent' || req.user?.role === 'family_student') {
      const familyUser = await User.findById(req.user.userId).select('familyId parentProfileId').lean<any>();
      const studentRecord = await Student.findOne({ studentId: (result as any).student?.studentId, isDeleted: false }).select('familyId parentProfileId').lean<any>();
      const resultStudent = (result as any).student ?? {};
      const linkedByFamily = familyUser?.familyId && (
        (studentRecord?.familyId && String(studentRecord.familyId) === String(familyUser.familyId)) ||
        (resultStudent?.familyId && String(resultStudent.familyId) === String(familyUser.familyId))
      );
      const linkedByParentProfile = !familyUser?.familyId && familyUser?.parentProfileId && (
        (studentRecord?.parentProfileId && String(studentRecord.parentProfileId) === String(familyUser.parentProfileId)) ||
        (resultStudent?.parentProfileId && String(resultStudent.parentProfileId) === String(familyUser.parentProfileId))
      );
      if (!linkedByFamily && !linkedByParentProfile) {
        return res.status(403).json(createError('Access denied'));
      }
    }

    if (req.user?.canonicalRole === 'teacher') {
      if ((result as any).student.assignedTeacherId?.toString() !== req.user.userId) {
        return res.status(403).json(createError('Access denied'));
      }
    }

    res.json(createResponse(await serializeResult(result, String(req.query.lang || 'en'))));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', authorize(['super_admin', 'admin', 'branch_manager', 'teacher']), validate(updateResultSchema), async (req, res, next) => {
  try {
    const existing = await Result.findById(req.params.id)
      .populate('student', 'assignedTeacherId')
      .populate('exam', 'totalMarks')
      .lean();

    if (!existing) return res.status(404).json(createError('Result not found'));

    if (req.user?.canonicalRole === 'teacher') {
      const assignedTeacherId = (existing as any).student?.assignedTeacherId;
      if (!assignedTeacherId || String(assignedTeacherId) !== String(req.user?.userId)) {
        return res.status(403).json(createError('Access denied'));
      }
    }

    const mergedBody = {
      score: (existing as any).score,
      ...req.body
    };
    const resolved = resolveUnifiedExamScore(mergedBody as Record<string, unknown>);
    const grade = deriveExamGrade(resolved.score);

    const updated = await Result.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          score: resolved.score,
          grade,
          ...(req.body.remarks !== undefined ? { remarks: req.body.remarks } : {}),
          gradedBy: req.user?.userId ?? null
        },
        $unset: {
          classroomActivityScore: 1,
          attendanceScore: 1,
          midtermScore: 1,
          finalExamScore: 1
        }
      },
      { new: true }
    )
      .populate('student', 'name firstName lastName email studentId assignedTeacherId familyId parentProfileId')
      .populate({
        path: 'exam',
        select: 'title date totalMarks examType subject class teacherId',
        populate: [
          { path: 'subject', select: 'title code' },
          { path: 'class', select: 'className name classCode' },
          { path: 'teacherId', select: 'name email' }
        ]
      })
      .populate('gradedBy', 'name email')
      .lean();

    if (!updated) return res.status(404).json(createError('Result not found'));

    scheduleResultInsightGeneration(String(req.params.id), req.user?.userId ?? null);

    const language = String(req.body.lang || req.query.lang || 'en');
    res.json(createResponse(await serializeResult(updated, language), 'Result updated'));
  } catch (error) {
    next(error);
  }
});

export const resultRouter = router;
