import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { connectDatabase } from '../database/connect';
import { config } from '../config/env';
import { Branch } from '../models/Branch';
import { User } from '../models/User';
import { Family } from '../models/Family';
import { ParentProfile } from '../models/Parent';
import { FamilyLink } from '../models/FamilyLink';
import { Student } from '../models/Student';
import { ClassModel } from '../models/Class';
import { Subject } from '../models/Subject';
import { Course } from '../models/Course';
import { Timetable } from '../models/Timetable';
import { Attendance } from '../models/Attendance';
import { Exam } from '../models/Exam';
import { Result } from '../models/Result';
import { Notification } from '../models/Notification';
import { Message } from '../models/Message';
import { StudentMessage } from '../models/StudentMessage';
import { Enrollment } from '../models/Enrollment';
import { Payment } from '../models/Payment';
import { FinanceEntry } from '../models/FinanceEntry';
import { Expense } from '../models/Expense';
import { SalaryTransaction } from '../models/SalaryTransaction';
import { SessionToken } from '../models/SessionToken';
import { AuditLog } from '../models/AuditLog';

async function backup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve(process.cwd(), '..', 'backups');
  const outputFile = path.join(backupDir, `dev-db-backup-${timestamp}.json`);
  fs.mkdirSync(backupDir, { recursive: true });

  await connectDatabase();

  const payload = {
    metadata: {
      createdAt: new Date().toISOString(),
      mongoUri: config.mongoUri,
      environment: config.environment
    },
    collections: {
      branches: await Branch.find({}).lean(),
      users: await User.find({}).select('+password').lean(),
      families: await Family.find({}).lean(),
      parentProfiles: await ParentProfile.find({}).lean(),
      familyLinks: await FamilyLink.find({}).lean(),
      students: await Student.find({}).lean(),
      classes: await ClassModel.find({}).lean(),
      subjects: await Subject.find({}).lean(),
      courses: await Course.find({}).lean(),
      timetable: await Timetable.find({}).lean(),
      attendance: await Attendance.find({}).lean(),
      exams: await Exam.find({}).lean(),
      results: await Result.find({}).lean(),
      notifications: await Notification.find({}).lean(),
      messages: await Message.find({}).lean(),
      studentMessages: await StudentMessage.find({}).lean(),
      enrollments: await Enrollment.find({}).lean(),
      payments: await Payment.find({}).lean(),
      financeEntries: await FinanceEntry.find({}).lean(),
      expenses: await Expense.find({}).lean(),
      salaryTransactions: await SalaryTransaction.find({}).lean(),
      sessionTokens: await SessionToken.find({}).lean(),
      auditLogs: await AuditLog.find({}).lean()
    }
  };

  fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`BACKUP_SUCCESS ${outputFile}`);
}

async function main() {
  try {
    await backup();
  } catch (error) {
    console.error('BACKUP_FAILED');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

void main();
