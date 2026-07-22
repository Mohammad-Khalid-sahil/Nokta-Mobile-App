"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createResponse = createResponse;
exports.createError = createError;
function createResponse(data, message = '', pagination) {
    return {
        success: true,
        message,
        data,
        ...(pagination ? { pagination } : {})
    };
}
function createError(message = 'Unexpected error', messageCode) {
    return {
        success: false,
        message,
        ...(messageCode ? { messageCode } : {}),
        data: {}
    };
}
