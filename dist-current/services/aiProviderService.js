"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiProviderService = exports.AiProviderService = void 0;
const integrations_1 = require("../config/integrations");
const logger_1 = require("../utils/logger");
class AiProviderService {
    async enhanceInsight(input) {
        if (!(0, integrations_1.isAiConfigured)()) {
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
            const timeout = setTimeout(() => controller.abort(), integrations_1.integrationConfig.ai.timeoutMs);
            const response = await fetch(`${integrations_1.integrationConfig.ai.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${integrations_1.integrationConfig.ai.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: integrations_1.integrationConfig.ai.model,
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
                logger_1.logger.warn('AI provider request failed', { status: response.status });
                return input.analysis;
            }
            const payload = await response.json();
            const content = payload.choices?.[0]?.message?.content ?? '';
            const parsed = this.parseProviderJson(content);
            if (!parsed)
                return input.analysis;
            return {
                ...input.analysis,
                recommendations: parsed.recommendations?.length ? parsed.recommendations : input.analysis.recommendations,
                teacherNotesSuggestion: parsed.teacherNotesSuggestion || input.analysis.teacherNotesSuggestion,
                parentSummary: parsed.parentSummary || input.analysis.parentSummary,
                studentSummary: parsed.studentSummary || input.analysis.studentSummary,
                generatedBy: 'ai_provider',
                confidenceScore: Math.min(0.95, input.analysis.confidenceScore + 0.1)
            };
        }
        catch (error) {
            logger_1.logger.warn('AI provider unavailable, using rule-based insight', { error: String(error) });
            return input.analysis;
        }
    }
    parseProviderJson(content) {
        try {
            const trimmed = content.trim();
            const jsonBlock = trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed;
            return JSON.parse(jsonBlock);
        }
        catch {
            return null;
        }
    }
}
exports.AiProviderService = AiProviderService;
exports.aiProviderService = new AiProviderService();
