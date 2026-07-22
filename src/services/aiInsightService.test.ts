import assert from 'node:assert/strict';
import {
  buildInsightFromStudentData,
  calculateImprovementTrend,
  classifyPerformanceBand
} from './aiInsightService';

assert.equal(classifyPerformanceBand(85), 'excellent');
assert.equal(classifyPerformanceBand(84), 'good');
assert.equal(classifyPerformanceBand(60), 'good');
assert.equal(classifyPerformanceBand(59), 'needs_improvement');

assert.equal(calculateImprovementTrend(80, 60), 'improving');
assert.equal(calculateImprovementTrend(50, 70), 'declining');
assert.equal(calculateImprovementTrend(70, 68), 'stable');
assert.equal(calculateImprovementTrend(70, null), 'unknown');

const excellent = buildInsightFromStudentData({
  score: 90,
  subjectName: 'Mathematics',
  previousScores: [70],
  attendanceRate: 95
});
assert.equal(excellent.message, 'Excellent performance.');
assert.deepEqual(excellent.recommendations, ['Advanced materials.']);
assert.equal(excellent.performanceBand, 'excellent');
assert.equal(excellent.trendStatus, 'improving');
assert.equal(excellent.generatedBy, 'rule_based');

const good = buildInsightFromStudentData({
  score: 72,
  subjectName: 'Physics',
  previousScores: [70]
});
assert.equal(good.message, 'Good progress.');
assert.deepEqual(good.recommendations, ['Practice and revision.']);

const weak = buildInsightFromStudentData({
  score: 45,
  subjectName: 'English',
  previousScores: [55],
  weakTopics: ['Grammar', 'Vocabulary']
});
assert.equal(weak.message, 'Needs improvement.');
assert.deepEqual(weak.recommendations, [
  'Basic lessons',
  'Practice exercises',
  'Related books'
]);
assert.ok(weak.weakTopics.includes('Grammar'));
assert.equal(weak.sourceScore, 45);

console.log('aiInsightService tests passed');
