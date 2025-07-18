import { IsEmail, IsOptional, IsString } from "class-validator"

export class EditUserDto {
    
    @IsEmail()
    @IsOptional()
    email?: string

    @IsString()
    @IsOptional()
    username?: string

    @IsString()
    @IsOptional()
    currentPassword?: string;

    @IsString()
    @IsOptional()
    newPassword?: string;

}