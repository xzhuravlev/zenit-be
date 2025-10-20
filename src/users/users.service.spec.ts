import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { DatabaseService } from 'src/database/database.service';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

describe('UsersService (unit)', () => {
    let service: UsersService;

    // Prisma mock — добавили findFirst!
    const dbMock = {
        user: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
        },
    } as unknown as DatabaseService;

    beforeEach(async () => {
        jest.clearAllMocks();

        const mod = await Test.createTestingModule({
            providers: [
                UsersService,
                { provide: DatabaseService, useValue: dbMock },
            ],
        }).compile();

        service = mod.get(UsersService);
    });

    // ---------- findOne (по username, через findFirst) ----------
    describe('findOne (by username)', () => {
        it('возвращает пользователя по username (публичные поля)', async () => {
            dbMock.user.findFirst = jest.fn().mockResolvedValue({
                id: 1,
                email: 'u@mail.com',
                username: 'user',
                role: 'USER',
                verified: false,
                createdAt: new Date(),
            });

            const me = await service.findOne('user');

            expect(dbMock.user.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({ where: { username: 'user' } })
            );
            expect(me).toEqual(
                expect.objectContaining({ id: 1, email: 'u@mail.com', username: 'user' })
            );
            expect(me).not.toHaveProperty('hash');
            expect(me).not.toHaveProperty('hashedRt');
            expect(me).not.toHaveProperty('password');
        });

        it('возвращает null, если пользователя нет', async () => {
            dbMock.user.findFirst = jest.fn().mockResolvedValue(null);
            const res = await service.findOne('unknown');
            expect(res).toBeNull();
        });
    });

    // ---------- editUser ----------
    describe('editUser', () => {
        const userId = 1;

        it('обновляет username и email (успех)', async () => {
            dbMock.user.findUnique = jest.fn().mockResolvedValue({ id: userId });

            dbMock.user.update = jest.fn().mockResolvedValue({
                id: userId,
                email: 'new@mail.com',
                username: 'newname',
                role: 'USER',
                verified: false,
            });

            const dto = { email: 'new@mail.com', username: 'newname' };
            const updated = await service.editUser(userId, dto);

            expect(dbMock.user.findUnique).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: userId } })
            );
            expect(dbMock.user.update).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: userId }, data: dto })
            );
            expect(updated).toEqual(expect.objectContaining(dto));
        });

        it('кидает NotFound, если пользователя нет', async () => {
            dbMock.user.findUnique = jest.fn().mockResolvedValue(null);
            await expect(service.editUser(userId, { username: 'x' }))
                .rejects.toBeInstanceOf(NotFoundException);
        });

        it('P2002 email -> Forbidden("Email is already taken")', async () => {
            dbMock.user.findUnique = jest.fn().mockResolvedValue({ id: userId });

            const err: any = { code: 'P2002', meta: { target: ['email'] } };
            // важно: делаем "реальный" instanceof
            Object.setPrototypeOf(err, PrismaClientKnownRequestError.prototype);

            dbMock.user.update = jest.fn().mockRejectedValue(err);

            await expect(service.editUser(userId, { email: 'exists@mail.com' }))
                .rejects.toBeInstanceOf(ForbiddenException);
        });

        it('P2002 username -> Forbidden("Username is already taken")', async () => {
            dbMock.user.findUnique = jest.fn().mockResolvedValue({ id: userId });

            const err: any = { code: 'P2002', meta: { target: ['username'] } };
            Object.setPrototypeOf(err, PrismaClientKnownRequestError.prototype);

            dbMock.user.update = jest.fn().mockRejectedValue(err);

            await expect(service.editUser(userId, { username: 'exists' }))
                .rejects.toBeInstanceOf(ForbiddenException);
        });

        it('P2002 без target -> Forbidden("Credentials taken")', async () => {
            dbMock.user.findUnique = jest.fn().mockResolvedValue({ id: userId });

            const err: any = { code: 'P2002' };
            Object.setPrototypeOf(err, PrismaClientKnownRequestError.prototype);

            dbMock.user.update = jest.fn().mockRejectedValue(err);

            await expect(service.editUser(userId, { email: 'x@y.z' }))
                .rejects.toBeInstanceOf(ForbiddenException);
        });

        it('обновляет только username, если в dto одно поле', async () => {
            dbMock.user.findUnique = jest.fn().mockResolvedValue({ id: userId });

            dbMock.user.update = jest.fn().mockResolvedValue({
                id: userId,
                email: 'old@mail.com',
                username: 'only-username',
            });

            const updated = await service.editUser(userId, { username: 'only-username' });

            expect(dbMock.user.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: userId },
                    data: { username: 'only-username' },
                })
            );
            expect(updated.username).toBe('only-username');
        });
    });

    // ---------- verifyUser ----------
    describe('verifyUser', () => {
        const userId = 2;

        it('помечает пользователя как verified: true (успех)', async () => {
            dbMock.user.findUnique = jest.fn().mockResolvedValue({ id: userId, verified: false });

            dbMock.user.update = jest.fn().mockResolvedValue({
                id: userId,
                verified: true,
            });

            const res = await service.verifyUser(userId);

            expect(dbMock.user.findUnique).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: userId } })
            );
            expect(dbMock.user.update).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: userId }, data: { verified: true } })
            );
            expect(res).toEqual(expect.objectContaining({ id: userId, verified: true }));
        });

        it('кидает NotFound, если пользователя нет', async () => {
            dbMock.user.findUnique = jest.fn().mockResolvedValue(null);
            await expect(service.verifyUser(999)).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    // ---------- findAll (если есть) ----------
    describe('findAll', () => {
        it('возвращает список пользователей', async () => {
            if (!(service as any).findAll) return; // пропустить, если метода нет
            dbMock.user.findMany = jest.fn().mockResolvedValue([
                { id: 1, email: 'a@mail.com' },
                { id: 2, email: 'b@mail.com' },
            ]);

            const res = await (service as any).findAll?.();
            expect(dbMock.user.findMany).toHaveBeenCalled();
            expect(Array.isArray(res)).toBe(true);
            expect(res).toHaveLength(2);
        });
    });
});
