"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runExamScoreTests = runExamScoreTests;
const strict_1 = __importDefault(require("node:assert/strict"));
const examScore_1 = require("./examScore");
function testClampAndGrade() {
    strict_1.default.equal((0, examScore_1.clampExamScore)(-5), 0);
    strict_1.default.equal((0, examScore_1.clampExamScore)(150), 100);
    strict_1.default.equal((0, examScore_1.deriveExamGrade)(95), 'A');
    strict_1.default.equal((0, examScore_1.deriveExamGrade)(85), 'B');
    strict_1.default.equal((0, examScore_1.deriveExamGrade)(72), 'C');
    strict_1.default.equal((0, examScore_1.deriveExamGrade)(60), 'D');
    strict_1.default.equal((0, examScore_1.deriveExamGrade)(59), 'F');
    strict_1.default.equal((0, examScore_1.isExamPassed)(60), true);
    strict_1.default.equal((0, examScore_1.isExamPassed)(59), false);
}
function testResolveUnifiedScore() {
    const direct = (0, examScore_1.resolveUnifiedExamScore)({ score: 86, classroomActivityScore: 10 });
    strict_1.default.equal(direct.score, 86);
    strict_1.default.equal(direct.fromLegacyComponents, false);
    const legacy = (0, examScore_1.resolveUnifiedExamScore)({
        classroomActivityScore: 8,
        attendanceScore: 9,
        midtermScore: 15,
        finalExamScore: 50
    });
    strict_1.default.equal(legacy.score, 82);
    strict_1.default.equal(legacy.fromLegacyComponents, true);
}
function testMigrationNormalize() {
    const migrated = (0, examScore_1.migrateResultScoreToUnified)({ score: 40, totalMarks: 50 });
    strict_1.default.equal(migrated.score, 80);
    strict_1.default.equal(migrated.grade, 'B');
    strict_1.default.equal(migrated.passed, true);
}
function runExamScoreTests() {
    testClampAndGrade();
    testResolveUnifiedScore();
    testMigrationNormalize();
    console.log('examScore.test.ts: all tests passed');
}
if (require.main === module) {
    runExamScoreTests();
}
