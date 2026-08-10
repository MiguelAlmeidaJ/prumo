import { Global, Module } from "@nestjs/common";
import { AuthRateLimitGuard } from "./auth-rate-limit.guard";

@Global()
@Module({
  providers: [AuthRateLimitGuard],
  exports: [AuthRateLimitGuard],
})
export class SecurityModule {}
