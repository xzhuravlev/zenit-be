import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { User } from '@prisma/client';

@Injectable()
export class UsersService {

    constructor(private database: DatabaseService) { }

    async findOne(username: string): Promise<User | null> {
        return await this.database.user.findFirst({
            where: { username: username},
        });
    }

}
