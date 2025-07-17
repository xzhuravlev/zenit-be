import { IsArray, IsInt } from "class-validator";

export class CompleteChecklistDto{

    @IsArray()
    @IsInt({ each: true })
    selectedInstrumentIds: number[];
}