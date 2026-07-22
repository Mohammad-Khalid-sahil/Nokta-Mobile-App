"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const supportedRoles = [
    'super_admin',
    'admin',
    'teacher',
    'student',
    'parent',
    'owner',
    'branch_manager',
    'system_automation',
    'family_student',
    'family',
    'accountant',
    'librarian',
    'user'
];
const passwordHistorySchema = new mongoose_1.default.Schema({
    hash: { type: String, required: true, select: false },
    changedAt: { type: Date, default: Date.now }
}, { _id: false });
const userSchema = (0, schema_1.createBaseSchema)({
    name: { type: String, required: true, trim: true, index: true },
    username: { type: String, trim: true, lowercase: true, unique: true, sparse: true, index: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    profileImage: { type: String, trim: true, default: '' },
    password: { type: String, required: true, select: false },
    role: { type: String, required: true, enum: supportedRoles, index: true },
    status: { type: String, enum: ['active', 'inactive', 'locked', 'suspended', 'pending_verification', 'blocked', 'expired'], default: 'active', index: true },
    permissions: {
        type: Map,
        of: [String],
        default: {}
    },
    permissionKeys: [{ type: String }],
    revokedPermissionKeys: [{ type: String }],
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    familyId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Family', default: null, index: true },
    parentProfileId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Parent', default: null, index: true },
    ownerProfileId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Owner', default: null, index: true },
    teacherId: { type: String, unique: true, sparse: true },
    studentId: { type: String, unique: true, sparse: true },
    firstName: { type: String, trim: true, default: '' },
    lastName: { type: String, trim: true, default: '' },
    fatherName: { type: String, trim: true, default: '' },
    whatsapp: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    gender: { type: String, enum: ['male', 'female', 'other'], default: 'other', index: true },
    joinDate: { type: Date, default: Date.now },
    salaryType: { type: String, enum: ['fixed', 'percentage', 'fixed_plus_percentage'], default: 'fixed' },
    fixedSalary: { type: Number, default: 0 },
    percentageRate: { type: Number, default: 35 },
    customPercentage: { type: Number, default: 0 },
    walletBalance: { type: Number, default: 0 },
    totalStudents: { type: Number, default: 0 },
    totalSalaryEarned: { type: Number, default: 0 },
    assignedSubjects: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Subject' }],
    assignedClasses: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Class' }],
    classId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Class', default: null },
    subjectId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Subject', default: null },
    assignedTeacherId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null },
    feeAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    remainingBalance: { type: Number, default: 0 },
    active: { type: Boolean, default: true, index: true },
    emailVerifiedAt: { type: Date, default: null },
    phoneVerifiedAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: Date.now },
    passwordHistory: { type: [passwordHistorySchema], default: [] },
    mustChangePassword: { type: Boolean, default: true },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, trim: true, default: '' },
    loginDevices: { type: [schema_1.deviceSchema], default: [] },
    auditHistory: { type: [schema_1.auditHistorySchema], default: [] }
}, { collection: 'users' });
userSchema.pre('validate', function normalizeName(next) {
    const firstName = String(this.firstName || '').trim();
    const lastName = String(this.lastName || '').trim();
    if ((!this.name || !String(this.name).trim()) && (firstName || lastName)) {
        this.name = `${firstName} ${lastName}`.trim();
    }
    next();
});
userSchema.pre('save', function onPasswordChange(next) {
    if (this.isModified('password') && this.password) {
        this.passwordChangedAt = new Date();
        const currentHistory = Array.isArray(this.passwordHistory) ? this.passwordHistory : [];
        this.passwordHistory = [{ hash: this.password, changedAt: new Date() }, ...currentHistory].slice(0, 5);
    }
    this.remainingBalance = Number(this.feeAmount || 0) - Number(this.paidAmount || 0);
    next();
});
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, branchId: 1, active: 1 });
userSchema.index({ familyId: 1, role: 1 });
exports.User = mongoose_1.default.models.User ?? mongoose_1.default.model('User', userSchema);
