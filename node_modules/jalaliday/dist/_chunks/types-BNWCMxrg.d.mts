import { PluginFunc } from "dayjs";

//#region src/dayjs/types.d.ts

type CalendarType = 'jalali' | 'gregory';
declare module 'dayjs' {
  // @ts-expect-error - dayjs types are not correct
  import type { Dayjs } from 'dayjs';
  export function calendar(calendarType: CalendarType): Dayjs;
  export function isJalali(): boolean;
  export interface FormatObject {
    jalali?: boolean;
  }
  interface Dayjs {
    calendar: (calendarType: CalendarType) => Dayjs;
  }
}