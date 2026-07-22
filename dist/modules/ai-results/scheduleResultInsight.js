"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleResultInsightGeneration = scheduleResultInsightGeneration;
const aiResultAnalysis_service_1 = require("./aiResultAnalysis.service");
const logger_1 = require("../../utils/logger");
function scheduleResultInsightGeneration(resultId, actorId) {
    void (0, aiResultAnalysis_service_1.upsertAIResultInsight)({ resultId, actorId: actorId ?? null }).catch((error) => {
        logger_1.logger.warn('AI result insight generation failed', {
            resultId,
            error: error instanceof Error ? error.message : String(error)
        });
    });
}
