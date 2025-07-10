import { Body, Controller, Get, Patch, UseGuards, ValidationPipe } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtGuard, ModeratorGuard } from 'src/auth/guard';
import { EditUserDto } from './dto';
import { GetUser } from './decorator';

@Controller('users')
@UseGuards(JwtGuard)
export class UsersController {
    
    constructor(private usersService: UsersService) { }

    @Get('all')
    @UseGuards(ModeratorGuard)
    findAll(){
        return this.usersService.findAll();
    }

    @Patch('edit')
    editUser(@GetUser('id') userId: number, @Body(ValidationPipe) dto: EditUserDto){
        return this.usersService.editUser(userId, dto);
    }
}
