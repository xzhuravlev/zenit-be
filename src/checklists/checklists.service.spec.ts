
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ChecklistsService } from './checklists.service';

// простой мок DatabaseService c нужными методами
const dbMock: any = {
    checklist: {
        findFirst: jest.fn(),
    },
    checklistProgress: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    },
};

describe('ChecklistsService (unit)', () => {
    let service: ChecklistsService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new ChecklistsService(dbMock);
    });

    describe('complete', () => {
        const checklistId = 10;
        const userId = 42;

        it('бросает NotFound, если чеклист не найден', async () => {
            dbMock.checklist.findFirst.mockResolvedValue(null);

            await expect(service.complete(checklistId, { selectedInstrumentIds: [1, 2, 3] } as any, userId))
                .rejects.toBeInstanceOf(NotFoundException);

            expect(dbMock.checklist.findFirst).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: checklistId },
            }));
        });

        it('бросает BadRequest, если массив пустой или отсутствует', async () => {
            dbMock.checklist.findFirst.mockResolvedValue({
                id: checklistId,
                items: [],
            });

            await expect(service.complete(checklistId, { selectedInstrumentIds: [] } as any, userId))
                .rejects.toBeInstanceOf(BadRequestException);

            await expect(service.complete(checklistId, {} as any, userId))
                .rejects.toBeInstanceOf(BadRequestException);
        });

        it('бросает BadRequest при дубликатах instrumentId', async () => {
            dbMock.checklist.findFirst.mockResolvedValue({
                id: checklistId,
                items: [
                    { order: 1, instrumentId: 11, id: 100 },
                    { order: 2, instrumentId: 22, id: 101 },
                ],
            });

            await expect(service.complete(checklistId, { selectedInstrumentIds: [11, 11] } as any, userId))
                .rejects.toBeInstanceOf(BadRequestException);
        });

        it('бросает BadRequest если прислан несуществующий instrumentId', async () => {
            dbMock.checklist.findFirst.mockResolvedValue({
                id: checklistId,
                items: [
                    { order: 1, instrumentId: 11, id: 100 },
                    { order: 2, instrumentId: 22, id: 101 },
                ],
            });

            await expect(service.complete(checklistId, { selectedInstrumentIds: [11, 999] } as any, userId))
                .rejects.toBeInstanceOf(BadRequestException);
        });

        it('создаёт прогресс при первом прохождении и считает percent = 100', async () => {
            dbMock.checklist.findFirst.mockResolvedValue({
                id: checklistId,
                items: [
                    { order: 1, instrumentId: 11, id: 100 },
                    { order: 2, instrumentId: 22, id: 101 },
                    { order: 3, instrumentId: 33, id: 102 },
                ],
            });

            dbMock.checklistProgress.findFirst.mockResolvedValue(null);
            dbMock.checklistProgress.create.mockResolvedValue({
                id: 900, attempt: 1, percent: 100, userId, checklistId,
            });

            const dto = { selectedInstrumentIds: [11, 22, 33] } as any;
            const res = await service.complete(checklistId, dto, userId);

            expect(dbMock.checklistProgress.findFirst).toHaveBeenCalledWith({ where: { checklistId, userId } });
            expect(dbMock.checklistProgress.create).toHaveBeenCalledWith({
                data: { attempt: 1, percent: 100, userId, checklistId },
            });
            expect(res).toEqual(expect.objectContaining({ attempt: 1, percent: 100 }));
        });

        it('обновляет прогресс при повторном прохождении; percent < 100 при несовпадении порядка', async () => {
            // Ожидаемый порядок: [1,2,3]; присланный: [1,3,2] -> расстояние 2, maxLen 3 => percent ≈ 33
            dbMock.checklist.findFirst.mockResolvedValue({
                id: checklistId,
                items: [
                    { order: 1, instrumentId: 11, id: 100 },
                    { order: 2, instrumentId: 22, id: 101 },
                    { order: 3, instrumentId: 33, id: 102 },
                ],
            });

            dbMock.checklistProgress.findFirst.mockResolvedValue({ id: 777, attempt: 3, percent: 80 });

            // Мок апдейта вернём ровно тем percent, который сервис должен посчитать (33)
            dbMock.checklistProgress.update.mockImplementation(({ data, where }: any) => ({
                id: where.id,
                attempt: data.attempt,
                percent: data.percent,
            }));

            const dto = { selectedInstrumentIds: [11, 33, 22] } as any;
            const res = await service.complete(checklistId, dto, userId);

            expect(dbMock.checklistProgress.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 777 },
                data: expect.objectContaining({ attempt: 4, percent: expect.any(Number) }),
            }));
            expect(res).toEqual(expect.objectContaining({ attempt: 4 }));

            // Дополнительно проверим, что percent близок к 33 (округление до целого)
            const calledArg = dbMock.checklistProgress.update.mock.calls[0][0];
            expect(calledArg.data.percent).toBe(33);
        });
    });
});
