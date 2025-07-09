import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";


@Injectable()
export class ModeratorGuard implements CanActivate {
    constructor(private jwtService: JwtService, private config: ConfigService) { }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user || (user.role !== "MODERATOR" && user.role !== "ADMIN")) {
            throw new ForbiddenException("Access denied");
        }
        return true;
    }
}