import type { NextFunction, Request, Response } from 'express';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = (err as Error & { statusCode?: number }).statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';

  if (statusCode >= 500) {
    console.error('[CipherLine] Internal server error:', err.message);
  }

  res.status(statusCode).json({
    error:
      statusCode >= 500 && isProd
        ? 'An unexpected server error occurred'
        : err.message || 'Request failed',
  });
}
