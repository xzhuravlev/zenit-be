import { ForbiddenException, Injectable } from '@nestjs/common';
import { SignInDto, SignUpDto } from './dto';
import { DatabaseService } from 'src/database/database.service';
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon from 'argon2'
import { OAuth2Client } from 'google-auth-library';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {

    private googleClient = new OAuth2Client(this.config.get<string>('GOOGLE_CLIENT_ID'));

    constructor(private database: DatabaseService, private config: ConfigService, private jwtService: JwtService) { }

    async signUp(dto: SignUpDto): Promise<any> {
        const hash = await argon.hash(dto.password);

        try {
            const usersCount = await this.database.user.count()
            const role: UserRole = usersCount === 0 ? UserRole.ADMIN : UserRole.USER;
            const user = await this.database.user.create({
                data: {
                    email: dto.email,
                    username: dto.username,
                    hash,
                    role: role,
                },
                select: {
                    id: true,
                    username: true,
                    email: true,
                    createdAt: true,
                },
            });

            // return saved user
            const tokens = await this.generateTokens(user.id, user.email);
            await this.saveRefreshToken(user.id, tokens.refresh_token);

            return { access_token: tokens.access_token, refresh_token: tokens.refresh_token };
        } catch (error) {
            if (error instanceof PrismaClientKnownRequestError) {
                if (error.code === 'P2002') {
                    const target = error.meta?.target as string[];
                    if (target)
                        console.log(target)
                    if (target && target.includes('email'))
                        throw new ForbiddenException('Email is already taken');
                    if (target && target.includes('username'))
                        throw new ForbiddenException('Username is already taken');
                    throw new ForbiddenException('Credentials taken');
                }
            }
            throw error;
        }
    }

    async signIn(dto: SignInDto): Promise<any> {
        const user = await this.database.user.findUnique({
            where: { email: dto.email },
        });
        if (!user) throw new ForbiddenException('Credentials incorrect')
        if (!user.hash) throw new ForbiddenException('Password not set. Sign in with Google or set a password first.');

        const passwordsMatches = await argon.verify(user.hash, dto.password);
        if (!passwordsMatches) throw new ForbiddenException('Credentials incorrect');

        const tokens = await this.generateTokens(user.id, user.email);
        await this.saveRefreshToken(user.id, tokens.refresh_token);
        return { access_token: tokens.access_token, refresh_token: tokens.refresh_token };
    }

    async signInWithGoogle(idToken: string): Promise<{ access_token: string; refresh_token: string }> {
        const ticket = await this.googleClient.verifyIdToken({
            idToken,
            audience: this.config.get<string>('GOOGLE_CLIENT_ID'),
        });
        const payload = ticket.getPayload();
        if (!payload) throw new ForbiddenException('Invalid Google token')

        const sub = payload.sub;
        const email = payload.email;
        const emailVerified = payload.email_verified;
        const name = payload.name ?? '';
        const picture = payload.picture ?? '';
        if (!email || !emailVerified) throw new ForbiddenException('Google email is missing or not verified');

        // find user, if he is already in our database
        let user = await this.database.user.findFirst({
            where: {
                OR: [{ providerId: sub }, { email }],
            },
        });

        // create new user, if he is not in database
        if (!user) {
            const base = (email.split('@')[0] || 'user').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || 'user';
            let candidate = base;
            let i = 0;
            while (await this.database.user.findUnique({ where: {username: candidate}})) {
                i += 1;
                candidate = `${base}_${i}`;
            }

            user = await this.database.user.create({
                data: {
                    email,
                    username: candidate,
                    provider: 'GOOGLE',
                    providerId: sub,
                    avatar: picture,
                    verified: true,
                },
            });
        } else {
            if (user.providerId !== sub || user.avatar !== picture || !user.verified || user.provider !== 'GOOGLE') {
                user = await this.database.user.update({
                    where: { id: user.id },
                    data: {
                        provider: 'GOOGLE',
                        providerId: sub,
                        avatar: picture,
                        verified: true,
                    },
                });
            }
        }

        // выпускаем токены и сохраняем refresh (как в обычном логине)
        const tokens = await this.generateTokens(user.id, user.email);
        await this.saveRefreshToken(user.id, tokens.refresh_token);
        return { access_token: tokens.access_token, refresh_token: tokens.refresh_token };
    }

    async logout(userId: number): Promise<void> {
        await this.database.user.update({
            where: { id: userId },
            data: { refreshToken: null },
        });
    }

    async getMe(userId: number) {
        const user = await this.database.user.findFirst({
            where: {id: userId},
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                verified: true,
                avatar: true,
            }
        })
        if (!user)
            throw new ForbiddenException(`User with ${userId} not found`)
        return user
    }

    private async generateTokens(userId: number, email: string) {
        const [accessToken, refreshToken] = await Promise.all([
            this.signToken(userId, email, "5m"),
            this.signToken(userId, email, "7d"),
        ]);

        // await this.saveRefreshToken(userId, refreshToken.signed_token);

        return { access_token: accessToken.signed_token, refresh_token: refreshToken.signed_token };
    }

    async refreshTokens(refreshToken: string): Promise<{ access_token: string, refresh_token: string }> {
        try {
            const payload = await this.jwtService.verifyAsync(refreshToken, {
                secret: this.config.get('JWT_SECRET'),
            });

            const user = await this.database.user.findUnique({
                where: { id: payload.sub }
            });
            if (!user || !user.refreshToken) throw new ForbiddenException('Access denied');

            const isValid = await argon.verify(user.refreshToken, refreshToken);
            if (!isValid) throw new ForbiddenException('Invalid refresh token');

            const tokens = await this.generateTokens(user.id, user.email);
            await this.saveRefreshToken(user.id, tokens.refresh_token);
            return tokens;

        } catch {
            throw new ForbiddenException('Invalid refresh token');
        }
    }


    private async saveRefreshToken(userId: number, refreshToken: string) {
        const hashedRefreshToken = await argon.hash(refreshToken);
        await this.database.user.update({
            where: { id: userId },
            data: { refreshToken: hashedRefreshToken },
        });
    }

    private async signToken(userId: number, email: string, expiresIn: string): Promise<{ signed_token: string }> {
        const payload = {
            sub: userId,
            email
        };

        const secret = this.config.get('JWT_SECRET');

        const token = await this.jwtService.signAsync(
            payload,
            {
                expiresIn: expiresIn,
                secret: secret,
            },
        );

        return {
            signed_token: token
        };
    }
}
