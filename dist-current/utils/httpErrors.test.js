"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const httpErrors_1 = require("./httpErrors");
function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}
assert((0, httpErrors_1.resolveHttpStatus)(new Error('Email already exists')) === 409, 'duplicate messages should map to 409');
assert((0, httpErrors_1.resolveHttpStatus)(new Error('Student gender is required')) === 400, 'validation messages should map to 400');
assert((0, httpErrors_1.resolveHttpStatus)({ code: 11000 }) === 409, 'mongo duplicate key should map to 409');
const validationError = new mongoose_1.default.Error.ValidationError();
validationError.addError('gender', new mongoose_1.default.Error.ValidatorError({ path: 'gender', message: 'Path `gender` is required.' }));
assert((0, httpErrors_1.resolveHttpStatus)(validationError) === 400, 'mongoose validation errors should map to 400');
assert((0, httpErrors_1.resolveHttpMessage)(validationError).includes('gender'), 'validation messages should include field details');
console.log('httpErrors tests passed');
