import mongoose from 'mongoose';
import { connectDatabase } from '../database/connect';
import { User } from '../models/User';
import { ClassModel as Class } from '../models/Class';
import { Subject } from '../models/Subject';
import { Result } from '../models/Result';
import { Family } from '../models/Family';
import { Expense } from '../models/Expense';
import { AuditLog } from '../models/AuditLog';

async function deleteStudentsAndTeachers() {
  console.log('Starting deletion of students and teachers...');

  // Get student IDs (including family_student)
  const students = await User.find({ role: { $in: ['student', 'family_student'] } }).select('_id');
  const studentIds = students.map(s => s._id);

  // Get teacher IDs
  const teachers = await User.find({ role: 'teacher' }).select('_id');
  const teacherIds = teachers.map(t => t._id);

  // Get class IDs taught by teachers
  const classes = await Class.find({ teacher: { $in: teacherIds } }).select('_id');
  const classIds = classes.map(c => c._id);

  console.log(`Found ${studentIds.length} students and ${teacherIds.length} teachers to delete.`);
  console.log(`Found ${classIds.length} classes to delete.`);

  // Delete dependent records
  console.log('Deleting dependent records...');

  // Delete results for students
  await Result.deleteMany({ student: { $in: studentIds } });
  console.log('Deleted student results.');

  // Delete results graded by teachers
  await Result.deleteMany({ gradedBy: { $in: teacherIds } });
  console.log('Deleted teacher-graded results.');

  // Remove students from families
  await Family.updateMany({}, { $pull: { students: { $in: studentIds } } });
  console.log('Removed students from families.');

  // Delete audit logs by students and teachers
  await AuditLog.deleteMany({ actor: { $in: [...studentIds, ...teacherIds] } });
  console.log('Deleted audit logs.');

  // Delete expenses by students and teachers
  await Expense.deleteMany({ createdBy: { $in: [...studentIds, ...teacherIds] } });
  console.log('Deleted expenses.');

  // Delete classes taught by teachers
  await Class.deleteMany({ teacher: { $in: teacherIds } });
  console.log('Deleted classes.');

  // Delete subjects taught by teachers
  await Subject.deleteMany({ teacher: { $in: teacherIds } });
  console.log('Deleted subjects.');

  // Update users: set teacherId to null if teacher is being deleted
  await User.updateMany({ teacherId: { $in: teacherIds } }, { $unset: { teacherId: 1 } });
  console.log('Unset teacherId references.');

  // Set classId to null for users whose class is deleted
  await User.updateMany({ classId: { $in: classIds } }, { $unset: { classId: 1 } });
  console.log('Unset classId references.');

  // Now delete the users
  console.log('Deleting students and teachers...');
  await User.deleteMany({ role: { $in: ['student', 'teacher', 'family_student'] } });
  console.log('Deleted users.');

  // Verify
  const studentCount = await User.countDocuments({ role: { $in: ['student', 'family_student'] } });
  const teacherCount = await User.countDocuments({ role: 'teacher' });

  if (studentCount === 0 && teacherCount === 0) {
    console.log('All students and teachers have been deleted successfully.');
  } else {
    console.log(`Deletion incomplete. Remaining: ${studentCount} students, ${teacherCount} teachers.`);
  }
}

async function main() {
  try {
    await connectDatabase();
    await deleteStudentsAndTeachers();
  } catch (error) {
    console.error('Error during deletion:', error);
  } finally {
    await mongoose.disconnect();
  }
}

main();