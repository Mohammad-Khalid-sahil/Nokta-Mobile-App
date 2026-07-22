import mongoose from 'mongoose';
import { Subject } from '../../models/Subject';

export class SubjectRepository {
  async validateManyByIds(subjectIds: string[]) {
    return Subject.find({ _id: { $in: subjectIds } });
  }

  async assignClassToSubjects(classId: string, subjectIds: string[]) {
    return Subject.updateMany(
      { _id: { $in: subjectIds } },
      { $set: { classId } }
    );
  }
}
