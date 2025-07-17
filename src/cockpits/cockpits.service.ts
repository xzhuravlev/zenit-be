import { Injectable } from '@nestjs/common';
import { CockpitFilterDto } from './dto';
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
                    // checklist: {
                    //     select: {
                    //         id: true,
                    //         progresses: {
                    //             where: { userId: userId },
                    //             select: {
                    //                 percent: true,
                    //                 attempt: true,
                    //             },
                    //         },
                    //     },
                    // },
                    creator: {
                        select: {
                            verified: true,
                        },
                    },
                    // media: true,
                },
            });
        }

        // filter
        const { name, manufacturer, model, type, hasChecklist, orderBy } = filterDto;
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

        if (hasChecklist !== undefined) {
            // Если hasChecklist === "true" – выбираем, у кого checklist существует, иначе – выбираем, у кого его нет
            where.checklist = hasChecklist === 'true' ? { isNot: null } : { is: null };
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
                // checklist: {
                //     select: {
                //         id: true,
                //         progresses: {
                //             where: { userId: userId },
                //             select: {
                //                 percent: true,
                //                 attempt: true,
                //             },
                //         },
                //     },
                // },
                creator: {
                    select: {
                        verified: true,
                    },
                },
                // media: true,
            },
        });
    }
}
