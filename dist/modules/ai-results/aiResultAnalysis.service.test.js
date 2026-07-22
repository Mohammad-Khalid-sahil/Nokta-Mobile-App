"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const aiResultAnalysis_service_1 = require("./aiResultAnalysis.service");
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
const basePayload = {
    exam: { subject: { title: 'Mathematics' } },
    student: { _id: 'student-1' },
    previousResults: []
};
const highScore = (0, aiResultAnalysis_service_1.analyzeResultWithRules)({
    ...basePayload,
    result: { score: 92, grade: 'A' },
    attendanceRate: 90
});
assert(highScore.riskLevel === 'low', 'high score should produce low risk');
assert(highScore.trendStatus === 'unknown', 'no history should produce unknown trend');
assert(highScore.studentSummary === 'Excellent performance.', 'high score should use excellent message');
assert(highScore.recommendations.includes('Advanced materials.'), 'high score should recommend advanced materials');
const decliningHighRisk = (0, aiResultAnalysis_service_1.analyzeResultWithRules)({
    ...basePayload,
    result: { score: 48, grade: 'F' },
    previousResults: [{ score: 70 }],
    attendanceRate: 60
});
assert(decliningHighRisk.riskLevel === 'high', 'low score + poor attendance should produce high risk');
assert(decliningHighRisk.trendStatus === 'declining', 'large score drop should be declining');
assert(decliningHighRisk.studentSummary === 'Needs improvement.', 'low score should use needs improvement message');
assert(decliningHighRisk.recommendations.includes('Basic lessons'), 'low score should recommend basic lessons');
const improvingMedium = (0, aiResultAnalysis_service_1.analyzeResultWithRules)({
    ...basePayload,
    result: { score: 65, grade: 'D' },
    previousResults: [{ score: 50 }],
    attendanceRate: 80
});
assert(improvingMedium.trendStatus === 'improving', 'large score increase should be improving');
assert(['low', 'medium'].includes(improvingMedium.riskLevel), 'improving mid score should not be high risk');
assert(improvingMedium.studentSummary === 'Good progress.', 'mid score should use good progress message');
assert(improvingMedium.recommendations.includes('Practice and revision.'), 'mid score should recommend practice and revision');
console.log('aiResultAnalysis tests passed');
