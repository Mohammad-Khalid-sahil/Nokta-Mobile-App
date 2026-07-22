"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const aiInsightService_1 = require("./aiInsightService");
strict_1.default.equal((0, aiInsightService_1.classifyPerformanceBand)(85), 'excellent');
strict_1.default.equal((0, aiInsightService_1.classifyPerformanceBand)(84), 'good');
strict_1.default.equal((0, aiInsightService_1.classifyPerformanceBand)(60), 'good');
strict_1.default.equal((0, aiInsightService_1.classifyPerformanceBand)(59), 'needs_improvement');
strict_1.default.equal((0, aiInsightService_1.calculateImprovementTrend)(80, 60), 'improving');
strict_1.default.equal((0, aiInsightService_1.calculateImprovementTrend)(50, 70), 'declining');
strict_1.default.equal((0, aiInsightService_1.calculateImprovementTrend)(70, 68), 'stable');
strict_1.default.equal((0, aiInsightService_1.calculateImprovementTrend)(70, null), 'unknown');
const excellent = (0, aiInsightService_1.buildInsightFromStudentData)({
    score: 90,
    subjectName: 'Mathematics',
    previousScores: [70],
    attendanceRate: 95
});
strict_1.default.equal(excellent.message, 'Excellent performance.');
strict_1.default.deepEqual(excellent.recommendations, ['Advanced materials.']);
strict_1.default.equal(excellent.performanceBand, 'excellent');
strict_1.default.equal(excellent.trendStatus, 'improving');
strict_1.default.equal(excellent.generatedBy, 'rule_based');
const good = (0, aiInsightService_1.buildInsightFromStudentData)({
    score: 72,
    subjectName: 'Physics',
    previousScores: [70]
});
strict_1.default.equal(good.message, 'Good progress.');
strict_1.default.deepEqual(good.recommendations, ['Practice and revision.']);
const weak = (0, aiInsightService_1.buildInsightFromStudentData)({
    score: 45,
    subjectName: 'English',
    previousScores: [55],
    weakTopics: ['Grammar', 'Vocabulary']
});
strict_1.default.equal(weak.message, 'Needs improvement.');
strict_1.default.deepEqual(weak.recommendations, [
    'Basic lessons',
    'Practice exercises',
    'Related books'
]);
strict_1.default.ok(weak.weakTopics.includes('Grammar'));
strict_1.default.equal(weak.sourceScore, 45);
console.log('aiInsightService tests passed');
