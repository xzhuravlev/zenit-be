import { MediaType } from "@prisma/client";
import { Type } from "class-transformer";
import { IsArray, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateIf, ValidateNested } from "class-validator"

class InstrumentCreateDto{

    @IsString()
    @IsNotEmpty()
    name: string

    @IsNumber()
    @IsOptional()
    x: number

    @IsNumber()
    @IsOptional()
    y: number

    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => MediaCreateDto)
    media?: MediaCreateDto[];
}

class MediaCreateDto{

    @IsString()
    @IsNotEmpty()
    link: string;

    @IsString()
    @IsEnum(MediaType)
    @IsNotEmpty()
    type: MediaType;

    @IsNumber()
    @IsOptional()
    @ValidateIf(o => o.type !== MediaType.TEXT)
    width?: number;

    @IsNumber()
    @IsOptional()
    @ValidateIf(o => o.type !== MediaType.TEXT)
    height?: number;
}

class ChecklistItemCreateDto{

    @IsNumber()
    @IsNotEmpty()
    order: number;

    @IsString()
    @IsOptional()
    description?: string

    @IsNumber()
    @IsNotEmpty()
    instrumentIndex: number;
}

class ChecklistCreateDto{

    @IsString()
    @IsNotEmpty()
    name: string
    
    @IsArray()
    @IsNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => ChecklistItemCreateDto)
    items: ChecklistItemCreateDto[];
}

export class CockpitUpdateDto{

    @IsString()
    @IsOptional()
    name?: string

    @IsString()
    @IsOptional()
    manufacturer?: string
    
    @IsString()
    @IsOptional()
    model?: string
    
    @IsString()
    @IsOptional()
    type?: string

    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => InstrumentCreateDto)
    instruments?: InstrumentCreateDto[];

    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => MediaCreateDto)
    media?: MediaCreateDto[];

    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => ChecklistCreateDto)
    checklists?: ChecklistCreateDto[];
}