import { IsArray, IsString, ArrayMaxSize } from 'class-validator';

export class UpdateOttsDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  otts!: string[];
}
