"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const afghanistanSalaryTaxService_1 = require("./afghanistanSalaryTaxService");
async function run() {
    const case1 = await (0, afghanistanSalaryTaxService_1.calculateAfghanistanSalaryTax)(4000);
    strict_1.default.equal(case1.taxAmount, 0);
    strict_1.default.equal(case1.netSalary, 4000);
    const case2 = await (0, afghanistanSalaryTaxService_1.calculateAfghanistanSalaryTax)(10000);
    strict_1.default.equal(case2.taxAmount, 100);
    strict_1.default.equal(case2.netSalary, 9900);
    const case3 = await (0, afghanistanSalaryTaxService_1.calculateAfghanistanSalaryTax)(20000);
    strict_1.default.equal(case3.taxAmount, 900);
    strict_1.default.equal(case3.netSalary, 19100);
    const case4 = await (0, afghanistanSalaryTaxService_1.calculateAfghanistanSalaryTax)(100000);
    strict_1.default.equal(case4.taxAmount, 8900);
    strict_1.default.equal(case4.netSalary, 91100);
    const case5 = await (0, afghanistanSalaryTaxService_1.calculateAfghanistanSalaryTax)(120000);
    strict_1.default.equal(case5.taxAmount, 12900);
    strict_1.default.equal(case5.netSalary, 107100);
    console.log('Afghanistan salary tax tests passed.');
}
run().catch((error) => {
    console.error(error);
    process.exit(1);
});
