import assert from 'node:assert/strict';
import { calculateAfghanistanSalaryTax } from './afghanistanSalaryTaxService';

async function run() {
  const case1 = await calculateAfghanistanSalaryTax(4000);
  assert.equal(case1.taxAmount, 0);
  assert.equal(case1.netSalary, 4000);

  const case2 = await calculateAfghanistanSalaryTax(10000);
  assert.equal(case2.taxAmount, 100);
  assert.equal(case2.netSalary, 9900);

  const case3 = await calculateAfghanistanSalaryTax(20000);
  assert.equal(case3.taxAmount, 900);
  assert.equal(case3.netSalary, 19100);

  const case4 = await calculateAfghanistanSalaryTax(100000);
  assert.equal(case4.taxAmount, 8900);
  assert.equal(case4.netSalary, 91100);

  const case5 = await calculateAfghanistanSalaryTax(120000);
  assert.equal(case5.taxAmount, 12900);
  assert.equal(case5.netSalary, 107100);

  console.log('Afghanistan salary tax tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
