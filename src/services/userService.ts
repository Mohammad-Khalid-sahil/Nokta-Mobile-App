import { UserRepository } from '../database/repositories/userRepository';
import { hashPassword, comparePassword } from '../utils/password';

export class UserService {
  private userRepository = new UserRepository();

  async createUser(data: any) {
    if (data.password) {
      data.password = await hashPassword(data.password);
    }

    if (data.role === 'teacher') {
      data.teacherId = this.generateTeacherId();
    }

    if (data.role === 'parent' || data.role === 'family') {
      const normalizedFatherName = String(data.fatherName || data.name || 'parent').toLowerCase().replace(/[^a-z0-9]/g, '') || 'parent';
      let familyEmail = data.email || `${normalizedFatherName}@nokta.academy`;
      let suffix = 1;
      while (await this.userRepository.findByEmail(familyEmail)) {
        familyEmail = `${normalizedFatherName}${suffix}@nokta.academy`;
        suffix += 1;
      }
      data.email = familyEmail;
      if (!data.password) {
        data.password = await hashPassword(`Parent@${String(data.phone || '00000000').slice(-8)}!`);
      }
      data.role = 'parent';
      data.mustChangePassword = true;
    }

    return this.userRepository.create(data);
  }

  async authenticate(email: string, password: string) {
    const user = await this.userRepository.findByEmail(email);
    if (!user || !(await comparePassword(password, user.password))) {
      return null;
    }
    return user;
  }

  async updateUser(id: string, data: any) {
    if (data.password) {
      data.password = await hashPassword(data.password);
    }
    return this.userRepository.update(id, data);
  }

  private generateTeacherId() {
    return `T${Date.now().toString().slice(-6)}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  }

  async getTeachers() {
    return this.userRepository.findTeachers();
  }

  async getFamilies() {
    return this.userRepository.findFamilies();
  }
}
