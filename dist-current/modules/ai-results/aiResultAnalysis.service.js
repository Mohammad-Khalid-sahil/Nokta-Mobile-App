"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeResultWithRules = analyzeResultWithRules;
exports.upsertAIResultInsight = upsertAIResultInsight;
exports.generateExamInsights = generateExamInsights;
const env_1 = require("../../config/env");
const Attendance_1 = require("../../models/Attendance");
const AIClassExamInsight_1 = require("../../models/AIClassExamInsight");
const AIResultInsight_1 = require("../../models/AIResultInsight");
const Exam_1 = require("../../models/Exam");
const Result_1 = require("../../models/Result");
const notificationDispatchService_1 = require("../../services/notificationDispatchService");
const aiProviderService_1 = require("../../services/aiProviderService");
const logger_1 = require("../../utils/logger");
const notificationDispatch = new notificationDispatchService_1.NotificationDispatchService();
function calculateTrend(currentScore, previousScore) {
    if (previousScore === null || Number.isNaN(previousScore))
        return 'unknown';
    const delta = currentScore - previousScore;
    if (delta > 10)
        return 'improving';
    if (delta < -10)
        return 'declining';
    return 'stable';
}
function classifyRisk(score, attendanceRate, trendStatus) {
    if (score < 60 && (attendanceRate === null || attendanceRate < 75 || trendStatus === 'declining'))
        return 'high';
    if (score < 60 || trendStatus === 'declining')
        return 'medium';
    return 'low';
}
async function maybeEnhanceWithProvider(analysis, payload) {
    if (!env_1.config.aiProviderEnabled || !env_1.config.aiProviderApiKey) {
        return analysis;
    }
    if (env_1.config.aiAllowSensitiveExternal) {
        logger_1.logger.info('AI provider enabled with sensitive external flag; using rule-based output only.');
        return analysis;
    }
    return aiProviderService_1.aiProviderService.enhanceInsight({
        analysis,
        subjectName: payload.exam?.subject?.title ?? 'subject',
        studentName: payload.student?.name ?? payload.student?.fullName
    });
}
function analyzeResultWithRules(payload) {
    const score = Number(payload.result?.score ?? 0);
    const grade = String(payload.result?.grade ?? '');
    const previousScore = payload.previousResults.length ? Number(payload.previousResults[0]?.score ?? NaN) : null;
    const trendStatus = calculateTrend(score, previousScore);
    const attendanceRate = payload.attendanceRate ?? null;
    const riskLevel = classifyRisk(score, attendanceRate, trendStatus);
    const subjectName = payload.exam?.subject?.title ?? 'subject';
    const strengths = [];
    const weaknesses = [];
    const recommendations = [];
    if (score >= 85) {
        strengths.push(`Strong performance in ${subjectName}`);
        recommendations.push('Continue advanced practice and mentoring peers.');
    }
    else if (score >= 60) {
        strengths.push(`Moderate understanding in ${subjectName}`);
        weaknesses.push('Inconsistent mastery across topics');
        recommendations.push('Increase weekly revision and targeted practice questions.');
    }
    else {
        weaknesses.push(`Weak performance in ${subjectName}`);
        recommendations.push('Schedule a focused intervention plan with teacher support.');
    }
    if (trendStatus === 'declining') {
        weaknesses.push('Performance trend is declining');
        recommendations.push('Review mistakes from previous exams and set a 2-week recovery plan.');
    }
    if (trendStatus === 'improving') {
        strengths.push('Performance trend is improving');
        recommendations.push('Maintain the current study routine and set next exam target.');
    }
    if (attendanceRate !== null) {
        if (attendanceRate < 75) {
            weaknesses.push('Low attendance may be affecting academic progress');
            recommendations.push('Improve attendance consistency to stabilize learning outcomes.');
        }
        else {
            strengths.push('Attendance is supportive of progress');
        }
    }
    const teacherNotesSuggestion = riskLevel === 'high'
        ? 'Prioritize direct intervention, assign remedial tasks, and coordinate with guardians.'
        : riskLevel === 'medium'
            ? 'Monitor weekly progress and provide structured feedback.'
            : 'Encourage continued growth with stretch goals.';
    const parentSummary = riskLevel === 'high'
        ? 'Your student needs extra support this period. Regular study time and teacher follow-up are recommended.'
        : 'Your student is progressing. Consistent study habits and attendance will help maintain growth.';
    const studentSummary = riskLevel === 'high'
        ? 'You can improve with daily short practice and support from your teacher. You are not behind permanently.'
        : 'Keep going. Your effort is moving in the right direction.';
    return {
        overallScore: score,
        grade,
        trendStatus,
        riskLevel,
        strengths: Array.from(new Set(strengths)).slice(0, 6),
        weaknesses: Array.from(new Set(weaknesses)).slice(0, 6),
        recommendations: Array.from(new Set(recommendations)).slice(0, 8),
        teacherNotesSuggestion,
        parentSummary,
        studentSummary,
        classComparison: '',
        generatedBy: 'rule_based',
        confidenceScore: 0.78
    };
}
async function upsertAIResultInsight(params) {
    const result = await Result_1.Result.findById(params.resultId)
        .populate({
        path: 'exam',
        select: 'subject class teacherId branchId totalMarks passingMarks',
        populate: [
            { path: 'subject', select: 'title code' },
            { path: 'class', select: 'className name classCode' }
        ]
    })
        .populate('student', 'branchId')
        .lean();
    if (!result)
        throw new Error('Result not found');
    const exam = result.exam;
    const student = result.student;
    const studentId = result.student?._id ?? result.student;
    const examId = result.exam?._id ?? result.exam;
    const classId = result.classId ?? exam?.class?._id ?? exam?.class ?? null;
    const previousResults = await Result_1.Result.find({
        student: studentId,
        _id: { $ne: result._id },
        isDeleted: false
    })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();
    const attendance = await Attendance_1.Attendance.aggregate([
        { $match: { userId: studentId, isDeleted: { $ne: true } } },
        { $group: { _id: null, total: { $sum: 1 }, present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late', 'excused']] }, 1, 0] } } } }
    ]);
    const attendanceRate = attendance.length && attendance[0].total > 0
        ? Math.round((attendance[0].present / attendance[0].total) * 100)
        : null;
    const analysis = await maybeEnhanceWithProvider(analyzeResultWithRules({
        result,
        exam,
        student,
        previousResults,
        attendanceRate
    }), {
        result,
        exam,
        student,
        previousResults,
        attendanceRate
    });
    const classAvg = await Result_1.Result.aggregate([
        { $match: { exam: examId, isDeleted: { $ne: true } } },
        { $group: { _id: null, avg: { $avg: '$score' } } }
    ]);
    const average = classAvg[0]?.avg ? Number(classAvg[0].avg) : 0;
    analysis.classComparison = average
        ? `Score ${analysis.overallScore} vs class average ${Math.round(average)}`
        : '';
    const insight = await AIResultInsight_1.AIResultInsight.findOneAndUpdate({ studentId, examId }, {
        $set: {
            studentId,
            examId,
            classId,
            branchId: student?.branchId ?? exam?.branchId ?? null,
            subjectId: result.subjectId ?? exam?.subject?._id ?? exam?.subject ?? null,
            resultId: result._id,
            ...analysis
        }
    }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
    if (analysis.riskLevel === 'high') {
        await notificationDispatch.send({
            title: 'Academic support recommended',
            message: 'High academic risk detected. Please review the latest AI insight.',
            recipientIds: [String(studentId)],
            recipientRoles: ['student']
        });
    }
    return insight;
}
async function generateExamInsights(examId) {
    const exam = await Exam_1.Exam.findById(examId).lean();
    if (!exam)
        throw new Error('Exam not found');
    const results = await Result_1.Result.find({ exam: exam._id, isDeleted: false }).select('_id student score').lean();
    for (const result of results) {
        await upsertAIResultInsight({ resultId: String(result._id) });
    }
    const insights = await AIResultInsight_1.AIResultInsight.find({ examId: exam._id, isDeleted: { $ne: true } }).lean();
    const scores = insights.map((item) => Number(item.overallScore || 0));
    const averageScore = scores.length ? Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(2)) : 0;
    const passMark = Number(exam.passingMarks ?? 40);
    const passCount = scores.filter((score) => score >= passMark).length;
    const failCount = scores.length - passCount;
    const passRate = scores.length ? Number(((passCount / scores.length) * 100).toFixed(2)) : 0;
    const failRate = scores.length ? Number(((failCount / scores.length) * 100).toFixed(2)) : 0;
    const atRiskStudentCount = insights.filter((item) => item.riskLevel === 'high').length;
    const recommendations = [
        failRate > 40 ? 'Plan a focused revision cycle for weak topics.' : 'Maintain the current teaching pace with periodic checks.',
        atRiskStudentCount > 0 ? 'Schedule targeted intervention sessions for high-risk students.' : 'Continue regular formative assessments.'
    ];
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
            topStrengths: ['Exam participation completed'],
            commonWeaknesses: failRate > 30 ? ['Weak performance cluster detected'] : [],
            atRiskStudentCount,
            recommendations,
            unusualScoreDistribution,
            generatedBy: 'rule_based'
        }
    }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
    return classInsight;
}
