import { Body, Controller, HttpCode, HttpStatus, Post, ValidationPipe, Request, Get, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignInDto, SignUpDto } from './dto';
import { JwtGuard, ModeratorGuard } from './guard';
import { AdminGuard } from './guard/admin.guard';

@Controller('auth')
export class AuthController {

    constructor(private authService: AuthService) {}

    @Post('registration')
    signUp(@Body(ValidationPipe) dto: SignUpDto) {
        return this,this.authService.signUp(dto);
    }

    @HttpCode(HttpStatus.OK)
    @Post('login')
    signIn(@Body(ValidationPipe) dto: SignInDto) {
        return this.authService.signIn(dto);
    }

    @UseGuards(JwtGuard)
    @Get('profile')
    getProfile(@Request() req) {
        return req.user;
    }

    @UseGuards(JwtGuard, AdminGuard)
    @Get('admin')
    getAdmin(@Request() req) {
        return req.user;
    }

    @UseGuards(JwtGuard, ModeratorGuard)
    @Get('moderator')
    getModerator(@Request() req) {
        return req.user;
    }


}
