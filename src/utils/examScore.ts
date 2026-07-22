/**
 * Unified exam result scoring: score is always 0–100.
 * Grade bands: A 90–100, B 80–89, C 70–79, D 60–69, F below 60.
 */

export const EXAM_SCORE_MAX = 100;
export const EXAM_PASS_PERCENT = 60;

export function clampExamScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(EXAM_SCORE_MAX, Math.max(0, Number(value.toFixed(2))));
}

export function deriveExamGrade(score: number): string {
  const normalized = clampExamScore(score);
  if (normalized >= 90) return 'A';
  if (normalized >= 80) return 'B';
  if (normalized >= 70) return 'C';
  if (normalized >= 60) return 'D';
  return 'F';
}

export function isExamPassed(score: number): boolean {
  return clampExamScore(score) >= EXAM_PASS_PERCENT;
}

export function toOptionalScore(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Resolve a single 0–100 score from a create/update body.
 * Legacy component fields are accepted only as a fallback (summed once),
 * then discarded — new writes must send `score`.
 */
export function resolveUnifiedExamScore(body: Record<string, unknown>): {
  score: number;
  fromLegacyComponents: boolean;
} {
  const direct = toOptionalScore(body.score ?? body.marks ?? body.totalScore);
  if (direct !== null) {
    return { score: clampExamScore(direct), fromLegacyComponents: false };
  }

  const classroomActivity = toOptionalScore(
    body.classroomActivityScore ?? body.classActivityScore
  );
  const attendance = toOptionalScore(body.attendanceScore);
  const midterm = toOptionalScore(body.midtermScore);
  const finalExam = toOptionalScore(body.finalExamScore ?? body.finalScore);
  const parts = [classroomActivity, attendance, midterm, finalExam];
  if (parts.some((value) => value !== null)) {
    const sum = parts.reduce<number>((acc, value) => acc + (value ?? 0), 0);
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
export function migrateResultScoreToUnified(params: {
  score?: unknown;
  classroomActivityScore?: unknown;
  attendanceScore?: unknown;
  midtermScore?: unknown;
  finalExamScore?: unknown;
  totalMarks?: unknown;
}): { score: number; grade: string; passed: boolean } {
  const totalMarksRaw = Number(params.totalMarks ?? EXAM_SCORE_MAX);
  const totalMarks =
    Number.isFinite(totalMarksRaw) && totalMarksRaw > 0 ? totalMarksRaw : EXAM_SCORE_MAX;

  let score = toOptionalScore(params.score);
  if (score === null) {
    const sum =
      (toOptionalScore(params.classroomActivityScore) ?? 0) +
      (toOptionalScore(params.attendanceScore) ?? 0) +
      (toOptionalScore(params.midtermScore) ?? 0) +
      (toOptionalScore(params.finalExamScore) ?? 0);
    score = sum;
  }

  // Normalize marks-obtained → 0–100 when exam total differs from 100.
  if (totalMarks !== EXAM_SCORE_MAX && score <= totalMarks) {
    score = (score / totalMarks) * EXAM_SCORE_MAX;
  }

  const unified = clampExamScore(score);
  return {
    score: unified,
    grade: deriveExamGrade(unified),
    passed: isExamPassed(unified)
  };
}
