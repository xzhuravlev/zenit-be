import { 
    Body, 
    Controller, 
    HttpCode, 
    HttpStatus, 
    Post, 
    ValidationPipe, 
    Get, 
    UseGuards, 
    Res, 
    Req, 
    UnauthorizedException 
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignInDto, SignUpDto } from './dto';
import { JwtGuard, ModeratorGuard } from './guard';
import { AdminGuard } from './guard/admin.guard';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';


@Controller('auth')
export class AuthController {

    constructor(private authService: AuthService, private config: ConfigService) { }

    @Post('registration')
    async signUp(
        @Body(ValidationPipe) dto: SignUpDto,
        @Res({ passthrough: true }) res: Response
    ) {
        const { access_token, refresh_token } = await this.authService.signIn(dto);
        res.cookie('refresh_token', refresh_token, {
            httpOnly: true,
            secure: this.config.get('NODE_ENV') === 'production', // включи только на HTTPS
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 дней
        });
        return { access_token };
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    async signIn(
        @Body(ValidationPipe) dto: SignInDto,
        @Res({ passthrough: true }) res: Response
    ) {
        const { access_token, refresh_token } = await this.authService.signIn(dto);
        res.cookie('refresh_token', refresh_token, {
            httpOnly: true,
            secure: this.config.get('NODE_ENV') === 'production', // включи только на HTTPS
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 дней
        });
        return { access_token };
    }

    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const refresh_token = req.cookies?.refresh_token;
        if (!refresh_token) throw new UnauthorizedException('Refresh token not found');
        const { access_token, refresh_token: newRefreshToken } = await this.authService.refreshTokens(refresh_token);
        // Обновляем куку
        res.cookie('refresh_token', newRefreshToken, {
            httpOnly: true,
            secure: this.config.get('NODE_ENV') === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        return { access_token };
    }

    //
    // TEST:
    //

    @UseGuards(JwtGuard)
    @Get('profile')
    getProfile(@Req() req) {
        return req.user;
    }

    @UseGuards(JwtGuard, AdminGuard)
    @Get('admin')
    getAdmin(@Req() req) {
        return req.user;
    }

    @UseGuards(JwtGuard, ModeratorGuard)
    @Get('moderator')
    getModerator(@Req() req) {
        return req.user;
    }


}
