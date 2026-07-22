import dayjs from 'dayjs';
import jalaliday from 'jalaliday';
import { TaxRule } from '../models/TaxRule';

dayjs.extend(jalaliday);

type TaxRuleInput = {
  minAmount: number;
  maxAmount: number | null;
  baseTax: number;
  percentage: number;
  categoryNameDari: string;
  explanationDari: string;
};

export type SalaryTaxResult = {
  grossSalary: number;
  taxAmount: number;
  netSalary: number;
  taxCategory: string;
  taxRate: number;
  taxableAmount: number;
  baseTax: number;
  formula: string;
  explanation: string;
  isTaxExempt: boolean;
};

const defaultTaxRules: TaxRuleInput[] = [
  {
    minAmount: 0,
    maxAmount: 5000,
    baseTax: 0,
    percentage: 0,
    categoryNameDari: 'معاف از مالیه',
    explanationDari: 'معاش این شخص از حد قابل مالیه پایین‌تر است.'
  },
  {
    minAmount: 5001,
    maxAmount: 12500,
    baseTax: 0,
    percentage: 2,
    categoryNameDari: 'کتگوری ۲٪',
    explanationDari: 'فقط مقدار بالاتر از 5,000 افغانی شامل مالیه ۲٪ می‌شود.'
  },
  {
    minAmount: 12501,
    maxAmount: 100000,
    baseTax: 150,
    percentage: 10,
    categoryNameDari: 'کتگوری ۱۰٪',
    explanationDari: '150 افغانی مالیه ثابت از کتگوری قبلی + ۱۰٪ از مقدار بالاتر از 12,500 افغانی.'
  },
  {
    minAmount: 100001,
    maxAmount: null,
    baseTax: 8900,
    percentage: 20,
    categoryNameDari: 'کتگوری ۲۰٪',
    explanationDari: '8,900 افغانی مالیه ثابت از کتگوری‌های قبلی + ۲۰٪ از مقدار بالاتر از 100,000 افغانی.'
  }
];

function getTaxableStart(rule: TaxRuleInput) {
  return rule.minAmount <= 0 ? 0 : rule.minAmount - 1;
}

export async function getActiveTaxRules(atDate = new Date()) {
  try {
    const rules = await TaxRule.find({
      isActive: true,
      effectiveFrom: { $lte: atDate },
      $or: [{ effectiveTo: null }, { effectiveTo: { $gte: atDate } }]
    })
      .sort({ minAmount: 1 })
      .lean<TaxRuleInput[]>();
    return rules.length ? rules : defaultTaxRules;
  } catch {
    return defaultTaxRules;
  }
}

export async function ensureDefaultTaxRules() {
  const existing = await TaxRule.countDocuments();
  if (existing > 0) return;
  await TaxRule.insertMany(defaultTaxRules.map((rule) => ({ ...rule, effectiveFrom: new Date() })));
}

export async function calculateAfghanistanSalaryTax(grossSalaryInput: number): Promise<SalaryTaxResult> {
  const grossSalary = Math.max(0, Number(grossSalaryInput || 0));
  const rules = await getActiveTaxRules();
  const appliedRule = rules.find((rule) => grossSalary >= rule.minAmount && (rule.maxAmount === null || grossSalary <= rule.maxAmount)) ?? rules[rules.length - 1];
  const taxableStart = getTaxableStart(appliedRule);
  const taxableAmount = Math.max(0, grossSalary - taxableStart);
  const taxAmount = Number((appliedRule.baseTax + (taxableAmount * appliedRule.percentage) / 100).toFixed(2));
  const netSalary = Number((grossSalary - taxAmount).toFixed(2));
  const isTaxExempt = taxAmount <= 0;
  const formula = isTaxExempt
    ? '0'
    : `${appliedRule.baseTax} + (${taxableAmount} × ${appliedRule.percentage}٪)`;

  return {
    grossSalary,
    taxAmount,
    netSalary,
    taxCategory: appliedRule.categoryNameDari,
    taxRate: appliedRule.percentage,
    taxableAmount,
    baseTax: appliedRule.baseTax,
    formula,
    explanation: isTaxExempt ? 'معاف از مالیه، چون معاش ماهوار تا ۵,۰۰۰ افغانی است.' : appliedRule.explanationDari,
    isTaxExempt
  };
}

export function getHijriYearMonth(dateInput?: Date | string) {
  const date = dateInput ? dayjs(dateInput) : dayjs();
  const jalali = date.calendar('jalali');
  return {
    year: jalali.year(),
    month: jalali.month() + 1
  };
}
