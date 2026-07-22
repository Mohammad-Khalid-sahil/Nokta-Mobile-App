import { upsertAIResultInsight } from './aiResultAnalysis.service';
import { logger } from '../../utils/logger';

export function scheduleResultInsightGeneration(resultId: string, actorId?: string | null) {
  void upsertAIResultInsight({ resultId, actorId: actorId ?? null }).catch((error) => {
    logger.warn('AI result insight generation failed', {
      resultId,
      error: error instanceof Error ? error.message : String(error)
    });
  });
}
