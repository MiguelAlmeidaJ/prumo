import {
  loginSchema,
  logoutSchema,
  refreshSchema,
  selectTenantSchema,
  type AuthResponse,
  type LoginInput,
  type LogoutInput,
  type MembershipSummary,
  type RefreshInput,
  type SelectTenantInput,
} from "@prumo/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthService } from "./auth.service";
import type { AuthenticatedPrincipal } from "./auth.types";
import { CurrentUser } from "./decorators/current-user.decorator";
import {
  AuthResponseDto,
  LoginDto,
  MeResponseDto,
  MembershipSummaryDto,
  RefreshTokenDto,
  SelectTenantDto,
} from "./dto/auth.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { AuthRateLimitGuard } from "../security/auth-rate-limit.guard";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Autentica e inicia uma sessão tenant-bound." })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: "E-mail ou senha inválidos." })
  login(
    @Body(new ZodValidationPipe(loginSchema)) input: LoginInput & LoginDto,
  ): Promise<AuthResponse> {
    return this.authService.login(input);
  }

  @Post("select-tenant")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({
    summary: "Seleciona um tenant vinculado e rotaciona o refresh token.",
  })
  @ApiBody({ type: SelectTenantDto })
  @ApiOkResponse({ type: AuthResponseDto })
  selectTenant(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(selectTenantSchema))
    input: SelectTenantInput & SelectTenantDto,
  ): Promise<AuthResponse> {
    return this.authService.selectTenant(user.id, input);
  }

  @Post("select-platform")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({
    summary: "Seleciona o console global e rotaciona o refresh token.",
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({ type: AuthResponseDto })
  selectPlatform(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(refreshSchema))
    input: RefreshInput & RefreshTokenDto,
  ): Promise<AuthResponse> {
    return this.authService.selectPlatform(user.id, input);
  }

  @Post("refresh")
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rotaciona o refresh token e renova a sessão." })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({
    description: "Refresh token inválido, expirado ou reutilizado.",
  })
  refresh(
    @Body(new ZodValidationPipe(refreshSchema))
    input: RefreshInput & RefreshTokenDto,
  ): Promise<AuthResponse> {
    return this.authService.refresh(input);
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Revoga a sessão do refresh token informado." })
  @ApiBody({ type: RefreshTokenDto })
  @ApiNoContentResponse()
  async logout(
    @Body(new ZodValidationPipe(logoutSchema))
    input: LogoutInput & RefreshTokenDto,
  ): Promise<void> {
    await this.authService.logout(input);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Retorna usuário e tenant ativos." })
  @ApiOkResponse({ type: MeResponseDto })
  me(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.authService.getMe(user);
  }

  @Get("memberships")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Lista memberships ativas do usuário." })
  @ApiOkResponse({ type: MembershipSummaryDto, isArray: true })
  memberships(
    @CurrentUser() user: AuthenticatedPrincipal,
  ): Promise<MembershipSummary[]> {
    return this.authService.listMemberships(user.id);
  }
}
