import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../../models/User';
import { Family } from '../../models/Family';
import { ClassModel as Class } from '../../models/Class';
import { authenticate, authorize } from '../../middlewares/auth';
import { createResponse, createError } from '../../helpers/response';

const router = Router();

router.use(authenticate);

// POST /api/admin/reset-all
router.post('/reset-all', authorize(['super_admin']), async (req, res, next) => {
  try {
    // Delete all students
    await User.deleteMany({ role: 'student' });
    // Delete all teachers
    await User.deleteMany({ role: 'teacher' });
    // Delete all family students
    await User.deleteMany({ role: 'family_student' });
    // Delete all families
    await Family.deleteMany({});
    // Keep super_admin and admin intact

    res.json(createResponse(null, 'All data reset successfully'));
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/rebuild-system
router.post('/rebuild-system', authorize(['super_admin']), async (req, res, next) => {
  try {
    // STEP 1: CREATE TEACHERS
    const teachers = [];
    for (let i = 1; i <= 5; i++) {
      const salaryType = i % 2 === 0 ? 'fixed' : 'percentage'; // alternate
      const salaryValue = salaryType === 'fixed'
        ? Math.floor(Math.random() * 15001) + 5000 // 5000-20000
        : Math.floor(Math.random() * 21) + 10; // 10-30

      const teacher = await User.create({
        name: `Teacher ${i}`,
        email: `teacher${i}@gmail.com`,
        password: await bcrypt.hash('123456', 10),
        role: 'teacher',
        phone: `070${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
        salaryType,
        salaryValue
      });
      teachers.push(teacher);
    }

    // Get or create default class
    let defaultClass = await Class.findOne();
    if (!defaultClass) {
      defaultClass = await Class.create({
        name: 'Default Class',
        grade: '1'
      });
    }

    // STEP 2: CREATE 300 STUDENTS
    const students = [];
    for (let i = 1; i <= 300; i++) {
      const fatherName = `Father ${i}`;
      const phone = `079${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
      const fee = Math.floor(Math.random() * 4001) + 1000;
      const teacherId = teachers[Math.floor(Math.random() * teachers.length)]._id;

      // STEP 3: AUTO CREATE FAMILY ACCOUNT
      let familyRecord = await Family.findOne({ $or: [{ phone }, { name: fatherName }] });
      if (!familyRecord) {
        const normalizedFatherName = fatherName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'parent';
        let familyEmail = `${normalizedFatherName}@gmail.com`;
        let suffix = 1;
        while (await User.exists({ email: familyEmail })) {
          familyEmail = `${normalizedFatherName}${suffix}@gmail.com`;
          suffix += 1;
        }

        const familyUser = await User.create({
          name: fatherName,
          email: familyEmail,
          password: await bcrypt.hash(fatherName, 10),
          role: 'family_student',
          phone
        });

        familyRecord = await Family.create({
          name: fatherName,
          contactNumber: phone,
          userId: familyUser._id,
          students: []
        });
      }

      const student = await User.create({
        name: `Student ${i}`,
        email: `student${i}@gmail.com`,
        password: await bcrypt.hash('123456', 10),
        role: 'student',
        fatherName,
        phone,
        fee,
        teacherId,
        classId: defaultClass._id,
        familyId: familyRecord._id
      });

      familyRecord.students.push(student._id);
      await familyRecord.save();

      students.push(student);

      // STEP 4: TEACHER SALARY CALCULATION (dynamic, no save needed)
      // Since salary is calculated dynamically in buildTeacherPayrollInfo, no action needed here
    }

    res.json(createResponse({ teachersCreated: teachers.length, studentsCreated: students.length }, 'System rebuilt successfully'));
  } catch (error) {
    next(error);
  }
});

export default router;