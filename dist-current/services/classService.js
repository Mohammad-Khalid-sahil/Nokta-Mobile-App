"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClassService = void 0;
const classRepository_1 = require("../database/repositories/classRepository");
const teacherRepository_1 = require("../database/repositories/teacherRepository");
const AuditLog_1 = require("../models/AuditLog");
const Class_1 = require("../models/Class");
const Notification_1 = require("../models/Notification");
const Student_1 = require("../models/Student");
const Subject_1 = require("../models/Subject");
const User_1 = require("../models/User");
class ClassService {
    constructor() {
        this.classRepository = new classRepository_1.ClassRepository();
        this.teacherRepository = new teacherRepository_1.TeacherRepository();
    }
    normalizeSubjectNames(subjects) {
        return Array.isArray(subjects)
            ? Array.from(new Set(subjects
                .map((subject) => {
                if (typeof subject === 'string')
                    return subject;
                if (subject && typeof subject === 'object')
                    return String(subject.name || '');
                return '';
            })
                .map((name) => name.trim())
                .filter(Boolean)))
            : [];
    }
    normalizeTeacherIds(teacherIds) {
        return Array.isArray(teacherIds)
            ? Array.from(new Set(teacherIds.map(String).filter(Boolean)))
            : [];
    }
    normalizeImageUrl(value) {
        return value ? String(value).trim() : '';
    }
    normalizeGalleryImages(value) {
        if (!Array.isArray(value))
            return [];
        return Array.from(new Set(value.map((item) => String(item).trim()).filter(Boolean)));
    }
    normalizeWeeklySchedule(schedule) {
        if (!Array.isArray(schedule)) {
            return [];
        }
        return schedule.map((item) => {
            const [startHour, startMinute] = String(item.startTime).split(':').map(Number);
            const [endHour, endMinute] = String(item.endTime).split(':').map(Number);
            const startTotal = startHour * 60 + startMinute;
            const endTotal = endHour * 60 + endMinute;
            const durationMinutes = Number(item.durationMinutes ?? (endTotal > startTotal ? endTotal - startTotal : endTotal + 24 * 60 - startTotal));
            if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
                throw new Error('Class schedule end time must be after start time');
            }
            return {
                dayOfWeek: Number(item.dayOfWeek),
                startTime: item.startTime,
                endTime: item.endTime,
                durationMinutes,
                attendanceOpensBeforeMinutes: Number(item.attendanceOpensBeforeMinutes ?? 0),
                attendanceClosesAfterMinutes: Number(item.attendanceClosesAfterMinutes ?? 0)
            };
        });
    }
    async assertNoOverlappingSchedule(classId, teacherIds, branchId, schedule) {
        if (!schedule.length || !teacherIds.length) {
            return;
        }
        const existingClasses = await Class_1.ClassModel.find({
            _id: classId ? { $ne: classId } : { $exists: true },
            isDeleted: false,
            active: true,
            assignedTeachers: { $in: teacherIds },
            ...(branchId ? { branchId } : {})
        }).select('className assignedTeachers weeklySchedule').lean();
        const toMinutes = (time) => {
            const [hours, minutes] = time.split(':').map(Number);
            return hours * 60 + minutes;
        };
        for (const existing of existingClasses) {
            for (const currentSchedule of schedule) {
                for (const existingSchedule of existing.weeklySchedule ?? []) {
                    if (Number(currentSchedule.dayOfWeek) !== Number(existingSchedule.dayOfWeek))
                        continue;
                    const currentStart = toMinutes(currentSchedule.startTime);
                    const currentEnd = toMinutes(currentSchedule.endTime);
                    const existingStart = toMinutes(existingSchedule.startTime);
                    const existingEnd = toMinutes(existingSchedule.endTime);
                    if (currentStart < existingEnd && existingStart < currentEnd) {
                        throw new Error(`Overlapping class schedule for assigned teacher in ${existing.className}`);
                    }
                }
            }
        }
    }
    async validateTeacherAssignments(teacherIds, genderRestriction) {
        if (!teacherIds.length) {
            return [];
        }
        const teachers = await this.teacherRepository.validateManyByIds(teacherIds);
        if (teachers.length !== teacherIds.length) {
            throw new Error('One or more assigned teachers are invalid');
        }
        if (genderRestriction && genderRestriction !== 'coed') {
            const mismatchedTeacher = teachers.find((teacher) => teacher.gender && teacher.gender !== genderRestriction);
            if (mismatchedTeacher) {
                throw new Error('Teacher gender must match class policy');
            }
        }
        return teachers;
    }
    async generateNextClassCode() {
        const year = new Date().getFullYear();
        const prefix = `CLS-${year}-`;
        let index = await this.classRepository.countClassCodesWithPrefix(prefix);
        index += 1;
        while (true) {
            const classCode = `CLS-${year}-${String(index).padStart(4, '0')}`;
            const exists = await this.classRepository.findByCode(classCode);
            if (!exists)
                return classCode;
            index += 1;
        }
    }
    async generateNextSubjectCode(subjectName, className) {
        const subjectPrefix = String(subjectName).replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'SUB';
        const classPrefix = String(className).replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'CLS';
        let index = await Subject_1.Subject.countDocuments({ code: new RegExp(`^${subjectPrefix}-${classPrefix}-`) });
        index += 1;
        let code = `${subjectPrefix}-${classPrefix}-${String(index).padStart(2, '0')}`;
        while (await Subject_1.Subject.exists({ code })) {
            index += 1;
            code = `${subjectPrefix}-${classPrefix}-${String(index).padStart(2, '0')}`;
        }
        return code;
    }
    async syncTeacherAssignments(classId, nextTeacherIds, previousTeacherIds = []) {
        const removedTeacherIds = previousTeacherIds.filter((teacherId) => !nextTeacherIds.includes(String(teacherId)));
        if (removedTeacherIds.length) {
            await User_1.User.updateMany({ _id: { $in: removedTeacherIds }, role: 'teacher' }, { $pull: { assignedClasses: classId } });
        }
        if (nextTeacherIds.length) {
            await this.teacherRepository.assignClassToTeachers(classId, nextTeacherIds);
        }
    }
    async syncSubjectsForClass(klass, subjectNames, actorId) {
        if (!subjectNames.length) {
            throw new Error('At least one subject is required');
        }
        const existingSubjects = await Subject_1.Subject.find({ classId: klass._id, isDeleted: false }).lean();
        const subjectMap = new Map(existingSubjects.map((subject) => [String(subject.title).trim().toLowerCase(), subject]));
        const nextSubjectIds = [];
        for (const title of subjectNames) {
            const key = title.toLowerCase();
            const existingSubject = subjectMap.get(key);
            if (existingSubject) {
                if (existingSubject.title !== title) {
                    await Subject_1.Subject.updateOne({ _id: existingSubject._id }, { $set: { title } });
                }
                nextSubjectIds.push(String(existingSubject._id));
                continue;
            }
            const subject = await Subject_1.Subject.create({
                branchId: klass.branchId ?? null,
                title,
                code: await this.generateNextSubjectCode(title, klass.className),
                classId: klass._id,
                feeAmount: 0,
                activeStatus: true
            });
            nextSubjectIds.push(String(subject._id));
        }
        klass.assignedSubjects = nextSubjectIds;
        await klass.save();
        await AuditLog_1.AuditLog.create({
            actor: actorId,
            action: 'CLASS_SUBJECTS_SYNCED',
            target: String(klass._id),
            metadata: {
                className: klass.className,
                subjects: subjectNames
            }
        });
    }
    async createClass(payload, actorId) {
        try {
            const className = String(payload.className || '').trim();
            if (!className) {
                throw new Error('className is required');
            }
            const existingClass = await this.classRepository.findByName(className);
            if (existingClass) {
                throw new Error('Class name already exists');
            }
            const subjectNames = this.normalizeSubjectNames(payload.subjects);
            const teacherIds = this.normalizeTeacherIds(payload.assignedTeachers);
            await this.validateTeacherAssignments(teacherIds, payload.genderRestriction);
            const weeklySchedule = this.normalizeWeeklySchedule(payload.weeklySchedule);
            await this.assertNoOverlappingSchedule(null, teacherIds, payload.branchId ?? null, weeklySchedule);
            const classCode = payload.classCode?.trim() || await this.generateNextClassCode();
            if (payload.classCode) {
                const existingCode = await this.classRepository.findByCode(classCode);
                if (existingCode) {
                    throw new Error('Class code already exists');
                }
            }
            const klass = await this.classRepository.create({
                branchId: payload.branchId ?? null,
                title: payload.title?.trim() || className,
                description: payload.description?.trim() ?? '',
                subjectId: payload.subjectId ?? null,
                teacherId: payload.teacherId ?? teacherIds[0] ?? null,
                className,
                classCode,
                genderRestriction: payload.genderRestriction ?? 'coed',
                feeAmount: Number(payload.feeAmount ?? 0),
                assignedTeachers: teacherIds,
                room: payload.room?.trim() ?? '',
                capacity: payload.capacity ?? 30,
                startDate: payload.startDate ? new Date(payload.startDate) : null,
                endDate: payload.endDate ? new Date(payload.endDate) : null,
                weeklySchedule,
                examSchedule: Array.isArray(payload.examSchedule) ? payload.examSchedule : [],
                studentCount: payload.studentCount ?? 0,
                active: true,
                imageUrl: this.normalizeImageUrl(payload.imageUrl),
                thumbnailUrl: this.normalizeImageUrl(payload.thumbnailUrl) || this.normalizeImageUrl(payload.imageUrl),
                galleryImages: this.normalizeGalleryImages(payload.galleryImages)
            });
            await this.syncSubjectsForClass(klass, subjectNames, actorId);
            await this.syncTeacherAssignments(String(klass._id), teacherIds);
            await AuditLog_1.AuditLog.create({
                actor: actorId,
                action: 'CLASS_CREATED',
                target: String(klass._id),
                metadata: {
                    className,
                    classCode,
                    feeAmount: Number(payload.feeAmount ?? 0),
                    subjects: subjectNames,
                    assignedTeachers: teacherIds
                }
            });
            if (teacherIds.length) {
                await Notification_1.Notification.create({
                    title: 'New class assigned',
                    description: `A new class "${className}" has been assigned to you.`,
                    message: `A new class "${className}" has been assigned to you.`,
                    recipientRoles: ['teacher'],
                    recipientIds: teacherIds,
                    readBy: [],
                    publishStatus: 'published',
                    publishDate: new Date()
                });
            }
            return klass;
        }
        catch (error) {
            console.error('[CLASS CREATE ERROR]', error?.message || error);
            throw error;
        }
    }
    async updateClass(classId, payload, actorId) {
        const klass = await Class_1.ClassModel.findOne({ _id: classId, isDeleted: false });
        if (!klass) {
            throw new Error('Class not found');
        }
        if (payload.className) {
            const nextClassName = String(payload.className).trim();
            const existingClass = await Class_1.ClassModel.findOne({
                className: nextClassName,
                _id: { $ne: klass._id },
                isDeleted: false
            }).lean();
            if (existingClass) {
                throw new Error('Class name already exists');
            }
            klass.className = nextClassName;
            klass.name = nextClassName;
        }
        if (payload.classCode) {
            const nextClassCode = String(payload.classCode).trim();
            const existingCode = await Class_1.ClassModel.findOne({
                classCode: nextClassCode,
                _id: { $ne: klass._id },
                isDeleted: false
            }).lean();
            if (existingCode) {
                throw new Error('Class code already exists');
            }
            klass.classCode = nextClassCode;
        }
        const nextGenderRestriction = payload.genderRestriction ?? klass.genderRestriction;
        const nextTeacherIds = payload.assignedTeachers !== undefined
            ? this.normalizeTeacherIds(payload.assignedTeachers)
            : (Array.isArray(klass.assignedTeachers) ? klass.assignedTeachers.map((item) => String(item)) : []);
        await this.validateTeacherAssignments(nextTeacherIds, nextGenderRestriction);
        const nextWeeklySchedule = payload.weeklySchedule !== undefined
            ? this.normalizeWeeklySchedule(payload.weeklySchedule)
            : (Array.isArray(klass.weeklySchedule) ? klass.weeklySchedule.map((item) => ({
                dayOfWeek: Number(item.dayOfWeek),
                startTime: item.startTime,
                endTime: item.endTime,
                durationMinutes: Number(item.durationMinutes),
                attendanceOpensBeforeMinutes: Number(item.attendanceOpensBeforeMinutes ?? 0),
                attendanceClosesAfterMinutes: Number(item.attendanceClosesAfterMinutes ?? 0)
            })) : []);
        await this.assertNoOverlappingSchedule(classId, nextTeacherIds, payload.branchId !== undefined ? payload.branchId : klass.branchId?.toString?.(), nextWeeklySchedule);
        if (payload.branchId !== undefined)
            klass.branchId = payload.branchId ?? null;
        if (payload.title !== undefined)
            klass.title = payload.title?.trim() || klass.className;
        if (payload.description !== undefined)
            klass.description = payload.description?.trim() ?? '';
        if (payload.subjectId !== undefined)
            klass.subjectId = payload.subjectId ?? null;
        if (payload.teacherId !== undefined)
            klass.teacherId = payload.teacherId ?? nextTeacherIds[0] ?? null;
        if (payload.genderRestriction !== undefined)
            klass.genderRestriction = payload.genderRestriction;
        if (payload.feeAmount !== undefined)
            klass.feeAmount = Number(payload.feeAmount ?? 0);
        if (payload.room !== undefined)
            klass.room = payload.room?.trim() ?? '';
        if (payload.capacity !== undefined)
            klass.capacity = Number(payload.capacity ?? 30);
        if (payload.startDate !== undefined)
            klass.startDate = payload.startDate ? new Date(payload.startDate) : null;
        if (payload.endDate !== undefined)
            klass.endDate = payload.endDate ? new Date(payload.endDate) : null;
        if (payload.weeklySchedule !== undefined)
            klass.weeklySchedule = nextWeeklySchedule;
        if (payload.examSchedule !== undefined)
            klass.examSchedule = Array.isArray(payload.examSchedule) ? payload.examSchedule : [];
        if (payload.active !== undefined)
            klass.active = payload.active;
        if (payload.studentCount !== undefined)
            klass.studentCount = Number(payload.studentCount ?? klass.studentCount ?? 0);
        if (payload.imageUrl !== undefined) {
            klass.imageUrl = this.normalizeImageUrl(payload.imageUrl);
            if (!this.normalizeImageUrl(payload.thumbnailUrl)) {
                klass.thumbnailUrl = klass.imageUrl;
            }
        }
        if (payload.thumbnailUrl !== undefined) {
            klass.thumbnailUrl = this.normalizeImageUrl(payload.thumbnailUrl);
        }
        if (payload.galleryImages !== undefined) {
            klass.galleryImages = this.normalizeGalleryImages(payload.galleryImages);
        }
        const previousTeacherIds = Array.isArray(klass.assignedTeachers) ? klass.assignedTeachers.map((item) => String(item)) : [];
        klass.assignedTeachers = nextTeacherIds;
        await klass.save();
        if (payload.subjects !== undefined) {
            const subjectNames = this.normalizeSubjectNames(payload.subjects);
            await this.syncSubjectsForClass(klass, subjectNames, actorId);
        }
        await this.syncTeacherAssignments(String(klass._id), nextTeacherIds, previousTeacherIds);
        await AuditLog_1.AuditLog.create({
            actor: actorId,
            action: 'CLASS_UPDATED',
            target: String(klass._id),
            metadata: {
                className: klass.className,
                classCode: klass.classCode,
                assignedTeachers: nextTeacherIds
            }
        });
        return klass;
    }
    async deleteClass(classId, actorId) {
        const klass = await Class_1.ClassModel.findOne({ _id: classId, isDeleted: false });
        if (!klass) {
            throw new Error('Class not found');
        }
        const activeStudents = await Student_1.Student.countDocuments({ classId: klass._id, isDeleted: false });
        if (activeStudents > 0) {
            throw new Error('Cannot delete a class with active students');
        }
        const deletedAt = new Date();
        const teacherIds = Array.isArray(klass.assignedTeachers) ? klass.assignedTeachers.map((item) => String(item)) : [];
        await this.syncTeacherAssignments(String(klass._id), [], teacherIds);
        await Subject_1.Subject.updateMany({ classId: klass._id, isDeleted: false }, {
            $set: {
                isDeleted: true,
                deletedAt,
                deletedBy: actorId ?? null,
                activeStatus: false
            }
        });
        klass.isDeleted = true;
        klass.deletedAt = deletedAt;
        klass.deletedBy = actorId;
        klass.active = false;
        await klass.save();
        await AuditLog_1.AuditLog.create({
            actor: actorId,
            action: 'CLASS_DELETED',
            target: String(klass._id),
            metadata: {
                className: klass.className,
                classCode: klass.classCode
            }
        });
        return klass;
    }
}
exports.ClassService = ClassService;
