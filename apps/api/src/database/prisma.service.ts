import {
  ConflictException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import {
  createPrismaAdapter,
  isPrismaKnownRequestError,
  Prisma,
  PrismaClient,
} from "@prumo/database";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ adapter: createPrismaAdapter() });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async serializableTransaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
    maxAttempts = 3,
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const isWriteConflict =
          isPrismaKnownRequestError(error) &&
          error.code === "P2034";
        if (!isWriteConflict) throw error;
        if (attempt === maxAttempts) {
          throw new ConflictException(
            "A operação concorreu com outra alteração. Tente novamente.",
          );
        }
      }
    }
    throw new ConflictException(
      "A operação concorreu com outra alteração. Tente novamente.",
    );
  }
}
