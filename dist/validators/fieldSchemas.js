"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.afghanPhoneField = afghanPhoneField;
exports.personNameField = personNameField;
const joi_1 = __importDefault(require("joi"));
const fieldValidation_1 = require("../utils/fieldValidation");
const afghanPhoneMessage = 'Phone must be a 10-digit Afghan mobile number starting with 070, 078, 079, 072, 077, or 074.';
const personNameMessage = 'Name must contain only letters and cannot include numbers.';
function afghanPhoneField(required = false) {
    const schema = joi_1.default.string()
        .trim()
        .pattern(fieldValidation_1.AFGHAN_PHONE_REGEX)
        .messages({ 'string.pattern.base': afghanPhoneMessage });
    return required ? schema.required() : schema.allow('', null).optional();
}
function personNameField(required = true) {
    const schema = joi_1.default.string()
        .trim()
        .min(2)
        .max(120)
        .pattern(fieldValidation_1.PERSON_NAME_REGEX)
        .messages({
        'string.pattern.base': personNameMessage,
        'string.min': personNameMessage
    });
    return required ? schema.required() : schema.optional();
}
