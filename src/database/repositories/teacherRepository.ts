import mongoose from 'mongoose';
import { User } from '../../models/User';

export class TeacherRepository {
  async validateManyByIds(teacherIds: string[]) {
    return User.find({ _id: { $in: teacherIds }, role: 'teacher' });
  }

  async assignClassToTeachers(classId: string, teacherIds: string[]) {
    return User.updateMany(
      { _id: { $in: teacherIds }, role: 'teacher' },
      { $addToSet: { assignedClasses: classId } }
    );
  }
}
