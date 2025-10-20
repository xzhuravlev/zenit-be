import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import * as argon2 from 'argon2';

import { AuthService } from './auth.service';
import { count } from 'console';

// ---- Моки зависимостей ----
const mockDb = () => ({
    user: {
        count: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
    },
});

const mockJwtService = () => ({
    signAsync: jest.fn(),
    verifyAsync: jest.fn(), // на случай async-ветки
    verify: jest.fn(),      // на случай sync-ветки
});

const mockConfigService = () => ({
    get: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'test-secret';
        if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret';
        return undefined;
    }),
});

// мок argon2 — быстрый и детерминированный
jest.mock('argon2', () => ({
    hash: jest.fn(async (v: string) => `hashed(${v})`),
    verify: jest.fn(async (hash: string, plain: string) => hash === `hashed(${plain})`),
}));

describe('AuthService (unit)', () => {
    let service: AuthService;
    let db: ReturnType<typeof mockDb>;
    let jwt: ReturnType<typeof mockJwtService>;
    let config: ReturnType<typeof mockConfigService>;

    beforeEach(() => {
        db = mockDb();
        jwt = mockJwtService();
        config = mockConfigService() as any;

        service = new AuthService(db as any, config as any, jwt as any);

        // по умолчанию — access и refresh токены
        jwt.signAsync
            .mockResolvedValueOnce('access.jwt.token')
            .mockResolvedValueOnce('refresh.jwt.token');

        // по умолчанию verify проходит и возвращает payload с sub
        jwt.verifyAsync.mockResolvedValue({ sub: 1 });
        jwt.verify.mockReturnValue({ sub: 1 });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // ---------- signUp ----------
    describe('signUp', () => {
        it('успех: создаёт пользователя, хешит refresh, возвращает токены', async () => {
            db.user.create.mockResolvedValue({
                id: 1,
                email: 'u@mail.com',
                username: 'user',
                hash: 'hashed(123)',
                role: 'USER',
                createdAt: new Date(),
            });

            const res = await service.signUp({
                email: 'u@mail.com',
                username: 'user',
                password: '123',
            });

            // пароль хешился
            expect(argon2.hash).toHaveBeenCalledWith('123');

            // параметры create (не жестко привязываемся к select)
            expect(db.user.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        email: 'u@mail.com',
                        username: 'user',
                        hash: 'hashed(123)',
                    }),
                }),
            );

            // две подписи — access и refresh
            expect(jwt.signAsync).toHaveBeenCalledTimes(2);

            // сохранение хеша refresh-токена (в твоем сервисе — поле refreshToken)
            expect(db.user.update).toHaveBeenCalledWith({
                where: { id: 1 },
                data: { refreshToken: 'hashed(refresh.jwt.token)' },
            });

            // сервис возвращает оба токена — проверяем хотя бы наличие access
            expect(res).toEqual(
                expect.objectContaining({ access_token: 'access.jwt.token' })
            );
            // и при этом допускаем, что может быть и refresh
            expect(res).toEqual(
                expect.objectContaining({ refresh_token: 'refresh.jwt.token' })
            );
        });

        it('ошибка уникальности email -> ForbiddenException', async () => {
            const err = new PrismaClientKnownRequestError('P2002', {
                code: 'P2002',
                clientVersion: 'test',
                meta: { target: ['email'] },
            } as any);
            db.user.create.mockRejectedValue(err);

            await expect(
                service.signUp({ email: 'exists@mail.com', username: 'any', password: '123' }),
            ).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('ошибка уникальности username -> ForbiddenException', async () => {
            const err = new PrismaClientKnownRequestError('P2002', {
                code: 'P2002',
                clientVersion: 'test',
                meta: { target: ['username'] },
            } as any);
            db.user.create.mockRejectedValue(err);

            await expect(
                service.signUp({ email: 'u@mail.com', username: 'exists', password: '123' }),
            ).rejects.toBeInstanceOf(ForbiddenException);
        });
    });

    // ---------- signIn ----------
    describe('signIn', () => {
        it('403: пользователь не найден', async () => {
            db.user.findUnique.mockResolvedValue(null);

            await expect(service.signIn({ email: 'x@mail.com', password: '123' }))
                .rejects.toBeInstanceOf(ForbiddenException);
        });

        it('403: неправильный пароль', async () => {
            db.user.findUnique.mockResolvedValue({
                id: 1,
                email: 'u@mail.com',
                username: 'user',
                hash: 'hashed(other)', // verify вернёт false для plain '123'
            });

            await expect(service.signIn({ email: 'u@mail.com', password: '123' }))
                .rejects.toBeInstanceOf(ForbiddenException);
        });

        it('200: логин успешен, ротация refresh', async () => {
            db.user.findUnique.mockResolvedValue({
                id: 1,
                email: 'u@mail.com',
                username: 'user',
                hash: 'hashed(123)',
            });

            const res = await service.signIn({ email: 'u@mail.com', password: '123' });

            expect(jwt.signAsync).toHaveBeenCalledTimes(2);
            expect(db.user.update).toHaveBeenCalledWith({
                where: { id: 1 },
                data: { refreshToken: 'hashed(refresh.jwt.token)' },
            });

            // сервис может вернуть и оба токена — не ломаемся
            expect(res).toEqual(
                expect.objectContaining({ access_token: 'access.jwt.token' })
            );
        });
    });

    // ---------- refreshTokens ----------
    describe('refreshTokens', () => {
        it('403: пользователь не найден', async () => {
            db.user.findUnique.mockResolvedValue(null);

            // в твоем сервисе refreshTokens вероятно принимает ОДИН аргумент (сам refresh-токен)
            await expect(service.refreshTokens('any'))
                .rejects.toBeInstanceOf(ForbiddenException);
        });

        it('403: неверный refresh токен (verify ok, argon false)', async () => {
            db.user.findUnique.mockResolvedValue({
                id: 1,
                // в сервисе хранится refreshToken (а не refreshTokenHash)
                refreshToken: 'hashed(saved)',
            });

            // verify прошёл → вернётся { sub: 1 }
            jwt.verifyAsync.mockResolvedValue({ sub: 1 });
            jwt.verify.mockReturnValue({ sub: 1 });

            // argon сверка не прошла
            (argon2.verify as jest.Mock).mockResolvedValueOnce(false);

            await expect(service.refreshTokens('incoming'))
                .rejects.toBeInstanceOf(ForbiddenException);
        });

        it('200: успех, новая пара токенов и обновление hash', async () => {
            db.user.findUnique.mockResolvedValue({
                id: 1,
                refreshToken: 'hashed(old)',
            });

            // verify прошёл
            jwt.verifyAsync.mockResolvedValue({ sub: 1 });
            jwt.verify.mockReturnValue({ sub: 1 });

            // успешная сверка argon: plain 'old' подходит к 'hashed(old)'
            (argon2.verify as jest.Mock).mockResolvedValueOnce(true);

            // новые токены
            (jwt.signAsync as jest.Mock)
                .mockReset()
                .mockResolvedValueOnce('new.access.jwt')
                .mockResolvedValueOnce('new.refresh.jwt');

            const res = await service.refreshTokens('old');

            expect(jwt.signAsync).toHaveBeenCalledTimes(2);
            expect(db.user.update).toHaveBeenCalledWith({
                where: { id: 1 },
                data: { refreshToken: 'hashed(new.refresh.jwt)' },
            });

            // допускаем, что сервис вернёт access (и, возможно, refresh)
            expect(res).toEqual(
                expect.objectContaining({ access_token: 'new.access.jwt' })
            );
        });
    });

    // ---------- logout ----------
    describe('logout', () => {
        it('обнуляет refreshToken через update', async () => {
            db.user.update.mockResolvedValue({ id: 1 });

            await service.logout(1);

            expect(db.user.update).toHaveBeenCalledWith({
                where: { id: 1 },
                data: { refreshToken: null },
            });
        });
    });
});
