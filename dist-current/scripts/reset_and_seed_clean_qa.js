"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mongoose_1 = __importDefault(require("mongoose"));
const connect_1 = require("../database/connect");
const env_1 = require("../config/env");
const password_1 = require("../utils/password");
const Branch_1 = require("../models/Branch");
const User_1 = require("../models/User");
const Family_1 = require("../models/Family");
const Parent_1 = require("../models/Parent");
const FamilyLink_1 = require("../models/FamilyLink");
const Student_1 = require("../models/Student");
const Class_1 = require("../models/Class");
const Subject_1 = require("../models/Subject");
const Course_1 = require("../models/Course");
const Timetable_1 = require("../models/Timetable");
const Attendance_1 = require("../models/Attendance");
const Exam_1 = require("../models/Exam");
const Result_1 = require("../models/Result");
const Notification_1 = require("../models/Notification");
const Message_1 = require("../models/Message");
const StudentMessage_1 = require("../models/StudentMessage");
const Enrollment_1 = require("../models/Enrollment");
const Payment_1 = require("../models/Payment");
const FinanceEntry_1 = require("../models/FinanceEntry");
const Expense_1 = require("../models/Expense");
const SalaryTransaction_1 = require("../models/SalaryTransaction");
const SessionToken_1 = require("../models/SessionToken");
const AuditLog_1 = require("../models/AuditLog");
const Book_1 = require("../models/Book");
function assertDevelopmentDatabaseSafety() {
    const uri = String(env_1.config.mongoUri || '');
    const env = String(env_1.config.environment || '').toLowerCase();
    const isLocalMongo = /mongodb(\+srv)?:\/\/(localhost|127\.0\.0\.1)/i.test(uri);
    const isDevLikeDb = /(dev|test|local|nokta_academy)/i.test(uri);
    const isProduction = env === 'production';
    if (isProduction || !isLocalMongo || !isDevLikeDb) {
        throw new Error(`Safety check failed. Refusing destructive reset for uri="${uri}" env="${env}".`);
    }
}
function minutesToHHMM(totalMinutes) {
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
    if (upcomingStart <= nowMin)
        upcomingStart = Math.min(1430, nowMin + 1);
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
        Attendance_1.Attendance.deleteMany({}),
        Result_1.Result.deleteMany({}),
        Exam_1.Exam.deleteMany({}),
        Timetable_1.Timetable.deleteMany({}),
        Enrollment_1.Enrollment.deleteMany({}),
        Payment_1.Payment.deleteMany({}),
        FinanceEntry_1.FinanceEntry.deleteMany({}),
        Expense_1.Expense.deleteMany({}),
        SalaryTransaction_1.SalaryTransaction.deleteMany({}),
        Message_1.Message.deleteMany({}),
        StudentMessage_1.StudentMessage.deleteMany({}),
        Notification_1.Notification.deleteMany({}),
        Course_1.Course.deleteMany({}),
        Subject_1.Subject.deleteMany({}),
        Class_1.ClassModel.deleteMany({}),
        Student_1.Student.deleteMany({}),
        FamilyLink_1.FamilyLink.deleteMany({}),
        Parent_1.ParentProfile.deleteMany({}),
        Family_1.Family.deleteMany({}),
        SessionToken_1.SessionToken.deleteMany({}),
        User_1.User.deleteMany({}),
        Branch_1.Branch.deleteMany({}),
        Book_1.Book.deleteMany({}),
        AuditLog_1.AuditLog.deleteMany({})
    ]);
}
async function seedCleanDataset() {
    const credentials = [
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
    const branch = await Branch_1.Branch.create({
        name: 'نمایندگی تست',
        code: 'QA-BR',
        city: 'Kabul',
        address: 'QA Branch Street',
        phone: '0700000000',
        email: 'branch.qa@nokta.local',
        active: true
    });
    const superAdmin = await User_1.User.create({
        name: credentials[0].name,
        email: credentials[0].email,
        password: await (0, password_1.hashPassword)(credentials[0].password),
        role: 'super_admin',
        branchId: branch._id,
        mustChangePassword: false
    });
    const admin = await User_1.User.create({
        name: credentials[1].name,
        email: credentials[1].email,
        password: await (0, password_1.hashPassword)(credentials[1].password),
        role: 'admin',
        branchId: branch._id,
        mustChangePassword: false
    });
    const teacher = await User_1.User.create({
        name: credentials[2].name,
        email: credentials[2].email,
        password: await (0, password_1.hashPassword)(credentials[2].password),
        role: 'teacher',
        teacherId: 'TCHR-QA-001',
        branchId: branch._id,
        phone: '0700000001',
        whatsapp: '0700000001',
        salaryType: 'fixed',
        fixedSalary: 15000,
        mustChangePassword: false
    });
    const klass = await Class_1.ClassModel.create({
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
    const subject = await Subject_1.Subject.create({
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
    await Class_1.ClassModel.updateOne({ _id: klass._id }, {
        $set: {
            subjectId: subject._id,
            teacherId: teacher._id,
            assignedSubjects: [subject._id],
            title: 'صنف تست QA',
            shortDescription: 'Class for final QA',
            description: 'Class for final QA',
            fullDescription: 'Class for final QA'
        }
    });
    await User_1.User.updateOne({ _id: teacher._id }, {
        $set: {
            assignedSubjects: [subject._id],
            assignedClasses: [klass._id]
        }
    });
    const family = await Family_1.Family.create({
        guardianName: credentials[4].name,
        guardianEmail: credentials[4].email,
        guardianPhone: '0700000003',
        students: []
    });
    const parentUser = await User_1.User.create({
        name: credentials[4].name,
        email: credentials[4].email,
        password: await (0, password_1.hashPassword)(credentials[4].password),
        role: 'parent',
        branchId: branch._id,
        familyId: family._id,
        phone: '0700000003',
        mustChangePassword: false
    });
    const parentProfile = await Parent_1.ParentProfile.create({
        userId: parentUser._id,
        branchId: branch._id,
        guardianName: credentials[4].name,
        guardianPhone: '0700000003',
        guardianEmail: credentials[4].email,
        relationType: 'guardian',
        linkedStudentIds: []
    });
    const studentCode = 'STD-QA-001';
    const student = await Student_1.Student.create({
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
    const studentUser = await User_1.User.create({
        name: credentials[3].name,
        email: credentials[3].email,
        password: await (0, password_1.hashPassword)(credentials[3].password),
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
    await Family_1.Family.updateOne({ _id: family._id }, { $set: { students: [student._id] } });
    await Parent_1.ParentProfile.updateOne({ _id: parentProfile._id }, { $set: { linkedStudentIds: [student._id] } });
    await User_1.User.updateOne({ _id: parentUser._id }, { $set: { parentProfileId: parentProfile._id } });
    await FamilyLink_1.FamilyLink.create({
        parentId: parentProfile._id,
        studentId: student._id,
        relationType: 'guardian',
        isPrimary: true
    });
    await Enrollment_1.Enrollment.create({
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
        Timetable_1.Timetable.create({
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
        Timetable_1.Timetable.create({
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
        Timetable_1.Timetable.create({
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
    const exam = await Exam_1.Exam.create({
        branchId: branch._id,
        title: 'QA Final Exam',
        subject: subject._id,
        class: klass._id,
        teacherId: teacher._id,
        date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        totalMarks: 100,
        passingMarks: 40,
        examType: 'final',
        examCode: 'QA-EXAM-001',
        status: 'published',
        publishedAt: new Date()
    });
    await Result_1.Result.create({
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
    await Course_1.Course.create({
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
    await Notification_1.Notification.create({
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
    await StudentMessage_1.StudentMessage.create({
        branchId: branch._id,
        studentId: studentUser._id,
        teacherId: teacher._id,
        subject: 'QA message',
        message: 'Sample student-to-teacher message for QA dataset.',
        status: 'sent'
    });
    await Message_1.Message.create({
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
    await Payment_1.Payment.create({
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
        database: env_1.config.mongoUri,
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
    const outputPath = path_1.default.resolve(process.cwd(), '..', 'account', 'clean-qa-credentials.json');
    fs_1.default.mkdirSync(path_1.default.dirname(outputPath), { recursive: true });
    fs_1.default.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
    return output;
}
async function main() {
    try {
        assertDevelopmentDatabaseSafety();
        await (0, connect_1.connectDatabase)();
        await clearCollections();
        const result = await seedCleanDataset();
        console.log('RESET_AND_SEED_SUCCESS');
        console.log(JSON.stringify(result, null, 2));
    }
    catch (error) {
        console.error('RESET_AND_SEED_FAILED');
        console.error(error);
        process.exitCode = 1;
    }
    finally {
        await mongoose_1.default.disconnect();
    }
}
void main();
