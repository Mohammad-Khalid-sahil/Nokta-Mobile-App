/**
 * Safe migration: unify Result scores to 0–100 and clear legacy components.
 *
 * Usage:
 *   npx ts-node src/scripts/migrate_result_scores_unified.ts
 *   npx ts-node src/scripts/migrate_result_scores_unified.ts --apply
 *
 * Default is dry-run (no writes). Existing documents keep their data until --apply.
 */
import mongoose from 'mongoose';
import { connectDatabase } from '../database/connect';
import { Result } from '../models/Result';
import { Exam } from '../models/Exam';
import { migrateResultScoreToUnified } from '../utils/examScore';

async function main() {
  const apply = process.argv.includes('--apply');
  await connectDatabase();

  const results = await Result.find({ isDeleted: { $ne: true } })
    .select(
      'score grade classroomActivityScore attendanceScore midtermScore finalExamScore exam'
    )
    .lean<any[]>();

  const examIds = [
    ...new Set(results.map((item) => String(item.exam ?? '')).filter(Boolean))
  ];
  const exams = examIds.length
    ? await Exam.find({ _id: { $in: examIds } }).select('totalMarks').lean<any[]>()
    : [];
  const totalByExam = new Map(
    exams.map((exam) => [String(exam._id), Number(exam.totalMarks ?? 100)])
  );

  let updated = 0;
  let unchanged = 0;
  const samples: Array<Record<string, unknown>> = [];

  for (const result of results) {
    const migrated = migrateResultScoreToUnified({
      score: result.score,
      classroomActivityScore: result.classroomActivityScore,
      attendanceScore: result.attendanceScore,
      midtermScore: result.midtermScore,
      finalExamScore: result.finalExamScore,
      totalMarks: totalByExam.get(String(result.exam)) ?? 100
    });

    const hasLegacyComponents =
      result.classroomActivityScore != null ||
      result.attendanceScore != null ||
      result.midtermScore != null ||
      result.finalExamScore != null;

    const scoreChanged = Number(result.score) !== migrated.score;
    const gradeChanged = String(result.grade ?? '') !== migrated.grade;

    if (!scoreChanged && !gradeChanged && !hasLegacyComponents) {
      unchanged += 1;
      continue;
    }

    if (samples.length < 12) {
      samples.push({
        id: String(result._id),
        before: {
          score: result.score,
          grade: result.grade,
          classroomActivityScore: result.classroomActivityScore,
          attendanceScore: result.attendanceScore,
          midtermScore: result.midtermScore,
          finalExamScore: result.finalExamScore
        },
        after: migrated
      });
    }

    if (apply) {
      await Result.updateOne(
        { _id: result._id },
        {
          $set: {
            score: migrated.score,
            grade: migrated.grade
          },
          $unset: {
            classroomActivityScore: 1,
            attendanceScore: 1,
            midtermScore: 1,
            finalExamScore: 1
          }
        }
      );
    }
    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        scanned: results.length,
        wouldUpdateOrUpdated: updated,
        unchanged,
        samples
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('migrate_result_scores_unified failed:', error);
  process.exitCode = 1;
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
});
