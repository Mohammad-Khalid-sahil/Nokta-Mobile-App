"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACADEMY_ADDRESS = void 0;
exports.isStaleAcademyAddress = isStaleAcademyAddress;
exports.resolveAcademyAddress = resolveAcademyAddress;
/** Canonical public academy address — single source of truth for defaults. */
exports.ACADEMY_ADDRESS = {
    en: 'Afghanistan, Kabul – Khair Khana, First Section',
    fa: 'افغانستان، کابل – حصه اول خیرخانه',
    ps: 'افغانستان، کابل – د خیرخانې لومړۍ حصه'
};
function isStaleAcademyAddress(value) {
    const text = String(value ?? '').trim();
    if (!text)
        return true;
    const lowered = text.toLowerCase();
    return (lowered.includes('tehran') ||
        lowered.includes('iran') ||
        text.includes('تهران') ||
        text.includes('ایران'));
}
function resolveAcademyAddress(address) {
    const source = address && typeof address === 'object' && !Array.isArray(address)
        ? address
        : {};
    return {
        en: isStaleAcademyAddress(source.en) ? exports.ACADEMY_ADDRESS.en : String(source.en).trim(),
        fa: isStaleAcademyAddress(source.fa) ? exports.ACADEMY_ADDRESS.fa : String(source.fa).trim(),
        ps: isStaleAcademyAddress(source.ps) ? exports.ACADEMY_ADDRESS.ps : String(source.ps).trim()
    };
}
