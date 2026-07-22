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
async function backup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path_1.default.resolve(process.cwd(), '..', 'backups');
    const outputFile = path_1.default.join(backupDir, `dev-db-backup-${timestamp}.json`);
    fs_1.default.mkdirSync(backupDir, { recursive: true });
    await (0, connect_1.connectDatabase)();
    const payload = {
        metadata: {
            createdAt: new Date().toISOString(),
            mongoUri: env_1.config.mongoUri,
            environment: env_1.config.environment
        },
        collections: {
            branches: await Branch_1.Branch.find({}).lean(),
            users: await User_1.User.find({}).select('+password').lean(),
            families: await Family_1.Family.find({}).lean(),
            parentProfiles: await Parent_1.ParentProfile.find({}).lean(),
            familyLinks: await FamilyLink_1.FamilyLink.find({}).lean(),
            students: await Student_1.Student.find({}).lean(),
            classes: await Class_1.ClassModel.find({}).lean(),
            subjects: await Subject_1.Subject.find({}).lean(),
            courses: await Course_1.Course.find({}).lean(),
            timetable: await Timetable_1.Timetable.find({}).lean(),
            attendance: await Attendance_1.Attendance.find({}).lean(),
            exams: await Exam_1.Exam.find({}).lean(),
            results: await Result_1.Result.find({}).lean(),
            notifications: await Notification_1.Notification.find({}).lean(),
            messages: await Message_1.Message.find({}).lean(),
            studentMessages: await StudentMessage_1.StudentMessage.find({}).lean(),
            enrollments: await Enrollment_1.Enrollment.find({}).lean(),
            payments: await Payment_1.Payment.find({}).lean(),
            financeEntries: await FinanceEntry_1.FinanceEntry.find({}).lean(),
            expenses: await Expense_1.Expense.find({}).lean(),
            salaryTransactions: await SalaryTransaction_1.SalaryTransaction.find({}).lean(),
            sessionTokens: await SessionToken_1.SessionToken.find({}).lean(),
            auditLogs: await AuditLog_1.AuditLog.find({}).lean()
        }
    };
    fs_1.default.writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`BACKUP_SUCCESS ${outputFile}`);
}
async function main() {
    try {
        await backup();
    }
    catch (error) {
        console.error('BACKUP_FAILED');
        console.error(error);
        process.exitCode = 1;
    }
    finally {
        await mongoose_1.default.disconnect();
    }
}
void main();
