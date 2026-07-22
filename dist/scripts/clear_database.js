"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const connect_1 = require("../database/connect");
const User_1 = require("../models/User");
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
const Student_1 = require("../models/Student");
async function clearDatabase() {
    console.log('Deleting all data...');
    await Promise.all([
        User_1.User.deleteMany({}),
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
        Student_1.Student.deleteMany({})
    ]);
    console.log('All data deleted.');
}
async function main() {
    try {
        await (0, connect_1.connectDatabase)();
        await clearDatabase();
        console.log('All accounts and users have been deleted successfully.');
    }
    catch (error) {
        console.error('Error during deletion:', error);
    }
    finally {
        await mongoose_1.default.disconnect();
    }
}
main();
