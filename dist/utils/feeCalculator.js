"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateEnrollmentFee = calculateEnrollmentFee;
function calculateEnrollmentFee(classFeeAmount, subjectFeeAmount) {
    const classFee = Math.max(0, Number(classFeeAmount ?? 0) || 0);
    const subjectFee = Math.max(0, Number(subjectFeeAmount ?? 0) || 0);
    return {
        classFee,
        subjectFee,
        totalFee: classFee + subjectFee,
        currency: 'AFN'
    };
}
