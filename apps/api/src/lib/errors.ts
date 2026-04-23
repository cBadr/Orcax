export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (msg: string, code = 'BAD_REQUEST', details?: unknown) =>
  new AppError(400, code, msg, details);

export const unauthorized = (msg = 'Unauthorized', code = 'UNAUTHORIZED') =>
  new AppError(401, code, msg);

export const forbidden = (msg = 'Forbidden', code = 'FORBIDDEN') => new AppError(403, code, msg);

export const notFound = (msg = 'Not found', code = 'NOT_FOUND') => new AppError(404, code, msg);

export const conflict = (msg: string, code = 'CONFLICT') => new AppError(409, code, msg);

export const tooMany = (msg = 'Too many requests', code = 'RATE_LIMITED') =>
  new AppError(429, code, msg);

export const serverError = (msg = 'Internal server error', code = 'SERVER_ERROR') =>
  new AppError(500, code, msg);
