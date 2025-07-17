import { Module } from '@nestjs/common';
import { CockpitsController } from './cockpits.controller';
import { CockpitsService } from './cockpits.service';

@Module({
  controllers: [CockpitsController],
  providers: [CockpitsService]
})
export class CockpitsModule {}
