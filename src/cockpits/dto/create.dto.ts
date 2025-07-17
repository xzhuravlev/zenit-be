import { MediaType } from "@prisma/client";
import { Type } from "class-transformer";
import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator"

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
    type: MediaType;

    @IsNumber()
    @IsOptional()
    width?: number;

    @IsNumber()
    @IsOptional()
    height?: number;
}

class ChecklistItemCreateDto{

    @IsNumber()
    @IsNotEmpty()
    order: number;

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

export class CockpitCreateDto{

    @IsString()
    @IsNotEmpty()
    name: string

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

    @IsOptional()
    @ValidateNested()
    @Type(() => ChecklistCreateDto)
    checklist?: ChecklistCreateDto;
}