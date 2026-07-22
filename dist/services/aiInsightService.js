"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiInsightService = exports.AIInsightService = void 0;
exports.classifyPerformanceBand = classifyPerformanceBand;
exports.calculateImprovementTrend = calculateImprovementTrend;
exports.buildInsightFromStudentData = buildInsightFromStudentData;
const Attendance_1 = require("../models/Attendance");
const AIResultInsight_1 = require("../models/AIResultInsight");
const Result_1 = require("../models/Result");
const notificationDispatchService_1 = require("./notificationDispatchService");
const examScore_1 = require("../utils/examScore");
const logger_1 = require("../utils/logger");
const notificationDispatch = new notificationDispatchService_1.NotificationDispatchService();
function classifyPerformanceBand(score) {
    if (score >= 85)
        return 'excellent';
    if (score >= 60)
        return 'good';
    return 'needs_improvement';
}
function calculateImprovementTrend(currentScore, previousScore) {
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
    if (score < 60 && (attendanceRate === null || attendanceRate < 75 || trendStatus === 'declining')) {
        return 'high';
    }
    if (score < 60 || trendStatus === 'declining')
        return 'medium';
    return 'low';
}
function tierCopy(band) {
    if (band === 'excellent') {
        return {
            message: 'Excellent performance.',
            recommendations: ['Advanced materials.']
        };
    }
    if (band === 'good') {
        return {
            message: 'Good progress.',
            recommendations: ['Practice and revision.']
        };
    }
    return {
        message: 'Needs improvement.',
        recommendations: ['Basic lessons', 'Practice exercises', 'Related books']
    };
}
function deriveWeakTopics(input, band) {
    const provided = (input.weakTopics ?? [])
        .map((item) => String(item ?? '').trim())
        .filter(Boolean);
    if (provided.length)
        return Array.from(new Set(provided)).slice(0, 6);
    const subject = input.subjectName.trim() || 'this subject';
    const topics = [];
    if (band === 'needs_improvement') {
        topics.push(`Fundamentals of ${subject}`);
        topics.push(`${subject} practice exercises`);
    }
    else if (band === 'good') {
        topics.push(`${subject} revision topics`);
    }
    if (input.previousScores.some((score) => Number(score) < 60)) {
        topics.push(`Previously weak areas in ${subject}`);
    }
    return Array.from(new Set(topics)).slice(0, 6);
}
/**
 * Deterministic performance insight from student exam data.
 * Does not call external AI providers or invent random text.
 */
function buildInsightFromStudentData(input) {
    const score = Number(input.score ?? 0);
    const band = classifyPerformanceBand(score);
    const { message, recommendations } = tierCopy(band);
    const previousScore = input.previousScores.length > 0 ? Number(input.previousScores[0]) : null;
    const trendStatus = calculateImprovementTrend(score, previousScore);
    const attendanceRate = input.attendanceRate ?? null;
    const riskLevel = classifyRisk(score, attendanceRate, trendStatus);
    const subjectName = input.subjectName.trim() || 'subject';
    const weakTopics = deriveWeakTopics(input, band);
    const grade = String(input.grade ?? '').trim() || (0, examScore_1.deriveExamGrade)(score);
    const strengths = [];
    const weaknesses = [...weakTopics];
    if (band === 'excellent') {
        strengths.push(`Strong performance in ${subjectName}`);
    }
    else if (band === 'good') {
        strengths.push(`Steady progress in ${subjectName}`);
    }
    if (trendStatus === 'improving') {
        strengths.push('Improvement trend detected from previous scores');
    }
    if (trendStatus === 'declining') {
        weaknesses.push('Performance trend is declining');
    }
    if (attendanceRate !== null && attendanceRate < 75) {
        weaknesses.push('Low attendance may be affecting progress');
    }
    else if (attendanceRate !== null && attendanceRate >= 75) {
        strengths.push('Attendance supports learning progress');
    }
    const teacherNotesSuggestion = band === 'needs_improvement'
        ? 'Assign basic lessons, practice exercises, and related books; follow up weekly.'
        : band === 'good'
            ? 'Encourage practice and revision with targeted feedback.'
            : 'Recommend advanced materials and peer mentoring.';
    const classAverage = input.classAverage ?? null;
    const classComparison = classAverage !== null && Number.isFinite(classAverage)
        ? `Score ${score} vs class average ${Math.round(classAverage)}`
        : '';
    return {
        overallScore: score,
        sourceScore: score,
        grade,
        message,
        performanceBand: band,
        trendStatus,
        riskLevel,
        strengths: Array.from(new Set(strengths)).slice(0, 6),
        weaknesses: Array.from(new Set(weaknesses)).slice(0, 6),
        weakTopics,
        recommendations,
        teacherNotesSuggestion,
        parentSummary: message,
        studentSummary: message,
        classComparison,
        generatedBy: 'rule_based',
        confidenceScore: 0.9
    };
}
class AIInsightService {
    /**
     * Returns a stored insight when the score is unchanged.
     * Regenerates and persists only when missing, score changed, or force=true.
     */
    async getOrCreateResultInsight(resultId, options = {}) {
        const result = await Result_1.Result.findById(resultId)
            .populate({
            path: 'exam',
            select: 'subject class teacherId branchId totalMarks passingMarks title',
            populate: [
                { path: 'subject', select: 'title code' },
                { path: 'class', select: 'className name classCode' }
            ]
        })
            .populate('student', 'branchId name fullName')
            .lean();
        if (!result) {
            throw new Error('Result not found');
        }
        const exam = result.exam;
        const student = result.student;
        const studentId = result.student?._id ?? result.student;
        const examId = result.exam?._id ?? result.exam;
        const classId = result.classId ?? exam?.class?._id ?? exam?.class ?? null;
        const currentScore = Number(result.score ?? 0);
        const existing = await AIResultInsight_1.AIResultInsight.findOne({
            studentId,
            examId,
            isDeleted: false
        }).lean();
        const storedScore = Number(existing?.sourceScore ?? existing?.overallScore ?? NaN);
        if (!options.force &&
            existing &&
            Number.isFinite(storedScore) &&
            storedScore === currentScore) {
            return existing;
        }
        const previousResults = await Result_1.Result.find({
            student: studentId,
            _id: { $ne: result._id },
            isDeleted: false
        })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('score remarks')
            .lean();
        const attendance = await Attendance_1.Attendance.aggregate([
            { $match: { userId: studentId, isDeleted: { $ne: true } } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    present: {
                        $sum: {
                            $cond: [{ $in: ['$status', ['present', 'late', 'excused']] }, 1, 0]
                        }
                    }
                }
            }
        ]);
        const attendanceRate = attendance.length && attendance[0].total > 0
            ? Math.round((attendance[0].present / attendance[0].total) * 100)
            : null;
        const classAvg = await Result_1.Result.aggregate([
            { $match: { exam: examId, isDeleted: { $ne: true } } },
            { $group: { _id: null, avg: { $avg: '$score' } } }
        ]);
        const classAverage = classAvg[0]?.avg ? Number(classAvg[0].avg) : null;
        const weakTopicsFromRemarks = String(result.remarks ?? '')
            .split(/[,;\n]/)
            .map((item) => item.trim())
            .filter((item) => item.length > 2);
        const analysis = buildInsightFromStudentData({
            score: currentScore,
            grade: result.grade,
            subjectName: exam?.subject?.title ?? 'subject',
            previousScores: previousResults
                .map((item) => Number(item.score ?? NaN))
                .filter((score) => Number.isFinite(score)),
            weakTopics: weakTopicsFromRemarks,
            attendanceRate,
            classAverage
        });
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
            try {
                await notificationDispatch.send({
                    title: 'Academic support recommended',
                    message: 'Needs improvement. Please review the latest AI insight.',
                    recipientIds: [String(studentId)],
                    recipientRoles: ['student']
                });
            }
            catch (error) {
                logger_1.logger.warn('AI insight notification failed', {
                    resultId,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
        return insight;
    }
}
exports.AIInsightService = AIInsightService;
exports.aiInsightService = new AIInsightService();
