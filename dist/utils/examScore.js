"use strict";
/**
 * Unified exam result scoring: score is always 0–100.
 * Grade bands: A 90–100, B 80–89, C 70–79, D 60–69, F below 60.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXAM_PASS_PERCENT = exports.EXAM_SCORE_MAX = void 0;
exports.clampExamScore = clampExamScore;
exports.deriveExamGrade = deriveExamGrade;
exports.isExamPassed = isExamPassed;
exports.toOptionalScore = toOptionalScore;
exports.resolveUnifiedExamScore = resolveUnifiedExamScore;
exports.migrateResultScoreToUnified = migrateResultScoreToUnified;
exports.EXAM_SCORE_MAX = 100;
exports.EXAM_PASS_PERCENT = 60;
function clampExamScore(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.min(exports.EXAM_SCORE_MAX, Math.max(0, Number(value.toFixed(2))));
}
function deriveExamGrade(score) {
    const normalized = clampExamScore(score);
    if (normalized >= 90)
        return 'A';
    if (normalized >= 80)
        return 'B';
    if (normalized >= 70)
        return 'C';
    if (normalized >= 60)
        return 'D';
    return 'F';
}
function isExamPassed(score) {
    return clampExamScore(score) >= exports.EXAM_PASS_PERCENT;
}
function toOptionalScore(value) {
    if (value === null || value === undefined || value === '')
        return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}
/**
 * Resolve a single 0–100 score from a create/update body.
 * Legacy component fields are accepted only as a fallback (summed once),
 * then discarded — new writes must send `score`.
 */
function resolveUnifiedExamScore(body) {
    const direct = toOptionalScore(body.score ?? body.marks ?? body.totalScore);
    if (direct !== null) {
        return { score: clampExamScore(direct), fromLegacyComponents: false };
    }
    const classroomActivity = toOptionalScore(body.classroomActivityScore ?? body.classActivityScore);
    const attendance = toOptionalScore(body.attendanceScore);
    const midterm = toOptionalScore(body.midtermScore);
    const finalExam = toOptionalScore(body.finalExamScore ?? body.finalScore);
    const parts = [classroomActivity, attendance, midterm, finalExam];
    if (parts.some((value) => value !== null)) {
        const sum = parts.reduce((acc, value) => acc + (value ?? 0), 0);
        return { score: clampExamScore(sum), fromLegacyComponents: true };
    }
    return { score: 0, fromLegacyComponents: false };
}
/**
 * Convert a stored result onto the 0–100 scale without inventing scores.
 * Prefer existing `score`; if missing, sum legacy components.
 * When exam.totalMarks is not 100 and score looks like "marks obtained",
 * normalize to a percentage of totalMarks.
 */
function migrateResultScoreToUnified(params) {
    const totalMarksRaw = Number(params.totalMarks ?? exports.EXAM_SCORE_MAX);
    const totalMarks = Number.isFinite(totalMarksRaw) && totalMarksRaw > 0 ? totalMarksRaw : exports.EXAM_SCORE_MAX;
    let score = toOptionalScore(params.score);
    if (score === null) {
        const sum = (toOptionalScore(params.classroomActivityScore) ?? 0) +
            (toOptionalScore(params.attendanceScore) ?? 0) +
            (toOptionalScore(params.midtermScore) ?? 0) +
            (toOptionalScore(params.finalExamScore) ?? 0);
        score = sum;
    }
    // Normalize marks-obtained → 0–100 when exam total differs from 100.
    if (totalMarks !== exports.EXAM_SCORE_MAX && score <= totalMarks) {
        score = (score / totalMarks) * exports.EXAM_SCORE_MAX;
    }
    const unified = clampExamScore(score);
    return {
        score: unified,
        grade: deriveExamGrade(unified),
        passed: isExamPassed(unified)
    };
}
