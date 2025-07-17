import { IsIn, IsOptional, IsString } from "class-validator";

export class CockpitFilterDto {

    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    manufacturer?: string;

    @IsOptional()
    @IsString()
    model?: string;

    @IsOptional()
    @IsString()
    type?: string;

    @IsOptional()
    @IsString()
    @IsIn(['true'])
    hasChecklist?: string;

    @IsOptional()
    @IsIn(['old', 'new'])
    orderBy?: string;
}