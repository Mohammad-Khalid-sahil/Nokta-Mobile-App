"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveStudentRecordForUser = resolveStudentRecordForUser;
exports.resolveStudentContext = resolveStudentContext;
const Student_1 = require("../models/Student");
const User_1 = require("../models/User");
async function resolveStudentRecordForUser(userId) {
    if (!userId)
        return null;
    const user = await User_1.User.findById(userId)
        .select('role studentId classId subjectId assignedTeacherId branchId familyId name email phone')
        .lean();
    if (!user || user.role !== 'student')
        return null;
    let student = user.studentId
        ? await Student_1.Student.findOne({ studentId: user.studentId, isDeleted: false })
            .populate('classId', 'className name classCode feeAmount')
            .populate('subjectId', 'title code feeAmount')
            .populate('teacherId', 'name email phone whatsapp')
            .lean()
        : null;
    if (!student) {
        student = await Student_1.Student.findOne({ _id: userId, isDeleted: false })
            .populate('classId', 'className name classCode feeAmount')
            .populate('subjectId', 'title code feeAmount')
            .populate('teacherId', 'name email phone whatsapp')
            .lean();
    }
    return { user, student };
}
async function resolveStudentContext(req) {
    const resolved = await resolveStudentRecordForUser(req.user?.userId);
    if (!resolved?.student && !resolved?.user) {
        return null;
    }
    const { user, student } = resolved;
    const classId = student?.classId?._id ?? student?.classId ?? user.classId ?? null;
    const subjectId = student?.subjectId?._id ?? student?.subjectId ?? user.subjectId ?? null;
    const teacherId = student?.teacherId?._id ?? student?.teacherId ?? user.assignedTeacherId ?? null;
    const studentDocId = student?._id ?? null;
    return {
        user,
        student,
        studentDocId,
        classId,
        subjectId,
        teacherId,
        branchId: student?.branchId ?? user.branchId ?? req.user?.branchId ?? null
    };
}
