// database.service.spec.ts
import { ConfigService } from '@nestjs/config';

// 1) объявляем моки раньше
const transactionMock = jest.fn();

const mkDeleteMany = (label: string) => jest.fn().mockReturnValue(label);

// конструкторный мок PrismaClient: навешиваем, что нужно сервису
const prismaCtorMock = jest.fn(function (this: any, opts: any) {
    // сохраняем опции конструктора на инстанс
    this.__opts = opts;

    // модели, которые используются в cleanDb()
    this.media = { deleteMany: mkDeleteMany('media') };
    this.checklistProgress = { deleteMany: mkDeleteMany('checklistProgress') };
    this.checklistItem = { deleteMany: mkDeleteMany('checklistItem') };
    this.checklist = { deleteMany: mkDeleteMany('checklist') };
    this.instrument = { deleteMany: mkDeleteMany('instrument') };
    this.purchase = { deleteMany: mkDeleteMany('purchase') };
    this.cockpit = { deleteMany: mkDeleteMany('cockpit') };
    this.user = { deleteMany: mkDeleteMany('user') };

    this.$transaction = transactionMock;
});

// 2) мок модуля — до импорта DatabaseService
jest.mock('@prisma/client', () => {
    // возвращаем класс-обёртку, который вызывает наш prismaCtorMock
    // и позволяет Jest считать это "классом"
    return {
        PrismaClient: function (this: any, opts: any) {
            // вызов "конструктора" — через prismaCtorMock
            prismaCtorMock.call(this, opts);
        },
    };
});

// 3) импортируем/require сервис только после моков
//    (через require, чтобы не было hoisting-а импортов)
const { DatabaseService } = require('./database.service');

describe('DatabaseService', () => {
    let cfg: jest.Mocked<ConfigService>;

    beforeEach(() => {
        jest.clearAllMocks();
        cfg = { get: jest.fn() } as any;
        cfg.get.mockReturnValue('postgres://user:pass@localhost:5432/db');
    });

    it('передаёт DATABASE_URL из ConfigService в конструктор PrismaClient', () => {
        const service = new DatabaseService(cfg);
        expect(prismaCtorMock).toHaveBeenCalledTimes(1);

        // опции, переданные в super(...)
        const opts = (service as any).__opts;
        expect(opts).toEqual({
            datasources: {
                db: {
                    url: 'postgres://user:pass@localhost:5432/db',
                },
            },
        });
        expect(cfg.get).toHaveBeenCalledWith('DATABASE_URL');
    });

    it('cleanDb вызывает $transaction с deleteMany по всем моделям в правильном порядке', async () => {
        const service: any = new DatabaseService(cfg);

        transactionMock.mockImplementation(async (ops: any[]) => ops);

        const result = await service.cleanDb();

        expect(service.media.deleteMany).toHaveBeenCalledTimes(1);
        expect(service.checklistProgress.deleteMany).toHaveBeenCalledTimes(1);
        expect(service.checklistItem.deleteMany).toHaveBeenCalledTimes(1);
        expect(service.checklist.deleteMany).toHaveBeenCalledTimes(1);
        expect(service.instrument.deleteMany).toHaveBeenCalledTimes(1);
        expect(service.purchase.deleteMany).toHaveBeenCalledTimes(1);
        expect(service.cockpit.deleteMany).toHaveBeenCalledTimes(1);
        expect(service.user.deleteMany).toHaveBeenCalledTimes(1);

        expect(transactionMock).toHaveBeenCalledTimes(1);
        const passedOps = transactionMock.mock.calls[0][0];
        expect(passedOps).toEqual([
            'media',
            'checklistProgress',
            'checklistItem',
            'checklist',
            'instrument',
            'purchase',
            'cockpit',
            'user',
        ]);

        expect(result).toEqual(passedOps);
    });
});
