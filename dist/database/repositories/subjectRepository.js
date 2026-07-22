"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubjectRepository = void 0;
const Subject_1 = require("../../models/Subject");
class SubjectRepository {
    async validateManyByIds(subjectIds) {
        return Subject_1.Subject.find({ _id: { $in: subjectIds } });
    }
    async assignClassToSubjects(classId, subjectIds) {
        return Subject_1.Subject.updateMany({ _id: { $in: subjectIds } }, { $set: { classId } });
    }
}
exports.SubjectRepository = SubjectRepository;
