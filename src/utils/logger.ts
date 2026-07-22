type LogLevel = 'info' | 'warn' | 'error';

function serializeError(error: unknown) {
  if (!(error instanceof Error)) return error;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack
  };
}

function write(level: LogLevel, message: string, metadata?: Record<string, unknown>) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(metadata ? { metadata } : {})
  };
  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

export const logger = {
  info(message: string, metadata?: Record<string, unknown>) {
    write('info', message, metadata);
  },
  warn(message: string, metadata?: Record<string, unknown>) {
    write('warn', message, metadata);
  },
  error(message: string, error?: unknown, metadata?: Record<string, unknown>) {
    write('error', message, { ...metadata, error: serializeError(error) });
  }
};
