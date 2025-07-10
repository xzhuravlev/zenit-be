import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export const GetUser = createParamDecorator(
    (
        data: string | undefined,
        context: ExecutionContext,
    ) => {
        const request: Request = context.switchToHttp().getRequest();
        if (data) return request.user?.[data];
        return request.user;
    },
);