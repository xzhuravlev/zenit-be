import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class ChecklistsService {
    constructor(private database: DatabaseService) { }
}
