"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const academyAddress_1 = require("../constants/academyAddress");
function test(name, fn) {
    try {
        fn();
        console.log(`ok - ${name}`);
    }
    catch (error) {
        console.error(`fail - ${name}`);
        throw error;
    }
}
test('canonical English spelling uses Khair Khana', () => {
    strict_1.default.match(academyAddress_1.ACADEMY_ADDRESS.en, /Khair Khana/);
    strict_1.default.equal(academyAddress_1.ACADEMY_ADDRESS.en, 'Afghanistan, Kabul – Khair Khana, First Section');
});
test('Dari and Pashto addresses are set', () => {
    strict_1.default.equal(academyAddress_1.ACADEMY_ADDRESS.fa, 'افغانستان، کابل – حصه اول خیرخانه');
    strict_1.default.equal(academyAddress_1.ACADEMY_ADDRESS.ps, 'افغانستان، کابل – د خیرخانې لومړۍ حصه');
});
test('stale detector catches Tehran/Iran', () => {
    strict_1.default.equal((0, academyAddress_1.isStaleAcademyAddress)('Tehran, Iran'), true);
    strict_1.default.equal((0, academyAddress_1.isStaleAcademyAddress)('تهران، ایران'), true);
    strict_1.default.equal((0, academyAddress_1.isStaleAcademyAddress)(''), true);
    strict_1.default.equal((0, academyAddress_1.isStaleAcademyAddress)(academyAddress_1.ACADEMY_ADDRESS.en), false);
});
test('resolve backfills empty and stale locales', () => {
    const resolved = (0, academyAddress_1.resolveAcademyAddress)({
        en: 'Tehran, Iran',
        fa: '',
        ps: academyAddress_1.ACADEMY_ADDRESS.ps
    });
    strict_1.default.equal(resolved.en, academyAddress_1.ACADEMY_ADDRESS.en);
    strict_1.default.equal(resolved.fa, academyAddress_1.ACADEMY_ADDRESS.fa);
    strict_1.default.equal(resolved.ps, academyAddress_1.ACADEMY_ADDRESS.ps);
});
console.log('phase5 academy address checks passed');
