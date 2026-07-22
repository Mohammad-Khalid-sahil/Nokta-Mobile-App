import type { ApiResponse } from '../types';

export function createResponse<T>(data: T, message = '', pagination?: ApiResponse['pagination']): ApiResponse<T> {
  return {
    success: true,
    message,
    data,
    ...(pagination ? { pagination } : {})
  };
}

export function createError(message = 'Unexpected error', messageCode?: string) {
  return {
    success: false,
    message,
    ...(messageCode ? { messageCode } : {}),
    data: {}
  };
}
