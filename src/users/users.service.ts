import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { User } from '@prisma/client';
import { EditUserDto } from './dto';
import * as argon from 'argon2';

@Injectable()
export class UsersService {
    constructor(private database: DatabaseService) { }

    async findOne(username: string): Promise<User | null> {
        return await this.database.user.findFirst({
            where: { username: username },
        });
    }

    async findAll() {
        return this.database.user.findMany({
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                verified: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    }

    async editUser(userId: number, dto: EditUserDto) {
        const user = await this.database.user.findUnique({
            where: { id: userId },
        });
        if (!user) throw new NotFoundException('User not found');

        const dataToUpdate: any = {};
        if (dto.username) dataToUpdate.username = dto.username;
        if (dto.email) dataToUpdate.email = dto.email;

        if (dto.newPassword) {
            if (user.hash) {
                if (!dto.currentPassword) throw new ForbiddenException('Current password required')
                
                const isMatch = await argon.verify(user.hash, dto.currentPassword);
                if (!isMatch) throw new ForbiddenException('Current password incorrect')
                dataToUpdate.hash = await argon.hash(dto.newPassword)
            } else {
                throw new ForbiddenException('Password not set. Use Google login or dedicated set-password flow.')
            }
        }
        // if (dto.currentPassword && dto.newPassword) {
        //     const isMatch = await argon.verify(user.hash, dto.currentPassword);
        //     if (!isMatch) throw new ForbiddenException('Current password incorrect');

        //     const newHash = await argon.hash(dto.newPassword);
        //     dataToUpdate.hash = newHash;
        // }

        return this.database.user.update({
            where: { id: userId },
            data: dataToUpdate,
            select: {
                id: true,
                username: true,
                email: true,
                updatedAt: true,
            }
        })
    }

    async verifyUser(userId: number) {
        const user = await this.database.user.findUnique({
            where: { id: userId },
            select: { verified: true },
        });

        if (!user) throw new NotFoundException('User not found');

        return this.database.user.update({
            where: { id: userId },
            data: {
                verified: !user.verified,
            },
            select: {
                id: true,
                verified: true,
            }
        });
    }

}