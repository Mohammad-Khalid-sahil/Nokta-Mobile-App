import { ClassModel } from '../models/Class';
import { Course } from '../models/Course';
import { Subject } from '../models/Subject';
import { serializeCourse } from '../modules/courses/courses.service';

function pickLocalized(value: any, language = 'en') {
  if (!value || typeof value !== 'object') return String(value ?? '');
  return value[language] || value.en || value.fa || value.ps || '';
}

function formatScheduleSummary(weeklySchedule: any[] = []) {
  if (!weeklySchedule.length) return '';
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return weeklySchedule
    .slice(0, 3)
    .map((slot) => `${dayNames[Number(slot.dayOfWeek)] ?? slot.dayOfWeek} ${slot.startTime}-${slot.endTime}`)
    .join(' · ');
}

const PUBLIC_CLASS_LIST_FIELDS =
  'className title name shortDescription description fullDescription feeAmount capacity studentCount currency imageUrl thumbnailUrl galleryImages featured registrationOpen active weeklySchedule teacherId subjectId assignedTeachers assignedSubjects level language category';

export function serializePublicClass(klass: any, language = 'en', options: { listMode?: boolean } = {}) {
  const weeklySchedule = Array.isArray(klass.weeklySchedule) ? klass.weeklySchedule : [];
  const firstSlot = weeklySchedule[0];
  const capacity = Number(klass.capacity ?? 0);
  const enrolled = Number(klass.studentCount ?? 0);
  const shortDescription =
    pickLocalized(klass.shortDescription, language) || String(klass.description ?? '').slice(0, 220);

  return {
    _id: String(klass._id),
    catalogType: 'class' as const,
    title: klass.className ?? klass.title ?? klass.name ?? '',
    titleText: klass.className ?? klass.title ?? klass.name ?? '',
    shortDescription,
    descriptionText: options.listMode
      ? shortDescription
      : String(klass.fullDescription ?? klass.description ?? ''),
    category: klass.category ?? klass.department ?? 'general',
    academicCategory: klass.category ?? klass.department ?? 'general',
    classId: String(klass._id),
    subjectId: klass.subjectId?._id ? String(klass.subjectId._id) : klass.subjectId ? String(klass.subjectId) : null,
    teacherId: klass.teacherId?._id ? String(klass.teacherId._id) : klass.teacherId ? String(klass.teacherId) : null,
    teacherName: klass.teacherId?.name ?? klass.teacherName ?? '',
    subjectName: klass.subjectId?.title ?? klass.subjectName ?? (Array.isArray(klass.assignedSubjects) ? klass.assignedSubjects.map((s: any) => s?.title).filter(Boolean).join(', ') : ''),
    schedule: formatScheduleSummary(weeklySchedule),
    startTime: firstSlot?.startTime ?? '',
    endTime: firstSlot?.endTime ?? '',
    duration: firstSlot?.durationMinutes ? `${firstSlot.durationMinutes} min` : '',
    totalDurationWeeks: Number(klass.totalDurationWeeks ?? 0) || null,
    fee: Number(klass.feeAmount ?? 0),
    feeAmount: Number(klass.feeAmount ?? 0),
    currency: klass.currency ?? 'AFN',
    imageUrl: klass.imageUrl || klass.thumbnailUrl || (Array.isArray(klass.galleryImages) ? klass.galleryImages[0] : '') || '',
    galleryImages: options.listMode ? [] : (Array.isArray(klass.galleryImages) ? klass.galleryImages : []),
    level: klass.level ?? '',
    language: klass.language ?? language,
    capacity,
    availableSeats: Math.max(0, capacity - enrolled),
    enrollmentStatus: klass.registrationOpen === false ? 'closed' : 'open',
    registrationOpen: klass.registrationOpen !== false && klass.active !== false,
    status: klass.active === false ? 'inactive' : 'active',
    featured: Boolean(klass.featured)
  };
}

export async function listPublicClasses(query: Record<string, unknown> = {}) {
  const language = String(query.lang || 'en');
  const homeOnly = query.homeOnly === true || query.homeOnly === 'true';
  const limit = homeOnly ? Number(query.limit || 12) : Number(query.limit || 50);
  const filter: Record<string, unknown> = {
    isDeleted: false,
    active: true,
    registrationOpen: { $ne: false }
  };

  const classes = await ClassModel.find(filter)
    .select(PUBLIC_CLASS_LIST_FIELDS)
    .populate('teacherId', 'name')
    .populate('subjectId', 'title code feeAmount')
    .sort({ featured: -1, className: 1 })
    .limit(limit)
    .lean();

  return classes.map((klass) => serializePublicClass(klass, language, { listMode: homeOnly || limit <= 16 }));
}

function formatScheduleDays(weeklySchedule: any[] = []) {
  if (!weeklySchedule.length) return '';
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const unique = Array.from(
    new Set(
      weeklySchedule
        .map((slot) => dayNames[Number(slot.dayOfWeek)] ?? String(slot.dayOfWeek ?? ''))
        .filter(Boolean)
    )
  );
  return unique.join(', ');
}

export async function getPublicClassById(id: string, language = 'en') {
  const klass = await ClassModel.findOne({ _id: id, isDeleted: false, active: true, registrationOpen: { $ne: false } })
    .populate('teacherId', 'name email profileImage phone')
    .populate('subjectId', 'title code feeAmount teacher')
    .populate('assignedTeachers', 'name email profileImage')
    .populate('assignedSubjects', 'title code feeAmount teacher')
    .populate('branchId', 'name title')
    .lean();

  if (!klass) return null;
  const classDoc = klass as any;
  const weeklySchedule = Array.isArray(classDoc.weeklySchedule) ? classDoc.weeklySchedule : [];

  const subjects = await Subject.find({ classId: classDoc._id, activeStatus: true, isDeleted: false })
    .populate('teacher', 'name email profileImage')
    .lean();

  const branch = classDoc.branchId;
  const branchName =
    (branch && typeof branch === 'object'
      ? branch.name || branch.title || ''
      : '') || String(classDoc.branchName ?? '');

  return {
    ...serializePublicClass(classDoc, language),
    room: String(classDoc.room ?? ''),
    startDate: classDoc.startDate ?? null,
    endDate: classDoc.endDate ?? null,
    days: formatScheduleDays(weeklySchedule),
    branchName,
    location: branchName,
    weeklySchedule,
    subjects: subjects.map((subject: any) => ({
      _id: String(subject._id),
      title: subject.title,
      code: subject.code,
      feeAmount: Number(subject.feeAmount ?? 0),
      teacherId: subject.teacher?._id ? String(subject.teacher._id) : null,
      teacherName: subject.teacher?.name ?? ''
    })),
    fullDescription: String(classDoc.fullDescription ?? classDoc.description ?? '')
  };
}

export async function listPublicCourses(query: Record<string, unknown> = {}) {
  const language = String(query.lang || 'en');
  const limit = Number(query.limit || 50);
  const homeOnly = query.homeOnly === true || query.homeOnly === 'true';
  const filter: Record<string, unknown> = {
    isDeleted: false,
    status: 'active',
    visibility: 'public',
    enrollmentStatus: 'open'
  };

  if (homeOnly) {
    delete filter.enrollmentStatus;
    filter.$or = [{ enrollmentStatus: 'open' }, { registrationOpen: true }];
  }

  const courses = await Course.find(filter)
    .populate('teacher', 'name email profileImage')
    .populate('instructor', 'name email profileImage')
    .populate('subjects', 'title code classId feeAmount')
    .sort({ featured: -1, createdAt: -1 })
    .limit(homeOnly ? Math.min(limit, 12) : limit)
    .lean();

  return courses.map((course) => {
    const serialized = serializeCourse(course, language);
    const capacity = Number(course.capacity ?? 0);
    const enrolled = Number(course.enrolledCount ?? 0);
    const gallery = Array.isArray(course.galleryImages) ? course.galleryImages : [];
    const imageUrl =
      course.imageUrl ||
      course.thumbnailUrl ||
      (gallery.length > 0 ? gallery[0] : '') ||
      '';
    return {
      ...serialized,
      catalogType: 'course' as const,
      imageUrl,
      shortDescription: pickLocalized(course.shortDescription, language) || String(serialized.descriptionText ?? '').slice(0, 220),
      classId: course.linkedClassId ? String(course.linkedClassId) : null,
      currency: course.currency ?? 'AFN',
      availableSeats: Math.max(0, capacity - enrolled),
      registrationOpen: course.registrationOpen !== false && course.enrollmentStatus !== 'closed',
      galleryImages: homeOnly ? [] : gallery
    };
  });
}

export async function getPublicCourseById(id: string, language = 'en') {
  const course = await Course.findOne({ _id: id, isDeleted: false, status: 'active', visibility: 'public' })
    .populate('teacher', 'name email profileImage phone')
    .populate('instructor', 'name email profileImage phone')
    .populate('subjects', 'title code classId feeAmount teacher')
    .lean();

  if (!course) return null;
  const courseDoc = course as any;
  const serialized = serializeCourse(courseDoc, language);
  return {
    ...serialized,
    catalogType: 'course' as const,
    shortDescription: pickLocalized(courseDoc.shortDescription, language),
    fullDescription: pickLocalized(courseDoc.description, language),
    requirementsText: pickLocalized(courseDoc.requirements, language),
    learningOutcomesText: pickLocalized(courseDoc.learningOutcomes, language),
    classId: courseDoc.linkedClassId ? String(courseDoc.linkedClassId) : null,
    galleryImages: Array.isArray(courseDoc.galleryImages) ? courseDoc.galleryImages : [],
    availableSeats: Math.max(0, Number(courseDoc.capacity ?? 0) - Number(courseDoc.enrolledCount ?? 0)),
    registrationOpen: courseDoc.registrationOpen !== false && courseDoc.enrollmentStatus !== 'closed'
  };
}
