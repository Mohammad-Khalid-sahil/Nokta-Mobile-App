"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherRepository = void 0;
const User_1 = require("../../models/User");
class TeacherRepository {
    async validateManyByIds(teacherIds) {
        return User_1.User.find({ _id: { $in: teacherIds }, role: 'teacher' });
    }
    async assignClassToTeachers(classId, teacherIds) {
        return User_1.User.updateMany({ _id: { $in: teacherIds }, role: 'teacher' }, { $addToSet: { assignedClasses: classId } });
    }
}
exports.TeacherRepository = TeacherRepository;
