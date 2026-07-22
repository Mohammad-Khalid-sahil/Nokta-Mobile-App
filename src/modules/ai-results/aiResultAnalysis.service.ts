import { AIClassExamInsight } from '../../models/AIClassExamInsight';
import { AIResultInsight } from '../../models/AIResultInsight';
import { Exam } from '../../models/Exam';
import { Result } from '../../models/Result';
import {
  aiInsightService,
  buildInsightFromStudentData,
  type AIInsightPayload
} from '../../services/aiInsightService';

/** @deprecated Prefer AIInsightPayload from AIInsightService */
export type InsightAnalysis = Omit<
  AIInsightPayload,
  'message' | 'performanceBand' | 'weakTopics' | 'sourceScore' | 'generatedBy'
> & {
  generatedBy: 'rule_based' | 'ai_provider';
};

/**
 * Deterministic rule analysis used by unit tests and legacy callers.
 * Delegates to AIInsightService — does not invent random text.
 */
export function analyzeResultWithRules(payload: {
  result: any;
  exam: any;
  student: any;
  previousResults: any[];
  attendanceRate?: number | null;
}): InsightAnalysis {
  const insight = buildInsightFromStudentData({
    score: Number(payload.result?.score ?? 0),
    grade: payload.result?.grade,
    subjectName: payload.exam?.subject?.title ?? 'subject',
    previousScores: (payload.previousResults ?? [])
      .map((item: any) => Number(item?.score ?? NaN))
      .filter((score: number) => Number.isFinite(score)),
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

export async function upsertAIResultInsight(params: {
  resultId: string;
  actorId?: string | null;
  force?: boolean;
}) {
  return aiInsightService.getOrCreateResultInsight(params.resultId, {
    force: params.force ?? false,
    actorId: params.actorId ?? null
  });
}

export async function getStoredOrCreateAIResultInsight(params: {
  resultId: string;
  actorId?: string | null;
}) {
  return aiInsightService.getOrCreateResultInsight(params.resultId, {
    force: false,
    actorId: params.actorId ?? null
  });
}

export async function generateExamInsights(examId: string) {
  const exam = await Exam.findById(examId).lean<any>();
  if (!exam) throw new Error('Exam not found');

  const results = await Result.find({ exam: exam._id, isDeleted: false })
    .select('_id student score')
    .lean<any[]>();
  for (const result of results) {
    await aiInsightService.getOrCreateResultInsight(String(result._id), {
      force: false
    });
  }

  const insights = await AIResultInsight.find({
    examId: exam._id,
    isDeleted: { $ne: true }
  }).lean<any[]>();
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
  const atRiskStudentCount = insights.filter(
    (item) => item.riskLevel === 'high'
  ).length;
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

  const unusualScoreDistribution =
    scores.length >= 5 && Math.max(...scores) - Math.min(...scores) > 60
      ? 'High variance in score distribution detected.'
      : '';

  const classInsight = await AIClassExamInsight.findOneAndUpdate(
    { examId: exam._id, classId: exam.class },
    {
      $set: {
        examId: exam._id,
        classId: exam.class,
        branchId: exam.branchId ?? null,
        averageScore,
        passRate,
        failRate,
        topStrengths:
          hasResults && passRate >= 60
            ? ['Majority of students met the passing mark']
            : [],
        commonWeaknesses:
          hasResults && failRate > 30 ? ['Weak performance cluster detected'] : [],
        atRiskStudentCount: hasResults ? atRiskStudentCount : 0,
        recommendations,
        unusualScoreDistribution: hasResults ? unusualScoreDistribution : '',
        generatedBy: 'rule_based'
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean<any>();

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
