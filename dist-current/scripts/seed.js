"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const faker_1 = require("@faker-js/faker");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const connect_1 = require("../database/connect");
const User_1 = require("../models/User");
const Student_1 = require("../models/Student");
const Class_1 = require("../models/Class");
const Subject_1 = require("../models/Subject");
const Exam_1 = require("../models/Exam");
const Result_1 = require("../models/Result");
const Family_1 = require("../models/Family");
const Expense_1 = require("../models/Expense");
const Book_1 = require("../models/Book");
const Notification_1 = require("../models/Notification");
const AuditLog_1 = require("../models/AuditLog");
const SalaryTransaction_1 = require("../models/SalaryTransaction");
const Payment_1 = require("../models/Payment");
const SalarySetting_1 = require("../models/SalarySetting");
const SalaryRecord_1 = require("../models/SalaryRecord");
const afghanistanSalaryTaxService_1 = require("../services/afghanistanSalaryTaxService");
const payrollCalculation_service_1 = require("../services/payrollCalculation.service");
const teacherCompensationService_1 = require("../services/teacherCompensationService");
const STUDENT_FEE_AMOUNT = 1000;
const STUDENTS_PER_TEACHER = 10;
const ACCOUNT_FILE_PATH = path_1.default.resolve(process.cwd(), '..', 'account', 'accounts.md');
const STUDENT_PROFILE_IMAGES = [
    '/images/stunet/images.jfif',
    '/images/stunet/images (1).jfif',
    '/images/stunet/images (2).jfif',
    '/images/stunet/images (3).jfif',
    '/images/stunet/images (4).jfif',
    '/images/stunet/images (5).jfif',
    '/images/stunet/images (6).jfif',
    '/images/stunet/images (7).jfif',
    '/images/stunet/images (8).jfif',
    '/images/stunet/images (9).jfif',
    '/images/stunet/download.jfif',
    '/images/stunet/download (1).jfif',
    '/images/stunet/download (2).jfif',
    '/images/stunet/download (3).jfif',
    '/images/stunet/download (4).jfif',
    '/images/stunet/download (5).jfif',
    '/images/stunet/download (6).jfif',
    '/images/stunet/b1.jpg',
    '/images/stunet/b3.jpg',
    '/images/stunet/b4.jpg'
];
const TEACHER_PROFILE_IMAGES = [
    '/images/techer/images.jfif',
    '/images/techer/images (1).jfif',
    '/images/techer/images (2).jfif',
    '/images/techer/images (3).jfif',
    '/images/techer/images (4).jfif',
    '/images/techer/download.jfif',
    '/images/techer/download (1).jfif',
    '/images/techer/download (2).jfif',
    '/images/techer/download (7).jfif'
];
const CLASS_NAMES = [
    'Computer Fundamentals',
    'Web Design',
    'Programming Basics',
    'English Language',
    'Mathematics',
    'Science',
    'Islamic Studies',
    'Accounting',
    'Graphic Design',
    'Office Applications'
];
const SUBJECT_TITLES = [
    'Mathematics',
    'Science',
    'English',
    'History',
    'Geography',
    'Physics',
    'Chemistry',
    'Biology',
    'Computer Science',
    'Art',
    'Music',
    'Physical Education',
    'Social Studies',
    'Islamic Studies',
    'Economics',
    'Accounting',
    'Civics',
    'Persian',
    'Arabic',
    'Environmental Science',
    'Health Education',
    'Programming',
    'Design',
    'Literature'
];
async function clearDatabase() {
    console.log('Deleting all data...');
    await Promise.all([
        User_1.User.deleteMany({}),
        Student_1.Student.deleteMany({}),
        Class_1.ClassModel.deleteMany({}),
        Subject_1.Subject.deleteMany({}),
        Exam_1.Exam.deleteMany({}),
        Result_1.Result.deleteMany({}),
        Family_1.Family.deleteMany({}),
        Expense_1.Expense.deleteMany({}),
        Book_1.Book.deleteMany({}),
        Notification_1.Notification.deleteMany({}),
        AuditLog_1.AuditLog.deleteMany({}),
        SalaryTransaction_1.SalaryTransaction.deleteMany({}),
        Payment_1.Payment.deleteMany({}),
        SalarySetting_1.SalarySetting.deleteMany({}),
        SalaryRecord_1.SalaryRecord.deleteMany({})
    ]);
    console.log('All data deleted.');
}
async function createSuperAdmin() {
    console.log('Creating super admin...');
    const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL || 'admin@gmail.com';
    const superAdminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD || 'Admin123!';
    const hashedPassword = await bcryptjs_1.default.hash(superAdminPassword, 10);
    const superAdmin = await User_1.User.create({
        name: 'Super Admin',
        email: superAdminEmail,
        password: hashedPassword,
        role: 'super_admin'
    });
    console.log('Super admin created.');
    return { superAdmin, superAdminPassword };
}
async function createUserAccounts(accounts) {
    console.log('Creating user accounts...');
    const teachers = [];
    const students = [];
    const familyStudents = [];
    const admins = [];
    const accountants = [];
    const librarians = [];
    for (let i = 1; i <= 5; i++) {
        const name = faker_1.faker.person.fullName();
        const hashedPassword = await bcryptjs_1.default.hash('Admin123!', 10);
        const user = await User_1.User.create({
            name,
            email: `admin${i}@nokta.com`,
            password: hashedPassword,
            role: 'admin'
        });
        admins.push(user);
        accounts.admin.push({ name, email: user.email, password: 'Admin123!', role: 'admin' });
    }
    for (let i = 1; i <= 10; i++) {
        const firstName = faker_1.faker.person.firstName();
        const lastName = faker_1.faker.person.lastName();
        const name = `${firstName} ${lastName}`;
        const hashedPassword = await bcryptjs_1.default.hash('Teacher123!', 10);
        const percentageRate = faker_1.faker.number.int({ min: 20, max: 40 });
        const user = await User_1.User.create({
            name,
            email: `teacher${i}@nokta.com`,
            password: hashedPassword,
            role: 'teacher',
            teacherId: `TCHR-${String(i).padStart(3, '0')}`,
            firstName,
            lastName,
            phone: faker_1.faker.phone.number(),
            whatsapp: faker_1.faker.phone.number(),
            profileImage: TEACHER_PROFILE_IMAGES[(i - 1) % TEACHER_PROFILE_IMAGES.length],
            salaryType: 'percentage',
            fixedSalary: 0,
            percentageRate,
            customPercentage: 0,
            assignedSubjects: [],
            assignedClasses: []
        });
        teachers.push(user);
        accounts.teacher.push({
            name,
            email: user.email,
            password: 'Teacher123!',
            role: 'teacher',
            percentage: `${percentageRate}%`,
            students: String(STUDENTS_PER_TEACHER)
        });
    }
    for (let i = 1; i <= 100; i++) {
        const firstName = faker_1.faker.person.firstName();
        const lastName = faker_1.faker.person.lastName();
        const name = `${firstName} ${lastName}`;
        const hashedPassword = await bcryptjs_1.default.hash('Student123!', 10);
        const gender = faker_1.faker.helpers.arrayElement(['male', 'female']);
        const user = await User_1.User.create({
            name,
            email: `student${i}@nokta.com`,
            password: hashedPassword,
            role: 'student',
            studentId: `STD-${String(i).padStart(4, '0')}`,
            gender,
            profileImage: STUDENT_PROFILE_IMAGES[(i - 1) % STUDENT_PROFILE_IMAGES.length],
            status: 'active'
        });
        students.push(user);
        accounts.student.push({ name, email: user.email, password: 'Student123!', role: 'student' });
    }
    for (let i = 1; i <= 50; i++) {
        const name = faker_1.faker.person.fullName();
        const hashedPassword = await bcryptjs_1.default.hash('Family123!', 10);
        const user = await User_1.User.create({
            name,
            email: `family${i}@nokta.com`,
            password: hashedPassword,
            role: 'family_student'
        });
        familyStudents.push(user);
        accounts.family_student.push({ name, email: user.email, password: 'Family123!', role: 'family_student' });
    }
    for (let i = 1; i <= 5; i++) {
        const name = faker_1.faker.person.fullName();
        const hashedPassword = await bcryptjs_1.default.hash('Accountant123!', 10);
        const user = await User_1.User.create({
            name,
            email: `accountant${i}@nokta.com`,
            password: hashedPassword,
            role: 'accountant'
        });
        accountants.push(user);
        accounts.accountant.push({ name, email: user.email, password: 'Accountant123!', role: 'accountant' });
    }
    for (let i = 1; i <= 5; i++) {
        const name = faker_1.faker.person.fullName();
        const hashedPassword = await bcryptjs_1.default.hash('Librarian123!', 10);
        const user = await User_1.User.create({
            name,
            email: `librarian${i}@nokta.com`,
            password: hashedPassword,
            role: 'librarian'
        });
        librarians.push(user);
        accounts.librarian.push({ name, email: user.email, password: 'Librarian123!', role: 'librarian' });
    }
    console.log('User accounts created.');
    return { admins, teachers, students, familyStudents, accountants, librarians };
}
function chooseRandomSubjectTitles(count) {
    return faker_1.faker.helpers.arrayElements(SUBJECT_TITLES, count).map((title) => ({
        title,
        code: `${title.substring(0, 3).toUpperCase()}-${faker_1.faker.number.int({ min: 100, max: 999 })}`
    }));
}
async function createClassesAndSubjects(teachers) {
    console.log('Creating classes and subjects (1 teacher per class, fee 1000 AF)...');
    const classes = [];
    const subjects = [];
    for (let i = 0; i < 10; i++) {
        const teacher = teachers[i];
        const className = CLASS_NAMES[i] ?? `Class ${i + 1}`;
        const subjectTitle = SUBJECT_TITLES[i] ?? className;
        const classData = await Class_1.ClassModel.create({
            className,
            name: className,
            assignedSubjects: [],
            assignedTeachers: [teacher._id],
            capacity: 15,
            feeAmount: STUDENT_FEE_AMOUNT
        });
        const subject = await Subject_1.Subject.create({
            title: subjectTitle,
            code: `SUB-${i + 1}-${STUDENT_FEE_AMOUNT}`,
            classId: classData._id,
            feeAmount: STUDENT_FEE_AMOUNT,
            teacher: teacher._id,
            description: `${className} - ${subjectTitle}`
        });
        classData.assignedSubjects = [subject._id];
        await classData.save();
        await User_1.User.findByIdAndUpdate(teacher._id, {
            assignedSubjects: [subject._id],
            assignedClasses: [classData._id]
        });
        classes.push(classData);
        subjects.push(subject);
    }
    console.log('Classes and subjects created.');
    return { classes, subjects };
}
async function createFamilies(count) {
    const families = [];
    for (let i = 0; i < count; i++) {
        const family = await Family_1.Family.create({
            guardianName: faker_1.faker.person.fullName(),
            guardianEmail: faker_1.faker.internet.email(),
            guardianPhone: faker_1.faker.phone.number(),
            students: [],
            notes: faker_1.faker.lorem.sentence()
        });
        families.push(family);
    }
    return families;
}
async function createStudentsAndFamilies(students, teachers, classes, subjects) {
    console.log(`Creating student profiles (${STUDENTS_PER_TEACHER} students per teacher, ${STUDENT_FEE_AMOUNT} AF each)...`);
    const families = await createFamilies(Math.ceil(students.length / 3));
    const studentDocs = [];
    for (let studentIndex = 0; studentIndex < students.length; studentIndex++) {
        const teacherIndex = Math.floor(studentIndex / STUDENTS_PER_TEACHER);
        const teacher = teachers[teacherIndex];
        const classData = classes[teacherIndex];
        const subject = subjects[teacherIndex];
        const student = students[studentIndex];
        const family = families[studentIndex % families.length];
        const studentDoc = await Student_1.Student.create({
            rollNo: `STD-${studentIndex + 1}`,
            studentId: student.studentId ?? `STD-${String(studentIndex + 1).padStart(4, '0')}`,
            firstName: student.firstName || student.name.split(' ')[0],
            lastName: student.lastName || student.name.split(' ').slice(1).join(' '),
            fatherName: faker_1.faker.person.fullName(),
            familyPhone: faker_1.faker.phone.number(),
            loginEmail: student.email,
            profileImage: student.profileImage ?? STUDENT_PROFILE_IMAGES[studentIndex % STUDENT_PROFILE_IMAGES.length],
            gender: student.gender ?? 'male',
            classId: classData._id,
            subjectId: subject._id,
            teacherId: teacher._id,
            feeAmount: STUDENT_FEE_AMOUNT,
            paidAmount: STUDENT_FEE_AMOUNT,
            remainingBalance: 0,
            familyId: family._id
        });
        family.students.push(studentDoc._id);
        await User_1.User.findByIdAndUpdate(student._id, {
            classId: classData._id,
            subjectId: subject._id,
            assignedTeacherId: teacher._id,
            profileImage: student.profileImage ?? STUDENT_PROFILE_IMAGES[studentIndex % STUDENT_PROFILE_IMAGES.length],
            feeAmount: STUDENT_FEE_AMOUNT,
            paidAmount: STUDENT_FEE_AMOUNT,
            remainingBalance: 0
        });
        studentDocs.push(studentDoc);
    }
    await Promise.all(families.map((family) => family.save()));
    console.log('Students and families created.');
    return { families, studentDocs };
}
async function createFinancialPaymentsAndSalary(teachers, studentDocs, financeActor) {
    console.log('Creating student fee payments, salary settings, and payroll records...');
    const compensationService = new teacherCompensationService_1.TeacherCompensationService();
    const paymentDate = new Date();
    const { year: hijriYear, month: hijriMonth } = (0, afghanistanSalaryTaxService_1.getHijriYearMonth)(paymentDate);
    const teacherById = new Map(teachers.map((teacher) => [String(teacher._id), teacher]));
    let invoiceCounter = 1;
    for (const studentDoc of studentDocs) {
        const teacher = teacherById.get(String(studentDoc.teacherId));
        const payment = await Payment_1.Payment.create({
            paymentFor: 'student_fee',
            studentId: studentDoc._id,
            classId: studentDoc.classId,
            subjectId: studentDoc.subjectId,
            teacherId: studentDoc.teacherId,
            amount: STUDENT_FEE_AMOUNT,
            status: 'completed',
            currency: 'AFN',
            method: 'cash',
            invoiceNumber: `INV-SEED-${String(invoiceCounter).padStart(5, '0')}`,
            referenceNumber: `SEED-PAY-${String(invoiceCounter).padStart(5, '0')}`,
            paymentDate,
            collectedBy: financeActor?._id ?? null,
            notes: 'Seeded student fee payment'
        });
        invoiceCounter += 1;
        if (teacher) {
            await compensationService.recordPaymentCommission({
                payment,
                student: studentDoc,
                teacher,
                createdBy: financeActor?._id ?? null
            });
        }
    }
    for (const teacher of teachers) {
        const percentage = Number(teacher.percentageRate || 0);
        await SalarySetting_1.SalarySetting.create({
            userId: teacher._id,
            role: 'teacher',
            salaryType: 'percentage',
            fixedAmount: 0,
            percentage,
            percentageScope: 'branch',
            isActive: true,
            createdBy: financeActor?._id ?? null
        });
        await (0, payrollCalculation_service_1.calculateSalaryRecord)({
            userId: String(teacher._id),
            hijriYear,
            hijriMonth,
            actorId: financeActor?._id ?? null,
            allowAllSystemScope: true,
            forceRecalculate: true
        });
    }
    console.log('Financial payments and payroll records created.');
}
async function createExams(subjects) {
    console.log('Creating exams...');
    const exams = [];
    for (let i = 1; i <= 20; i++) {
        const subject = faker_1.faker.helpers.arrayElement(subjects);
        const exam = await Exam_1.Exam.create({
            title: `Midterm ${i} - ${subject.title}`,
            subject: subject._id,
            class: subject.classId,
            teacherId: subject.teacher,
            date: faker_1.faker.date.future(),
            totalMarks: 100,
            passingMarks: 40,
            examType: 'midterm',
            onlineExamUrl: `https://docs.google.com/forms/d/e/nokta-academy-demo-${i}/viewform`,
            googleFormUrl: `https://docs.google.com/forms/d/e/nokta-academy-demo-${i}/viewform`,
            examCode: `EXM-${String(i).padStart(3, '0')}`
        });
        exams.push(exam);
    }
    console.log('Exams created.');
    return exams;
}
async function createResults(exams, teachers) {
    console.log('Creating results...');
    const results = [];
    for (const exam of exams) {
        const studentsForClass = await Student_1.Student.find({ classId: exam.class, subjectId: exam.subject })
            .select('studentId')
            .lean();
        const studentUsers = await User_1.User.find({
            role: 'student',
            studentId: { $in: studentsForClass.map((student) => student.studentId).filter(Boolean) }
        })
            .select('_id studentId')
            .lean();
        const studentUserMap = new Map(studentUsers.map((studentUser) => [studentUser.studentId, studentUser._id]));
        for (const student of studentsForClass) {
            const studentUserId = studentUserMap.get(student.studentId);
            if (!studentUserId) {
                continue;
            }
            const score = faker_1.faker.number.int({ min: 0, max: 100 });
            let grade = 'F';
            if (score >= 90)
                grade = 'A';
            else if (score >= 80)
                grade = 'B';
            else if (score >= 70)
                grade = 'C';
            else if (score >= 60)
                grade = 'D';
            else if (score >= 40)
                grade = 'E';
            const remarks = score >= 40 ? 'Pass' : 'Fail';
            const result = await Result_1.Result.create({
                student: studentUserId,
                exam: exam._id,
                score,
                grade,
                remarks,
                gradedBy: faker_1.faker.helpers.arrayElement(teachers)._id
            });
            results.push(result);
        }
    }
    console.log('Results created.');
    return results;
}
async function createFinanceAndSupportData(teachers, classes) {
    console.log('Creating finance and support data...');
    const expenses = [];
    const books = [];
    const notifications = [];
    const auditLogs = [];
    const salaryTransactions = [];
    const financeActor = await User_1.User.findOne({ role: { $in: ['super_admin', 'admin', 'accountant'] } });
    for (const teacher of teachers) {
        const teacherIds = classes
            .filter((klass) => klass.assignedTeachers?.map((id) => id.toString()).includes(teacher._id.toString()))
            .map((klass) => klass._id);
        const salary = teacherIds.length * 600;
        const expense = await Expense_1.Expense.create({
            title: `Teacher salary - ${teacher.name}`,
            amount: salary,
            category: 'Salary',
            date: new Date(),
            createdBy: teacher._id,
            notes: `Salary expense for ${teacher.name}`
        });
        expenses.push(expense);
    }
    for (let offset = 5; offset >= 0; offset -= 1) {
        const incomeDate = new Date();
        incomeDate.setMonth(incomeDate.getMonth() - offset);
        incomeDate.setDate(15);
        const income = await Expense_1.Expense.create({
            title: `Tuition income - ${incomeDate.toLocaleString('en', { month: 'long', year: 'numeric' })}`,
            amount: faker_1.faker.number.int({ min: 180000, max: 235000 }),
            category: 'income',
            date: incomeDate,
            createdBy: financeActor?._id,
            notes: 'Seeded monthly tuition income'
        });
        expenses.push(income);
    }
    const supportExpenseTemplates = [
        { title: 'Campus utilities', category: 'Utilities', monthOffset: 2, amountRange: { min: 2500, max: 4500 } },
        { title: 'Learning supplies', category: 'Supplies', monthOffset: 1, amountRange: { min: 2200, max: 4200 } },
        { title: 'Maintenance', category: 'Maintenance', monthOffset: 0, amountRange: { min: 3000, max: 5200 } }
    ];
    for (const template of supportExpenseTemplates) {
        const expenseDate = new Date();
        expenseDate.setMonth(expenseDate.getMonth() - template.monthOffset);
        expenseDate.setDate(10);
        const supportExpense = await Expense_1.Expense.create({
            title: `${template.title} - ${expenseDate.toLocaleString('en', { month: 'long', year: 'numeric' })}`,
            amount: faker_1.faker.number.int(template.amountRange),
            category: template.category,
            date: expenseDate,
            createdBy: financeActor?._id,
            notes: 'Seeded operational expense'
        });
        expenses.push(supportExpense);
    }
    for (let i = 1; i <= 10; i++) {
        const book = await Book_1.Book.create({
            title: faker_1.faker.lorem.words(3),
            author: faker_1.faker.person.fullName(),
            isbn: `ISBN-${faker_1.faker.number.int({ min: 1000000000, max: 9999999999 })}`,
            available: faker_1.faker.datatype.boolean(),
            category: faker_1.faker.lorem.word()
        });
        books.push(book);
    }
    const roles = ['admin', 'teacher', 'student', 'family_student', 'accountant', 'librarian'];
    const sampleTitles = [
        {
            en: 'Exam schedule update',
            fa: 'به‌روزرسانی برنامه امتحانات',
            ps: 'د ازموینې مهالویش تازه معلومات'
        },
        {
            en: 'Holiday notice',
            fa: 'اطلاعیه تعطیلات',
            ps: 'د رخصتۍ خبرتیا'
        },
        {
            en: 'Class reminder',
            fa: 'یادآوری صنف',
            ps: 'د ټولګي یادونه'
        }
    ];
    for (let i = 0; i < 10; i++) {
        const recipients = faker_1.faker.helpers.arrayElements(roles, 2);
        const title = sampleTitles[i % sampleTitles.length];
        const description = {
            en: faker_1.faker.lorem.sentence(),
            fa: `اعلان سیستمی ${i + 1}: ${faker_1.faker.lorem.words(6)}`,
            ps: `د سیسټم خبرتیا ${i + 1}: ${faker_1.faker.lorem.words(6)}`
        };
        const notification = await Notification_1.Notification.create({
            title,
            description,
            message: description,
            recipientRoles: recipients,
            recipientIds: [],
            readBy: [],
            category: faker_1.faker.helpers.arrayElement(['general', 'holiday', 'class_notice', 'exam_alert']),
            priority: faker_1.faker.helpers.arrayElement(['low', 'normal', 'high', 'urgent']),
            metadata: { priority: faker_1.faker.helpers.arrayElement(['low', 'medium', 'high']) },
            publishStatus: 'published',
            publishDate: new Date()
        });
        notifications.push(notification);
    }
    const recentUser = await User_1.User.findOne({ role: 'admin' });
    if (recentUser) {
        for (let i = 1; i <= 5; i++) {
            const auditLog = await AuditLog_1.AuditLog.create({
                actor: recentUser._id,
                action: `Seed event ${i}`,
                target: `System seed record ${i}`,
                metadata: { type: 'seed' }
            });
            auditLogs.push(auditLog);
        }
    }
    console.log('Finance and support data created.');
    return { expenses, books, notifications, auditLogs, salaryTransactions };
}
function generateAccountsFile(accounts) {
    console.log('Generating accounts file...');
    let content = '# System Accounts\n\n';
    content += '## Super Admin\n';
    accounts.super_admin.forEach((acc) => {
        content += `Name: ${acc.name}\nEmail: ${acc.email}\nPassword: ${acc.password}\nRole: ${acc.role}\n\n`;
    });
    content += '## Admins\n';
    accounts.admin.forEach((acc) => {
        content += `Name: ${acc.name}\nEmail: ${acc.email}\nPassword: ${acc.password}\nRole: ${acc.role}\n\n`;
    });
    content += '## Teachers\n';
    accounts.teacher.forEach((acc) => {
        content += `Name: ${acc.name}\nEmail: ${acc.email}\nPassword: ${acc.password}\nRole: ${acc.role}`;
        if (acc.percentage)
            content += `\nCommission: ${acc.percentage}`;
        if (acc.students)
            content += `\nAssigned Students: ${acc.students}`;
        content += '\n\n';
    });
    content += '## Students\n';
    accounts.student.forEach((acc) => {
        content += `Name: ${acc.name}\nEmail: ${acc.email}\nPassword: ${acc.password}\nRole: ${acc.role}\n\n`;
    });
    content += '## Family Students\n';
    accounts.family_student.forEach((acc) => {
        content += `Name: ${acc.name}\nEmail: ${acc.email}\nPassword: ${acc.password}\nRole: ${acc.role}\n\n`;
    });
    content += '## Accountants\n';
    accounts.accountant.forEach((acc) => {
        content += `Name: ${acc.name}\nEmail: ${acc.email}\nPassword: ${acc.password}\nRole: ${acc.role}\n\n`;
    });
    content += '## Librarians\n';
    accounts.librarian.forEach((acc) => {
        content += `Name: ${acc.name}\nEmail: ${acc.email}\nPassword: ${acc.password}\nRole: ${acc.role}\n\n`;
    });
    const dir = path_1.default.dirname(ACCOUNT_FILE_PATH);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    fs_1.default.writeFileSync(ACCOUNT_FILE_PATH, content, 'utf8');
    console.log('Accounts file generated.');
}
async function seedDatabase() {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Database seed is blocked in production. Use create-super-admin with SUPER_ADMIN_PASSWORD instead.');
    }
    if (!process.env.SEED_SUPER_ADMIN_PASSWORD) {
        console.warn('Warning: SEED_SUPER_ADMIN_PASSWORD is not set. Default demo passwords will be used (development only).');
    }
    try {
        await (0, connect_1.connectDatabase)();
        console.log('Connected to database.');
        await clearDatabase();
        const accounts = {
            super_admin: [],
            admin: [],
            teacher: [],
            student: [],
            family_student: [],
            accountant: [],
            librarian: []
        };
        const { superAdmin, superAdminPassword } = await createSuperAdmin();
        accounts.super_admin.push({ name: superAdmin.name, email: superAdmin.email, password: superAdminPassword, role: 'super_admin' });
        const { teachers, students } = await createUserAccounts(accounts);
        const { classes, subjects } = await createClassesAndSubjects(teachers);
        const { families, studentDocs } = await createStudentsAndFamilies(students, teachers, classes, subjects);
        await createFinancialPaymentsAndSalary(teachers, studentDocs, superAdmin);
        const exams = await createExams(subjects);
        await createResults(exams, teachers);
        await createFinanceAndSupportData(teachers, classes);
        generateAccountsFile(accounts);
        console.log('Seeding complete!');
        process.exit(0);
    }
    catch (error) {
        console.error('Seeding failed:', error);
        process.exit(1);
    }
}
seedDatabase();
