import {
  ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx    = host.switchToHttp();
    const res    = ctx.getResponse<Response>();
    const req    = ctx.getRequest<Request>();

    let status  = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code    = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status  = exception.getStatus();
      const body = exception.getResponse();
      message = typeof body === 'string' ? body : (body as any).message || message;
      code    = (body as any).error || HttpStatus[status];
    } else if (exception instanceof Error) {
      message = exception.message;
      if ((exception as any).code === 'AGENT_TIMEOUT') {
        status  = HttpStatus.GATEWAY_TIMEOUT;
        code    = 'AGENT_TIMEOUT';
        message = 'AI response timed out';
      }
    }

    if (status >= 500) {
      this.logger.error(`[${req.method}] ${req.url} → ${status}: ${message}`, (exception as Error)?.stack);
    }

    res.status(status).json({
      success:    false,
      statusCode: status,
      code,
      message,
      path:       req.url,
      timestamp:  new Date().toISOString(),
    });
  }
}
