import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class DatabaseService extends PrismaClient {
    constructor(config: ConfigService) {
        super({
            datasources: {
                db: {
                    url: config.get('DATABASE_URL')
                }
            }
        })
    }

    cleanDb() {
        return this.$transaction([
            this.media.deleteMany(),
            this.checklistProgress.deleteMany(),
            this.checklistItem.deleteMany(),
            this.checklist.deleteMany(),
            this.instrument.deleteMany(),
            this.purchase.deleteMany(),
            this.cockpit.deleteMany(),
            this.user.deleteMany()
        ]);
    }
}
