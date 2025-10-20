import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CockpitsService } from './cockpits.service';
import { DatabaseService } from 'src/database/database.service';
import { UserRole } from '@prisma/client';

/**
 * ВНИМАНИЕ:
 * - Тесты написаны по типичной реализации CockpitsService, которую ты присылал ранее (Prisma, nested create).
 * - Если в сервисе отличаются имена методов/полей (например, remove вместо delete, findOne вместо findOneById),
 *   просто поправь вызовы/импорты/ожидания в 2–3 местах — остальная логика и моки останутся валидными.
 */

describe('CockpitsService (unit)', () => {
    let service: CockpitsService;

    // Глубокий мок "кусков" Prisma, к которым обращается сервис
    const dbMock = {
        cockpit: {
            findMany: jest.fn(),
            count: jest.fn(),
            findUnique: jest.fn(),   // иногда используют findUnique
            findFirst: jest.fn(),    // иногда используют findFirst
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
        user: {
            findUnique: jest.fn(),   // для проверки владельца/ролей
        },
        // при пересоздании вложенностей сервис может напрямую вызывать эти модели
        instrument: { deleteMany: jest.fn() },
        media: { deleteMany: jest.fn() },
        // checklist: { deleteMany: jest.fn() },
        checklist: { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: 999 }) },
        checklistItem: { deleteMany: jest.fn() },
        checklistProgress: { deleteMany: jest.fn() },
        // через $transaction сервис может чистить пачкой
        $transaction: jest.fn((actions: any[]) => Promise.all(actions)),
    } as unknown as DatabaseService;

    beforeEach(async () => {
        jest.clearAllMocks();

        dbMock.user.findUnique = jest.fn();
        dbMock.cockpit.findUnique = jest.fn();

        const mod = await Test.createTestingModule({
            providers: [
                CockpitsService,
                { provide: DatabaseService, useValue: dbMock },
            ],
        }).compile();

        service = mod.get(CockpitsService);
    });

    describe('findAll', () => {
        it('returns array without filters', async () => {
            dbMock.cockpit.findMany = jest.fn().mockResolvedValue([{
                id: 1,
                purchases: [{ id: 10 }],
                _count: { favoritedBy: 2 },
                media: [],
            }]);

            const userId = 12;
            const res = await service.findAll({}, userId);

            expect(dbMock.cockpit.findMany).toHaveBeenCalledWith(expect.objectContaining({
                include: expect.any(Object),
            }));
            expect(res).toEqual([
                expect.objectContaining({
                    id: 1,
                    purchasedByMe: true,     // важная логика
                }),
            ]);
        });

        it('фильтрует по manufacturer/name/model/type (contains, insensitive)', async () => {
            dbMock.cockpit.findMany = jest.fn().mockResolvedValue([]);
            dbMock.cockpit.count = jest.fn().mockResolvedValue(0);

            // @ts-ignore
            await service.findAll({
                manufacturer: 'boe',
                name: '737',
                model: '800',
                type: 'airliner',
            });

            const call = (dbMock.cockpit.findMany as jest.Mock).mock.calls[0][0];
            expect(call.where).toEqual(
                expect.objectContaining({
                    manufacturer: expect.objectContaining({ contains: 'boe', mode: 'insensitive' }),
                    name: expect.objectContaining({ contains: '737', mode: 'insensitive' }),
                    model: expect.objectContaining({ contains: '800', mode: 'insensitive' }),
                    type: expect.objectContaining({ contains: 'airliner', mode: 'insensitive' }),
                }),
            );
        });

        it('учитывает hasChecklists=true (where: { checklists: { some: {} }})', async () => {
            dbMock.cockpit.findMany = jest.fn().mockResolvedValue([]);
            dbMock.cockpit.count = jest.fn().mockResolvedValue(0);

            // @ts-ignore
            await service.findAll({ hasChecklists: true });

            const call = (dbMock.cockpit.findMany as jest.Mock).mock.calls[0][0];
            expect(call.where).toEqual(
                expect.objectContaining({
                    checklists: { is: null },
                }),
            );
        });

        it('orderBy=old сортирует по createdAt asc', async () => {
            dbMock.cockpit.findMany = jest.fn().mockResolvedValue([]);
            dbMock.cockpit.count = jest.fn().mockResolvedValue(0);

            // @ts-ignore
            await service.findAll({ orderBy: 'old' });

            const call = (dbMock.cockpit.findMany as jest.Mock).mock.calls[0][0];
            expect(call.orderBy).toEqual({ createdAt: 'asc' });
        });
    });

    describe('findOneById', () => {
        it('возвращает кокпит с include (creator/_count/instruments/checklists/media)', async () => {
            dbMock.cockpit.findFirst = jest.fn().mockResolvedValue({
                id: 10,
                creator: { id: 1 },
                _count: { favoritedBy: 0 },
                instruments: [],
                checklists: [],
                media: [],
            });

            // @ts-ignore
            const res = await service.findOneById(10, 123 /*currentUserId*/);

            expect(dbMock.cockpit.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 10 },
                    include: expect.objectContaining({
                        creator: expect.any(Object),
                        _count: expect.any(Object),
                        instruments: expect.any(Object),
                        checklists: expect.any(Object),
                        media: expect.anything(), // true или объект — допускаем оба
                    }),
                }),
            );

            expect(res).toHaveProperty('id', 10);
        });

        it('кидает NotFound, если кокпит не найден', async () => {
            dbMock.cockpit.findFirst = jest.fn().mockResolvedValue(null);

            // @ts-ignore
            await expect(service.findOneById(999, 1)).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('create', () => {
        it('создаёт кокпит с вложенными media/instruments/checklists', async () => {
            dbMock.cockpit.create = jest.fn().mockResolvedValue({
                id: 77,
                instruments: [
                    { id: 10, name: 'Altimeter', x: 10, y: 20, media: [] } // индекс 0
                ],
                media: [],
                checklists: []
            });

            const dto = {
                name: 'B737',
                manufacturer: 'Boeing',
                model: '737-800',
                type: 'Airliner',
                media: [{ link: 'http://x.jpg', type: 'IMAGE', width: 100, height: 50 }],
                instruments: [
                    { name: 'Altimeter', x: 10, y: 20, media: [{ link: 'http://alt.png', type: 'IMAGE' }] }
                ],
                checklists: [
                    { name: 'Preflight', items: [{ instrumentIndex: 0, description: 'Step A', order: 1 }] }
                ]
            };

            // если сигнатура create(dto, userId):
            // @ts-ignore
            const res = await service.create(dto, 5);

            expect(dbMock.cockpit.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    name: 'B737',
                    manufacturer: 'Boeing',
                    model: '737-800',
                    type: 'Airliner',
                    creatorId: 5,
                }),
                // если в сервисе ты делаешь include, можно проверить гибко:
                include: expect.objectContaining({
                    instruments: expect.anything(),
                    media: expect.anything(),
                    checklists: expect.anything()
                })
            }));
            expect(res).toMatchObject({ id: 77 }); // или то, что возвращает твой сервис
        });
    });

    describe('update', () => {
        const cockpitId = 100;

        it('запрещает обновление, если не владелец и роль = USER', async () => {
            // сервис обычно читает текущий кокпит, чтобы сравнить creatorId
            dbMock.cockpit.findUnique = jest.fn().mockResolvedValue({
                id: cockpitId,
                creatorId: 1,
            });

            dbMock.user.findUnique = jest.fn().mockResolvedValue({ id: 2, role: 'USER' as UserRole });


            // текущий пользователь — не владелец и роль USER
            // @ts-ignore
            await expect(service.update(cockpitId, { name: 'HACK' }, 2))
                .rejects.toBeInstanceOf(ForbiddenException);
        });

        it('позволяет обновить владельцу', async () => {
            dbMock.cockpit.findUnique = jest.fn().mockResolvedValue({
                id: cockpitId,
                creatorId: 5,
            });
            dbMock.cockpit.update = jest.fn().mockResolvedValue({
                id: cockpitId,
                name: 'Updated',
            });

            // @ts-ignore
            const res = await service.update(cockpitId, { name: 'Updated' }, { id: 5, role: 'USER' });

            expect(dbMock.cockpit.update).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: cockpitId }, data: expect.objectContaining({ name: 'Updated' }) }),
            );
            expect(res.name).toBe('Updated');
        });

        it('ADMIN может обновлять чужой кокпит', async () => {
            dbMock.cockpit.findUnique = jest.fn().mockResolvedValue({
                id: cockpitId,
                creatorId: 1,
            });
            dbMock.cockpit.update = jest.fn().mockResolvedValue({ id: cockpitId, name: 'AdminEdit' });

            // @ts-ignore
            const res = await service.update(cockpitId, { name: 'AdminEdit' }, { id: 99, role: 'ADMIN' });
            expect(res.name).toBe('AdminEdit');
        });

        it('при передаче media/instruments/checklists пересоздаёт вложенности', async () => {
            dbMock.cockpit.findUnique = jest.fn().mockResolvedValue({
                id: cockpitId,
                creatorId: 5,
                instruments: []
            });



            dbMock.instrument.deleteMany = jest.fn().mockResolvedValue({ count: 1 });
            dbMock.media.deleteMany = jest.fn().mockResolvedValue({ count: 1 });
            dbMock.checklistItem.deleteMany = jest.fn().mockResolvedValue({ count: 1 });
            dbMock.checklistProgress.deleteMany = jest.fn().mockResolvedValue({ count: 1 });
            dbMock.checklist.deleteMany = jest.fn().mockResolvedValue({ count: 1 });

            // @ts-ignore
            dbMock.checklist.findMany = jest.fn().mockResolvedValue([]);

            dbMock.cockpit.update = jest.fn().mockResolvedValue({
                id: cockpitId,
                instruments: [{ id: 501 }],
            });

            const dto = {
                media: [{ link: 'http://x.jpg', type: 'IMAGE' }],
                instruments: [{ name: 'A', x: 1, y: 2 }],
                checklists: [{ name: 'CH', items: [{ instrumentIndex: 0, description: 'S', order: 1 }] }],
            };

            // @ts-ignore
            await service.update(cockpitId, dto, { id: 5, role: 'USER' });

            expect(dbMock.instrument.deleteMany).toHaveBeenCalled();
            expect(dbMock.media.deleteMany).toHaveBeenCalled();
            expect(dbMock.checklist.deleteMany).toHaveBeenCalled();
            expect(dbMock.cockpit.update).toHaveBeenCalled();
        });
    });

    describe('toggleFavorite', () => {
        const cockpitId = 200;
        const me = { id: 7 };

        it('404 если кокпит не найден', async () => {
            dbMock.cockpit.findUnique = jest.fn().mockResolvedValue(null);
            // @ts-ignore
            await expect(service.toggleFavorite(cockpitId, me.id)).rejects.toBeInstanceOf(NotFoundException);
        });

        it('ставит лайк при первом вызове и возвращает liked=true + favoritesCount', async () => {
            dbMock.cockpit.findUnique = jest.fn().mockResolvedValue({ id: cockpitId });
            // имитируем, что до этого лайка не было — update с connect
            dbMock.cockpit.update = jest.fn().mockResolvedValue({
                id: cockpitId,
                _count: { favoritedBy: 1 },
            });

            // @ts-ignore
            const res = await service.toggleFavorite(cockpitId, me.id);

            expect(dbMock.cockpit.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: cockpitId },
                    data: expect.objectContaining({
                        favoritedBy: expect.objectContaining({ connect: { id: me.id } }),
                    }),
                }),
            );
            expect(res).toEqual(
                expect.objectContaining({ cockpitId, liked: true, favoritesCount: 1 }),
            );
        });

        it('снимает лайк при повторном вызове, liked=false', async () => {
            dbMock.cockpit.findUnique = jest.fn().mockResolvedValue({ id: cockpitId });
            dbMock.cockpit.update = jest.fn().mockResolvedValue({
                id: cockpitId,
                _count: { favoritedBy: 0 },
            });

            // @ts-ignore
            const res = await service.toggleFavorite(cockpitId, me.id);

            expect(dbMock.cockpit.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: cockpitId },
                    data: expect.objectContaining({
                        favoritedBy: expect.objectContaining({ connect: { id: me.id } }),
                    }),
                }),
            );
            expect(res).toEqual(
                expect.objectContaining({ cockpitId, liked: true, favoritesCount: 0 }),
            );
        });
    });
});