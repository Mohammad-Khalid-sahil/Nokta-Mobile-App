import mongoose from 'mongoose';

export function resolveHttpStatus(err: unknown): number {
  if (!err || typeof err !== 'object') {
    return 500;
  }

  const error = err as {
    statusCode?: number;
    status?: number;
    code?: number | string;
    name?: string;
    message?: string;
  };

  if (typeof error.statusCode === 'number') {
    return error.statusCode;
  }

  if (typeof error.status === 'number') {
    return error.status;
  }

  if (error.name === 'ValidationError' || error instanceof mongoose.Error.ValidationError) {
    return 400;
  }

  if (error.name === 'CastError' || error instanceof mongoose.Error.CastError) {
    return 400;
  }

  if (error.code === 11000) {
    return 409;
  }

  const message = String(error.message ?? '').trim();
  if (!message) {
    return 500;
  }

  if (message.startsWith('CORS blocked:')) {
    return 403;
  }

  if (/forbidden|not authorized|permission denied/i.test(message)) {
    return 403;
  }

  if (/not found/i.test(message)) {
    return 404;
  }

  if (/already exists|duplicate key/i.test(message)) {
    return 409;
  }

  if (
    /password must/i.test(message) ||
    /required/i.test(message) ||
    /invalid/i.test(message) ||
    /must match/i.test(message) ||
    /must be/i.test(message)
  ) {
    return 400;
  }

  return 500;
}

export function resolveHttpMessage(err: unknown): string {
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors)
      .map((item) => item?.message)
      .filter(Boolean)
      .join('; ');
    return details || err.message;
  }

  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }

  return 'Server error';
}
