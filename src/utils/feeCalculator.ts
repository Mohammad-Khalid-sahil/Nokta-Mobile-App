export type FeeBreakdown = {
  classFee: number;
  subjectFee: number;
  totalFee: number;
  currency: 'AFN';
};

export function calculateEnrollmentFee(classFeeAmount: unknown, subjectFeeAmount: unknown): FeeBreakdown {
  const classFee = Math.max(0, Number(classFeeAmount ?? 0) || 0);
  const subjectFee = Math.max(0, Number(subjectFeeAmount ?? 0) || 0);
  return {
    classFee,
    subjectFee,
    totalFee: classFee + subjectFee,
    currency: 'AFN'
  };
}
