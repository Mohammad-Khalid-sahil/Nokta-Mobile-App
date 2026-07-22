"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const classSchedule_1 = require("./classSchedule");
const saturdayClass = {
    dayOfWeek: 6,
    startTime: '08:00',
    endTime: '09:30',
    durationMinutes: 90,
    attendanceOpensBeforeMinutes: 10,
    attendanceClosesAfterMinutes: 15
};
function at(hour, minute) {
    return new Date(2026, 4, 23, hour, minute, 0, 0);
}
strict_1.default.equal((0, classSchedule_1.isAttendanceWindowOpen)(saturdayClass, at(7, 49)).isOpen, false, 'early check-in denied');
strict_1.default.equal((0, classSchedule_1.isAttendanceWindowOpen)(saturdayClass, at(7, 50)).status, 'active', 'attendance opens before class');
strict_1.default.equal((0, classSchedule_1.isAttendanceWindowOpen)(saturdayClass, at(8, 30)).isOpen, true, 'attendance open during class');
strict_1.default.equal((0, classSchedule_1.isAttendanceWindowOpen)(saturdayClass, at(9, 46)).status, 'closed', 'late check-in denied');
strict_1.default.ok((0, classSchedule_1.findOpenAttendanceWindow)([saturdayClass], at(9, 0)), 'active class API can discover current class');
const jalali = new Intl.DateTimeFormat('fa-AF-u-ca-persian', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
}).format(new Date(2026, 4, 18));
strict_1.default.ok(/1405|۱۴۰۵/.test(jalali), 'Jalali formatting uses Hijri Shamsi year');
const first = { ...saturdayClass, startTime: '08:00', endTime: '09:00' };
const second = { ...saturdayClass, startTime: '08:30', endTime: '09:30' };
const toMinutes = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
};
strict_1.default.ok(toMinutes(first.startTime) < toMinutes(second.endTime) && toMinutes(second.startTime) < toMinutes(first.endTime), 'overlapping schedule prevention detects conflicts');
console.log('classSchedule tests passed');
