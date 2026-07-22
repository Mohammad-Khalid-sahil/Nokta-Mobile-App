import { Book } from '../models/Book';
import { Course } from '../models/Course';
import { LearningResource } from '../models/LearningResource';
import { Result } from '../models/Result';
import {
  classifyPerformanceBand,
  type PerformanceBand
} from './aiInsightService';

export type StudyActionType = 'review' | 'practice' | 'watch' | 'read';
export type StudyResourceKind = 'book' | 'course' | 'lesson' | 'exercise' | 'video' | 'document' | 'link';

export type StudyRecommendationAction = {
  type: StudyActionType;
  label: string;
  title: string;
  description: string;
  icon: string;
};

export type StudyResourceItem = {
  id: string;
  kind: StudyResourceKind;
  kindLabel: string;
  title: string;
  description: string;
  url: string;
  actionLabel: string;
};

export type StudyRecommendationPayload = {
  title: string;
  message: string;
  reason: string;
  score: number;
  subjectName: string;
  performanceBand: PerformanceBand;
  analysis: {
    failedFocus: string;
    weakTopics: string[];
    lowScoreSubjects: string[];
  };
  actions: StudyRecommendationAction[];
  resources: StudyResourceItem[];
  books: StudyResourceItem[];
  courses: StudyResourceItem[];
  lessons: StudyResourceItem[];
  exercises: StudyResourceItem[];
  studyPlan: string[];
  recommendations: string[];
  suggestedResources: StudyResourceItem[];
  hasInternalResources: boolean;
};

type SubjectFocus = {
  review: string;
  practice: string;
  watch: string;
  read: string;
  advancedReview: string;
  advancedPractice: string;
  advancedWatch: string;
  advancedRead: string;
};

type LocalizedCopy = {
  reasonLow: (score: number, subject: string) => string;
  reasonGood: (score: number, subject: string) => string;
  reasonHigh: (score: number, subject: string) => string;
  failedLow: (missed: number, subject: string) => string;
  failedGood: (subject: string) => string;
  failedHigh: (subject: string) => string;
  review: string;
  practice: string;
  watch: string;
  read: string;
  open: string;
  book: string;
  course: string;
  lesson: string;
  exercise: string;
  video: string;
  document: string;
  link: string;
  titleLow: string;
  titleGood: string;
  titleHigh: string;
};

function pickLocalized(value: unknown, language = 'en'): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return String(value ?? '').trim();
  }
  const record = value as Record<string, unknown>;
  return String(record[language] ?? record.en ?? record.fa ?? record.ps ?? '').trim();
}

function normalizeSubjectKey(subjectName: string): string {
  return subjectName.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function subjectFocus(subjectName: string): SubjectFocus {
  const key = normalizeSubjectKey(subjectName);
  const subject = subjectName.trim() || 'this subject';

  if (key.includes('math') || key.includes('algebra') || key.includes('حساب') || key.includes('ریاضی')) {
    return {
      review: 'Algebra chapter 2',
      practice: '20 equations',
      watch: 'Basic Algebra course',
      read: `${subject} fundamentals workbook`,
      advancedReview: 'Advanced Algebra applications',
      advancedPractice: 'Challenge problem set (15 items)',
      advancedWatch: 'Advanced Mathematics course',
      advancedRead: `Advanced ${subject} reference`
    };
  }

  if (key.includes('physics') || key.includes('فزیک') || key.includes('فیزیک')) {
    return {
      review: 'Mechanics chapter 1',
      practice: '15 force and motion problems',
      watch: 'Basic Physics course',
      read: `${subject} basics handbook`,
      advancedReview: 'Advanced mechanics topics',
      advancedPractice: 'Challenge lab problem set',
      advancedWatch: 'Advanced Physics course',
      advancedRead: `Advanced ${subject} reference`
    };
  }

  if (key.includes('english') || key.includes('انگلیسی') || key.includes('انګلیسي')) {
    return {
      review: 'Grammar unit 2',
      practice: '20 vocabulary and sentence drills',
      watch: 'Basic English course',
      read: `${subject} reading pack`,
      advancedReview: 'Advanced writing workshop chapter',
      advancedPractice: 'Essay practice set (5 prompts)',
      advancedWatch: 'Advanced English course',
      advancedRead: `Advanced ${subject} reader`
    };
  }

  if (key.includes('computer') || key.includes('ict') || key.includes('کامپیوتر') || key.includes('کمپیوتر')) {
    return {
      review: 'Programming basics chapter 2',
      practice: '15 coding exercises',
      watch: 'Basic Computer Science course',
      read: `${subject} starter guide`,
      advancedReview: 'Data structures chapter',
      advancedPractice: 'Challenge coding set',
      advancedWatch: 'Advanced Computer Science course',
      advancedRead: `Advanced ${subject} reference`
    };
  }

  return {
    review: `Core chapter of ${subject}`,
    practice: `15 practice exercises in ${subject}`,
    watch: `Basic ${subject} course`,
    read: `Related ${subject} book`,
    advancedReview: `Advanced chapter of ${subject}`,
    advancedPractice: `Challenge exercises in ${subject}`,
    advancedWatch: `Advanced ${subject} course`,
    advancedRead: `Advanced ${subject} reference`
  };
}

function copyFor(language: string): LocalizedCopy {
  if (language === 'fa') {
    return {
      reasonLow: (score, subject) =>
        `نمره ${score} در ${subject} — نیاز به تقویت مباحث ضعیف.`,
      reasonGood: (score, subject) =>
        `نمره ${score} در ${subject} — تمرین هدفمند و مرور توصیه می‌شود.`,
      reasonHigh: (score, subject) =>
        `نمره ${score} در ${subject} — آماده محتوای پیشرفته.`,
      failedLow: (missed, subject) =>
        `حدود ${missed}% محتوای آزمون ${subject} نیاز به بازبینی دارد.`,
      failedGood: (subject) => `بخش‌هایی از ${subject} هنوز نیاز به تمرین دارند.`,
      failedHigh: (subject) => `آمادگی بالا در ${subject}؛ روی محتوای پیشرفته تمرکز کنید.`,
      review: 'مرور',
      practice: 'تمرین',
      watch: 'تماشا',
      read: 'مطالعه',
      open: 'باز کردن',
      book: 'کتاب',
      course: 'دوره',
      lesson: 'درس',
      exercise: 'تمرین',
      video: 'ویدیو',
      document: 'سند',
      link: 'لینک',
      titleLow: 'نیازمند بهبود.',
      titleGood: 'پیشرفت خوب.',
      titleHigh: 'عملکرد عالی.'
    };
  }

  if (language === 'ps') {
    return {
      reasonLow: (score, subject) =>
        `نمره ${score} په ${subject} کې — ضعیف موضوعات باید پیاوړي شي.`,
      reasonGood: (score, subject) =>
        `نمره ${score} په ${subject} کې — هدفمند تمرین او بیاکتنه سپارښتنه کېږي.`,
      reasonHigh: (score, subject) =>
        `نمره ${score} په ${subject} کې — د پرمختللي موادو لپاره چمتو.`,
      failedLow: (missed, subject) =>
        `شاوخوا ${missed}% د ${subject} ازموینې محتوا بیاکتنې ته اړتیا لري.`,
      failedGood: (subject) => `د ${subject} ځینې برخې لا تمرین ته اړتیا لري.`,
      failedHigh: (subject) => `په ${subject} کې لوړ چمتووالی؛ پر پرمختللي محتوا تمرکز وکړئ.`,
      review: 'بیاکتنه',
      practice: 'تمرین',
      watch: 'کتل',
      read: 'لوستل',
      open: 'پرانیستل',
      book: 'کتاب',
      course: 'کورس',
      lesson: 'درس',
      exercise: 'تمرین',
      video: 'ویډیو',
      document: 'سند',
      link: 'لینک',
      titleLow: 'ښه والي ته اړتیا لري.',
      titleGood: 'ښه پرمختګ.',
      titleHigh: 'غوره کارکرد.'
    };
  }

  return {
    reasonLow: (score, subject) =>
      `Score ${score} in ${subject} — strengthen weak topics.`,
    reasonGood: (score, subject) =>
      `Score ${score} in ${subject} — targeted practice and revision recommended.`,
    reasonHigh: (score, subject) =>
      `Score ${score} in ${subject} — ready for advanced content.`,
    failedLow: (missed, subject) =>
      `About ${missed}% of ${subject} exam content needs review.`,
    failedGood: (subject) => `Some ${subject} areas still need practice.`,
    failedHigh: (subject) => `Strong readiness in ${subject}; focus on advanced content.`,
    review: 'Review',
    practice: 'Practice',
    watch: 'Watch',
    read: 'Read',
    open: 'Open',
    book: 'Book',
    course: 'Course',
    lesson: 'Lesson',
    exercise: 'Exercise',
    video: 'Video',
    document: 'Document',
    link: 'Link',
    titleLow: 'Needs improvement.',
    titleGood: 'Good progress.',
    titleHigh: 'Excellent performance.'
  };
}

function parseWeakTopics(remarks: unknown, provided: string[] = []): string[] {
  const fromRemarks = String(remarks ?? '')
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 2);
  return Array.from(new Set([...provided, ...fromRemarks])).slice(0, 6);
}

function kindLabel(kind: StudyResourceKind, copy: LocalizedCopy): string {
  switch (kind) {
    case 'book':
      return copy.book;
    case 'course':
      return copy.course;
    case 'lesson':
      return copy.lesson;
    case 'exercise':
      return copy.exercise;
    case 'video':
      return copy.video;
    case 'document':
      return copy.document;
    case 'link':
      return copy.link;
    default:
      return copy.lesson;
  }
}

function mapLearningKind(type: unknown): StudyResourceKind {
  const value = String(type ?? '').toLowerCase();
  if (value === 'book') return 'book';
  if (value === 'video') return 'video';
  if (value === 'assignment') return 'exercise';
  if (value === 'link') return 'link';
  return 'document';
}

/**
 * Pure study-plan builder from score, subject, and weak topics.
 * High scores get advanced content; low scores get foundational Review/Practice/Watch.
 */
export function buildStudyPlanFromAnalysis(input: {
  score: number;
  subjectName: string;
  weakTopics?: string[];
  lowScoreSubjects?: string[];
  language?: string;
}): Omit<StudyRecommendationPayload, 'hasInternalResources'> {
  const language = input.language || 'en';
  const copy = copyFor(language);
  const score = Math.max(0, Math.min(100, Number(input.score ?? 0)));
  const subjectName = String(input.subjectName ?? '').trim() || 'this subject';
  const band = classifyPerformanceBand(score);
  const focus = subjectFocus(subjectName);
  const weakTopics = (input.weakTopics ?? []).map((item) => String(item).trim()).filter(Boolean);
  const lowScoreSubjects = (input.lowScoreSubjects ?? [])
    .map((item) => String(item).trim())
    .filter(Boolean);
  const missed = Math.max(0, 100 - Math.round(score));

  const primaryTopic = weakTopics[0] || (band === 'excellent' ? focus.advancedReview : focus.review);
  const practiceTitle = band === 'excellent' ? focus.advancedPractice : focus.practice;
  const watchTitle = band === 'excellent' ? focus.advancedWatch : focus.watch;
  const readTitle = band === 'excellent' ? focus.advancedRead : focus.read;

  const reason =
    band === 'excellent'
      ? copy.reasonHigh(score, subjectName)
      : band === 'good'
        ? copy.reasonGood(score, subjectName)
        : copy.reasonLow(score, subjectName);

  const failedFocus =
    band === 'excellent'
      ? copy.failedHigh(subjectName)
      : band === 'good'
        ? copy.failedGood(subjectName)
        : copy.failedLow(missed, subjectName);

  const title =
    band === 'excellent' ? copy.titleHigh : band === 'good' ? copy.titleGood : copy.titleLow;

  const actions: StudyRecommendationAction[] = [
    {
      type: 'review',
      label: copy.review,
      title: primaryTopic,
      description: `${copy.review}: ${primaryTopic}`,
      icon: 'menu_book'
    },
    {
      type: 'practice',
      label: copy.practice,
      title: practiceTitle,
      description: `${copy.practice}: ${practiceTitle}`,
      icon: 'fitness_center'
    },
    {
      type: 'watch',
      label: copy.watch,
      title: watchTitle,
      description: `${copy.watch}: ${watchTitle}`,
      icon: 'play_circle'
    },
    {
      type: 'read',
      label: copy.read,
      title: readTitle,
      description: `${copy.read}: ${readTitle}`,
      icon: 'auto_stories'
    }
  ];

  const studyPlan = actions.map((action) => `${action.label}: ${action.title}`);
  const recommendations = [...studyPlan];

  if (weakTopics.length) {
    recommendations.push(...weakTopics.slice(0, 3).map((topic) => `${copy.review}: ${topic}`));
  }
  if (lowScoreSubjects.length) {
    recommendations.push(
      ...lowScoreSubjects.slice(0, 2).map((subject) => `${copy.practice}: ${subject}`)
    );
  }

  return {
    title,
    message: title,
    reason,
    score,
    subjectName,
    performanceBand: band,
    analysis: {
      failedFocus,
      weakTopics: weakTopics.length
        ? weakTopics
        : band === 'needs_improvement'
          ? [focus.review, `${subjectName} fundamentals`]
          : band === 'good'
            ? [`${subjectName} revision topics`]
            : [`Advanced ${subjectName}`],
      lowScoreSubjects
    },
    actions,
    resources: [],
    books: [],
    courses: [],
    lessons: [],
    exercises: [],
    studyPlan,
    recommendations: Array.from(new Set(recommendations)).slice(0, 8),
    suggestedResources: []
  };
}

async function loadCatalogResources(params: {
  subjectId: unknown;
  classId: unknown;
  branchId: unknown;
  subjectName: string;
  language: string;
  copy: LocalizedCopy;
}): Promise<{
  books: StudyResourceItem[];
  courses: StudyResourceItem[];
  lessons: StudyResourceItem[];
  exercises: StudyResourceItem[];
}> {
  const { subjectId, classId, branchId, subjectName, language, copy } = params;
  const resourceFilter: Record<string, unknown> = { published: true, isDeleted: { $ne: true } };
  if (subjectId) resourceFilter.subjectId = subjectId;
  if (classId) resourceFilter.$or = [{ classId }, { classId: null }];
  if (branchId) {
    resourceFilter.$and = [{ $or: [{ branchId }, { branchId: null }] }];
  }

  const bookFilter: Record<string, unknown> = { available: true, isDeleted: false };
  if (subjectName) {
    bookFilter.$or = [
      { title: { $regex: subjectName, $options: 'i' } },
      { category: { $regex: subjectName, $options: 'i' } },
      { subject: { $regex: subjectName, $options: 'i' } }
    ];
  }

  const courseFilter: Record<string, unknown> = {
    isDeleted: false
  };
  if (subjectId) courseFilter.subjects = subjectId;

  const [learningResources, books, courses] = await Promise.all([
    LearningResource.find(resourceFilter)
      .select('title type url description')
      .sort({ updatedAt: -1 })
      .limit(8)
      .lean<any[]>(),
    Book.find(bookFilter)
      .select('title author category description fileUrl coverUrl')
      .sort({ updatedAt: -1 })
      .limit(4)
      .lean<any[]>(),
    Course.find(courseFilter)
      .select('title shortDescription description slug imageUrl')
      .sort({ updatedAt: -1 })
      .limit(4)
      .lean<any[]>()
  ]);

  const mappedBooks: StudyResourceItem[] = books.map((item) => ({
    id: String(item._id ?? ''),
    kind: 'book',
    kindLabel: copy.book,
    title: String(item.title ?? ''),
    description: item.author
      ? `${item.author}${item.category ? ` • ${item.category}` : ''}`
      : String(item.category ?? ''),
    url: String(item.fileUrl || item.coverUrl || ''),
    actionLabel: copy.open
  }));

  const mappedCourses: StudyResourceItem[] = courses.map((item) => ({
    id: String(item._id ?? ''),
    kind: 'course',
    kindLabel: copy.course,
    title: pickLocalized(item.title, language) || String(item.slug ?? ''),
    description:
      pickLocalized(item.shortDescription, language) || pickLocalized(item.description, language),
    url: '',
    actionLabel: copy.open
  }));

  const lessons: StudyResourceItem[] = [];
  const exercises: StudyResourceItem[] = [];
  const videosAsCourses: StudyResourceItem[] = [];

  for (const item of learningResources) {
    const kind = mapLearningKind(item.type);
    const resource: StudyResourceItem = {
      id: String(item._id ?? ''),
      kind: kind === 'video' ? 'video' : kind === 'exercise' ? 'exercise' : kind === 'book' ? 'book' : 'lesson',
      kindLabel: kindLabel(
        kind === 'video' ? 'video' : kind === 'exercise' ? 'exercise' : kind === 'book' ? 'book' : 'lesson',
        copy
      ),
      title: String(item.title ?? ''),
      description: String(item.description ?? ''),
      url: String(item.url ?? ''),
      actionLabel: copy.open
    };

    if (kind === 'book') mappedBooks.push(resource);
    else if (kind === 'exercise') exercises.push(resource);
    else if (kind === 'video') videosAsCourses.push(resource);
    else lessons.push(resource);
  }

  return {
    books: mappedBooks.slice(0, 4),
    courses: [...mappedCourses, ...videosAsCourses].slice(0, 4),
    lessons: lessons.slice(0, 4),
    exercises: exercises.slice(0, 4)
  };
}

async function loadLowScoreSubjects(studentId: unknown, currentResultId: unknown): Promise<string[]> {
  if (!studentId) return [];

  const previous = await Result.find({
    student: studentId,
    _id: { $ne: currentResultId },
    isDeleted: false,
    score: { $lt: 60 }
  })
    .sort({ createdAt: -1 })
    .limit(8)
    .populate({ path: 'exam', select: 'subject', populate: { path: 'subject', select: 'title' } })
    .lean<any[]>();

  const names = previous
    .map((item) => String(item?.exam?.subject?.title ?? item?.subjectName ?? '').trim())
    .filter(Boolean);

  return Array.from(new Set(names)).slice(0, 4);
}

/**
 * Full intelligent study recommendation for a result document.
 * Analyzes score, weak topics, low-score subjects, and catalog resources.
 */
export async function buildStudyRecommendation(params: {
  result: any;
  language?: string;
}): Promise<StudyRecommendationPayload> {
  const language = params.language || 'en';
  const copy = copyFor(language);
  const result = params.result;
  const score = Number(result?.score ?? 0);
  const subjectName = String(result?.exam?.subject?.title ?? result?.subjectName ?? 'this subject');
  const subjectId = result?.exam?.subject?._id ?? result?.exam?.subject ?? result?.subjectId ?? null;
  const classId = result?.exam?.class?._id ?? result?.exam?.class ?? result?.classId ?? null;
  const branchId = result?.student?.branchId ?? result?.exam?.branchId ?? null;
  const studentId = result?.student?._id ?? result?.student ?? null;

  const weakTopics = parseWeakTopics(result?.remarks);
  const lowScoreSubjects = await loadLowScoreSubjects(studentId, result?._id);

  const base = buildStudyPlanFromAnalysis({
    score,
    subjectName,
    weakTopics,
    lowScoreSubjects,
    language
  });

  const catalog = await loadCatalogResources({
    subjectId,
    classId,
    branchId,
    subjectName,
    language,
    copy
  });

  const resources = [
    ...catalog.books,
    ...catalog.courses,
    ...catalog.lessons,
    ...catalog.exercises
  ].slice(0, 12);

  return {
    ...base,
    books: catalog.books,
    courses: catalog.courses,
    lessons: catalog.lessons,
    exercises: catalog.exercises,
    resources,
    suggestedResources: resources,
    hasInternalResources: resources.length > 0
  };
}
