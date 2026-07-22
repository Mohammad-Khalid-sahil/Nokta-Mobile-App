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
const Result_1 = require("../models/Result");
const Family_1 = require("../models/Family");
const Expense_1 = require("../models/Expense");
const AuditLog_1 = require("../models/AuditLog");
async function deleteStudentsAndTeachers() {
    console.log('Starting deletion of students and teachers...');
    // Get student IDs (including family_student)
    const students = await User_1.User.find({ role: { $in: ['student', 'family_student'] } }).select('_id');
    const studentIds = students.map(s => s._id);
    // Get teacher IDs
    const teachers = await User_1.User.find({ role: 'teacher' }).select('_id');
    const teacherIds = teachers.map(t => t._id);
    // Get class IDs taught by teachers
    const classes = await Class_1.ClassModel.find({ teacher: { $in: teacherIds } }).select('_id');
    const classIds = classes.map(c => c._id);
    console.log(`Found ${studentIds.length} students and ${teacherIds.length} teachers to delete.`);
    console.log(`Found ${classIds.length} classes to delete.`);
    // Delete dependent records
    console.log('Deleting dependent records...');
    // Delete results for students
    await Result_1.Result.deleteMany({ student: { $in: studentIds } });
    console.log('Deleted student results.');
    // Delete results graded by teachers
    await Result_1.Result.deleteMany({ gradedBy: { $in: teacherIds } });
    console.log('Deleted teacher-graded results.');
    // Remove students from families
    await Family_1.Family.updateMany({}, { $pull: { students: { $in: studentIds } } });
    console.log('Removed students from families.');
    // Delete audit logs by students and teachers
    await AuditLog_1.AuditLog.deleteMany({ actor: { $in: [...studentIds, ...teacherIds] } });
    console.log('Deleted audit logs.');
    // Delete expenses by students and teachers
    await Expense_1.Expense.deleteMany({ createdBy: { $in: [...studentIds, ...teacherIds] } });
    console.log('Deleted expenses.');
    // Delete classes taught by teachers
    await Class_1.ClassModel.deleteMany({ teacher: { $in: teacherIds } });
    console.log('Deleted classes.');
    // Delete subjects taught by teachers
    await Subject_1.Subject.deleteMany({ teacher: { $in: teacherIds } });
    console.log('Deleted subjects.');
    // Update users: set teacherId to null if teacher is being deleted
    await User_1.User.updateMany({ teacherId: { $in: teacherIds } }, { $unset: { teacherId: 1 } });
    console.log('Unset teacherId references.');
    // Set classId to null for users whose class is deleted
    await User_1.User.updateMany({ classId: { $in: classIds } }, { $unset: { classId: 1 } });
    console.log('Unset classId references.');
    // Now delete the users
    console.log('Deleting students and teachers...');
    await User_1.User.deleteMany({ role: { $in: ['student', 'teacher', 'family_student'] } });
    console.log('Deleted users.');
    // Verify
    const studentCount = await User_1.User.countDocuments({ role: { $in: ['student', 'family_student'] } });
    const teacherCount = await User_1.User.countDocuments({ role: 'teacher' });
    if (studentCount === 0 && teacherCount === 0) {
        console.log('All students and teachers have been deleted successfully.');
    }
    else {
        console.log(`Deletion incomplete. Remaining: ${studentCount} students, ${teacherCount} teachers.`);
    }
}
async function main() {
    try {
        await (0, connect_1.connectDatabase)();
        await deleteStudentsAndTeachers();
    }
    catch (error) {
        console.error('Error during deletion:', error);
    }
    finally {
        await mongoose_1.default.disconnect();
    }
}
main();
