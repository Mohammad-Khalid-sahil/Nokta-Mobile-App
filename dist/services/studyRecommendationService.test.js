"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const studyRecommendationService_1 = require("./studyRecommendationService");
const lowMath = (0, studyRecommendationService_1.buildStudyPlanFromAnalysis)({
    score: 45,
    subjectName: 'Mathematics',
    weakTopics: ['Algebra chapter 2'],
    language: 'en'
});
strict_1.default.equal(lowMath.performanceBand, 'needs_improvement');
strict_1.default.match(lowMath.reason, /45/);
strict_1.default.match(lowMath.reason, /Mathematics/);
strict_1.default.ok(lowMath.actions.some((item) => item.type === 'review' && item.title.includes('Algebra')));
strict_1.default.ok(lowMath.actions.some((item) => item.type === 'practice' && item.title.includes('20 equations')));
strict_1.default.ok(lowMath.actions.some((item) => item.type === 'watch' && item.title.toLowerCase().includes('algebra')));
strict_1.default.ok(lowMath.studyPlan.some((item) => item.startsWith('Review:')));
strict_1.default.ok(lowMath.studyPlan.some((item) => item.startsWith('Practice:')));
strict_1.default.ok(lowMath.studyPlan.some((item) => item.startsWith('Watch:')));
const highMath = (0, studyRecommendationService_1.buildStudyPlanFromAnalysis)({
    score: 92,
    subjectName: 'Mathematics',
    language: 'en'
});
strict_1.default.equal(highMath.performanceBand, 'excellent');
strict_1.default.ok(highMath.actions.some((item) => /advanced/i.test(item.title)));
strict_1.default.match(highMath.reason, /advanced/i);
const goodPhysics = (0, studyRecommendationService_1.buildStudyPlanFromAnalysis)({
    score: 72,
    subjectName: 'Physics',
    lowScoreSubjects: ['Chemistry'],
    language: 'en'
});
strict_1.default.equal(goodPhysics.performanceBand, 'good');
strict_1.default.ok(goodPhysics.analysis.lowScoreSubjects.includes('Chemistry'));
strict_1.default.ok(goodPhysics.recommendations.length > 0);
const fa = (0, studyRecommendationService_1.buildStudyPlanFromAnalysis)({
    score: 40,
    subjectName: 'ریاضی',
    language: 'fa'
});
strict_1.default.equal(fa.actions[0]?.label, 'مرور');
strict_1.default.ok(fa.reason.includes('40'));
console.log('studyRecommendationService tests passed');
