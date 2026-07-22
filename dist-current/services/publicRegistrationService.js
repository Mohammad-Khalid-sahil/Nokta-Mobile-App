"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublicRegistrationService = void 0;
const Class_1 = require("../models/Class");
const crypto_1 = require("crypto");
const Subject_1 = require("../models/Subject");
const Student_1 = require("../models/Student");
const User_1 = require("../models/User");
const Family_1 = require("../models/Family");
const FamilyLink_1 = require("../models/FamilyLink");
const Parent_1 = require("../models/Parent");
const Enrollment_1 = require("../models/Enrollment");
const Payment_1 = require("../models/Payment");
const teacherCompensationService_1 = require("./teacherCompensationService");
const Notification_1 = require("../models/Notification");
const password_1 = require("../utils/password");
const businessRuleService_1 = require("./businessRuleService");
const registrationCheckoutService_1 = require("./registrationCheckoutService");
const paymentProviderService_1 = require("./paymentProviderService");
const inputSecurity_1 = require("../utils/inputSecurity");
const timetableValidationService_1 = require("./timetableValidationService");
const emailService_1 = require("./emailService");
const businessRuleService = new businessRuleService_1.BusinessRuleService();
function generateStudentId() {
    return `S${Date.now().toString().slice(-6)}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}
async function generateStudentRollNo() {
    const count = await Student_1.Student.countDocuments();
    return `STD-${count + 1}`;
}
function buildRegistrationInvoiceNumber() {
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    const entropy = `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
    return `INV-REG-${stamp}-${entropy}`;
}
async function generateRegistrationInvoiceNumber() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = buildRegistrationInvoiceNumber();
        const exists = await Payment_1.Payment.findOne({ invoiceNumber: candidate }).select('_id').lean();
        if (!exists)
            return candidate;
    }
    throw new Error('Unable to generate registration invoice number');
}
function generateParentPassword() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let body = '';
    for (let index = 0; index < 10; index += 1) {
        body += alphabet[(0, crypto_1.randomInt)(0, alphabet.length)];
    }
    return `Parent@${body}9`;
}
class PublicRegistrationService {
    async quote(input) {
        const [klass, subject, teacher] = await Promise.all([
            Class_1.ClassModel.findOne({ _id: input.classId, active: true, isDeleted: false, registrationOpen: { $ne: false } }).lean(),
            Subject_1.Subject.findOne({ _id: input.subjectId, activeStatus: true, isDeleted: false }).lean(),
            User_1.User.findOne({ _id: input.teacherId, role: 'teacher', isDeleted: false }).lean()
        ]);
        if (!klass)
            throw new Error('Selected class is not open for registration');
        if (!subject)
            throw new Error('Selected subject is not available');
        if (!teacher)
            throw new Error('Selected teacher is not available');
        if (!(0, timetableValidationService_1.subjectBelongsToClass)(subject, klass)) {
            throw new Error('Selected subject does not belong to the chosen class');
        }
        if (!(0, timetableValidationService_1.teacherCanTeachClassSubject)(teacher, klass, subject)) {
            throw new Error('Selected teacher is not assigned to the chosen class and subject');
        }
        const pricing = (0, registrationCheckoutService_1.buildFeeBreakdown)(klass, subject);
        return {
            className: klass.className ?? klass.name,
            subjectName: subject.title,
            teacherName: teacher.name,
            pricing
        };
    }
    async createCheckout(input) {
        const pricing = (await this.quote(input)).pricing;
        const checkoutToken = (0, registrationCheckoutService_1.createRegistrationCheckoutToken)({
            email: input.email.toLowerCase(),
            classId: input.classId,
            subjectId: input.subjectId,
            teacherId: input.teacherId,
            ...pricing
        });
        const paymentConfig = paymentProviderService_1.paymentProviderService.getStatus();
        return {
            checkoutToken,
            pricing,
            paymentRequired: pricing.totalFee > 0,
            paymentProvider: paymentConfig.provider,
            paymentMode: paymentConfig.mode,
            liveReady: paymentConfig.liveReady
        };
    }
    async confirmCheckoutPayment(input) {
        const selection = await this.quote({
            classId: input.classId,
            subjectId: input.subjectId,
            teacherId: input.teacherId
        });
        const fee = selection.pricing;
        (0, registrationCheckoutService_1.verifyRegistrationCheckoutToken)(input.checkoutToken, {
            email: input.email.toLowerCase(),
            classId: input.classId,
            subjectId: input.subjectId,
            teacherId: input.teacherId,
            totalFee: fee.totalFee
        });
        const verification = await paymentProviderService_1.paymentProviderService.verifyRegistrationPayment({
            paymentReference: input.paymentReference,
            paymentMethod: input.paymentMethod,
            amount: fee.totalFee,
            currency: 'AFN',
            email: input.email.toLowerCase(),
            checkoutToken: input.checkoutToken
        });
        if (!verification.verified) {
            throw new Error(verification.message || 'Payment could not be verified');
        }
        const boundToken = (0, registrationCheckoutService_1.bindPaymentReferenceToCheckoutToken)(input.checkoutToken, input.paymentReference);
        return {
            checkoutToken: boundToken,
            verification,
            pricing: fee
        };
    }
    async registerStudent(input) {
        const email = input.email.toLowerCase();
        const parentEmail = input.parentEmail.toLowerCase();
        const parentPhone = (0, inputSecurity_1.sanitizePlainText)(input.parentPhone, 40);
        const fatherName = (0, inputSecurity_1.sanitizePlainText)(input.fatherName, 120);
        const [existingEmail, existingParentEmail, klass, subject, teacher] = await Promise.all([
            User_1.User.findOne({ email, isDeleted: false }).lean(),
            User_1.User.findOne({ email: parentEmail, isDeleted: false }).lean(),
            Class_1.ClassModel.findOne({ _id: input.classId, active: true, isDeleted: false, registrationOpen: { $ne: false } }).lean(),
            Subject_1.Subject.findOne({ _id: input.subjectId, activeStatus: true, isDeleted: false }).lean(),
            User_1.User.findOne({ _id: input.teacherId, role: 'teacher', isDeleted: false }).lean()
        ]);
        if (existingEmail)
            throw new Error('Email already exists');
        if (parentEmail === email) {
            throw new Error('Parent email must be different from student email');
        }
        if (existingParentEmail && existingParentEmail.role !== 'parent') {
            throw new Error('Parent email already belongs to another account role');
        }
        if (!klass)
            throw new Error('Selected class does not exist');
        if (!subject)
            throw new Error('Selected subject does not exist');
        if (!teacher)
            throw new Error('Selected teacher does not exist');
        if (!(0, timetableValidationService_1.subjectBelongsToClass)(subject, klass)) {
            throw new Error('Selected subject does not belong to the chosen class');
        }
        if (!(0, timetableValidationService_1.teacherCanTeachClassSubject)(teacher, klass, subject)) {
            throw new Error('Selected teacher is not assigned to the chosen class and subject');
        }
        await businessRuleService.assertStudentGenderMatchesClass(input.gender, input.classId);
        await businessRuleService.assertTeacherGenderMatchesClass(input.teacherId, input.classId);
        const pricing = (0, registrationCheckoutService_1.buildFeeBreakdown)(klass, subject);
        if (pricing.totalFee > 0) {
            if (!input.checkoutToken) {
                throw new Error('Payment confirmation is required before account activation');
            }
            const paymentReference = (0, inputSecurity_1.sanitizePlainText)(input.paymentReference, 120);
            if (!paymentReference) {
                throw new Error('Payment reference is required');
            }
            (0, registrationCheckoutService_1.verifyRegistrationCheckoutToken)(input.checkoutToken, {
                email,
                classId: input.classId,
                subjectId: input.subjectId,
                teacherId: input.teacherId,
                totalFee: pricing.totalFee,
                paymentReference
            });
            const verification = await paymentProviderService_1.paymentProviderService.verifyRegistrationPayment({
                paymentReference,
                paymentMethod: input.paymentMethod,
                amount: pricing.totalFee,
                currency: 'AFN',
                email,
                checkoutToken: input.checkoutToken
            });
            if (!verification.verified) {
                throw new Error(verification.message || 'Payment could not be verified');
            }
        }
        let family = await Family_1.Family.findOne({ guardianEmail: parentEmail });
        if (!family) {
            family = await Family_1.Family.create({
                guardianName: fatherName,
                guardianEmail: parentEmail,
                guardianPhone: parentPhone,
                students: []
            });
        }
        else {
            family.guardianName = fatherName || family.guardianName;
            family.guardianPhone = parentPhone || family.guardianPhone;
            await family.save();
        }
        const parentPassword = existingParentEmail ? '' : generateParentPassword();
        const parentUser = existingParentEmail ?? await User_1.User.create({
            name: fatherName,
            email: parentEmail,
            phone: parentPhone,
            whatsapp: parentPhone,
            password: await (0, password_1.hashPassword)(parentPassword),
            role: 'parent',
            branchId: klass.branchId ?? subject.branchId ?? teacher.branchId ?? null,
            familyId: family._id,
            mustChangePassword: true,
            status: 'active',
            active: true,
            emailVerifiedAt: new Date()
        });
        let parentProfile = await Parent_1.ParentProfile.findOne({
            $or: [
                { userId: parentUser._id },
                { guardianEmail: parentEmail }
            ],
            isDeleted: false
        });
        if (!parentProfile) {
            parentProfile = await Parent_1.ParentProfile.create({
                userId: parentUser._id,
                branchId: klass.branchId ?? subject.branchId ?? teacher.branchId ?? null,
                guardianName: fatherName,
                guardianPhone: parentPhone,
                guardianEmail: parentEmail,
                relationType: 'father',
                linkedStudentIds: []
            });
        }
        else {
            parentProfile.userId = parentUser._id;
            parentProfile.guardianName = fatherName || parentProfile.guardianName;
            parentProfile.guardianPhone = parentPhone || parentProfile.guardianPhone;
            parentProfile.guardianEmail = parentEmail;
            await parentProfile.save();
        }
        const studentId = generateStudentId();
        const paidAmount = pricing.totalFee > 0 ? pricing.totalFee : 0;
        const student = await Student_1.Student.create({
            rollNo: await generateStudentRollNo(),
            studentId,
            branchId: klass.branchId ?? subject.branchId ?? teacher.branchId ?? null,
            firstName: (0, inputSecurity_1.sanitizePlainText)(input.firstName, 80),
            lastName: (0, inputSecurity_1.sanitizePlainText)(input.lastName, 80),
            fatherName,
            familyPhone: parentPhone,
            familyEmail: parentEmail,
            gender: input.gender,
            classId: input.classId,
            subjectId: input.subjectId,
            teacherId: input.teacherId,
            profileImage: (0, inputSecurity_1.sanitizePlainText)(input.profileImage, 500),
            feeAmount: pricing.totalFee,
            paidAmount,
            remainingBalance: Math.max(0, pricing.totalFee - paidAmount),
            accountStatus: pricing.totalFee > 0 ? 'active' : 'active',
            familyId: family._id,
            parentProfileId: parentProfile._id
        });
        family.students = Array.from(new Set([...(family.students ?? []).map(String), String(student._id)]));
        await family.save();
        const user = await User_1.User.create({
            name: `${input.firstName} ${input.lastName}`.trim(),
            firstName: input.firstName,
            lastName: input.lastName,
            email,
            phone: input.phone,
            whatsapp: input.whatsapp || input.phone,
            password: await (0, password_1.hashPassword)(input.password),
            role: 'student',
            studentId,
            profileImage: (0, inputSecurity_1.sanitizePlainText)(input.profileImage, 500),
            classId: input.classId,
            subjectId: input.subjectId,
            assignedTeacherId: input.teacherId,
            branchId: klass.branchId ?? subject.branchId ?? teacher.branchId ?? null,
            familyId: family._id,
            parentProfileId: parentProfile._id,
            feeAmount: pricing.totalFee,
            paidAmount,
            remainingBalance: Math.max(0, pricing.totalFee - paidAmount),
            fatherName,
            gender: input.gender,
            mustChangePassword: false,
            status: 'active',
            active: true
        });
        const registrationDate = new Date();
        const enrollment = await Enrollment_1.Enrollment.create({
            studentId: student._id,
            classId: input.classId,
            subjectId: input.subjectId,
            teacherId: input.teacherId,
            branchId: klass.branchId ?? null,
            academicYear: `${registrationDate.getFullYear()}`,
            status: 'active',
            enrolledAt: registrationDate
        });
        await Promise.all([
            Parent_1.ParentProfile.findByIdAndUpdate(parentProfile._id, {
                $addToSet: { linkedStudentIds: student._id }
            }),
            User_1.User.findByIdAndUpdate(parentUser._id, {
                familyId: family._id,
                parentProfileId: parentProfile._id,
                branchId: klass.branchId ?? subject.branchId ?? teacher.branchId ?? null
            }),
            User_1.User.findByIdAndUpdate(user._id, {
                familyId: family._id,
                parentProfileId: parentProfile._id
            }),
            FamilyLink_1.FamilyLink.findOneAndUpdate({ parentId: parentProfile._id, studentId: student._id }, {
                parentId: parentProfile._id,
                studentId: student._id,
                relationType: 'father',
                isPrimary: true
            }, { upsert: true, new: true, setDefaultsOnInsert: true })
        ]);
        const parentCredentialEmail = parentPassword
            ? await emailService_1.emailService.sendParentWelcomeCredentials({
                to: parentEmail,
                parentName: fatherName,
                studentName: user.name,
                email: parentEmail,
                password: parentPassword
            }).catch((error) => ({
                delivered: false,
                channel: 'email',
                reason: error instanceof Error ? error.message : 'email_failed'
            }))
            : { delivered: false, channel: 'email', reason: 'parent_account_already_exists' };
        if (paidAmount > 0) {
            const registrationPayment = await Payment_1.Payment.create({
                studentId: student._id,
                branchId: klass.branchId ?? null,
                enrollmentId: enrollment._id,
                amount: paidAmount,
                status: 'completed',
                currency: 'AFN',
                method: input.paymentMethod || 'mobile_money',
                referenceNumber: (0, inputSecurity_1.sanitizePlainText)(input.paymentReference, 120),
                invoiceNumber: await generateRegistrationInvoiceNumber(),
                notes: 'Public online registration payment',
                collectedBy: null,
                paymentDate: registrationDate
            });
            await teacherCompensationService_1.teacherCompensationService.recordPaymentCommission({
                payment: registrationPayment,
                student,
                teacher,
                createdBy: null
            });
            await User_1.User.findByIdAndUpdate(input.teacherId, {
                $inc: { totalStudents: 1 }
            });
        }
        await Notification_1.Notification.create({
            title: 'Student registration completed',
            description: `${user.name} registered for ${klass.className ?? klass.name}`,
            message: `${user.name} completed online registration.`,
            recipientRoles: ['super_admin', 'admin', 'branch_manager'],
            publishDate: new Date(),
            active: true
        });
        return {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            studentId,
            parentAccount: {
                id: parentUser._id,
                email: parentEmail,
                role: 'parent',
                created: !existingParentEmail,
                passwordGenerated: Boolean(parentPassword),
                credentialEmail: parentCredentialEmail
            },
            pricing
        };
    }
}
exports.PublicRegistrationService = PublicRegistrationService;
