"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
function serializeError(error) {
    if (!(error instanceof Error))
        return error;
    return {
        name: error.name,
        message: error.message,
        stack: error.stack
    };
}
function write(level, message, metadata) {
    const payload = {
        ts: new Date().toISOString(),
        level,
        message,
        ...(metadata ? { metadata } : {})
    };
    const line = JSON.stringify(payload);
    if (level === 'error') {
        console.error(line);
        return;
    }
    if (level === 'warn') {
        console.warn(line);
        return;
    }
    console.log(line);
}
exports.logger = {
    info(message, metadata) {
        write('info', message, metadata);
    },
    warn(message, metadata) {
        write('warn', message, metadata);
    },
    error(message, error, metadata) {
        write('error', message, { ...metadata, error: serializeError(error) });
    }
};
