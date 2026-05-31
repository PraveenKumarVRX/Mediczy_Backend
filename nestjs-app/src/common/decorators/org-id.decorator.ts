import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Extract organization_id from the authenticated user context */
export const OrgId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): number | null =>
    ctx.switchToHttp().getRequest().user?.organizationId ?? null,
);

/** Extract pagination params (page, limit) from query string */
export const Pagination = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const query = ctx.switchToHttp().getRequest().query;
    return {
      page:  Math.max(1, parseInt(query.page  || '1',  10)),
      limit: Math.min(100, Math.max(1, parseInt(query.limit || '20', 10))),
    };
  },
);
