import { Injectable } from '@nestjs/common';
import { CockpitCreateDto, CockpitFilterDto } from './dto';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class CockpitsService {
    constructor(private database: DatabaseService) { }

    findAll(filterDto: CockpitFilterDto, userId: number) {
        if (!Object.keys(filterDto).length) {
            // no filter
            return this.database.cockpit.findMany({
                include: {
                    _count: {
                        select: {
                            favoritedBy: true,
                        },
                    },
                    checklists: {
                        select: {
                            id: true,
                            progresses: {
                                where: { userId: userId },
                                select: {
                                    percent: true,
                                    attempt: true,
                                },
                            },
                        },
                    },
                    creator: {
                        select: {
                            verified: true,
                        },
                    },
                    media: true,
                },
            });
        }

        // filter
        const { name, manufacturer, model, type, hasChecklists, orderBy } = filterDto;
        const where: any = {};

        if (name) {
            where.name = { contains: name, mode: 'insensitive' };
        }

        if (manufacturer) {
            where.manufacturer = { contains: manufacturer, mode: 'insensitive' };
        }

        if (model) {
            where.model = { contains: model, mode: 'insensitive' };
        }

        if (type) {
            where.type = { contains: type, mode: 'insensitive' };
        }

        if (hasChecklists !== undefined) {
            // Если hasChecklist === "true" – выбираем, у кого checklist существует, иначе – выбираем, у кого его нет
            where.checklists = hasChecklists === 'true' ? { isNot: null } : { is: null };
        }


        let sortOrder;
        if (orderBy === 'old') {
            sortOrder = { createdAt: 'asc' };
        } else if (orderBy === 'new') {
            sortOrder = { createdAt: 'desc' };
        }

        return this.database.cockpit.findMany({
            where,
            orderBy: sortOrder,
            include: {
                _count: {
                    select: {
                        favoritedBy: true,
                    },
                },
                checklists: {
                    select: {
                        id: true,
                        progresses: {
                            where: { userId: userId },
                            select: {
                                percent: true,
                                attempt: true,
                            },
                        },
                    },
                },
                creator: {
                    select: {
                        verified: true,
                    },
                },
                media: true,
            },
        });
    }

    findOneById(cockpitId: number) {
        return this.database.cockpit.findFirst({
            where: { id: cockpitId },
            include: {
                creator: {
                    select: {
                        id: true,
                        username: true
                    }
                },
                _count: {
                    select: {
                        favoritedBy: true
                    }
                },
                instruments: {
                    include: {
                        media: true
                    }
                },
                checklists: {
                    include: {
                        items: true
                    }
                },
                media: true,
            },
        });
    }

    async create(dto: CockpitCreateDto, userId: number) {
        const cockpit = await this.database.cockpit.create({
            data: {
                name: dto.name,
                manufacturer: dto.manufacturer,
                model: dto.model,
                type: dto.type,
                creatorId: userId,
    
                media: dto.media ? {
                    create: dto.media.map((media) => ({
                        link: media.link,
                        type: media.type,
                        width: media.width ? media.width : null, // ✅ Добавляем ширину
                        height: media.height ? media.height : null, // ✅ Добавляем высоту
                    })),
                } : undefined,
                
                instruments: dto.instruments ? {
                    create: dto.instruments.map((instrument) => ({
                        name: instrument.name,
                        x: instrument.x,
                        y: instrument.y,
    
                        media: instrument.media ? {
                            create: instrument.media.map((media) => ({
                                link: media.link,
                                type: media.type,
                                width: media.width ? media.width : null, // ✅ Размеры для инструмента
                                height: media.height ? media.height : null,
                            })),
                        } : undefined,
                    })),
                } : undefined,
            },
            include: {
                instruments: true,
            },
        });

        // ✅ Если передан чеклист, создаём его с элементами
        if (dto.checklist && dto.checklist.items.length > 0) {
            // Преобразуем каждый элемент, используя instrumentIndex для подключения к созданному инструменту.
            const checklistItemsData = dto.checklist.items.map(item => {
                // Найти инструмент по индексу.
                const instrument = cockpit.instruments[item.instrumentIndex];
                if (!instrument) {
                    throw new Error(`Инструмент с индексом ${item.instrumentIndex} не найден.`);
                }
                return {
                    order: item.order,
                    instrument: {
                        connect: { id: instrument.id },
                    },
                };
            });

            // Создаем чеклист, связанный с данным cockpit.
            await this.database.checklist.create({
                data: {
                    name: dto.checklist.name,
                    cockpitId: cockpit.id,
                    items: {
                        create: checklistItemsData,
                    },
                },
            });
        }

        return cockpit;
    }
}
