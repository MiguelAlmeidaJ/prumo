import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { TemplateRendererService } from "./template-renderer.service";

describe("TemplateRendererService", () => {
  const renderer = new TemplateRendererService();

  it("renderiza caminhos sem usar avaliação de código", () => {
    expect(
      renderer.render("Olá {{user.name}}, bem-vindo à {{tenantName}}.", {
        user: { name: "Ana" },
        tenantName: "Autoescola Sul",
      }),
    ).toBe("Olá Ana, bem-vindo à Autoescola Sul.");
  });

  it("escapa valores em conteúdo HTML", () => {
    expect(
      renderer.render("<p>{{name}}</p>", { name: "<script>" }, { html: true }),
    ).toBe("<p>&lt;script&gt;</p>");
  });

  it("rejeita variável que não foi permitida", () => {
    expect(() =>
      renderer.validate(["userName"], "{{userName}} {{secret}}"),
    ).toThrow(BadRequestException);
  });

  it("rejeita variável ausente na renderização", () => {
    expect(() => renderer.render("{{missing}}", {})).toThrow(
      BadRequestException,
    );
  });
});
