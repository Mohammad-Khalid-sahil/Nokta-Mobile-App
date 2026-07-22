"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BusinessRuleService = void 0;
const AttendancePolicy_1 = require("../models/AttendancePolicy");
const Class_1 = require("../models/Class");
const User_1 = require("../models/User");
class BusinessRuleService {
    async assertStudentGenderMatchesClass(studentGender, classId) {
        const klass = await Class_1.ClassModel.findById(classId).lean();
        if (!klass) {
            throw new Error('Class not found');
        }
        const restriction = klass.genderRestriction;
        if (restriction && restriction !== 'coed' && restriction !== studentGender) {
            throw new Error(`Student gender must match class policy: ${restriction}`);
        }
        return klass;
    }
    async assertTeacherGenderMatchesClass(teacherId, classId) {
        const [teacher, klass] = await Promise.all([
            User_1.User.findById(teacherId).lean(),
            Class_1.ClassModel.findById(classId).lean()
        ]);
        if (!teacher) {
            throw new Error('Teacher not found');
        }
        if (!klass) {
            throw new Error('Class not found');
        }
        const restriction = klass.genderRestriction;
        if (restriction && restriction !== 'coed' && teacher.gender && teacher.gender !== restriction) {
            throw new Error('Teacher gender must match class policy');
        }
        return { teacher, klass };
    }
    async getAttendancePolicy(branchId) {
        return AttendancePolicy_1.AttendancePolicy.findOne({
            branchId: branchId ?? null,
            active: true,
            isDeleted: false
        }).lean();
    }
    calculateTeacherAbsenceDeduction(absences, amountPerAbsence = 50) {
        return Math.max(0, absences) * amountPerAbsence;
    }
}
exports.BusinessRuleService = BusinessRuleService;
