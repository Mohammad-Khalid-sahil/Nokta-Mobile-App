export type AttendanceWindowStatus = 'upcoming' | 'active' | 'closed';

export interface WeeklyScheduleItem {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  durationMinutes?: number;
  attendanceOpensBeforeMinutes?: number;
  attendanceClosesAfterMinutes?: number;
}

export interface AttendanceWindow {
  isOpen: boolean;
  opensAt: Date;
  startsAt: Date;
  endsAt: Date;
  closesAt: Date;
  status: AttendanceWindowStatus;
  schedule: WeeklyScheduleItem;
}

function parseTime(value: string) {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error('Invalid class schedule time');
  }
  return { hours, minutes };
}

function atServerLocalTime(baseDate: Date, time: string) {
  const { hours, minutes } = parseTime(time);
  return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hours, minutes, 0, 0);
}

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60 * 1000);
}

export function getScheduleWindowForDate(schedule: WeeklyScheduleItem, baseDate: Date) {
  const startsAt = atServerLocalTime(baseDate, schedule.startTime);
  let endsAt = atServerLocalTime(baseDate, schedule.endTime);
  if (endsAt <= startsAt) {
    endsAt = addMinutes(endsAt, 24 * 60);
  }

  const opensAt = addMinutes(startsAt, -Number(schedule.attendanceOpensBeforeMinutes ?? 0));
  const closesAt = addMinutes(endsAt, Number(schedule.attendanceClosesAfterMinutes ?? 0));
  return { opensAt, startsAt, endsAt, closesAt };
}

export function isAttendanceWindowOpen(schedule: WeeklyScheduleItem, now = new Date()): AttendanceWindow {
  const { opensAt, startsAt, endsAt, closesAt } = getScheduleWindowForDate(schedule, now);
  const timestamp = now.getTime();
  const isOpen = timestamp >= opensAt.getTime() && timestamp <= closesAt.getTime();
  const status: AttendanceWindowStatus = timestamp < opensAt.getTime() ? 'upcoming' : isOpen ? 'active' : 'closed';

  return {
    isOpen,
    opensAt,
    startsAt,
    endsAt,
    closesAt,
    status,
    schedule
  };
}

export function findCurrentAttendanceWindow(schedules: WeeklyScheduleItem[] = [], now = new Date()) {
  const today = now.getDay();
  const todaysSchedules = schedules.filter((schedule) => Number(schedule.dayOfWeek) === today);
  const windows = todaysSchedules.map((schedule) => isAttendanceWindowOpen(schedule, now));
  return windows.find((window) => window.isOpen) ?? windows.find((window) => window.status === 'upcoming') ?? windows[windows.length - 1] ?? null;
}

export function findOpenAttendanceWindow(schedules: WeeklyScheduleItem[] = [], now = new Date()) {
  return schedules
    .filter((schedule) => Number(schedule.dayOfWeek) === now.getDay())
    .map((schedule) => isAttendanceWindowOpen(schedule, now))
    .find((window) => window.isOpen) ?? null;
}

export function getNextScheduleWindow(schedules: WeeklyScheduleItem[] = [], now = new Date(), daysAhead = 14) {
  const candidates: AttendanceWindow[] = [];

  for (let dayOffset = 0; dayOffset <= daysAhead; dayOffset += 1) {
    const candidateDate = new Date(now);
    candidateDate.setDate(now.getDate() + dayOffset);
    const dayOfWeek = candidateDate.getDay();

    for (const schedule of schedules.filter((item) => Number(item.dayOfWeek) === dayOfWeek)) {
      const window = isAttendanceWindowOpen(schedule, candidateDate);
      if (window.closesAt >= now) {
        candidates.push(window);
      }
    }
  }

  return candidates.sort((left, right) => left.opensAt.getTime() - right.opensAt.getTime())[0] ?? null;
}
