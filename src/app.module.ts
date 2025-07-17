import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CockpitsModule } from './cockpits/cockpits.module';

@Module({
    imports: [UsersModule, DatabaseModule, ConfigModule.forRoot({ isGlobal: true, }), AuthModule, CockpitsModule]
})
export class AppModule { }
