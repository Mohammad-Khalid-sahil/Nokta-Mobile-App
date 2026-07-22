"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClassRepository = void 0;
const Class_1 = require("../../models/Class");
class ClassRepository {
    async findByName(className) {
        return Class_1.ClassModel.findOne({ className });
    }
    async findByCode(classCode) {
        return Class_1.ClassModel.findOne({ classCode });
    }
    async create(data) {
        const klass = await Class_1.ClassModel.create(data);
        return klass;
    }
    async findById(id) {
        return Class_1.ClassModel.findById(id);
    }
    async countClassCodesWithPrefix(prefix) {
        return Class_1.ClassModel.countDocuments({ classCode: { $regex: `^${prefix}` } });
    }
}
exports.ClassRepository = ClassRepository;
