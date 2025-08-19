import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { CompleteChecklistDto } from './dto';

@Injectable()
export class ChecklistsService {

    constructor(private database: DatabaseService) { }

    private levenshtein(a: number[], b: number[]): number {
        const m = a.length;
        const n = b.length;
        const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (a[i - 1] === b[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = Math.min(
                        dp[i - 1][j],    // удаление
                        dp[i][j - 1],    // вставка
                        dp[i - 1][j - 1] // замена
                    ) + 1;
                }
            }
        }

        return dp[m][n];
    }

    findOneById(checklistId: number) {
        return this.database.checklist.findFirst({
            where: { id: checklistId },
            include: {
                items: {
                    orderBy: {
                        id: 'asc',
                    },
                },
                cockpit: {
                    select: {
                        id: true,
                        name: true,
                        media: {
                            where: { type: 'PANORAMA' },
                        },
                        instruments: true,
                    },
                },
            },
        });
    }

    async complete(checklistId: number, dto: CompleteChecklistDto, userId: number) {
        // find this checklist
        const checklist = await this.database.checklist.findFirst({
            where: { id: checklistId },
            include: {
                items: {
                    orderBy: { order: 'asc' },
                    select: { order: true, instrumentId: true, id: true }, // id оставил на всякий случай
                },
            },
        });

        if (!checklist) {
            throw new NotFoundException(`Checklist with id: ${checklistId} not found`);
        }

        // валидация входных данных
        const submitted = dto.selectedInstrumentIds ?? [];
        if (submitted.length === 0) {
            throw new BadRequestException('No instrument ids were submitted');
        }
        if (new Set(submitted).size !== submitted.length) {
            throw new BadRequestException('Duplicate instrument ids in submission');
        }

        // ожидаемый порядок (по порядку айтемов чеклиста)
        const expectedOrder = checklist.items.map((item) => item.order);

        // мапа instrumentId -> order для быстрого поиска
        const orderByInstrumentId = new Map(
            checklist.items.map((item) => [item.instrumentId, item.order] as const)
        );

        // преобразуем присланные instrumentId в их order внутри чеклиста
        const submittedOrder = submitted.map((instrumentId) => {
            const order = orderByInstrumentId.get(instrumentId);
            if (order === undefined) {
                throw new BadRequestException(
                    `Instrument id ${instrumentId} not found in checklist`
                );
            }
            return order;
        });

        // сравнение порядков
        const distance = this.levenshtein(expectedOrder, submittedOrder);
        const maxLen = Math.max(expectedOrder.length, submittedOrder.length) || 1;
        const percent = Math.round(((maxLen - distance) / maxLen) * 100);

        // create or update progress
        const progress = await this.database.checklistProgress.findFirst({
            where: { checklistId, userId },
        });

        const result = progress
            ? await this.database.checklistProgress.update({
                where: { id: progress.id },
                data: { attempt: progress.attempt + 1, percent },
            })
            : await this.database.checklistProgress.create({
                data: { attempt: 1, percent, userId, checklistId },
            });

        return result;
    }


    // async complete(checklistId: number, dto: CompleteChecklistDto, userId: number) {
    //     // find this checklist
    //     const checklist = await this.database.checklist.findFirst({
    //         where: { id: checklistId },
    //         include: { items: { orderBy: { order: 'asc' } } }
    //     });
    //     if (!checklist)
    //         throw new NotFoundException(`Checklist with id: ${checklistId} not found`);

    //     // define order
    //     const expectedOrder = (checklist.items.map((item) => item.order));
    //     const submittedOrder = dto.selectedInstrumentIds.map(itemId => {
    //         const item = checklist.items.find(item => item.id === itemId);
    //         if (!item)
    //             throw new BadRequestException(`Checklist item id ${itemId} not found in checklist`);
    //         return item.order;
    //     });

    //     // compare orders
    //     const distance = this.levenshtein(expectedOrder, submittedOrder);
    //     const maxLen = Math.max(expectedOrder.length, submittedOrder.length);
    //     const percent = Math.round(((maxLen - distance) / maxLen) * 100);


    //     // create or update progress
    //     const progress = await this.database.checklistProgress.findFirst({
    //         where: {
    //             checklistId: checklistId,
    //             userId: userId,
    //         },
    //     });

    //     let result;
    //     if (progress) {
    //         result = await this.database.checklistProgress.update({
    //             where: { id: progress.id },
    //             data: {
    //                 attempt: progress.attempt + 1,
    //                 percent: percent
    //             },
    //         });
    //     } else {
    //         result = await this.database.checklistProgress.create({
    //             data: {
    //                 attempt: 1,
    //                 percent: percent,
    //                 userId: userId,
    //                 checklistId: checklistId
    //             }
    //         })
    //     }

    //     return result;
    // }

}
