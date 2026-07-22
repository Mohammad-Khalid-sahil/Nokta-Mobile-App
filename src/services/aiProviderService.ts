import { integrationConfig, isAiConfigured } from '../config/integrations';
import { logger } from '../utils/logger';
import type { InsightAnalysis } from '../modules/ai-results/aiResultAnalysis.service';

type EnhanceInput = {
  analysis: InsightAnalysis;
  subjectName: string;
  studentName?: string;
};

export class AiProviderService {
  async enhanceInsight(input: EnhanceInput): Promise<InsightAnalysis> {
    if (!isAiConfigured()) {
      return input.analysis;
    }

    const prompt = [
      'You are an academic advisor for an Afghan school management system.',
      'Improve the recommendations in Dari-friendly concise bullets.',
      `Subject: ${input.subjectName}`,
      `Student: ${input.studentName ?? 'student'}`,
      `Score: ${input.analysis.overallScore}`,
      `Risk: ${input.analysis.riskLevel}`,
      `Trend: ${input.analysis.trendStatus}`,
      `Current recommendations: ${input.analysis.recommendations.join('; ')}`
    ].join('\n');

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), integrationConfig.ai.timeoutMs);

      const response = await fetch(`${integrationConfig.ai.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${integrationConfig.ai.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: integrationConfig.ai.model,
          temperature: 0.3,
          messages: [
            { role: 'system', content: 'Respond with JSON: {"recommendations":["..."],"teacherNotesSuggestion":"...","parentSummary":"...","studentSummary":"..."}' },
            { role: 'user', content: prompt }
          ]
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        logger.warn('AI provider request failed', { status: response.status });
        return input.analysis;
      }

      const payload = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content ?? '';
      const parsed = this.parseProviderJson(content);
      if (!parsed) return input.analysis;

      return {
        ...input.analysis,
        recommendations: parsed.recommendations?.length ? parsed.recommendations : input.analysis.recommendations,
        teacherNotesSuggestion: parsed.teacherNotesSuggestion || input.analysis.teacherNotesSuggestion,
        parentSummary: parsed.parentSummary || input.analysis.parentSummary,
        studentSummary: parsed.studentSummary || input.analysis.studentSummary,
        generatedBy: 'ai_provider',
        confidenceScore: Math.min(0.95, input.analysis.confidenceScore + 0.1)
      };
    } catch (error) {
      logger.warn('AI provider unavailable, using rule-based insight', { error: String(error) });
      return input.analysis;
    }
  }

  private parseProviderJson(content: string) {
    try {
      const trimmed = content.trim();
      const jsonBlock = trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed;
      return JSON.parse(jsonBlock) as {
        recommendations?: string[];
        teacherNotesSuggestion?: string;
        parentSummary?: string;
        studentSummary?: string;
      };
    } catch {
      return null;
    }
  }
}

export const aiProviderService = new AiProviderService();
