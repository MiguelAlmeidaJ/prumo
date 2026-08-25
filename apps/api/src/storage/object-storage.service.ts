import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  type ServerSideEncryption,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ConfigService } from "@nestjs/config";
import {
  ForbiddenException,
  Injectable,
  OnApplicationShutdown,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";

type DocumentExtension = "jpg" | "pdf" | "png";
type MigrationFileExtension = "csv" | "xlsx";

interface StoredObject {
  body: Buffer;
  contentType: string;
  metadata: Record<string, string>;
}

export interface StoreDocumentInput {
  tenantId: string;
  studentId: string;
  actorUserId: string;
  fileName: string;
  contentType: string;
  extension: DocumentExtension;
  body: Buffer;
}

export interface SignedDocumentUrl {
  url: string;
  expiresAt: string;
}

export interface StoreMigrationFileInput {
  tenantId: string;
  importJobId: string;
  actorUserId: string;
  fileName: string;
  contentType: string;
  extension: MigrationFileExtension;
  body: Buffer;
}

@Injectable()
export class ObjectStorageService implements OnApplicationShutdown {
  private readonly bucket: string;
  private readonly client: S3Client;
  private readonly inMemory: boolean;
  private readonly memoryObjects = new Map<string, StoredObject>();
  private readonly signedUrlTtlSeconds: number;
  private readonly encryption?: ServerSideEncryption;
  private readonly kmsKeyId?: string;

  constructor(config: ConfigService) {
    this.inMemory = config.get<string>("APP_ENV") === "test";
    this.bucket = config.get<string>("STORAGE_BUCKET", "prumo-documents");
    this.signedUrlTtlSeconds = Number(
      config.get<string>("STORAGE_SIGNED_URL_TTL_SECONDS", "300"),
    );
    this.kmsKeyId = config.get<string>("STORAGE_KMS_KEY_ID") || undefined;
    const configuredEncryption = config.get<string>(
      "STORAGE_SERVER_SIDE_ENCRYPTION",
      "none",
    );
    this.encryption =
      configuredEncryption === "AES256" || configuredEncryption === "aws:kms"
        ? configuredEncryption
        : undefined;

    const endpoint = config.get<string>(
      "STORAGE_ENDPOINT",
      "http://localhost:9000",
    );
    const accessKeyId = config.get<string>("STORAGE_ACCESS_KEY_ID");
    const secretAccessKey = config.get<string>("STORAGE_SECRET_ACCESS_KEY");
    this.client = new S3Client({
      region: config.get<string>("STORAGE_REGION", "us-east-1"),
      endpoint: endpoint || undefined,
      forcePathStyle:
        config.get<string>("STORAGE_FORCE_PATH_STYLE", "true") === "true",
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
    });
  }

  createDocumentKey(input: {
    tenantId: string;
    studentId: string;
    extension: DocumentExtension;
  }): string {
    return `tenants/${input.tenantId}/students/${input.studentId}/documents/${randomUUID()}.${input.extension}`;
  }

  async putDocument(input: StoreDocumentInput): Promise<string> {
    const key = this.createDocumentKey(input);
    const metadata = {
      tenantId: input.tenantId,
      studentId: input.studentId,
      uploadedBy: input.actorUserId,
      originalName: encodeURIComponent(input.fileName).slice(0, 512),
    };
    await this.putPrivateObject(key, input.body, input.contentType, metadata);
    return key;
  }

  async putMigrationFile(input: StoreMigrationFileInput): Promise<string> {
    const key = `tenants/${input.tenantId}/migrations/${input.importJobId}/files/${randomUUID()}.${input.extension}`;
    const metadata = {
      tenantId: input.tenantId,
      importJobId: input.importJobId,
      uploadedBy: input.actorUserId,
      originalName: encodeURIComponent(input.fileName).slice(0, 512),
    };
    await this.putPrivateObject(key, input.body, input.contentType, metadata);
    return key;
  }

  async getPrivateObject(tenantId: string, key: string): Promise<Buffer> {
    this.assertTenantKey(tenantId, key);
    if (this.inMemory) {
      const object = this.memoryObjects.get(key);
      if (!object) throw new Error("Object not found");
      return Buffer.from(object.body);
    }
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body) throw new Error("Object body not found");
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async deleteDocument(tenantId: string, key: string): Promise<void> {
    this.assertTenantKey(tenantId, key);
    if (this.inMemory) {
      this.memoryObjects.delete(key);
      return;
    }
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async signedDownloadUrl(input: {
    tenantId: string;
    key: string;
    fileName: string;
    contentType: string;
  }): Promise<SignedDocumentUrl> {
    this.assertTenantKey(input.tenantId, input.key);
    const expiresAt = new Date(
      Date.now() + this.signedUrlTtlSeconds * 1_000,
    ).toISOString();
    if (this.inMemory) {
      if (!this.memoryObjects.has(input.key))
        throw new Error("Object not found");
      return {
        url: `https://storage.test/${encodeURIComponent(input.key)}?private=1`,
        expiresAt,
      };
    }
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ResponseContentType: input.contentType,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(input.fileName)}`,
    });
    return {
      url: await getSignedUrl(this.client, command, {
        expiresIn: this.signedUrlTtlSeconds,
      }),
      expiresAt,
    };
  }

  async checkHealth(): Promise<void> {
    if (this.inMemory) return;
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  onApplicationShutdown(): void {
    this.client.destroy();
    this.memoryObjects.clear();
  }

  private assertTenantKey(tenantId: string, key: string): void {
    if (!key.startsWith(`tenants/${tenantId}/`)) {
      throw new ForbiddenException("Objeto fora do tenant ativo.");
    }
  }

  private async putPrivateObject(
    key: string,
    body: Buffer,
    contentType: string,
    metadata: Record<string, string>,
  ): Promise<void> {
    if (this.inMemory) {
      this.memoryObjects.set(key, {
        body: Buffer.from(body),
        contentType,
        metadata,
      });
      return;
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentLength: body.length,
        ContentType: contentType,
        Metadata: metadata,
        ServerSideEncryption: this.encryption,
        SSEKMSKeyId: this.kmsKeyId,
      }),
    );
  }
}
