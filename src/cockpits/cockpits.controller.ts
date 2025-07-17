import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { CockpitsService } from './cockpits.service';
import { CockpitFilterDto } from './dto';
import { GetUser } from 'src/users/decorator';

@Controller('cockpits')
@UseGuards(JwtGuard)
export class CockpitsController {
    constructor(private cockpitsService: CockpitsService) { }

    @Get()
    findAll(
        @Query() filterDto: CockpitFilterDto,
        @GetUser('id') userId: number
    ) {
        return this.cockpitsService.findAll(filterDto, userId);
    }
}
