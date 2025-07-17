import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { CockpitsService } from './cockpits.service';
import { CockpitFilterDto, CockpitCreateDto } from './dto';
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

    @Get(':id')
    findOneById(
        @Param('id', ParseIntPipe) cockpitId: number
    ) {
        return this.cockpitsService.findOneById(cockpitId);
    }

    @Post()
    create(
        @Body() dto: CockpitCreateDto,
        @GetUser('id') userId: number
    ) {
        return this.cockpitsService.create(dto, userId);
    }
}
