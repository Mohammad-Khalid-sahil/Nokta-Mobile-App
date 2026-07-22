"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentService = void 0;
const Family_1 = require("../models/Family");
const FamilyLink_1 = require("../models/FamilyLink");
const Enrollment_1 = require("../models/Enrollment");
const Parent_1 = require("../models/Parent");
const Payment_1 = require("../models/Payment");
const Student_1 = require("../models/Student");
const Subject_1 = require("../models/Subject");
const User_1 = require("../models/User");
const Class_1 = require("../models/Class");
const Notification_1 = require("../models/Notification");
const AuditLog_1 = require("../models/AuditLog");
const businessRuleService_1 = require("./businessRuleService");
const teacherCompensationService_1 = require("./teacherCompensationService");
const password_1 = require("../utils/password");
class StudentService {
    constructor() {
        this.businessRuleService = new businessRuleService_1.BusinessRuleService();
    }
    async assertEnrollmentLinksMatch(payload) {
        const [klass, subject, teacher] = await Promise.all([
            Class_1.ClassModel.findOne({ _id: payload.classId, isDeleted: false }).select('assignedSubjects').lean(),
            Subject_1.Subject.findOne({ _id: payload.subjectId, isDeleted: false }).lean(),
            User_1.User.findOne({ _id: payload.teacherId, role: 'teacher', isDeleted: false }).lean()
        ]);
        if (!klass) {
            throw new Error('Selected class does not exist');
        }
        if (!subject) {
            throw new Error('Selected subject does not exist');
        }
        const subjectClassIds = new Set([
            subject.classId ? String(subject.classId) : '',
            ...(Array.isArray(subject.classIds) ? subject.classIds.map((id) => String(id)) : [])
        ].filter(Boolean));
        const classSubjectIds = new Set((klass.assignedSubjects ?? []).map((id) => String(id)));
        if (!subjectClassIds.has(String(payload.classId)) && !classSubjectIds.has(String(payload.subjectId))) {
            throw new Error('Selected subject does not belong to the selected class');
        }
        if (!teacher) {
            throw new Error('Selected teacher does not exist');
        }
        const assignedSubjectIds = Array.isArray(teacher.assignedSubjects) ? teacher.assignedSubjects.map((item) => String(item)) : [];
        const assignedClassIds = Array.isArray(teacher.assignedClasses) ? teacher.assignedClasses.map((item) => String(item)) : [];
        const subjectTeacherMatches = subject.teacher ? String(subject.teacher) === String(teacher._id) : false;
        const teacherSubjectMatches = assignedSubjectIds.includes(String(subject._id));
        const teacherClassMatches = assignedClassIds.includes(String(payload.classId));
        if (!subjectTeacherMatches && !teacherSubjectMatches && !teacherClassMatches) {
            throw new Error('Selected teacher is not assigned to the selected subject');
        }
    }
    async resolveFeeAmount(classId, subjectId, override) {
        if (override !== undefined && override !== null)
            return Number(override);
        const [klass, subject] = await Promise.all([
            Class_1.ClassModel.findById(classId).select('feeAmount').lean(),
            Subject_1.Subject.findById(subjectId).select('feeAmount').lean()
        ]);
        const { calculateEnrollmentFee } = await Promise.resolve().then(() => __importStar(require('../utils/feeCalculator')));
        return calculateEnrollmentFee(klass?.feeAmount, subject?.feeAmount).totalFee;
    }
    async audit(actorId, action, student, metadata = {}) {
        const actor = actorId ?? (await User_1.User.findOne({ role: { $in: ['system_automation', 'super_admin'] }, isDeleted: false }).select('_id').lean())?._id;
        if (!actor)
            return;
        await AuditLog_1.AuditLog.create({
            actor,
            branchId: student?.branchId ?? null,
            action,
            target: String(student?._id ?? ''),
            targetType: 'student',
            metadata,
            severity: action.includes('BLOCK') ? 'critical' : 'info'
        });
    }
    async registerStudent(data) {
        if (!data.classId || !data.subjectId || !data.teacherId) {
            throw new Error('classId, subjectId, and teacherId are required');
        }
        if (!data.gender) {
            throw new Error('Student gender is required');
        }
        await this.assertEnrollmentLinksMatch({
            classId: data.classId,
            subjectId: data.subjectId,
            teacherId: data.teacherId
        });
        await this.businessRuleService.assertStudentGenderMatchesClass(data.gender, data.classId);
        await this.businessRuleService.assertTeacherGenderMatchesClass(data.teacherId, data.classId);
        const familyPhone = String(data.familyPhone ?? data.phone ?? '').trim();
        let family = familyPhone ? await Family_1.Family.findOne({ guardianPhone: familyPhone }) : null;
        let familyUser = null;
        if (!family) {
            const normalizedFatherName = String(data.fatherName || 'parent').toLowerCase().replace(/[^a-z0-9]/g, '') || 'parent';
            let familyEmail = `${normalizedFatherName}@nokta.academy`;
            let suffix = 1;
            while (await User_1.User.findOne({ email: familyEmail })) {
                familyEmail = `${normalizedFatherName}${suffix}@nokta.academy`;
                suffix += 1;
            }
            family = await Family_1.Family.create({
                guardianName: data.fatherName,
                guardianEmail: familyEmail,
                guardianPhone: familyPhone,
                students: []
            });
            familyUser = await User_1.User.create({
                name: data.fatherName,
                email: familyEmail,
                phone: familyPhone,
                password: await (0, password_1.hashPassword)(`Parent@${String(familyPhone || data.fatherName).slice(-8)}!`),
                role: 'parent',
                familyId: family._id,
                branchId: data.branchId ?? null,
                mustChangePassword: true
            });
        }
        else {
            familyUser = await User_1.User.findOne({ email: family.guardianEmail });
            if (!familyUser) {
                familyUser = await User_1.User.create({
                    name: family.guardianName,
                    email: family.guardianEmail,
                    phone: family.guardianPhone,
                    password: await (0, password_1.hashPassword)(`Parent@${String(family.guardianPhone).slice(-8)}!`),
                    role: 'parent',
                    familyId: family._id,
                    branchId: data.branchId ?? null,
                    mustChangePassword: true
                });
            }
        }
        let parentProfile = await Parent_1.ParentProfile.findOne({ userId: familyUser._id });
        if (!parentProfile) {
            parentProfile = await Parent_1.ParentProfile.create({
                userId: familyUser._id,
                branchId: data.branchId ?? null,
                guardianName: data.fatherName,
                guardianPhone: familyPhone,
                guardianEmail: family.guardianEmail,
                relationType: 'guardian',
                linkedStudentIds: []
            });
        }
        const studentId = this.generateStudentId();
        const rollNo = data.rollNo || await this.generateStudentRollNo();
        const registrationDate = data.registrationStartDate ? new Date(data.registrationStartDate) : (data.registrationDate ? new Date(data.registrationDate) : new Date());
        const registrationExpiryDate = data.registrationEndDate
            ? new Date(data.registrationEndDate)
            : data.registrationExpiryDate
                ? new Date(data.registrationExpiryDate)
                : new Date(registrationDate.getFullYear(), registrationDate.getMonth() + 1, registrationDate.getDate());
        const feeAmount = await this.resolveFeeAmount(data.classId, data.subjectId, data.feeAmount);
        const studentEmail = String(data.loginEmail || '').trim().toLowerCase() || `${studentId.toLowerCase()}@student.nokta.academy`;
        const existingStudentLogin = await User_1.User.findOne({ email: studentEmail, isDeleted: false }).lean();
        if (existingStudentLogin) {
            throw new Error('Student login email already exists');
        }
        const student = await Student_1.Student.create({
            rollNo,
            studentId,
            branchId: data.branchId ?? null,
            firstName: data.firstName,
            lastName: data.lastName,
            fatherName: data.fatherName,
            familyPhone,
            whatsapp: data.whatsapp ?? '',
            familyEmail: family.guardianEmail,
            loginEmail: studentEmail,
            profileImage: data.profileImage ?? '',
            gender: data.gender,
            registrationDate,
            registrationStartDate: registrationDate,
            registrationEndDate: registrationExpiryDate,
            registrationExpiryDate,
            accountStatus: 'active',
            classId: data.classId,
            subjectId: data.subjectId,
            teacherId: data.teacherId,
            feeAmount,
            paidAmount: data.paidAmount || 0,
            remainingBalance: feeAmount - (data.paidAmount || 0),
            familyId: family._id,
            parentProfileId: parentProfile._id
        });
        const studentUser = await User_1.User.create({
            name: `${data.firstName} ${data.lastName}`.trim(),
            email: studentEmail,
            phone: familyPhone,
            password: await (0, password_1.hashPassword)(data.loginPassword || `Student@${studentId}!`),
            role: 'student',
            studentId,
            profileImage: data.profileImage ?? '',
            classId: data.classId,
            subjectId: data.subjectId,
            assignedTeacherId: data.teacherId,
            whatsapp: data.whatsapp ?? '',
            feeAmount,
            paidAmount: data.paidAmount || 0,
            remainingBalance: feeAmount - (data.paidAmount || 0),
            branchId: data.branchId ?? null,
            familyId: family._id,
            parentProfileId: parentProfile._id,
            gender: data.gender,
            fatherName: data.fatherName,
            mustChangePassword: true
        });
        await Promise.all([
            Family_1.Family.findByIdAndUpdate(family._id, { $addToSet: { students: student._id } }),
            Parent_1.ParentProfile.findByIdAndUpdate(parentProfile._id, { $addToSet: { linkedStudentIds: student._id } }),
            FamilyLink_1.FamilyLink.findOneAndUpdate({ parentId: parentProfile._id, studentId: student._id }, { parentId: parentProfile._id, studentId: student._id, relationType: 'guardian', isPrimary: true }, { upsert: true, new: true, setDefaultsOnInsert: true }),
            Enrollment_1.Enrollment.create({
                studentId: student._id,
                classId: data.classId,
                subjectId: data.subjectId,
                teacherId: data.teacherId,
                branchId: data.branchId ?? null,
                academicYear: `${registrationDate.getFullYear()}`,
                status: 'active',
                enrolledAt: registrationDate,
                registrationExpiryDate
            }),
            User_1.User.findByIdAndUpdate(familyUser._id, { parentProfileId: parentProfile._id, familyId: family._id }),
            User_1.User.findByIdAndUpdate(studentUser._id, { familyId: family._id, parentProfileId: parentProfile._id })
        ]);
        const teacher = await User_1.User.findById(data.teacherId);
        if (!teacher) {
            throw new Error('Teacher not found');
        }
        const initialPaidAmount = Number(data.paidAmount || 0);
        if (initialPaidAmount > 0) {
            const initialPayment = await Payment_1.Payment.create({
                studentId: student._id,
                branchId: data.branchId ?? null,
                amount: initialPaidAmount,
                status: 'completed',
                currency: 'AFN',
                method: 'cash',
                referenceNumber: `REG-${String(student._id).slice(-8).toUpperCase()}`,
                notes: 'Initial registration payment',
                paymentDate: registrationDate,
                collectedBy: data.createdBy ?? null
            });
            await teacherCompensationService_1.teacherCompensationService.recordPaymentCommission({
                payment: initialPayment,
                student,
                teacher,
                createdBy: data.createdBy ?? null
            });
        }
        await User_1.User.findByIdAndUpdate(data.teacherId, {
            $inc: { totalStudents: 1 }
        });
        await this.audit(data.createdBy, 'STUDENT_CREATED', student, { classId: data.classId, subjectId: data.subjectId, teacherId: data.teacherId });
        return student;
    }
    async generateStudentRollNo() {
        const count = await Student_1.Student.countDocuments();
        let rollNo = `STD-${count + 1}`;
        let attempt = 1;
        while (await Student_1.Student.exists({ rollNo })) {
            rollNo = `STD-${count + 1 + attempt}`;
            attempt += 1;
        }
        return rollNo;
    }
    generateStudentId() {
        return `S${Date.now().toString().slice(-6)}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    }
    async getStudentsByFamily(familyId) {
        return Student_1.Student.find({ familyId, isDeleted: false })
            .populate('classId', 'className name classCode')
            .populate('subjectId', 'title code')
            .populate('teacherId', 'name email');
    }
    async getStudentsByTeacher(teacherId) {
        return Student_1.Student.find({ teacherId, isDeleted: false })
            .populate('classId', 'className name classCode')
            .populate('subjectId', 'title code')
            .populate('teacherId', 'name email');
    }
    async updateStudent(id, data) {
        const student = await Student_1.Student.findById(id);
        if (!student) {
            return null;
        }
        if (data.classId !== undefined || data.subjectId !== undefined || data.teacherId !== undefined || data.gender !== undefined) {
            const nextClassId = String(data.classId ?? student.classId);
            const nextSubjectId = String(data.subjectId ?? student.subjectId);
            const nextTeacherId = String(data.teacherId ?? student.teacherId);
            const nextGender = String(data.gender ?? student.gender);
            await this.assertEnrollmentLinksMatch({
                classId: nextClassId,
                subjectId: nextSubjectId,
                teacherId: nextTeacherId
            });
            await this.businessRuleService.assertStudentGenderMatchesClass(nextGender, nextClassId);
            await this.businessRuleService.assertTeacherGenderMatchesClass(nextTeacherId, nextClassId);
        }
        const updatedData = { ...data };
        const nextLoginEmail = String(data.loginEmail || '').trim().toLowerCase();
        const nextLoginPassword = String(data.loginPassword || '').trim();
        delete updatedData.loginPassword;
        if (data.registrationStartDate) {
            updatedData.registrationStartDate = new Date(data.registrationStartDate);
            updatedData.registrationDate = new Date(data.registrationStartDate);
        }
        if (data.registrationEndDate) {
            updatedData.registrationEndDate = new Date(data.registrationEndDate);
            updatedData.registrationExpiryDate = new Date(data.registrationEndDate);
        }
        if (data.feeAmount === undefined && (data.classId !== undefined || data.subjectId !== undefined)) {
            const fee = await this.resolveFeeAmount(String(data.classId ?? student.classId), String(data.subjectId ?? student.subjectId), null);
            updatedData.feeAmount = fee;
            updatedData.remainingBalance = fee - Number(data.paidAmount ?? student.paidAmount ?? 0);
        }
        if (data.feeAmount !== undefined || data.paidAmount !== undefined) {
            const fee = data.feeAmount !== undefined ? data.feeAmount : student.feeAmount;
            const paid = data.paidAmount !== undefined ? data.paidAmount : student.paidAmount;
            updatedData.remainingBalance = fee - paid;
        }
        const updatedStudent = await Student_1.Student.findByIdAndUpdate(id, updatedData, { new: true, runValidators: true });
        if (!updatedStudent) {
            return null;
        }
        await User_1.User.findOneAndUpdate({ studentId: updatedStudent.studentId, role: 'student', isDeleted: false }, {
            $set: {
                name: `${updatedStudent.firstName} ${updatedStudent.lastName}`.trim(),
                firstName: updatedStudent.firstName,
                lastName: updatedStudent.lastName,
                ...(nextLoginEmail ? { email: nextLoginEmail } : {}),
                ...(nextLoginPassword ? { password: await (0, password_1.hashPassword)(nextLoginPassword), mustChangePassword: true } : {}),
                phone: updatedStudent.familyPhone,
                whatsapp: updatedStudent.whatsapp ?? '',
                profileImage: updatedStudent.profileImage ?? '',
                classId: updatedStudent.classId,
                subjectId: updatedStudent.subjectId,
                assignedTeacherId: updatedStudent.teacherId,
                feeAmount: updatedStudent.feeAmount,
                paidAmount: updatedStudent.paidAmount,
                remainingBalance: updatedStudent.remainingBalance,
                branchId: updatedStudent.branchId ?? null,
                familyId: updatedStudent.familyId,
                parentProfileId: updatedStudent.parentProfileId ?? null,
                gender: updatedStudent.gender,
                fatherName: updatedStudent.fatherName,
                status: updatedStudent.status === 'graduated' ? 'inactive' : updatedStudent.status,
                active: updatedStudent.status === 'active'
            }
        });
        await Promise.all([
            updatedStudent.familyId
                ? Family_1.Family.findByIdAndUpdate(updatedStudent.familyId, {
                    guardianName: updatedStudent.fatherName,
                    guardianPhone: updatedStudent.familyPhone,
                    guardianEmail: updatedStudent.familyEmail
                })
                : Promise.resolve(),
            updatedStudent.parentProfileId
                ? Parent_1.ParentProfile.findByIdAndUpdate(updatedStudent.parentProfileId, {
                    guardianName: updatedStudent.fatherName,
                    guardianPhone: updatedStudent.familyPhone,
                    guardianEmail: updatedStudent.familyEmail,
                    branchId: updatedStudent.branchId ?? null
                })
                : Promise.resolve(),
            User_1.User.findOneAndUpdate({ familyId: updatedStudent.familyId, role: 'parent', isDeleted: false }, {
                $set: {
                    name: updatedStudent.fatherName,
                    phone: updatedStudent.familyPhone,
                    branchId: updatedStudent.branchId ?? null,
                    familyId: updatedStudent.familyId,
                    parentProfileId: updatedStudent.parentProfileId ?? null
                }
            })
        ]);
        await Enrollment_1.Enrollment.updateMany({ studentId: updatedStudent._id, isDeleted: false }, {
            $set: {
                classId: updatedStudent.classId,
                subjectId: updatedStudent.subjectId,
                teacherId: updatedStudent.teacherId,
                branchId: updatedStudent.branchId ?? null,
                registrationExpiryDate: updatedStudent.registrationExpiryDate ?? null
            }
        });
        await this.audit(data.updatedBy, 'STUDENT_UPDATED', updatedStudent, { fields: Object.keys(data) });
        return updatedStudent;
    }
    async renewRegistration(id, data) {
        const student = await Student_1.Student.findOne({ _id: id, isDeleted: false });
        if (!student)
            return null;
        const start = new Date(data.registrationStartDate);
        const end = new Date(data.registrationEndDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
            throw new Error('Registration end date must be after start date');
        }
        student.registrationStartDate = start;
        student.registrationDate = start;
        student.registrationEndDate = end;
        student.registrationExpiryDate = end;
        student.accountStatus = 'active';
        student.warningSentAt = null;
        student.blockedAt = null;
        student.status = 'active';
        if (data.feeAmount !== undefined)
            student.feeAmount = data.feeAmount;
        if (data.paidAmount !== undefined)
            student.paidAmount = data.paidAmount;
        await student.save();
        await Promise.all([
            User_1.User.updateOne({ studentId: student.studentId, role: 'student', isDeleted: false }, {
                $set: {
                    status: 'active',
                    active: true,
                    feeAmount: student.feeAmount,
                    paidAmount: student.paidAmount,
                    remainingBalance: student.remainingBalance
                }
            }),
            Enrollment_1.Enrollment.updateMany({ studentId: student._id, isDeleted: false }, { $set: { status: 'active', registrationExpiryDate: end } }),
            Notification_1.Notification.create({
                branchId: student.branchId ?? null,
                title: 'Registration renewed',
                description: 'Your registration has been renewed successfully.',
                message: 'Your registration has been renewed successfully.',
                recipientRoles: ['student', 'parent'],
                recipientIds: [],
                publishStatus: 'published',
                publishDate: new Date(),
                category: 'academic_reminder',
                metadata: { studentId: student._id, registrationEndDate: end }
            })
        ]);
        await this.audit(data.actorId, 'STUDENT_REGISTRATION_RENEWED', student, { registrationStartDate: start, registrationEndDate: end });
        return student;
    }
    async setBlockStatus(id, blocked, actorId) {
        const student = await Student_1.Student.findOne({ _id: id, isDeleted: false });
        if (!student)
            return null;
        student.accountStatus = blocked ? 'blocked' : 'active';
        student.blockedAt = blocked ? new Date() : null;
        student.status = blocked ? 'inactive' : 'active';
        await student.save();
        await User_1.User.updateOne({ studentId: student.studentId, role: 'student', isDeleted: false }, { $set: { status: blocked ? 'blocked' : 'active', active: !blocked } });
        await this.audit(actorId, blocked ? 'STUDENT_ACCOUNT_BLOCKED' : 'STUDENT_ACCOUNT_UNBLOCKED', student);
        return student;
    }
    async deleteStudent(id, actorId) {
        const student = await Student_1.Student.findOne({ _id: id, isDeleted: false });
        if (!student) {
            return null;
        }
        const deletedAt = new Date();
        await Student_1.Student.updateOne({ _id: student._id }, {
            $set: {
                isDeleted: true,
                deletedAt,
                deletedBy: actorId ?? null,
                status: 'inactive'
            }
        });
        await User_1.User.updateOne({ studentId: student.studentId, role: 'student', isDeleted: false }, {
            $set: {
                isDeleted: true,
                deletedAt,
                deletedBy: actorId ?? null,
                active: false,
                status: 'inactive'
            }
        });
        await Enrollment_1.Enrollment.updateMany({ studentId: student._id, isDeleted: false }, {
            $set: {
                isDeleted: true,
                deletedAt,
                deletedBy: actorId ?? null,
                status: 'cancelled'
            }
        });
        await FamilyLink_1.FamilyLink.updateMany({ studentId: student._id, isDeleted: false }, {
            $set: {
                isDeleted: true,
                deletedAt,
                deletedBy: actorId ?? null
            }
        });
        return student;
    }
}
exports.StudentService = StudentService;
