import { RegistryStatus } from "@prumo/database";
import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";

export class RegistryStatusDto {
  @ApiProperty({ enum: RegistryStatus, example: RegistryStatus.ACTIVE })
  @IsEnum(RegistryStatus)
  status!: RegistryStatus;
}
