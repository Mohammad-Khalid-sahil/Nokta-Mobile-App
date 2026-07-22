"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDashboardPeriod = parseDashboardPeriod;
exports.getDashboardDateRange = getDashboardDateRange;
exports.buildTrendBuckets = buildTrendBuckets;
exports.dateRangeFilter = dateRangeFilter;
exports.matchTrendBucket = matchTrendBucket;
function parseDashboardPeriod(value) {
    const normalized = String(value ?? 'month').trim().toLowerCase();
    if (normalized === 'day' || normalized === 'month' || normalized === 'quarter' || normalized === 'year') {
        return normalized;
    }
    return 'month';
}
function getDashboardDateRange(period, now = new Date()) {
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const start = new Date(now);
    if (period === 'day') {
        start.setHours(0, 0, 0, 0);
    }
    else if (period === 'month') {
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
    }
    else if (period === 'quarter') {
        const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
        start.setMonth(quarterStartMonth, 1);
        start.setHours(0, 0, 0, 0);
    }
    else {
        start.setMonth(0, 1);
        start.setHours(0, 0, 0, 0);
    }
    return { start, end, period };
}
function buildTrendBuckets(period, range) {
    const { start, end } = range;
    if (period === 'day') {
        return Array.from({ length: 24 }, (_, hour) => ({
            year: start.getFullYear(),
            month: start.getMonth() + 1,
            day: start.getDate(),
            hour
        }));
    }
    if (period === 'month') {
        const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
        return Array.from({ length: daysInMonth }, (_, index) => ({
            year: start.getFullYear(),
            month: start.getMonth() + 1,
            day: index + 1
        }));
    }
    if (period === 'quarter') {
        const quarterStartMonth = Math.floor(start.getMonth() / 3) * 3;
        return Array.from({ length: 3 }, (_, index) => {
            const monthDate = new Date(start.getFullYear(), quarterStartMonth + index, 1);
            return {
                year: monthDate.getFullYear(),
                month: monthDate.getMonth() + 1
            };
        });
    }
    const lastMonth = end.getMonth();
    return Array.from({ length: lastMonth + 1 }, (_, index) => ({
        year: start.getFullYear(),
        month: index + 1
    }));
}
function dateRangeFilter(start, end) {
    return { $gte: start, $lte: end };
}
function matchTrendBucket(period, bucket, parts) {
    if (parts.year !== bucket.year || parts.month !== bucket.month)
        return false;
    if (period === 'day')
        return parts.hour === bucket.hour;
    if (period === 'month')
        return parts.day === bucket.day;
    return true;
}
