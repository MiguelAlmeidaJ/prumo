import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { ObjectStorageService } from "./object-storage.service";

function service(): ObjectStorageService {
  return new ObjectStorageService(
    new ConfigService({
      APP_ENV: "test",
      STORAGE_BUCKET: "test-documents",
      STORAGE_SIGNED_URL_TTL_SECONDS: "120",
    }),
  );
}

describe("ObjectStorageService", () => {
  it("cria chave privada segregada por tenant e URL temporária", async () => {
    const storage = service();
    const key = await storage.putDocument({
      tenantId: "tenant-a",
      studentId: "student-a",
      actorUserId: "user-a",
      fileName: "documento.pdf",
      contentType: "application/pdf",
      extension: "pdf",
      body: Buffer.from("%PDF-1.4"),
    });

    expect(key).toMatch(
      /^tenants\/tenant-a\/students\/student-a\/documents\/.+\.pdf$/,
    );
    const signed = await storage.signedDownloadUrl({
      tenantId: "tenant-a",
      key,
      fileName: "documento.pdf",
      contentType: "application/pdf",
    });
    expect(signed.url).toContain("private=1");
    expect(new Date(signed.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("impede acesso cruzado mesmo quando uma chave é conhecida", async () => {
    const storage = service();
    const key = await storage.putDocument({
      tenantId: "tenant-a",
      studentId: "student-a",
      actorUserId: "user-a",
      fileName: "documento.pdf",
      contentType: "application/pdf",
      extension: "pdf",
      body: Buffer.from("%PDF-1.4"),
    });

    await expect(
      storage.signedDownloadUrl({
        tenantId: "tenant-b",
        key,
        fileName: "documento.pdf",
        contentType: "application/pdf",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
