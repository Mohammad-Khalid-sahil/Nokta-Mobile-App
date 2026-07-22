import assert from 'node:assert/strict';
import {
  clampExamScore,
  deriveExamGrade,
  isExamPassed,
  migrateResultScoreToUnified,
  resolveUnifiedExamScore
} from './examScore';

function testClampAndGrade() {
  assert.equal(clampExamScore(-5), 0);
  assert.equal(clampExamScore(150), 100);
  assert.equal(deriveExamGrade(95), 'A');
  assert.equal(deriveExamGrade(85), 'B');
  assert.equal(deriveExamGrade(72), 'C');
  assert.equal(deriveExamGrade(60), 'D');
  assert.equal(deriveExamGrade(59), 'F');
  assert.equal(isExamPassed(60), true);
  assert.equal(isExamPassed(59), false);
}

function testResolveUnifiedScore() {
  const direct = resolveUnifiedExamScore({ score: 86, classroomActivityScore: 10 });
  assert.equal(direct.score, 86);
  assert.equal(direct.fromLegacyComponents, false);

  const legacy = resolveUnifiedExamScore({
    classroomActivityScore: 8,
    attendanceScore: 9,
    midtermScore: 15,
    finalExamScore: 50
  });
  assert.equal(legacy.score, 82);
  assert.equal(legacy.fromLegacyComponents, true);
}

function testMigrationNormalize() {
  const migrated = migrateResultScoreToUnified({ score: 40, totalMarks: 50 });
  assert.equal(migrated.score, 80);
  assert.equal(migrated.grade, 'B');
  assert.equal(migrated.passed, true);
}

export function runExamScoreTests() {
  testClampAndGrade();
  testResolveUnifiedScore();
  testMigrationNormalize();
  console.log('examScore.test.ts: all tests passed');
}

if (require.main === module) {
  runExamScoreTests();
}
