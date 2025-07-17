import { ForbiddenException, Injectable } from '@nestjs/common';
import { CockpitCreateDto, CockpitUpdateDto, CockpitFilterDto } from './dto';
import { DatabaseService } from 'src/database/database.service';
import { link } from 'fs';

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
                instruments: dto.instruments ? {
                    create: dto.instruments.map((instrument) => ({
                        name: instrument.name,
                        x: instrument.x,
                        y: instrument.y,
                        media: instrument.media ? {
                            create: instrument.media.map((media) => ({
                                link: media.link,
                                type: media.type,
                                width: media.type !== 'TEXT' ? media.width ?? null : null,
                                height: media.type !== 'TEXT' ? media.height ?? null : null,
                            })),
                        } : undefined,
                    })),
                } : undefined,
                media: dto.media ? {
                    create: dto.media.map((media) => ({
                        link: media.link,
                        type: media.type,
                        width: media.type !== 'TEXT' ? media.width ?? null : null,
                        height: media.type !== 'TEXT' ? media.height ?? null : null,
                    })),
                } : undefined,
            },
            include: {
                media: true,
                instruments: true,
                checklists: true,
            },
        });

        if (dto.checklists && dto.checklists.length > 0) {
            for (const checklist of dto.checklists) {
                const itemsToCreate = checklist.items.map(item => {
                    const instrument = cockpit.instruments[item.instrumentIndex];
                    if (!instrument) {
                        throw new Error(`Instrument with index ${item.instrumentIndex} doesn't found.`);
                    }
                    return {
                        description: item.description ? item.description : null,
                        order: item.order,
                        instrument: {
                            connect: { id: instrument.id },
                        },
                    };
                });

                await this.database.checklist.create({
                    data: {
                        name: checklist.name,
                        cockpitId: cockpit.id,
                        items: {
                            create: itemsToCreate,
                        },
                    },
                });
            }
        }

        return cockpit;
    }

    async update(cockpitId: number, dto: CockpitUpdateDto, userId: number) {
        const cockpit = await this.database.cockpit.findUnique({
            where: { id: cockpitId },
            include: { instruments: true },
        });

        if (!cockpit || cockpit.creatorId !== userId)
            throw new ForbiddenException('Access to resources denied')

        // if we got new media => delete old
        if (dto.media) {
            await this.database.media.deleteMany({
                where: { cockpitId: cockpitId },
            });
        }

        // if we got new instruments => delete old
        if (dto.instruments) {
            const instrumentsIds = cockpit.instruments.map((instrument) => instrument.id);

            await this.database.checklistItem.deleteMany({
                where: { instrumentId: { in: instrumentsIds } },
            });

            await this.database.media.deleteMany({
                where: { instrumentId: { in: instrumentsIds } },
            });

            await this.database.instrument.deleteMany({
                where: { cockpitId },
            });
        }

        // if we got new checklists => delete old
        if (dto.checklists) {
            const existingChecklists = await this.database.checklist.findMany({
                where: { cockpitId },
                select: { id: true },
            });

            const checklistsIds = existingChecklists.map((checklist) => checklist.id);

            await this.database.checklistItem.deleteMany({
                where: { checklistId: { in: checklistsIds } },
            });

            await this.database.checklist.deleteMany({
                where: { id: { in: checklistsIds } },
            });
        }

        // update cockpit
        const updated = await this.database.cockpit.update({
            where: { id: cockpitId },
            data: {
                name: dto.name,
                manufacturer: dto.manufacturer,
                model: dto.model,
                type: dto.type,

                media: dto.media ? {
                    create: dto.media.map(media => ({
                        link: media.link,
                        type: media.type,
                        width: media.type !== 'TEXT' ? media.width ?? null : null,
                        height: media.type !== 'TEXT' ? media.height ?? null : null,
                    })),
                } : undefined,

                instruments: dto.instruments ? {
                    create: dto.instruments.map(instr => ({
                        name: instr.name,
                        x: instr.x,
                        y: instr.y,
                        media: instr.media ? {
                            create: instr.media.map(media => ({
                                link: media.link,
                                type: media.type,
                                width: media.type !== 'TEXT' ? media.width ?? null : null,
                                height: media.type !== 'TEXT' ? media.height ?? null : null,
                            })),
                        } : undefined,
                    })),
                } : undefined,
            },
            include: { instruments: true },
        });

        if (dto.checklists && dto.checklists.length > 0) {
            for (const checklist of dto.checklists) {
                const itemsToCreate = checklist.items.map(item => {
                    const instrument = updated.instruments[item.instrumentIndex];
                    if (!instrument) {
                        throw new Error(`Instrument at index ${item.instrumentIndex} not found`);
                    }

                    return {
                        description: item.description ?? null,
                        order: item.order,
                        instrument: { connect: { id: instrument.id } },
                    };
                });

                await this.database.checklist.create({
                    data: {
                        name: checklist.name,
                        cockpitId: cockpitId,
                        items: { create: itemsToCreate },
                    },
                });
            }
        }

        return updated;
    }


    /*
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
    */

    /*
    async edit(cockpitId: number, dto: CockpitEditDto, userId: number) {
        // Находим кокпит с вложенными инструментами
        const cockpit = await this.database.cockpit.findUnique({
            where: { id: cockpitId },
            include: { instruments: true },
        });
        
        if(!cockpit || cockpit.creatorId !== userId)
            throw new ForbiddenException('Access to resources denied');
        
        // Если переданы новые media для кокпита, удаляем старые
        if(dto.media){
            await this.database.media.deleteMany({
                where: { cockpitId: cockpitId },
            });
        }
        
        // Если переданы новые инструменты, удаляем старые инструменты (и связанные с ними media, если настроено каскадное удаление)
        if(dto.instruments){
            // Найдём все инструменты данного кокпита
            const instrumentsToDelete = await this.database.instrument.findMany({
                where: { cockpitId: cockpitId },
                select: { id: true },
            });

            const instrumentIds = instrumentsToDelete.map(i => i.id);
            
            // Удаляем все checklist items, ссылающиеся на эти инструменты
            await this.database.checklistItem.deleteMany({
                where: { instrumentId: { in: instrumentIds } },
            });

            // Удаляем медиа, связанные с этими инструментами
            await this.database.media.deleteMany({
                where: { instrumentId: { in: instrumentIds } },
            });
            
            // Теперь можно безопасно удалить инструменты
            await this.database.instrument.deleteMany({
                where: { cockpitId: cockpitId },
            });
        }
            
        
        // Обновляем основные поля кокпита, создаём новые вложенные media и instruments
        const updatedCockpit = await this.database.cockpit.update({
            where: { id: cockpitId },
            data: {
                name: dto.name,
                manufacturer: dto.manufacturer,
                model: dto.model,
                type: dto.type,
                media: dto.media ? {
                    create: dto.media.map(media => ({
                        link: media.link,
                        type: media.type,
                        width: media.width ? media.width : null, // ✅ Добавляем ширину
                        height: media.height ? media.height : null, // ✅ Добавляем высоту
                    })),
                } : undefined,
                instruments: dto.instruments ? {
                    create: dto.instruments.map(instrument => ({
                        name: instrument.name,
                        x: instrument.x,
                        y: instrument.y,
                        media: instrument.media ? {
                            create: instrument.media.map(media => ({
                            link: media.link,
                            type: media.type,
                            width: media.width ? media.width : null, // ✅ Добавляем ширину
                            height: media.height ? media.height : null, // ✅ Добавляем высоту
                            })),
                        } : undefined,
                    })),
                } : undefined,
            },
            include: { instruments: true },
        });
        
        // Если передан чеклист, обновляем или создаём его с элементами
        if(dto.checklist && dto.checklist.items.length > 0){
            // Преобразуем каждый элемент чеклиста, используя instrumentIndex для подключения к созданному инструменту
            const checklistItemsData = dto.checklist.items.map(item => {
                const instrument = updatedCockpit.instruments[item.instrumentIndex];
                if(!instrument){
                    throw new Error(`Инструмент с индексом ${item.instrumentIndex} не найден.`);
                }
                return {
                    order: item.order,
                    instrument: { connect: { id: instrument.id } },
                };
            });
        
            const existingChecklist = await this.database.checklist.findUnique({
                where: { cockpitId: cockpitId },
            });

            if(existingChecklist){
                // Сначала удаляем все элементы чеклиста отдельно
                await this.database.checklistItem.deleteMany({
                    where: { checklistId: existingChecklist.id },
                });

                // Затем обновляем чеклист, создавая новые элементы
                await this.database.checklist.update({
                    where: { id: existingChecklist.id },
                    data: {
                        items: { create: checklistItemsData },
                    },
                });
            }else {
                await this.database.checklist.create({
                    data: {
                        name: dto.checklist.name,
                        cockpitId: cockpitId,
                        items: { create: checklistItemsData },
                    },
                });
            }
        }
        
        return updatedCockpit;
    }
    */
}
