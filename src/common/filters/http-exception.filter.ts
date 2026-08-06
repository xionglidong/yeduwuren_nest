import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

export interface ErrorResponseBody {
  code: number;
  message: string;
  error?: string | object;
  path: string;
  timestamp: number;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal Server Error';
    let errorDetails: string | object | undefined = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        message = (resObj.message as string) || exception.message;
        errorDetails = resObj.error as string | object;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack);
    } else {
      this.logger.error(`Unknown exception type: ${JSON.stringify(exception)}`);
    }

    const responseBody: ErrorResponseBody = {
      code: status,
      message,
      ...(errorDetails ? { error: errorDetails } : {}),
      path: request.url,
      timestamp: Date.now(),
    };

    this.logger.warn(`[${request.method}] ${request.url} -> Status: ${status} | Message: ${message}`);

    response.status(status).json(responseBody);
  }
}
