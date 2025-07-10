import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt'
import { JwtStrategy } from './strategy/jwt.strategy';
import { ModeratorGuard } from './guard';

@Module({
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy, ModeratorGuard],
    imports: [JwtModule.register({})],
    exports: [ModeratorGuard, JwtModule]
})
export class AuthModule { }
