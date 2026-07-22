import { AttendancePolicy } from '../models/AttendancePolicy';
import { ClassModel } from '../models/Class';
import { User } from '../models/User';

export class BusinessRuleService {
  async assertStudentGenderMatchesClass(studentGender: string, classId: string) {
    const klass = await ClassModel.findById(classId).lean();
    if (!klass) {
      throw new Error('Class not found');
    }

    const restriction = (klass as any).genderRestriction;
    if (restriction && restriction !== 'coed' && restriction !== studentGender) {
      throw new Error(`Student gender must match class policy: ${restriction}`);
    }

    return klass;
  }

  async assertTeacherGenderMatchesClass(teacherId: string, classId: string) {
    const [teacher, klass] = await Promise.all([
      User.findById(teacherId).lean(),
      ClassModel.findById(classId).lean()
    ]);

    if (!teacher) {
      throw new Error('Teacher not found');
    }

    if (!klass) {
      throw new Error('Class not found');
    }

    const restriction = (klass as any).genderRestriction;
    if (restriction && restriction !== 'coed' && (teacher as any).gender && (teacher as any).gender !== restriction) {
      throw new Error('Teacher gender must match class policy');
    }

    return { teacher, klass };
  }

  async getAttendancePolicy(branchId?: string | null) {
    return AttendancePolicy.findOne({
      branchId: branchId ?? null,
      active: true,
      isDeleted: false
    }).lean();
  }

  calculateTeacherAbsenceDeduction(absences: number, amountPerAbsence = 50) {
    return Math.max(0, absences) * amountPerAbsence;
  }
}
