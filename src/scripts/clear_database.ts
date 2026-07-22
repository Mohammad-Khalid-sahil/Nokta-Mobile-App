import mongoose from 'mongoose';
import { connectDatabase } from '../database/connect';
import { User } from '../models/User';
import { ClassModel as Class } from '../models/Class';
import { Subject } from '../models/Subject';
import { Exam } from '../models/Exam';
import { Result } from '../models/Result';
import { Family } from '../models/Family';
import { Expense } from '../models/Expense';
import { Book } from '../models/Book';
import { Notification } from '../models/Notification';
import { AuditLog } from '../models/AuditLog';
import { SalaryTransaction } from '../models/SalaryTransaction';
import { Student } from '../models/Student';

async function clearDatabase() {
  console.log('Deleting all data...');
  await Promise.all([
    User.deleteMany({}),
    Class.deleteMany({}),
    Subject.deleteMany({}),
    Exam.deleteMany({}),
    Result.deleteMany({}),
    Family.deleteMany({}),
    Expense.deleteMany({}),
    Book.deleteMany({}),
    Notification.deleteMany({}),
    AuditLog.deleteMany({}),
    SalaryTransaction.deleteMany({}),
    Student.deleteMany({})
  ]);
  console.log('All data deleted.');
}

async function main() {
  try {
    await connectDatabase();
    await clearDatabase();
    console.log('All accounts and users have been deleted successfully.');
  } catch (error) {
    console.error('Error during deletion:', error);
  } finally {
    await mongoose.disconnect();
  }
}

main();