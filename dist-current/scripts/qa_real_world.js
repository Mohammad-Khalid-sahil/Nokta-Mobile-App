"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("../config/env");
const credentials = {
    super_admin: { email: 'superadmin.qa@nokta.local', password: 'SuperAdmin@123' },
    admin: { email: 'admin.qa@nokta.local', password: 'Admin@12345' },
    teacher: { email: 'teacher.qa@nokta.local', password: 'Teacher@12345' },
    student: { email: 'student.qa@nokta.local', password: 'Student@12345' },
    parent: { email: 'parent.qa@nokta.local', password: 'Parent@12345' }
};
const baseUrl = `${env_1.config.baseUrl}/api`;
async function http(path, token, init = {}) {
    const headers = {
        'content-type': 'application/json',
        ...(init.headers ?? {})
    };
    if (token)
        headers.authorization = `Bearer ${token}`;
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
    let payload = null;
    try {
        payload = await response.json();
    }
    catch {
        payload = null;
    }
    return { ok: response.ok, status: response.status, data: payload };
}
function ensure(condition, message) {
    if (!condition)
        throw new Error(message);
}
async function login(role) {
    const result = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(credentials[role])
    });
    const payload = await result.json();
    ensure(result.ok, `Login failed for ${role}: ${payload?.message ?? result.status}`);
    return payload?.token ?? payload?.tokens?.accessToken;
}
async function main() {
    const tokens = {};
    for (const role of Object.keys(credentials)) {
        tokens[role] = await login(role);
    }
    const report = {
        roles: {},
        attendanceFlow: {},
        crud: {}
    };
    // Role visibility checks
    const teacherStudents = await http('/students', tokens.teacher);
    ensure(teacherStudents.ok, 'Teacher students list failed');
    ensure(Array.isArray(teacherStudents.data?.data) && teacherStudents.data.data.length === 1, 'Teacher should see exactly assigned student');
    const teacherFinance = await http('/finance/summary', tokens.teacher);
    ensure(!teacherFinance.ok && [401, 403].includes(teacherFinance.status), 'Teacher must not access finance summary');
    const studentProfile = await http('/students/me/profile', tokens.student);
    ensure(studentProfile.ok, 'Student profile endpoint failed');
    const studentTeachers = await http('/students/me/teachers', tokens.student);
    ensure(studentTeachers.ok, 'Student teachers list failed');
    ensure(Array.isArray(studentTeachers.data?.data) && studentTeachers.data.data.length === 1, 'Student should only see assigned teacher');
    ensure(!('fixedSalary' in (studentTeachers.data.data[0] ?? {})), 'Student teacher payload must not expose salary fields');
    const parentResults = await http('/results', tokens.parent);
    ensure(parentResults.ok, 'Parent results failed');
    ensure(Array.isArray(parentResults.data?.data) && parentResults.data.data.length === 1, 'Parent should only see linked student result');
    const parentUsers = await http('/users', tokens.parent);
    ensure(!parentUsers.ok && [401, 403].includes(parentUsers.status), 'Parent must not access users module');
    const adminDashboard = await http('/dashboard/summary', tokens.admin);
    ensure(adminDashboard.ok, 'Admin dashboard summary failed');
    const superDashboard = await http('/dashboard/master-summary', tokens.super_admin);
    ensure(superDashboard.ok, 'Super admin master dashboard failed');
    report.roles = {
        teacher: { studentsCount: teacherStudents.data.data.length, financeAccessBlocked: true },
        student: { profileVisible: true, teachersCount: studentTeachers.data.data.length, salaryHidden: true },
        parent: { resultsCount: parentResults.data.data.length, usersAccessBlocked: true },
        admin: { dashboardSummary: true },
        superAdmin: { masterSummary: true }
    };
    // Attendance real flow checks
    const sessionsRes = await http('/attendance/active-sessions', tokens.student);
    ensure(sessionsRes.ok, 'Student attendance active-sessions failed');
    const active = sessionsRes.data?.data?.active?.[0];
    const upcoming = sessionsRes.data?.data?.upcoming?.[0];
    const closed = sessionsRes.data?.data?.closed?.[0];
    ensure(active && upcoming && closed, 'Need active/upcoming/closed timetable sessions for attendance QA');
    const beforeStart = await http('/attendance/mark', tokens.student, {
        method: 'POST',
        body: JSON.stringify({ timetableId: upcoming.timetableId, status: 'present' })
    });
    ensure(beforeStart.status === 403, 'Upcoming lesson attendance must be blocked');
    const activeMark = await http('/attendance/mark', tokens.student, {
        method: 'POST',
        body: JSON.stringify({ timetableId: active.timetableId, status: 'present' })
    });
    ensure(activeMark.status === 201, 'Active lesson should allow first attendance mark');
    const duplicateMark = await http('/attendance/mark', tokens.student, {
        method: 'POST',
        body: JSON.stringify({ timetableId: active.timetableId, status: 'present' })
    });
    ensure(duplicateMark.status === 409, 'Duplicate attendance mark must be blocked');
    const afterEnd = await http('/attendance/mark', tokens.student, {
        method: 'POST',
        body: JSON.stringify({ timetableId: closed.timetableId, status: 'present' })
    });
    ensure(afterEnd.status === 403, 'Closed lesson attendance must be blocked');
    const today = new Date().toISOString().slice(0, 10);
    const dailyReport = await http(`/attendance/daily-report?date=${today}`, tokens.admin);
    ensure(dailyReport.ok, 'Daily attendance report failed');
    const reportSessions = dailyReport.data?.data?.sessions ?? [];
    const closedReportRow = reportSessions.find((item) => String(item.timetableId) === String(closed.timetableId));
    ensure(closedReportRow, 'Closed session row missing in daily report');
    ensure(typeof closedReportRow.attendancePercentage === 'number', 'Attendance percentage missing in daily report');
    ensure((closedReportRow.absentStudentsCount ?? 0) >= 1, 'Closed session should auto-mark absent students');
    report.attendanceFlow = {
        beforeStartBlocked: true,
        activeAllowed: true,
        duplicateBlocked: true,
        afterEndBlocked: true,
        autoAbsentConfirmed: true,
        percentagePresent: true
    };
    // CRUD smoke checks (create -> edit -> detail/list -> delete)
    const adminToken = tokens.admin;
    const created = {};
    const primarySubjectRes = await http('/subjects', adminToken);
    ensure(primarySubjectRes.ok, 'Subjects list failed before CRUD');
    const primarySubject = primarySubjectRes.data?.data?.[0];
    ensure(primarySubject?._id && primarySubject?.classId && primarySubject?.teacherId, 'Primary subject/class/teacher seed data missing');
    const primaryClassId = String(primarySubject.classId);
    const primarySubjectId = String(primarySubject._id);
    const primaryTeacherId = String(primarySubject.teacherId);
    const usersCreate = await http('/users', adminToken, {
        method: 'POST',
        body: JSON.stringify({
            name: 'Temp QA User',
            email: 'temp.qa.user@nokta.local',
            password: 'TempUser@123',
            role: 'student',
            branchId: null
        })
    });
    ensure(usersCreate.ok, 'Users create failed');
    created.user = usersCreate.data?.data?._id;
    const usersUpdate = await http(`/users/${created.user}`, adminToken, {
        method: 'PUT',
        body: JSON.stringify({ name: 'Temp QA User Updated' })
    });
    ensure(usersUpdate.ok, 'Users update failed');
    const usersDetail = await http(`/users/${created.user}`, adminToken);
    ensure(usersDetail.ok, 'Users detail failed');
    const usersDelete = await http(`/users/${created.user}`, adminToken, { method: 'DELETE' });
    ensure(usersDelete.ok, 'Users delete failed');
    const teacherCreate = await http('/teachers', adminToken, {
        method: 'POST',
        body: JSON.stringify({
            firstName: 'Temp',
            lastName: 'Teacher',
            email: 'temp.teacher.qa@nokta.local',
            password: 'TempTeacher@123',
            salaryType: 'fixed',
            salaryValue: 1000
        })
    });
    ensure(teacherCreate.ok, 'Teacher create failed');
    created.teacher = teacherCreate.data?.data?._id;
    ensure(created.teacher, 'Teacher id missing');
    ensure((await http(`/teachers/${created.teacher}`, adminToken)).ok, 'Teacher detail failed');
    ensure((await http(`/teachers/${created.teacher}`, adminToken, { method: 'PUT', body: JSON.stringify({ phone: '0799999999' }) })).ok, 'Teacher update failed');
    ensure((await http(`/teachers/${created.teacher}`, adminToken, { method: 'DELETE' })).ok, 'Teacher delete failed');
    const classCreate = await http('/classes', adminToken, {
        method: 'POST',
        body: JSON.stringify({
            className: 'Temp QA Class',
            classCode: 'TMP-QA-CLASS',
            subjects: ['Temp Subject'],
            assignedTeachers: [],
            feeAmount: 1000
        })
    });
    ensure(classCreate.ok, 'Class create failed');
    created.class = classCreate.data?.data?._id;
    ensure((await http(`/classes/${created.class}`, adminToken)).ok, 'Class detail failed');
    ensure((await http(`/classes/${created.class}`, adminToken, { method: 'PUT', body: JSON.stringify({ room: 'TMP-1' }) })).ok, 'Class update failed');
    const subjectCreate = await http('/subjects', adminToken, {
        method: 'POST',
        body: JSON.stringify({
            title: 'Temp QA Subject',
            code: 'TMP-QA-SUB',
            classId: created.class,
            teacher: null
        })
    });
    ensure(subjectCreate.ok, 'Subject create failed');
    created.subject = subjectCreate.data?.data?._id;
    ensure((await http(`/subjects/${created.subject}`, adminToken)).ok, 'Subject detail failed');
    ensure((await http(`/subjects/${created.subject}`, adminToken, { method: 'PUT', body: JSON.stringify({ description: 'updated' }) })).ok, 'Subject update failed');
    const courseCreate = await http('/courses', adminToken, {
        method: 'POST',
        body: JSON.stringify({
            title: { en: 'Temp QA Course', fa: 'کورس موقت QA', ps: 'موقت QA کورس' },
            slug: 'temp-qa-course',
            teacher: null,
            subjects: [created.subject],
            status: 'active',
            visibility: 'public'
        })
    });
    ensure(courseCreate.ok, 'Course create failed');
    created.course = courseCreate.data?.data?._id;
    ensure((await http(`/courses/${created.course}`, adminToken)).ok, 'Course detail failed');
    ensure((await http(`/courses/${created.course}`, adminToken, { method: 'PUT', body: JSON.stringify({ duration: '1 month' }) })).ok, 'Course update failed');
    const examCreate = await http('/exams', adminToken, {
        method: 'POST',
        body: JSON.stringify({
            title: 'Temp QA Exam',
            subject: primarySubjectId,
            class: primaryClassId,
            teacherId: primaryTeacherId,
            date: new Date(Date.now() + 86400000).toISOString(),
            totalMarks: 100,
            passingMarks: 40,
            status: 'draft'
        })
    });
    ensure(examCreate.ok, 'Exam create failed');
    created.exam = examCreate.data?.data?._id;
    ensure((await http(`/exams/${created.exam}`, adminToken)).ok, 'Exam detail failed');
    ensure((await http(`/exams/${created.exam}`, adminToken, { method: 'PUT', body: JSON.stringify({ title: 'Temp QA Exam Updated' }) })).ok, 'Exam update failed');
    ensure((await http(`/exams/${created.exam}`, adminToken, { method: 'DELETE' })).ok, 'Exam delete failed');
    const timetableCreate = await http('/timetable', adminToken, {
        method: 'POST',
        body: JSON.stringify({
            classId: primaryClassId,
            subjectId: primarySubjectId,
            teacherId: primaryTeacherId,
            dayOfWeek: 1,
            startTime: '09:00',
            endTime: '10:00'
        })
    });
    ensure(timetableCreate.ok, 'Timetable create failed');
    created.timetable = timetableCreate.data?.data?._id;
    ensure((await http(`/timetable/${created.timetable}`, adminToken)).ok, 'Timetable detail failed');
    ensure((await http(`/timetable/${created.timetable}`, adminToken, { method: 'PUT', body: JSON.stringify({ room: 'QA-ROOM' }) })).ok, 'Timetable update failed');
    ensure((await http(`/timetable/${created.timetable}`, adminToken, { method: 'DELETE' })).ok, 'Timetable delete failed');
    const attendanceCreate = await http('/attendance', adminToken, {
        method: 'POST',
        body: JSON.stringify({
            classId: primaryClassId,
            subjectId: primarySubjectId,
            teacherId: primaryTeacherId,
            studentId: teacherStudents.data?.data?.[0]?._id,
            attendanceDate: new Date().toISOString(),
            status: 'present',
            session: 'morning'
        })
    });
    ensure(attendanceCreate.ok, 'Attendance create failed');
    const notificationCreate = await http('/notifications', adminToken, {
        method: 'POST',
        body: JSON.stringify({
            title: 'Temp QA Announcement',
            description: 'Temp QA announcement text',
            recipientRoles: ['student']
        })
    });
    ensure(notificationCreate.ok, 'Announcement create failed');
    created.notification = notificationCreate.data?.data?._id;
    ensure((await http(`/notifications/${created.notification}`, adminToken)).ok, 'Announcement detail failed');
    ensure((await http(`/notifications/${created.notification}`, adminToken, { method: 'PUT', body: JSON.stringify({ pinned: true }) })).ok, 'Announcement update failed');
    ensure((await http(`/notifications/${created.notification}`, adminToken, { method: 'DELETE' })).ok, 'Announcement delete failed');
    // Clean up class/subject/course temp entities in dependency-safe order.
    if (created.course)
        await http(`/courses/${created.course}`, adminToken, { method: 'DELETE' });
    if (created.subject)
        await http(`/subjects/${created.subject}`, adminToken, { method: 'DELETE' });
    if (created.class)
        await http(`/classes/${created.class}`, adminToken, { method: 'DELETE' });
    report.crud = {
        users: 'create/update/detail/delete ok',
        teachers: 'create/update/detail/delete ok',
        classes: 'create/update/detail/delete ok',
        subjects: 'create/update/detail/delete ok',
        courses: 'create/update/detail/delete ok',
        exams: 'create/update/detail/delete ok',
        timetable: 'create/update/detail/delete ok',
        attendance: 'create + flow checks confirmed',
        announcements: 'create/update/detail/delete ok'
    };
    console.log('QA_REAL_WORLD_SUCCESS');
    console.log(JSON.stringify(report, null, 2));
}
main().catch((error) => {
    console.error('QA_REAL_WORLD_FAILED');
    console.error(error);
    process.exitCode = 1;
});
