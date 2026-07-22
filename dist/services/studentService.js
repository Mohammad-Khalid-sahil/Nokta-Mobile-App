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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Family_1 = require("../models/Family");
const FamilyLink_1 = require("../models/FamilyLink");
const Enrollment_1 = require("../models/Enrollment");
const Parent_1 = require("../models/Parent");
const Payment_1 = require("../models/Payment");
const Student_1 = require("../models/Student");
const Subject_1 = require("../models/Subject");
const User_1 = require("../models/User");
const Class_1 = require("../models/Class");
const Branch_1 = require("../models/Branch");
const Notification_1 = require("../models/Notification");
const AuditLog_1 = require("../models/AuditLog");
const businessRuleService_1 = require("./businessRuleService");
const teacherCompensationService_1 = require("./teacherCompensationService");
const password_1 = require("../utils/password");
class StudentService {
    constructor() {
        this.businessRuleService = new businessRuleService_1.BusinessRuleService();
    }
    async assertEnrollmentLinksMatch(payload, session) {
        const [klass, subject, teacher] = await Promise.all([
            Class_1.ClassModel.findOne({ _id: payload.classId, isDeleted: false }).select('assignedSubjects branchId').session(session ?? null).lean(),
            Subject_1.Subject.findOne({ _id: payload.subjectId, isDeleted: false }).session(session ?? null).lean(),
            User_1.User.findOne({ _id: payload.teacherId, role: 'teacher', isDeleted: false }).session(session ?? null).lean()
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
    async resolveFeeAmount(classId, subjectId, override, session) {
        if (override !== undefined && override !== null)
            return Number(override);
        const [klass, subject] = await Promise.all([
            Class_1.ClassModel.findById(classId).select('feeAmount').session(session ?? null).lean(),
            Subject_1.Subject.findById(subjectId).select('feeAmount').session(session ?? null).lean()
        ]);
        const { calculateEnrollmentFee } = await Promise.resolve().then(() => __importStar(require('../utils/feeCalculator')));
        return calculateEnrollmentFee(klass?.feeAmount, subject?.feeAmount).totalFee;
    }
    async audit(actorId, action, student, metadata = {}, session) {
        const actor = actorId ?? (await User_1.User.findOne({ role: { $in: ['system_automation', 'super_admin'] }, isDeleted: false }).select('_id').session(session ?? null).lean())?._id;
        if (!actor)
            return;
        await AuditLog_1.AuditLog.create([{
                actor,
                branchId: student?.branchId ?? null,
                action,
                target: String(student?._id ?? ''),
                targetType: 'student',
                metadata,
                severity: action.includes('BLOCK') ? 'critical' : 'info'
            }], { session });
    }
    async registerStudent(data) {
        if (!data.firstName || !data.lastName || !data.fatherName) {
            throw new Error('Student first name, last name, and father name are required');
        }
        if (!data.classId || !data.subjectId || !data.teacherId) {
            throw new Error('classId, subjectId, and teacherId are required');
        }
        if (!data.gender) {
            throw new Error('Student gender is required');
        }
        let session = await mongoose_1.default.startSession();
        try {
            let createdStudent = null;
            const runRegistration = async () => {
                const activeSession = session;
                const writeSession = activeSession ?? undefined;
                const studentId = this.generateStudentId();
                const rollNo = data.rollNo || await this.generateStudentRollNo(writeSession);
                const studentPhone = String(data.phone ?? data.whatsapp ?? data.familyPhone ?? '').trim();
                const familyPhone = String(data.familyPhone ?? data.phone ?? '').trim();
                const studentEmail = String(data.loginEmail || '').trim().toLowerCase() || `${studentId.toLowerCase()}@student.nokta.academy`;
                const nationalId = String(data.nationalId || '').trim();
                await this.assertNoDuplicateStudent({
                    phone: studentPhone,
                    email: studentEmail,
                    nationalId
                }, writeSession);
                const [klass, subject, teacher] = await Promise.all([
                    Class_1.ClassModel.findOne({ _id: data.classId, active: true, isDeleted: false, registrationOpen: { $ne: false } }).session(activeSession).lean(),
                    Subject_1.Subject.findOne({ _id: data.subjectId, isDeleted: false }).session(activeSession).lean(),
                    User_1.User.findOne({ _id: data.teacherId, role: 'teacher', isDeleted: false }).session(activeSession).lean()
                ]);
                if (!klass)
                    throw new Error('Selected class is not open for registration');
                if (!subject)
                    throw new Error('Selected subject does not exist');
                if (!teacher)
                    throw new Error('Selected teacher does not exist');
                const effectiveBranchId = String(data.branchId || klass.branchId || subject.branchId || teacher.branchId || '').trim() || null;
                if (effectiveBranchId) {
                    const branch = await Branch_1.Branch.findOne({ _id: effectiveBranchId, active: true, isDeleted: false }).session(activeSession).lean();
                    if (!branch)
                        throw new Error('Selected branch does not exist or is inactive');
                    const relationBranchIds = [klass.branchId, subject.branchId, teacher.branchId].map((id) => String(id || '')).filter(Boolean);
                    if (relationBranchIds.some((id) => id !== effectiveBranchId)) {
                        throw new Error('Selected class, subject, teacher, and branch must belong to the same branch');
                    }
                }
                else if (data.branchId) {
                    throw new Error('Selected branch does not exist or is inactive');
                }
                const capacity = Number(klass.capacity ?? 0);
                if (capacity > 0) {
                    const activeClassStudents = await Student_1.Student.countDocuments({
                        classId: data.classId,
                        isDeleted: false,
                        status: { $in: ['active', 'suspended'] }
                    }).session(activeSession);
                    if (activeClassStudents >= capacity) {
                        throw new Error('Selected class is full');
                    }
                }
                await this.assertEnrollmentLinksMatch({
                    classId: data.classId,
                    subjectId: data.subjectId,
                    teacherId: data.teacherId
                }, writeSession);
                await this.businessRuleService.assertStudentGenderMatchesClass(data.gender, data.classId);
                await this.businessRuleService.assertTeacherGenderMatchesClass(data.teacherId, data.classId);
                let family = familyPhone ? await Family_1.Family.findOne({ guardianPhone: familyPhone }).session(activeSession) : null;
                let familyUser = null;
                if (!family) {
                    const normalizedFatherName = String(data.fatherName || 'parent').toLowerCase().replace(/[^a-z0-9]/g, '') || 'parent';
                    let familyEmail = `${normalizedFatherName}@nokta.academy`;
                    let suffix = 1;
                    while (await User_1.User.findOne({ email: familyEmail }).session(activeSession)) {
                        familyEmail = `${normalizedFatherName}${suffix}@nokta.academy`;
                        suffix += 1;
                    }
                    [family] = await Family_1.Family.create([{
                            guardianName: data.fatherName,
                            guardianEmail: familyEmail,
                            guardianPhone: familyPhone,
                            students: []
                        }], { session: writeSession });
                    [familyUser] = await User_1.User.create([{
                            name: data.fatherName,
                            email: familyEmail,
                            phone: familyPhone,
                            password: await (0, password_1.hashPassword)(`Parent@${String(familyPhone || data.fatherName).slice(-8)}!`),
                            role: 'parent',
                            familyId: family._id,
                            branchId: effectiveBranchId,
                            mustChangePassword: true
                        }], { session: writeSession });
                }
                else {
                    familyUser = await User_1.User.findOne({ email: family.guardianEmail }).session(activeSession);
                    if (!familyUser) {
                        [familyUser] = await User_1.User.create([{
                                name: family.guardianName,
                                email: family.guardianEmail,
                                phone: family.guardianPhone,
                                password: await (0, password_1.hashPassword)(`Parent@${String(family.guardianPhone).slice(-8)}!`),
                                role: 'parent',
                                familyId: family._id,
                                branchId: effectiveBranchId,
                                mustChangePassword: true
                            }], { session: writeSession });
                    }
                }
                let parentProfile = await Parent_1.ParentProfile.findOne({ userId: familyUser._id }).session(activeSession);
                if (!parentProfile) {
                    [parentProfile] = await Parent_1.ParentProfile.create([{
                            userId: familyUser._id,
                            branchId: effectiveBranchId,
                            guardianName: data.fatherName,
                            guardianPhone: familyPhone,
                            guardianEmail: family.guardianEmail,
                            relationType: 'guardian',
                            linkedStudentIds: []
                        }], { session: writeSession });
                }
                const registrationDate = data.registrationStartDate ? new Date(data.registrationStartDate) : (data.registrationDate ? new Date(data.registrationDate) : new Date());
                const registrationExpiryDate = data.registrationEndDate
                    ? new Date(data.registrationEndDate)
                    : data.registrationExpiryDate
                        ? new Date(data.registrationExpiryDate)
                        : new Date(registrationDate.getFullYear(), registrationDate.getMonth() + 1, registrationDate.getDate());
                const feeAmount = await this.resolveFeeAmount(data.classId, data.subjectId, data.feeAmount, writeSession);
                const paidAmount = Number(data.paidAmount || 0);
                const [student] = await Student_1.Student.create([{
                        rollNo,
                        studentId,
                        branchId: effectiveBranchId,
                        firstName: data.firstName,
                        lastName: data.lastName,
                        fatherName: data.fatherName,
                        nationalId,
                        familyPhone,
                        whatsapp: data.whatsapp ?? studentPhone,
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
                        paidAmount,
                        remainingBalance: feeAmount - paidAmount,
                        familyId: family._id,
                        parentProfileId: parentProfile._id
                    }], { session: writeSession });
                const [studentUser] = await User_1.User.create([{
                        name: `${data.firstName} ${data.lastName}`.trim(),
                        email: studentEmail,
                        phone: studentPhone || familyPhone,
                        password: await (0, password_1.hashPassword)(data.loginPassword || `Student@${studentId}!`),
                        role: 'student',
                        studentId,
                        nationalId,
                        profileImage: data.profileImage ?? '',
                        classId: data.classId,
                        subjectId: data.subjectId,
                        assignedTeacherId: data.teacherId,
                        whatsapp: data.whatsapp ?? '',
                        feeAmount,
                        paidAmount,
                        remainingBalance: feeAmount - paidAmount,
                        branchId: effectiveBranchId,
                        familyId: family._id,
                        parentProfileId: parentProfile._id,
                        gender: data.gender,
                        fatherName: data.fatherName,
                        mustChangePassword: true
                    }], { session: writeSession });
                await Promise.all([
                    Family_1.Family.findByIdAndUpdate(family._id, { $addToSet: { students: student._id } }, { session: writeSession }),
                    Parent_1.ParentProfile.findByIdAndUpdate(parentProfile._id, { $addToSet: { linkedStudentIds: student._id } }, { session: writeSession }),
                    FamilyLink_1.FamilyLink.findOneAndUpdate({ parentId: parentProfile._id, studentId: student._id }, { parentId: parentProfile._id, studentId: student._id, relationType: 'guardian', isPrimary: true }, { upsert: true, new: true, setDefaultsOnInsert: true, session: writeSession }),
                    Enrollment_1.Enrollment.create([{
                            studentId: student._id,
                            classId: data.classId,
                            subjectId: data.subjectId,
                            teacherId: data.teacherId,
                            branchId: effectiveBranchId,
                            academicYear: `${registrationDate.getFullYear()}`,
                            status: 'active',
                            enrolledAt: registrationDate,
                            registrationExpiryDate
                        }], { session: writeSession }),
                    User_1.User.findByIdAndUpdate(familyUser._id, { parentProfileId: parentProfile._id, familyId: family._id }, { session: writeSession }),
                    User_1.User.findByIdAndUpdate(studentUser._id, { familyId: family._id, parentProfileId: parentProfile._id }, { session: writeSession }),
                    Class_1.ClassModel.findByIdAndUpdate(data.classId, { $inc: { studentCount: 1 } }, { session: writeSession })
                ]);
                if (paidAmount > 0) {
                    const [initialPayment] = await Payment_1.Payment.create([{
                            studentId: student._id,
                            branchId: effectiveBranchId,
                            amount: paidAmount,
                            status: 'completed',
                            currency: 'AFN',
                            method: 'cash',
                            referenceNumber: `REG-${String(student._id).slice(-8).toUpperCase()}`,
                            notes: 'Initial registration payment',
                            paymentDate: registrationDate,
                            collectedBy: data.createdBy ?? null
                        }], { session: writeSession });
                    await teacherCompensationService_1.teacherCompensationService.recordPaymentCommission({
                        payment: initialPayment,
                        student,
                        teacher,
                        createdBy: data.createdBy ?? null,
                        session: writeSession
                    });
                }
                await User_1.User.findByIdAndUpdate(data.teacherId, {
                    $inc: { totalStudents: 1 }
                }, { session: writeSession });
                await this.audit(data.createdBy, 'STUDENT_CREATED', student, { classId: data.classId, subjectId: data.subjectId, teacherId: data.teacherId }, writeSession);
                createdStudent = student;
            };
            try {
                await session.withTransaction(runRegistration);
            }
            catch (error) {
                if (!this.isTransactionUnsupported(error)) {
                    throw error;
                }
                await session.endSession();
                session = null;
                createdStudent = null;
                await runRegistration();
            }
            return createdStudent;
        }
        finally {
            await session?.endSession();
        }
    }
    isTransactionUnsupported(error) {
        const message = String(error?.message || error || '');
        return /Transaction numbers are only allowed on a replica set member or mongos/i.test(message);
    }
    async generateStudentRollNo(session) {
        const count = await Student_1.Student.countDocuments().session(session ?? null);
        let rollNo = `STD-${count + 1}`;
        let attempt = 1;
        while (await Student_1.Student.exists({ rollNo }).session(session ?? null)) {
            rollNo = `STD-${count + 1 + attempt}`;
            attempt += 1;
        }
        return rollNo;
    }
    async assertNoDuplicateStudent(input, session) {
        const duplicateFilters = [];
        if (input.phone) {
            duplicateFilters.push({ familyPhone: input.phone }, { whatsapp: input.phone }, { phone: input.phone });
        }
        if (input.email) {
            duplicateFilters.push({ loginEmail: input.email }, { email: input.email });
        }
        if (input.nationalId) {
            duplicateFilters.push({ nationalId: input.nationalId });
        }
        if (!duplicateFilters.length)
            return;
        const [student, account] = await Promise.all([
            Student_1.Student.findOne({ isDeleted: false, $or: duplicateFilters }).select('_id familyPhone whatsapp loginEmail nationalId').session(session ?? null).lean(),
            User_1.User.findOne({ isDeleted: false, $or: duplicateFilters }).select('_id email phone whatsapp nationalId role').session(session ?? null).lean()
        ]);
        if (student) {
            if (input.nationalId && String(student.nationalId || '') === input.nationalId) {
                throw new Error('Student with this national ID already exists');
            }
            if (input.email && String(student.loginEmail || '').toLowerCase() === input.email) {
                throw new Error('Student with this email already exists');
            }
            throw new Error('Student with this phone already exists');
        }
        if (account) {
            if (input.nationalId && String(account.nationalId || '') === input.nationalId) {
                throw new Error('Account with this national ID already exists');
            }
            if (input.email && String(account.email || '').toLowerCase() === input.email) {
                throw new Error('Account with this email already exists');
            }
            throw new Error('Account with this phone already exists');
        }
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
        const nextStudentPhone = String(data.phone ?? data.whatsapp ?? '').trim();
        delete updatedData.loginPassword;
        delete updatedData.phone;
        if (nextStudentPhone && data.whatsapp === undefined) {
            updatedData.whatsapp = nextStudentPhone;
        }
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
                nationalId: updatedStudent.nationalId ?? '',
                phone: nextStudentPhone || updatedStudent.whatsapp || updatedStudent.familyPhone,
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
        await Promise.all([
            student.classId
                ? Class_1.ClassModel.updateOne({ _id: student.classId, studentCount: { $gt: 0 } }, { $inc: { studentCount: -1 } })
                : Promise.resolve(),
            student.teacherId
                ? User_1.User.updateOne({ _id: student.teacherId, totalStudents: { $gt: 0 } }, { $inc: { totalStudents: -1 } })
                : Promise.resolve()
        ]);
        return student;
    }
}
exports.StudentService = StudentService;
