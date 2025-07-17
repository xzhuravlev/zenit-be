import { ForbiddenException, Injectable } from '@nestjs/common';
import { CockpitCreateDto, CockpitUpdateDto, CockpitFilterDto } from './dto';
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
                        throw new Error(`Instrument with index ${item.instrumentIndex} not found`);
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

    async delete(cockpitId: number, userId: number) {
        const cockpit = await this.database.cockpit.findUnique({
            where: {
                id: cockpitId
            },
        });

        if (!cockpit || cockpit.creatorId !== userId)
            throw new ForbiddenException('Access to resources denied')

        return this.database.cockpit.delete({
            where: {
                id: cockpitId
            },
        });
    }
}
