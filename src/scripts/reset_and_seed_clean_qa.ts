import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { connectDatabase } from '../database/connect';
import { config } from '../config/env';
import { hashPassword } from '../utils/password';
import { Branch } from '../models/Branch';
import { User } from '../models/User';
import { Family } from '../models/Family';
import { ParentProfile } from '../models/Parent';
import { FamilyLink } from '../models/FamilyLink';
import { Student } from '../models/Student';
import { ClassModel } from '../models/Class';
import { Subject } from '../models/Subject';
import { Course } from '../models/Course';
import { Timetable } from '../models/Timetable';
import { Attendance } from '../models/Attendance';
import { Exam } from '../models/Exam';
import { Result } from '../models/Result';
import { Notification } from '../models/Notification';
import { Message } from '../models/Message';
import { StudentMessage } from '../models/StudentMessage';
import { Enrollment } from '../models/Enrollment';
import { Payment } from '../models/Payment';
import { FinanceEntry } from '../models/FinanceEntry';
import { Expense } from '../models/Expense';
import { SalaryTransaction } from '../models/SalaryTransaction';
import { SessionToken } from '../models/SessionToken';
import { AuditLog } from '../models/AuditLog';
import { Book } from '../models/Book';

type SeedUser = {
  role: string;
  name: string;
  email: string;
  password: string;
  visibility: string;
};

function assertDevelopmentDatabaseSafety() {
  const uri = String(config.mongoUri || '');
  const env = String(config.environment || '').toLowerCase();
  const isLocalMongo = /mongodb(\+srv)?:\/\/(localhost|127\.0\.0\.1)/i.test(uri);
  const isDevLikeDb = /(dev|test|local|nokta_academy)/i.test(uri);
  const isProduction = env === 'production';

  if (isProduction || !isLocalMongo || !isDevLikeDb) {
    throw new Error(`Safety check failed. Refusing destructive reset for uri="${uri}" env="${env}".`);
  }
}

function minutesToHHMM(totalMinutes: number) {
  const safe = Math.max(0, Math.min(1439, totalMinutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function buildTodayLessonWindows() {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const dayOfWeek = now.getDay();

  let activeStart = Math.max(0, nowMin - 10);
  let activeEnd = Math.min(1439, activeStart + 30);
  if (nowMin >= activeEnd) {
    activeStart = Math.max(0, nowMin - 20);
    activeEnd = Math.min(1439, nowMin + 5);
  }

  let upcomingStart = Math.min(1430, nowMin + 40);
  if (upcomingStart <= nowMin) upcomingStart = Math.min(1430, nowMin + 1);
  const upcomingEnd = Math.min(1439, upcomingStart + 30);

  const closedEnd = Math.max(1, nowMin - 20);
  const closedStart = Math.max(0, closedEnd - 30);

  return {
    dayOfWeek,
    active: { startTime: minutesToHHMM(activeStart), endTime: minutesToHHMM(activeEnd) },
    upcoming: { startTime: minutesToHHMM(upcomingStart), endTime: minutesToHHMM(upcomingEnd) },
    closed: { startTime: minutesToHHMM(closedStart), endTime: minutesToHHMM(closedEnd) }
  };
}

async function clearCollections() {
  await Promise.all([
    Attendance.deleteMany({}),
    Result.deleteMany({}),
    Exam.deleteMany({}),
    Timetable.deleteMany({}),
    Enrollment.deleteMany({}),
    Payment.deleteMany({}),
    FinanceEntry.deleteMany({}),
    Expense.deleteMany({}),
    SalaryTransaction.deleteMany({}),
    Message.deleteMany({}),
    StudentMessage.deleteMany({}),
    Notification.deleteMany({}),
    Course.deleteMany({}),
    Subject.deleteMany({}),
    ClassModel.deleteMany({}),
    Student.deleteMany({}),
    FamilyLink.deleteMany({}),
    ParentProfile.deleteMany({}),
    Family.deleteMany({}),
    SessionToken.deleteMany({}),
    User.deleteMany({}),
    Branch.deleteMany({}),
    Book.deleteMany({}),
    AuditLog.deleteMany({})
  ]);
}

async function seedCleanDataset() {
  const credentials: SeedUser[] = [
    {
      role: 'super_admin',
      name: 'Super Admin QA',
      email: 'superadmin.qa@nokta.local',
      password: 'SuperAdmin@123',
      visibility: 'Full system access and all modules.'
    },
    {
      role: 'admin',
      name: 'Admin QA',
      email: 'admin.qa@nokta.local',
      password: 'Admin@12345',
      visibility: 'Management modules without super-admin-only controls.'
    },
    {
      role: 'teacher',
      name: 'Teacher QA',
      email: 'teacher.qa@nokta.local',
      password: 'Teacher@12345',
      visibility: 'Only assigned class, subject, students, exams and results.'
    },
    {
      role: 'student',
      name: 'Student QA',
      email: 'student.qa@nokta.local',
      password: 'Student@12345',
      visibility: 'Only own profile, class, subject, timetable, attendance, exam and result.'
    },
    {
      role: 'parent',
      name: 'Parent QA',
      email: 'parent.qa@nokta.local',
      password: 'Parent@12345',
      visibility: 'Only linked student profile, timetable, attendance and results.'
    }
  ];

  const branch = await Branch.create({
    name: 'نمایندگی تست',
    code: 'QA-BR',
    city: 'Kabul',
    address: 'QA Branch Street',
    phone: '0700000000',
    email: 'branch.qa@nokta.local',
    active: true
  });

  const superAdmin = await User.create({
    name: credentials[0].name,
    email: credentials[0].email,
    password: await hashPassword(credentials[0].password),
    role: 'super_admin',
    branchId: branch._id,
    mustChangePassword: false
  });

  const admin = await User.create({
    name: credentials[1].name,
    email: credentials[1].email,
    password: await hashPassword(credentials[1].password),
    role: 'admin',
    branchId: branch._id,
    mustChangePassword: false
  });

  const teacher = await User.create({
    name: credentials[2].name,
    email: credentials[2].email,
    password: await hashPassword(credentials[2].password),
    role: 'teacher',
    teacherId: 'TCHR-QA-001',
    branchId: branch._id,
    phone: '0700000001',
    whatsapp: '0700000001',
    salaryType: 'fixed',
    fixedSalary: 15000,
    mustChangePassword: false
  });

  const klass = await ClassModel.create({
    branchId: branch._id,
    className: 'صنف تست QA',
    classCode: 'QA-CLASS-001',
    name: 'صنف تست QA',
    room: 'R-101',
    capacity: 30,
    feeAmount: 1500,
    active: true,
    registrationOpen: true,
    assignedTeachers: [teacher._id]
  });

  const subject = await Subject.create({
    branchId: branch._id,
    title: 'مضمون تست QA',
    code: 'QA-SUB-001',
    classId: klass._id,
    classIds: [klass._id],
    teacher: teacher._id,
    feeAmount: 500,
    activeStatus: true,
    description: 'Subject for final QA verification'
  });

  await ClassModel.updateOne(
    { _id: klass._id },
    {
      $set: {
        subjectId: subject._id,
        teacherId: teacher._id,
        assignedSubjects: [subject._id],
        title: 'صنف تست QA',
        shortDescription: 'Class for final QA',
        description: 'Class for final QA',
        fullDescription: 'Class for final QA'
      }
    }
  );

  await User.updateOne(
    { _id: teacher._id },
    {
      $set: {
        assignedSubjects: [subject._id],
        assignedClasses: [klass._id]
      }
    }
  );

  const family = await Family.create({
    guardianName: credentials[4].name,
    guardianEmail: credentials[4].email,
    guardianPhone: '0700000003',
    students: []
  });

  const parentUser = await User.create({
    name: credentials[4].name,
    email: credentials[4].email,
    password: await hashPassword(credentials[4].password),
    role: 'parent',
    branchId: branch._id,
    familyId: family._id,
    phone: '0700000003',
    mustChangePassword: false
  });

  const parentProfile = await ParentProfile.create({
    userId: parentUser._id,
    branchId: branch._id,
    guardianName: credentials[4].name,
    guardianPhone: '0700000003',
    guardianEmail: credentials[4].email,
    relationType: 'guardian',
    linkedStudentIds: []
  });

  const studentCode = 'STD-QA-001';
  const student = await Student.create({
    rollNo: 'QA-ROLL-001',
    studentId: studentCode,
    branchId: branch._id,
    firstName: 'Ahmad',
    lastName: 'QA',
    fatherName: 'Karim QA',
    familyPhone: '0700000003',
    whatsapp: '0700000002',
    familyEmail: credentials[4].email,
    loginEmail: credentials[3].email,
    gender: 'male',
    classId: klass._id,
    subjectId: subject._id,
    teacherId: teacher._id,
    feeAmount: 2000,
    paidAmount: 2000,
    status: 'active',
    accountStatus: 'active',
    familyId: family._id,
    parentProfileId: parentProfile._id
  });

  const studentUser = await User.create({
    name: credentials[3].name,
    email: credentials[3].email,
    password: await hashPassword(credentials[3].password),
    role: 'student',
    studentId: studentCode,
    branchId: branch._id,
    familyId: family._id,
    parentProfileId: parentProfile._id,
    classId: klass._id,
    subjectId: subject._id,
    assignedTeacherId: teacher._id,
    phone: '0700000002',
    mustChangePassword: false
  });

  await Family.updateOne({ _id: family._id }, { $set: { students: [student._id] } });
  await ParentProfile.updateOne({ _id: parentProfile._id }, { $set: { linkedStudentIds: [student._id] } });
  await User.updateOne({ _id: parentUser._id }, { $set: { parentProfileId: parentProfile._id } });

  await FamilyLink.create({
    parentId: parentProfile._id,
    studentId: student._id,
    relationType: 'guardian',
    isPrimary: true
  });

  await Enrollment.create({
    studentId: student._id,
    classId: klass._id,
    subjectId: subject._id,
    teacherId: teacher._id,
    branchId: branch._id,
    academicYear: '1405',
    status: 'active',
    enrolledAt: new Date()
  });

  const windows = buildTodayLessonWindows();
  const [activeTimetable, upcomingTimetable, closedTimetable] = await Promise.all([
    Timetable.create({
      branchId: branch._id,
      classId: klass._id,
      subjectId: subject._id,
      teacherId: teacher._id,
      dayOfWeek: windows.dayOfWeek,
      startTime: windows.active.startTime,
      endTime: windows.active.endTime,
      room: 'R-101',
      academicYear: '1405',
      semester: 'semester_1',
      isActive: true,
      active: true
    }),
    Timetable.create({
      branchId: branch._id,
      classId: klass._id,
      subjectId: subject._id,
      teacherId: teacher._id,
      dayOfWeek: windows.dayOfWeek,
      startTime: windows.upcoming.startTime,
      endTime: windows.upcoming.endTime,
      room: 'R-101',
      academicYear: '1405',
      semester: 'semester_1',
      isActive: true,
      active: true
    }),
    Timetable.create({
      branchId: branch._id,
      classId: klass._id,
      subjectId: subject._id,
      teacherId: teacher._id,
      dayOfWeek: windows.dayOfWeek,
      startTime: windows.closed.startTime,
      endTime: windows.closed.endTime,
      room: 'R-101',
      academicYear: '1405',
      semester: 'semester_1',
      isActive: true,
      active: true
    })
  ]);

  const exam = await Exam.create({
    branchId: branch._id,
    title: 'QA Final Exam',
    subject: subject._id,
    class: klass._id,
    teacherId: teacher._id,
    date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    totalMarks: 100,
    passingMarks: 40,
    examType: 'book',
    examCode: 'QA-EXAM-001',
    status: 'published',
    publishedAt: new Date()
  });

  await Result.create({
    student: studentUser._id,
    exam: exam._id,
    classId: klass._id,
    subjectId: subject._id,
    teacherId: teacher._id,
    score: 88,
    grade: 'B',
    remarks: 'Good progress',
    gradedBy: teacher._id,
    publishedAt: new Date()
  });

  await Course.create({
    branchId: branch._id,
    title: { en: 'QA Course', fa: 'کورس QA', ps: 'QA کورس' },
    shortDescription: { en: 'Course for QA', fa: 'کورس برای QA', ps: 'د QA لپاره کورس' },
    slug: 'qa-course',
    description: { en: 'Complete QA course', fa: 'کورس کامل QA', ps: 'بشپړ QA کورس' },
    linkedClassId: klass._id,
    instructor: teacher._id,
    teacher: teacher._id,
    subjects: [subject._id],
    duration: '3 months',
    fee: 2000,
    registrationOpen: true,
    status: 'active',
    visibility: 'public',
    featured: true,
    academicCategory: 'general',
    schedule: `${windows.active.startTime}-${windows.active.endTime}`
  });

  await Notification.create({
    branchId: branch._id,
    title: 'اعلان تست QA',
    description: 'این اعلان برای تست صفحه خانه و دسترسی نقش‌ها است.',
    message: 'این اعلان برای تست صفحه خانه و دسترسی نقش‌ها است.',
    classId: klass._id,
    subjectId: subject._id,
    teacherId: teacher._id,
    category: 'general',
    publishStatus: 'published',
    publishDate: new Date(),
    recipientRoles: ['student', 'parent', 'teacher', 'admin', 'super_admin'],
    recipientIds: []
  });

  await StudentMessage.create({
    branchId: branch._id,
    studentId: studentUser._id,
    teacherId: teacher._id,
    subject: 'QA message',
    message: 'Sample student-to-teacher message for QA dataset.',
    status: 'sent'
  });

  await Message.create({
    senderId: studentUser._id,
    senderRole: 'student',
    senderName: studentUser.name,
    senderEmail: studentUser.email,
    recipientId: admin._id,
    recipientRole: 'admin',
    targetGroup: 'admin',
    studentId: student._id,
    teacherId: teacher._id,
    branchId: branch._id,
    subject: 'QA support request',
    body: 'Sample student-to-admin message for QA.',
    category: 'student',
    messageType: 'student_to_admin',
    status: 'unread'
  });

  await Payment.create({
    studentId: student._id,
    branchId: branch._id,
    classId: klass._id,
    subjectId: subject._id,
    teacherId: teacher._id,
    amount: 2000,
    status: 'completed',
    currency: 'AFN',
    method: 'cash',
    referenceNumber: 'QA-PAY-001',
    notes: 'QA test payment'
  });

  const output = {
    database: config.mongoUri,
    createdAt: new Date().toISOString(),
    branchId: String(branch._id),
    classId: String(klass._id),
    subjectId: String(subject._id),
    teacherId: String(teacher._id),
    studentDocId: String(student._id),
    studentUserId: String(studentUser._id),
    parentUserId: String(parentUser._id),
    timetableIds: {
      active: String(activeTimetable._id),
      upcoming: String(upcomingTimetable._id),
      closed: String(closedTimetable._id)
    },
    credentials
  };

  const outputPath = path.resolve(process.cwd(), '..', 'account', 'clean-qa-credentials.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');

  return output;
}

async function main() {
  try {
    assertDevelopmentDatabaseSafety();
    await connectDatabase();
    await clearCollections();
    const result = await seedCleanDataset();
    console.log('RESET_AND_SEED_SUCCESS');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('RESET_AND_SEED_FAILED');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

void main();
