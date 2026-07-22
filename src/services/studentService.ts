import mongoose, { type ClientSession } from 'mongoose';
import { Family } from '../models/Family';
import { FamilyLink } from '../models/FamilyLink';
import { Enrollment } from '../models/Enrollment';
import { ParentProfile } from '../models/Parent';
import { Payment } from '../models/Payment';
import { Student } from '../models/Student';
import { Subject } from '../models/Subject';
import { User } from '../models/User';
import { ClassModel } from '../models/Class';
import { Branch } from '../models/Branch';
import { Notification } from '../models/Notification';
import { AuditLog } from '../models/AuditLog';
import { BusinessRuleService } from './businessRuleService';
import { teacherCompensationService } from './teacherCompensationService';
import { hashPassword } from '../utils/password';

export class StudentService {
  private readonly businessRuleService = new BusinessRuleService();

  private async assertEnrollmentLinksMatch(payload: { classId: string; subjectId: string; teacherId: string }, session?: ClientSession) {
    const [klass, subject, teacher] = await Promise.all([
      ClassModel.findOne({ _id: payload.classId, isDeleted: false }).select('assignedSubjects branchId').session(session ?? null).lean<any>(),
      Subject.findOne({ _id: payload.subjectId, isDeleted: false }).session(session ?? null).lean<any>(),
      User.findOne({ _id: payload.teacherId, role: 'teacher', isDeleted: false }).session(session ?? null).lean<any>()
    ]);

    if (!klass) {
      throw new Error('Selected class does not exist');
    }

    if (!subject) {
      throw new Error('Selected subject does not exist');
    }

    const subjectClassIds = new Set([
      subject.classId ? String(subject.classId) : '',
      ...(Array.isArray(subject.classIds) ? subject.classIds.map((id: any) => String(id)) : [])
    ].filter(Boolean));
    const classSubjectIds = new Set((klass.assignedSubjects ?? []).map((id: any) => String(id)));
    if (!subjectClassIds.has(String(payload.classId)) && !classSubjectIds.has(String(payload.subjectId))) {
      throw new Error('Selected subject does not belong to the selected class');
    }

    if (!teacher) {
      throw new Error('Selected teacher does not exist');
    }

    const assignedSubjectIds = Array.isArray(teacher.assignedSubjects) ? teacher.assignedSubjects.map((item: any) => String(item)) : [];
    const assignedClassIds = Array.isArray(teacher.assignedClasses) ? teacher.assignedClasses.map((item: any) => String(item)) : [];
    const subjectTeacherMatches = subject.teacher ? String(subject.teacher) === String(teacher._id) : false;
    const teacherSubjectMatches = assignedSubjectIds.includes(String(subject._id));
    const teacherClassMatches = assignedClassIds.includes(String(payload.classId));

    if (!subjectTeacherMatches && !teacherSubjectMatches && !teacherClassMatches) {
      throw new Error('Selected teacher is not assigned to the selected subject');
    }
  }

  private async resolveFeeAmount(classId: string, subjectId: string, override?: number | null, session?: ClientSession) {
    if (override !== undefined && override !== null) return Number(override);
    const [klass, subject] = await Promise.all([
      ClassModel.findById(classId).select('feeAmount').session(session ?? null).lean<any>(),
      Subject.findById(subjectId).select('feeAmount').session(session ?? null).lean<any>()
    ]);
    const { calculateEnrollmentFee } = await import('../utils/feeCalculator');
    return calculateEnrollmentFee(klass?.feeAmount, subject?.feeAmount).totalFee;
  }

  private async audit(actorId: string | null | undefined, action: string, student: any, metadata: Record<string, unknown> = {}, session?: ClientSession) {
    const actor = actorId ?? (await User.findOne({ role: { $in: ['system_automation', 'super_admin'] }, isDeleted: false }).select('_id').session(session ?? null).lean<any>())?._id;
    if (!actor) return;
    await AuditLog.create([{
      actor,
      branchId: student?.branchId ?? null,
      action,
      target: String(student?._id ?? ''),
      targetType: 'student',
      metadata,
      severity: action.includes('BLOCK') ? 'critical' : 'info'
    }], { session });
  }

  async registerStudent(data: any) {
    if (!data.firstName || !data.lastName || !data.fatherName) {
      throw new Error('Student first name, last name, and father name are required');
    }
    if (!data.classId || !data.subjectId || !data.teacherId) {
      throw new Error('classId, subjectId, and teacherId are required');
    }
    if (!data.gender) {
      throw new Error('Student gender is required');
    }

    let session: ClientSession | null = await mongoose.startSession();
    try {
      let createdStudent: any = null;
      const runRegistration = async () => {
        const activeSession = session;
        const writeSession = activeSession ?? undefined;
        const studentId = this.generateStudentId();
        const rollNo = data.rollNo || await this.generateStudentRollNo(writeSession);
        const studentPhone = String(data.phone ?? data.whatsapp ?? data.familyPhone ?? '').trim();
        const familyPhone = String(data.familyPhone ?? data.phone ?? '').trim();
        const studentEmail = String(data.loginEmail || '').trim().toLowerCase() || `${studentId.toLowerCase()}@student.nokta.academy`;
        const nationalId = String(data.nationalId || '').trim();

        await this.assertNoDuplicateStudent({
          phone: studentPhone,
          email: studentEmail,
          nationalId
        }, writeSession);

        const [klass, subject, teacher] = await Promise.all([
          ClassModel.findOne({ _id: data.classId, active: true, isDeleted: false, registrationOpen: { $ne: false } }).session(activeSession).lean<any>(),
          Subject.findOne({ _id: data.subjectId, isDeleted: false }).session(activeSession).lean<any>(),
          User.findOne({ _id: data.teacherId, role: 'teacher', isDeleted: false }).session(activeSession).lean<any>()
        ]);

        if (!klass) throw new Error('Selected class is not open for registration');
        if (!subject) throw new Error('Selected subject does not exist');
        if (!teacher) throw new Error('Selected teacher does not exist');

        const effectiveBranchId = String(data.branchId || klass.branchId || subject.branchId || teacher.branchId || '').trim() || null;
        if (effectiveBranchId) {
          const branch = await Branch.findOne({ _id: effectiveBranchId, active: true, isDeleted: false }).session(activeSession).lean<any>();
          if (!branch) throw new Error('Selected branch does not exist or is inactive');
          const relationBranchIds = [klass.branchId, subject.branchId, teacher.branchId].map((id: any) => String(id || '')).filter(Boolean);
          if (relationBranchIds.some((id) => id !== effectiveBranchId)) {
            throw new Error('Selected class, subject, teacher, and branch must belong to the same branch');
          }
        } else if (data.branchId) {
          throw new Error('Selected branch does not exist or is inactive');
        }

        const capacity = Number(klass.capacity ?? 0);
        if (capacity > 0) {
          const activeClassStudents = await Student.countDocuments({
            classId: data.classId,
            isDeleted: false,
            status: { $in: ['active', 'suspended'] }
          }).session(activeSession);
          if (activeClassStudents >= capacity) {
            throw new Error('Selected class is full');
          }
        }

        await this.assertEnrollmentLinksMatch({
          classId: data.classId,
          subjectId: data.subjectId,
          teacherId: data.teacherId
        }, writeSession);
        await this.businessRuleService.assertStudentGenderMatchesClass(data.gender, data.classId);
        await this.businessRuleService.assertTeacherGenderMatchesClass(data.teacherId, data.classId);

        let family = familyPhone ? await Family.findOne({ guardianPhone: familyPhone }).session(activeSession) : null;
        let familyUser: any = null;

        if (!family) {
          const normalizedFatherName = String(data.fatherName || 'parent').toLowerCase().replace(/[^a-z0-9]/g, '') || 'parent';
          let familyEmail = `${normalizedFatherName}@nokta.academy`;
          let suffix = 1;
          while (await User.findOne({ email: familyEmail }).session(activeSession)) {
            familyEmail = `${normalizedFatherName}${suffix}@nokta.academy`;
            suffix += 1;
          }

          [family] = await Family.create([{
            guardianName: data.fatherName,
            guardianEmail: familyEmail,
            guardianPhone: familyPhone,
            students: []
          }], { session: writeSession });

          [familyUser] = await User.create([{
            name: data.fatherName,
            email: familyEmail,
            phone: familyPhone,
            password: await hashPassword(`Parent@${String(familyPhone || data.fatherName).slice(-8)}!`),
            role: 'parent',
            familyId: family._id,
            branchId: effectiveBranchId,
            mustChangePassword: true
          }], { session: writeSession });
        } else {
          familyUser = await User.findOne({ email: family.guardianEmail }).session(activeSession);
          if (!familyUser) {
            [familyUser] = await User.create([{
              name: family.guardianName,
              email: family.guardianEmail,
              phone: family.guardianPhone,
              password: await hashPassword(`Parent@${String(family.guardianPhone).slice(-8)}!`),
              role: 'parent',
              familyId: family._id,
              branchId: effectiveBranchId,
              mustChangePassword: true
            }], { session: writeSession });
          }
        }

        let parentProfile = await ParentProfile.findOne({ userId: familyUser._id }).session(activeSession);
        if (!parentProfile) {
          [parentProfile] = await ParentProfile.create([{
            userId: familyUser._id,
            branchId: effectiveBranchId,
            guardianName: data.fatherName,
            guardianPhone: familyPhone,
            guardianEmail: family.guardianEmail,
            relationType: 'guardian',
            linkedStudentIds: []
          }], { session: writeSession });
        }

        const registrationDate = data.registrationStartDate ? new Date(data.registrationStartDate) : (data.registrationDate ? new Date(data.registrationDate) : new Date());
        const registrationExpiryDate = data.registrationEndDate
          ? new Date(data.registrationEndDate)
          : data.registrationExpiryDate
          ? new Date(data.registrationExpiryDate)
          : new Date(registrationDate.getFullYear(), registrationDate.getMonth() + 1, registrationDate.getDate());
        const feeAmount = await this.resolveFeeAmount(data.classId, data.subjectId, data.feeAmount, writeSession);
        const paidAmount = Number(data.paidAmount || 0);

        const [student] = await Student.create([{
          rollNo,
          studentId,
          branchId: effectiveBranchId,
          firstName: data.firstName,
          lastName: data.lastName,
          fatherName: data.fatherName,
          nationalId,
          familyPhone,
          whatsapp: data.whatsapp ?? studentPhone,
          familyEmail: family.guardianEmail,
          loginEmail: studentEmail,
          profileImage: data.profileImage ?? '',
          gender: data.gender,
          registrationDate,
          registrationStartDate: registrationDate,
          registrationEndDate: registrationExpiryDate,
          registrationExpiryDate,
          accountStatus: 'active',
          classId: data.classId,
          subjectId: data.subjectId,
          teacherId: data.teacherId,
          feeAmount,
          paidAmount,
          remainingBalance: feeAmount - paidAmount,
          familyId: family._id,
          parentProfileId: parentProfile._id
        }], { session: writeSession });

        const [studentUser] = await User.create([{
          name: `${data.firstName} ${data.lastName}`.trim(),
          email: studentEmail,
          phone: studentPhone || familyPhone,
          password: await hashPassword(data.loginPassword || `Student@${studentId}!`),
          role: 'student',
          studentId,
          nationalId,
          profileImage: data.profileImage ?? '',
          classId: data.classId,
          subjectId: data.subjectId,
          assignedTeacherId: data.teacherId,
          whatsapp: data.whatsapp ?? '',
          feeAmount,
          paidAmount,
          remainingBalance: feeAmount - paidAmount,
          branchId: effectiveBranchId,
          familyId: family._id,
          parentProfileId: parentProfile._id,
          gender: data.gender,
          fatherName: data.fatherName,
          mustChangePassword: true
        }], { session: writeSession });

        await Promise.all([
          Family.findByIdAndUpdate(family._id, { $addToSet: { students: student._id } }, { session: writeSession }),
          ParentProfile.findByIdAndUpdate(parentProfile._id, { $addToSet: { linkedStudentIds: student._id } }, { session: writeSession }),
          FamilyLink.findOneAndUpdate(
            { parentId: parentProfile._id, studentId: student._id },
            { parentId: parentProfile._id, studentId: student._id, relationType: 'guardian', isPrimary: true },
            { upsert: true, new: true, setDefaultsOnInsert: true, session: writeSession }
          ),
          Enrollment.create([{
            studentId: student._id,
            classId: data.classId,
            subjectId: data.subjectId,
            teacherId: data.teacherId,
            branchId: effectiveBranchId,
            academicYear: `${registrationDate.getFullYear()}`,
            status: 'active',
            enrolledAt: registrationDate,
            registrationExpiryDate
          }], { session: writeSession }),
          User.findByIdAndUpdate(familyUser._id, { parentProfileId: parentProfile._id, familyId: family._id }, { session: writeSession }),
          User.findByIdAndUpdate(studentUser._id, { familyId: family._id, parentProfileId: parentProfile._id }, { session: writeSession }),
          ClassModel.findByIdAndUpdate(data.classId, { $inc: { studentCount: 1 } }, { session: writeSession })
        ]);

        if (paidAmount > 0) {
          const [initialPayment] = await Payment.create([{
            studentId: student._id,
            branchId: effectiveBranchId,
            amount: paidAmount,
            status: 'completed',
            currency: 'AFN',
            method: 'cash',
            referenceNumber: `REG-${String(student._id).slice(-8).toUpperCase()}`,
            notes: 'Initial registration payment',
            paymentDate: registrationDate,
            collectedBy: data.createdBy ?? null
          }], { session: writeSession });

          await teacherCompensationService.recordPaymentCommission({
            payment: initialPayment,
            student,
            teacher,
            createdBy: data.createdBy ?? null,
            session: writeSession
          });
        }

        await User.findByIdAndUpdate(data.teacherId, {
          $inc: { totalStudents: 1 }
        }, { session: writeSession });

        await this.audit(data.createdBy, 'STUDENT_CREATED', student, { classId: data.classId, subjectId: data.subjectId, teacherId: data.teacherId }, writeSession);
        createdStudent = student;
      };
      try {
        await session.withTransaction(runRegistration);
      } catch (error: any) {
        if (!this.isTransactionUnsupported(error)) {
          throw error;
        }
        await session.endSession();
        session = null;
        createdStudent = null;
        await runRegistration();
      }
      return createdStudent;
    } finally {
      await session?.endSession();
    }
  }

  private isTransactionUnsupported(error: any) {
    const message = String(error?.message || error || '');
    return /Transaction numbers are only allowed on a replica set member or mongos/i.test(message);
  }

  private async generateStudentRollNo(session?: ClientSession) {
    const count = await Student.countDocuments().session(session ?? null);
    let rollNo = `STD-${count + 1}`;
    let attempt = 1;
    while (await Student.exists({ rollNo }).session(session ?? null)) {
      rollNo = `STD-${count + 1 + attempt}`;
      attempt += 1;
    }
    return rollNo;
  }

  private async assertNoDuplicateStudent(input: { phone: string; email: string; nationalId: string }, session?: ClientSession) {
    const duplicateFilters: Record<string, unknown>[] = [];
    if (input.phone) {
      duplicateFilters.push(
        { familyPhone: input.phone },
        { whatsapp: input.phone },
        { phone: input.phone }
      );
    }
    if (input.email) {
      duplicateFilters.push({ loginEmail: input.email }, { email: input.email });
    }
    if (input.nationalId) {
      duplicateFilters.push({ nationalId: input.nationalId });
    }
    if (!duplicateFilters.length) return;

    const [student, account] = await Promise.all([
      Student.findOne({ isDeleted: false, $or: duplicateFilters }).select('_id familyPhone whatsapp loginEmail nationalId').session(session ?? null).lean<any>(),
      User.findOne({ isDeleted: false, $or: duplicateFilters }).select('_id email phone whatsapp nationalId role').session(session ?? null).lean<any>()
    ]);

    if (student) {
      if (input.nationalId && String(student.nationalId || '') === input.nationalId) {
        throw new Error('Student with this national ID already exists');
      }
      if (input.email && String(student.loginEmail || '').toLowerCase() === input.email) {
        throw new Error('Student with this email already exists');
      }
      throw new Error('Student with this phone already exists');
    }
    if (account) {
      if (input.nationalId && String(account.nationalId || '') === input.nationalId) {
        throw new Error('Account with this national ID already exists');
      }
      if (input.email && String(account.email || '').toLowerCase() === input.email) {
        throw new Error('Account with this email already exists');
      }
      throw new Error('Account with this phone already exists');
    }
  }

  private generateStudentId() {
    return `S${Date.now().toString().slice(-6)}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  }

  async getStudentsByFamily(familyId: string) {
    return Student.find({ familyId, isDeleted: false })
      .populate('classId', 'className name classCode')
      .populate('subjectId', 'title code')
      .populate('teacherId', 'name email');
  }

  async getStudentsByTeacher(teacherId: string) {
    return Student.find({ teacherId, isDeleted: false })
      .populate('classId', 'className name classCode')
      .populate('subjectId', 'title code')
      .populate('teacherId', 'name email');
  }

  async updateStudent(id: string, data: any) {
    const student = await Student.findById(id);
    if (!student) {
      return null;
    }

    if (data.classId !== undefined || data.subjectId !== undefined || data.teacherId !== undefined || data.gender !== undefined) {
      const nextClassId = String(data.classId ?? student.classId);
      const nextSubjectId = String(data.subjectId ?? student.subjectId);
      const nextTeacherId = String(data.teacherId ?? student.teacherId);
      const nextGender = String(data.gender ?? student.gender);

      await this.assertEnrollmentLinksMatch({
        classId: nextClassId,
        subjectId: nextSubjectId,
        teacherId: nextTeacherId
      });
      await this.businessRuleService.assertStudentGenderMatchesClass(nextGender, nextClassId);
      await this.businessRuleService.assertTeacherGenderMatchesClass(nextTeacherId, nextClassId);
    }

    const updatedData: any = { ...data };
    const nextLoginEmail = String(data.loginEmail || '').trim().toLowerCase();
    const nextLoginPassword = String(data.loginPassword || '').trim();
    const nextStudentPhone = String(data.phone ?? data.whatsapp ?? '').trim();
    delete updatedData.loginPassword;
    delete updatedData.phone;
    if (nextStudentPhone && data.whatsapp === undefined) {
      updatedData.whatsapp = nextStudentPhone;
    }
    if (data.registrationStartDate) {
      updatedData.registrationStartDate = new Date(data.registrationStartDate);
      updatedData.registrationDate = new Date(data.registrationStartDate);
    }
    if (data.registrationEndDate) {
      updatedData.registrationEndDate = new Date(data.registrationEndDate);
      updatedData.registrationExpiryDate = new Date(data.registrationEndDate);
    }
    if (data.feeAmount === undefined && (data.classId !== undefined || data.subjectId !== undefined)) {
      const fee = await this.resolveFeeAmount(String(data.classId ?? student.classId), String(data.subjectId ?? student.subjectId), null);
      updatedData.feeAmount = fee;
      updatedData.remainingBalance = fee - Number(data.paidAmount ?? student.paidAmount ?? 0);
    }
    if (data.feeAmount !== undefined || data.paidAmount !== undefined) {
      const fee = data.feeAmount !== undefined ? data.feeAmount : student.feeAmount;
      const paid = data.paidAmount !== undefined ? data.paidAmount : student.paidAmount;
      updatedData.remainingBalance = fee - paid;
    }

    const updatedStudent = await Student.findByIdAndUpdate(id, updatedData, { new: true, runValidators: true });
    if (!updatedStudent) {
      return null;
    }

    await User.findOneAndUpdate(
      { studentId: updatedStudent.studentId, role: 'student', isDeleted: false },
      {
        $set: {
          name: `${updatedStudent.firstName} ${updatedStudent.lastName}`.trim(),
          firstName: updatedStudent.firstName,
          lastName: updatedStudent.lastName,
          ...(nextLoginEmail ? { email: nextLoginEmail } : {}),
          ...(nextLoginPassword ? { password: await hashPassword(nextLoginPassword), mustChangePassword: true } : {}),
          nationalId: updatedStudent.nationalId ?? '',
          phone: nextStudentPhone || updatedStudent.whatsapp || updatedStudent.familyPhone,
          whatsapp: updatedStudent.whatsapp ?? '',
          profileImage: updatedStudent.profileImage ?? '',
          classId: updatedStudent.classId,
          subjectId: updatedStudent.subjectId,
          assignedTeacherId: updatedStudent.teacherId,
          feeAmount: updatedStudent.feeAmount,
          paidAmount: updatedStudent.paidAmount,
          remainingBalance: updatedStudent.remainingBalance,
          branchId: updatedStudent.branchId ?? null,
          familyId: updatedStudent.familyId,
          parentProfileId: updatedStudent.parentProfileId ?? null,
          gender: updatedStudent.gender,
          fatherName: updatedStudent.fatherName,
          status: updatedStudent.status === 'graduated' ? 'inactive' : updatedStudent.status,
          active: updatedStudent.status === 'active'
        }
      }
    );

    await Promise.all([
      updatedStudent.familyId
        ? Family.findByIdAndUpdate(updatedStudent.familyId, {
            guardianName: updatedStudent.fatherName,
            guardianPhone: updatedStudent.familyPhone,
            guardianEmail: updatedStudent.familyEmail
          })
        : Promise.resolve(),
      updatedStudent.parentProfileId
        ? ParentProfile.findByIdAndUpdate(updatedStudent.parentProfileId, {
            guardianName: updatedStudent.fatherName,
            guardianPhone: updatedStudent.familyPhone,
            guardianEmail: updatedStudent.familyEmail,
            branchId: updatedStudent.branchId ?? null
          })
        : Promise.resolve(),
      User.findOneAndUpdate(
        { familyId: updatedStudent.familyId, role: 'parent', isDeleted: false },
        {
          $set: {
            name: updatedStudent.fatherName,
            phone: updatedStudent.familyPhone,
            branchId: updatedStudent.branchId ?? null,
            familyId: updatedStudent.familyId,
            parentProfileId: updatedStudent.parentProfileId ?? null
          }
        }
      )
    ]);

    await Enrollment.updateMany(
      { studentId: updatedStudent._id, isDeleted: false },
      {
        $set: {
          classId: updatedStudent.classId,
          subjectId: updatedStudent.subjectId,
          teacherId: updatedStudent.teacherId,
          branchId: updatedStudent.branchId ?? null,
          registrationExpiryDate: updatedStudent.registrationExpiryDate ?? null
        }
      }
    );

    await this.audit(data.updatedBy, 'STUDENT_UPDATED', updatedStudent, { fields: Object.keys(data) });
    return updatedStudent;
  }

  async renewRegistration(id: string, data: { registrationStartDate: Date; registrationEndDate: Date; feeAmount?: number; paidAmount?: number; actorId?: string | null }) {
    const student = await Student.findOne({ _id: id, isDeleted: false });
    if (!student) return null;

    const start = new Date(data.registrationStartDate);
    const end = new Date(data.registrationEndDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new Error('Registration end date must be after start date');
    }

    student.registrationStartDate = start;
    student.registrationDate = start;
    student.registrationEndDate = end;
    student.registrationExpiryDate = end;
    student.accountStatus = 'active';
    student.warningSentAt = null;
    student.blockedAt = null;
    student.status = 'active';
    if (data.feeAmount !== undefined) student.feeAmount = data.feeAmount;
    if (data.paidAmount !== undefined) student.paidAmount = data.paidAmount;
    await student.save();

    await Promise.all([
      User.updateOne({ studentId: student.studentId, role: 'student', isDeleted: false }, {
        $set: {
          status: 'active',
          active: true,
          feeAmount: student.feeAmount,
          paidAmount: student.paidAmount,
          remainingBalance: student.remainingBalance
        }
      }),
      Enrollment.updateMany({ studentId: student._id, isDeleted: false }, { $set: { status: 'active', registrationExpiryDate: end } }),
      Notification.create({
        branchId: student.branchId ?? null,
        title: 'Registration renewed',
        description: 'Your registration has been renewed successfully.',
        message: 'Your registration has been renewed successfully.',
        recipientRoles: ['student', 'parent'],
        recipientIds: [],
        publishStatus: 'published',
        publishDate: new Date(),
        category: 'academic_reminder',
        metadata: { studentId: student._id, registrationEndDate: end }
      })
    ]);

    await this.audit(data.actorId, 'STUDENT_REGISTRATION_RENEWED', student, { registrationStartDate: start, registrationEndDate: end });
    return student;
  }

  async setBlockStatus(id: string, blocked: boolean, actorId?: string | null) {
    const student = await Student.findOne({ _id: id, isDeleted: false });
    if (!student) return null;
    student.accountStatus = blocked ? 'blocked' : 'active';
    student.blockedAt = blocked ? new Date() : null;
    student.status = blocked ? 'inactive' : 'active';
    await student.save();
    await User.updateOne(
      { studentId: student.studentId, role: 'student', isDeleted: false },
      { $set: { status: blocked ? 'blocked' : 'active', active: !blocked } }
    );
    await this.audit(actorId, blocked ? 'STUDENT_ACCOUNT_BLOCKED' : 'STUDENT_ACCOUNT_UNBLOCKED', student);
    return student;
  }

  async deleteStudent(id: string, actorId?: string | null) {
    const student = await Student.findOne({ _id: id, isDeleted: false });
    if (!student) {
      return null;
    }

    const deletedAt = new Date();

    await Student.updateOne(
      { _id: student._id },
      {
        $set: {
          isDeleted: true,
          deletedAt,
          deletedBy: actorId ?? null,
          status: 'inactive'
        }
      }
    );

    await User.updateOne(
      { studentId: student.studentId, role: 'student', isDeleted: false },
      {
        $set: {
          isDeleted: true,
          deletedAt,
          deletedBy: actorId ?? null,
          active: false,
          status: 'inactive'
        }
      }
    );

    await Enrollment.updateMany(
      { studentId: student._id, isDeleted: false },
      {
        $set: {
          isDeleted: true,
          deletedAt,
          deletedBy: actorId ?? null,
          status: 'cancelled'
        }
      }
    );

    await FamilyLink.updateMany(
      { studentId: student._id, isDeleted: false },
      {
        $set: {
          isDeleted: true,
          deletedAt,
          deletedBy: actorId ?? null
        }
      }
    );

    await Promise.all([
      student.classId
        ? ClassModel.updateOne(
            { _id: student.classId, studentCount: { $gt: 0 } },
            { $inc: { studentCount: -1 } }
          )
        : Promise.resolve(),
      student.teacherId
        ? User.updateOne(
            { _id: student.teacherId, totalStudents: { $gt: 0 } },
            { $inc: { totalStudents: -1 } }
          )
        : Promise.resolve()
    ]);

    return student;
  }
}
