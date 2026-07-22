import { User } from '../../models/User';

export class UserRepository {
  async findById(id: string) {
    return User.findById(id).select('+password');
  }

  async findByEmail(email: string) {
    return User.findOne({ email }).select('+password');
  }

  async findByRole(role: string) {
    return User.find({ role });
  }

  async create(data: any) {
    return User.create(data);
  }

  async update(id: string, data: any) {
    return User.findByIdAndUpdate(id, data, { new: true });
  }

  async delete(id: string) {
    return User.findByIdAndDelete(id);
  }

  async countByRole(role: string) {
    return User.countDocuments({ role });
  }

  async findTeachers() {
    return User.find({ role: 'teacher' });
  }

  async findFamilies() {
    return User.find({ role: 'family' });
  }
}
