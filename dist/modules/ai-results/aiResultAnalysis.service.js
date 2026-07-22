"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeResultWithRules = analyzeResultWithRules;
exports.upsertAIResultInsight = upsertAIResultInsight;
exports.getStoredOrCreateAIResultInsight = getStoredOrCreateAIResultInsight;
exports.generateExamInsights = generateExamInsights;
const AIClassExamInsight_1 = require("../../models/AIClassExamInsight");
const AIResultInsight_1 = require("../../models/AIResultInsight");
const Exam_1 = require("../../models/Exam");
const Result_1 = require("../../models/Result");
const aiInsightService_1 = require("../../services/aiInsightService");
/**
 * Deterministic rule analysis used by unit tests and legacy callers.
 * Delegates to AIInsightService — does not invent random text.
 */
function analyzeResultWithRules(payload) {
    const insight = (0, aiInsightService_1.buildInsightFromStudentData)({
        score: Number(payload.result?.score ?? 0),
        grade: payload.result?.grade,
        subjectName: payload.exam?.subject?.title ?? 'subject',
        previousScores: (payload.previousResults ?? [])
            .map((item) => Number(item?.score ?? NaN))
            .filter((score) => Number.isFinite(score)),
        attendanceRate: payload.attendanceRate ?? null
    });
    return {
        overallScore: insight.overallScore,
        grade: insight.grade,
        trendStatus: insight.trendStatus,
        riskLevel: insight.riskLevel,
        strengths: insight.strengths,
        weaknesses: insight.weaknesses,
        recommendations: insight.recommendations,
        teacherNotesSuggestion: insight.teacherNotesSuggestion,
        parentSummary: insight.parentSummary,
        studentSummary: insight.studentSummary,
        classComparison: insight.classComparison,
        generatedBy: 'rule_based',
        confidenceScore: insight.confidenceScore
    };
}
async function upsertAIResultInsight(params) {
    return aiInsightService_1.aiInsightService.getOrCreateResultInsight(params.resultId, {
        force: params.force ?? false,
        actorId: params.actorId ?? null
    });
}
async function getStoredOrCreateAIResultInsight(params) {
    return aiInsightService_1.aiInsightService.getOrCreateResultInsight(params.resultId, {
        force: false,
        actorId: params.actorId ?? null
    });
}
async function generateExamInsights(examId) {
    const exam = await Exam_1.Exam.findById(examId).lean();
    if (!exam)
        throw new Error('Exam not found');
    const results = await Result_1.Result.find({ exam: exam._id, isDeleted: false })
        .select('_id student score')
        .lean();
    for (const result of results) {
        await aiInsightService_1.aiInsightService.getOrCreateResultInsight(String(result._id), {
            force: false
        });
    }
    const insights = await AIResultInsight_1.AIResultInsight.find({
        examId: exam._id,
        isDeleted: { $ne: true }
    }).lean();
    const scores = results
        .map((item) => Number(item.score ?? 0))
        .filter((score) => Number.isFinite(score));
    const averageScore = scores.length
        ? Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(2))
        : 0;
    const highestScore = scores.length ? Math.max(...scores) : 0;
    const lowestScore = scores.length ? Math.min(...scores) : 0;
    const passMark = Number(exam.passingMarks ?? 60);
    const passCount = scores.filter((score) => score >= passMark).length;
    const failCount = scores.length - passCount;
    const passRate = scores.length
        ? Number(((passCount / scores.length) * 100).toFixed(2))
        : 0;
    const failRate = scores.length
        ? Number(((failCount / scores.length) * 100).toFixed(2))
        : 0;
    const atRiskStudentCount = insights.filter((item) => item.riskLevel === 'high').length;
    const hasResults = scores.length > 0;
    const recommendations = hasResults
        ? [
            failRate > 40
                ? 'Plan a focused revision cycle for weak topics.'
                : 'Maintain the current teaching pace with periodic checks.',
            atRiskStudentCount > 0
                ? 'Schedule targeted intervention sessions for high-risk students.'
                : 'Continue regular formative assessments.'
        ]
        : ['Enter student results to generate class analysis.'];
    const unusualScoreDistribution = scores.length >= 5 && Math.max(...scores) - Math.min(...scores) > 60
        ? 'High variance in score distribution detected.'
        : '';
    const classInsight = await AIClassExamInsight_1.AIClassExamInsight.findOneAndUpdate({ examId: exam._id, classId: exam.class }, {
        $set: {
            examId: exam._id,
            classId: exam.class,
            branchId: exam.branchId ?? null,
            averageScore,
            passRate,
            failRate,
            topStrengths: hasResults && passRate >= 60
                ? ['Majority of students met the passing mark']
                : [],
            commonWeaknesses: hasResults && failRate > 30 ? ['Weak performance cluster detected'] : [],
            atRiskStudentCount: hasResults ? atRiskStudentCount : 0,
            recommendations,
            unusualScoreDistribution: hasResults ? unusualScoreDistribution : '',
            generatedBy: 'rule_based'
        }
    }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
    return {
        ...classInsight,
        hasResults,
        resultCount: scores.length,
        highestScore,
        lowestScore,
        passCount,
        failCount,
        totalMarks: 100,
        passingMarks: passMark,
        examTitle: exam.title ?? '',
        executiveSummary: hasResults
            ? `Class average ${averageScore} / 100. Pass rate ${passRate}% (${passCount} passed, ${failCount} failed) across ${scores.length} graded results.`
            : 'No graded results are available for this exam yet.'
    };
}
