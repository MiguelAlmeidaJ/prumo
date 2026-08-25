import { Injectable, type NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  requestId?: string;
}

interface ResponseLike {
  setHeader(name: string, value: string): void;
}

function validRequestId(value: string | undefined): string | null {
  return value && /^[A-Za-z0-9._-]{1,128}$/.test(value) ? value : null;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestLike, response: ResponseLike, next: () => void): void {
    const supplied = request.headers["x-request-id"];
    const requestId =
      validRequestId(Array.isArray(supplied) ? supplied[0] : supplied) ??
      randomUUID();
    request.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);
    next();
  }
}
