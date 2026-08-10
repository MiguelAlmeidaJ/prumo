export function emailHtml(input: {
  tenantName: string;
  title: string;
  body: string;
  actionUrl?: string | null;
}): string {
  const action = input.actionUrl
    ? `<p style="margin:28px 0"><a href="${input.actionUrl}" style="background:#163d34;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Abrir no Prumo</a></p>`
    : "";
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f4f6f3;font-family:Arial,sans-serif;color:#18322c">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" style="max-width:620px;background:#fff;border-radius:12px;overflow:hidden">
      <tr><td style="background:#163d34;color:#fff;padding:22px 28px;font-size:22px;font-weight:700">PRUMO</td></tr>
      <tr><td style="padding:28px">
        <p style="color:#5b716b;margin-top:0">${input.tenantName}</p>
        <h1 style="font-size:24px;line-height:1.25">${input.title}</h1>
        <div style="font-size:16px;line-height:1.6">${input.body}</div>
        ${action}
      </td></tr>
      <tr><td style="padding:18px 28px;background:#eef2ef;color:#61736e;font-size:12px">Mensagem enviada pelo Prumo.</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
