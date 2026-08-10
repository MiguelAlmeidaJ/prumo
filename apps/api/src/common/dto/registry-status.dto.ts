import { RegistryStatus } from "@prisma/client";
import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";

export class RegistryStatusDto {
  @ApiProperty({ enum: RegistryStatus, example: RegistryStatus.ACTIVE })
  @IsEnum(RegistryStatus)
  status!: RegistryStatus;
}
