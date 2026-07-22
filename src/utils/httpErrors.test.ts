import mongoose from 'mongoose';
import { resolveHttpMessage, resolveHttpStatus } from './httpErrors';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(resolveHttpStatus(new Error('Email already exists')) === 409, 'duplicate messages should map to 409');
assert(resolveHttpStatus(new Error('Student gender is required')) === 400, 'validation messages should map to 400');
assert(resolveHttpStatus({ code: 11000 }) === 409, 'mongo duplicate key should map to 409');

const validationError = new mongoose.Error.ValidationError();
validationError.addError('gender', new mongoose.Error.ValidatorError({ path: 'gender', message: 'Path `gender` is required.' }));
assert(resolveHttpStatus(validationError) === 400, 'mongoose validation errors should map to 400');
assert(resolveHttpMessage(validationError).includes('gender'), 'validation messages should include field details');

console.log('httpErrors tests passed');
