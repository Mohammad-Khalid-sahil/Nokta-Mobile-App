"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const User_1 = require("../../models/User");
const Family_1 = require("../../models/Family");
const Class_1 = require("../../models/Class");
const auth_1 = require("../../middlewares/auth");
const response_1 = require("../../helpers/response");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// POST /api/admin/reset-all
router.post('/reset-all', (0, auth_1.authorize)(['super_admin']), async (req, res, next) => {
    try {
        // Delete all students
        await User_1.User.deleteMany({ role: 'student' });
        // Delete all teachers
        await User_1.User.deleteMany({ role: 'teacher' });
        // Delete all family students
        await User_1.User.deleteMany({ role: 'family_student' });
        // Delete all families
        await Family_1.Family.deleteMany({});
        // Keep super_admin and admin intact
        res.json((0, response_1.createResponse)(null, 'All data reset successfully'));
    }
    catch (error) {
        next(error);
    }
});
// POST /api/admin/rebuild-system
router.post('/rebuild-system', (0, auth_1.authorize)(['super_admin']), async (req, res, next) => {
    try {
        // STEP 1: CREATE TEACHERS
        const teachers = [];
        for (let i = 1; i <= 5; i++) {
            const salaryType = i % 2 === 0 ? 'fixed' : 'percentage'; // alternate
            const salaryValue = salaryType === 'fixed'
                ? Math.floor(Math.random() * 15001) + 5000 // 5000-20000
                : Math.floor(Math.random() * 21) + 10; // 10-30
            const teacher = await User_1.User.create({
                name: `Teacher ${i}`,
                email: `teacher${i}@gmail.com`,
                password: await bcryptjs_1.default.hash('123456', 10),
                role: 'teacher',
                phone: `070${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
                salaryType,
                salaryValue
            });
            teachers.push(teacher);
        }
        // Get or create default class
        let defaultClass = await Class_1.ClassModel.findOne();
        if (!defaultClass) {
            defaultClass = await Class_1.ClassModel.create({
                name: 'Default Class',
                grade: '1'
            });
        }
        // STEP 2: CREATE 300 STUDENTS
        const students = [];
        for (let i = 1; i <= 300; i++) {
            const fatherName = `Father ${i}`;
            const phone = `079${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
            const fee = Math.floor(Math.random() * 4001) + 1000;
            const teacherId = teachers[Math.floor(Math.random() * teachers.length)]._id;
            // STEP 3: AUTO CREATE FAMILY ACCOUNT
            let familyRecord = await Family_1.Family.findOne({ $or: [{ phone }, { name: fatherName }] });
            if (!familyRecord) {
                const normalizedFatherName = fatherName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'parent';
                let familyEmail = `${normalizedFatherName}@gmail.com`;
                let suffix = 1;
                while (await User_1.User.exists({ email: familyEmail })) {
                    familyEmail = `${normalizedFatherName}${suffix}@gmail.com`;
                    suffix += 1;
                }
                const familyUser = await User_1.User.create({
                    name: fatherName,
                    email: familyEmail,
                    password: await bcryptjs_1.default.hash(fatherName, 10),
                    role: 'family_student',
                    phone
                });
                familyRecord = await Family_1.Family.create({
                    name: fatherName,
                    contactNumber: phone,
                    userId: familyUser._id,
                    students: []
                });
            }
            const student = await User_1.User.create({
                name: `Student ${i}`,
                email: `student${i}@gmail.com`,
                password: await bcryptjs_1.default.hash('123456', 10),
                role: 'student',
                fatherName,
                phone,
                fee,
                teacherId,
                classId: defaultClass._id,
                familyId: familyRecord._id
            });
            familyRecord.students.push(student._id);
            await familyRecord.save();
            students.push(student);
            // STEP 4: TEACHER SALARY CALCULATION (dynamic, no save needed)
            // Since salary is calculated dynamically in buildTeacherPayrollInfo, no action needed here
        }
        res.json((0, response_1.createResponse)({ teachersCreated: teachers.length, studentsCreated: students.length }, 'System rebuilt successfully'));
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
