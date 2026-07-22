import assert from 'node:assert/strict';
import { buildStudyPlanFromAnalysis } from './studyRecommendationService';

const lowMath = buildStudyPlanFromAnalysis({
  score: 45,
  subjectName: 'Mathematics',
  weakTopics: ['Algebra chapter 2'],
  language: 'en'
});

assert.equal(lowMath.performanceBand, 'needs_improvement');
assert.match(lowMath.reason, /45/);
assert.match(lowMath.reason, /Mathematics/);
assert.ok(lowMath.actions.some((item) => item.type === 'review' && item.title.includes('Algebra')));
assert.ok(lowMath.actions.some((item) => item.type === 'practice' && item.title.includes('20 equations')));
assert.ok(lowMath.actions.some((item) => item.type === 'watch' && item.title.toLowerCase().includes('algebra')));
assert.ok(lowMath.studyPlan.some((item) => item.startsWith('Review:')));
assert.ok(lowMath.studyPlan.some((item) => item.startsWith('Practice:')));
assert.ok(lowMath.studyPlan.some((item) => item.startsWith('Watch:')));

const highMath = buildStudyPlanFromAnalysis({
  score: 92,
  subjectName: 'Mathematics',
  language: 'en'
});
assert.equal(highMath.performanceBand, 'excellent');
assert.ok(highMath.actions.some((item) => /advanced/i.test(item.title)));
assert.match(highMath.reason, /advanced/i);

const goodPhysics = buildStudyPlanFromAnalysis({
  score: 72,
  subjectName: 'Physics',
  lowScoreSubjects: ['Chemistry'],
  language: 'en'
});
assert.equal(goodPhysics.performanceBand, 'good');
assert.ok(goodPhysics.analysis.lowScoreSubjects.includes('Chemistry'));
assert.ok(goodPhysics.recommendations.length > 0);

const fa = buildStudyPlanFromAnalysis({
  score: 40,
  subjectName: 'ریاضی',
  language: 'fa'
});
assert.equal(fa.actions[0]?.label, 'مرور');
assert.ok(fa.reason.includes('40'));

console.log('studyRecommendationService tests passed');
