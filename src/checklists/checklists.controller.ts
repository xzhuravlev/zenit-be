import { Controller, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { ChecklistsService } from './checklists.service';

@Controller('checklists')
@UseGuards(JwtGuard)
export class ChecklistsController {
    constructor(private checklistsService: ChecklistsService) { }
}
