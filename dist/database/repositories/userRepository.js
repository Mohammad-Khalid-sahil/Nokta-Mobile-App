"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRepository = void 0;
const User_1 = require("../../models/User");
class UserRepository {
    async findById(id) {
        return User_1.User.findById(id).select('+password');
    }
    async findByEmail(email) {
        return User_1.User.findOne({ email }).select('+password');
    }
    async findByRole(role) {
        return User_1.User.find({ role });
    }
    async create(data) {
        return User_1.User.create(data);
    }
    async update(id, data) {
        return User_1.User.findByIdAndUpdate(id, data, { new: true });
    }
    async delete(id) {
        return User_1.User.findByIdAndDelete(id);
    }
    async countByRole(role) {
        return User_1.User.countDocuments({ role });
    }
    async findTeachers() {
        return User_1.User.find({ role: 'teacher' });
    }
    async findFamilies() {
        return User_1.User.find({ role: 'family' });
    }
}
exports.UserRepository = UserRepository;
