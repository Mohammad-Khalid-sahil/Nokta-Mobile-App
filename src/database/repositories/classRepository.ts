import mongoose from 'mongoose';
import { ClassModel } from '../../models/Class';

export class ClassRepository {
  async findByName(className: string) {
    return ClassModel.findOne({ className });
  }

  async findByCode(classCode: string) {
    return ClassModel.findOne({ classCode });
  }

  async create(data: any) {
    const klass = await ClassModel.create(data);
    return klass;
  }

  async findById(id: string) {
    return ClassModel.findById(id);
  }

  async countClassCodesWithPrefix(prefix: string) {
    return ClassModel.countDocuments({ classCode: { $regex: `^${prefix}` } });
  }
}
