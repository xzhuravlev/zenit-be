import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { ChecklistsService } from './checklists.service';
import { CompleteChecklistDto } from './dto';
import { GetUser } from 'src/users/decorator';

@Controller('checklists')
@UseGuards(JwtGuard)
export class ChecklistsController {
    constructor(private checklistsService: ChecklistsService) { }

    @Get(':id')
    findOne(
        @Param('id', ParseIntPipe) checklistId: number,
    ) {
        return this.checklistsService.findOneById(checklistId);
    }

    @Post(':id/complete')
    complete(
        @Param('id', ParseIntPipe) checklistId: number,
        @Body() dto: CompleteChecklistDto,
        @GetUser('id') userId: number
    ) {
        return this.checklistsService.complete(checklistId, dto, userId);
    }
}
