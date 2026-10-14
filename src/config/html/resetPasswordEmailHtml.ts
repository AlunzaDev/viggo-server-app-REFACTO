import { emailTheme, emailThemeStyles } from "./emailTheme";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export const resetPasswordEmailHtml = (
  link: string,
  email: string,
  name?: string,
): string => {
  const safeLink = escapeHtml(link);
  const safeEmail = escapeHtml(email);
  const safeName = escapeHtml(name?.trim() || "Usuario");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <title>Recupera tu contraseña - Viggo</title>
  <style>${emailThemeStyles}</style>
</head>
<body class="email-page" style="margin:0;padding:0;background-color:${emailTheme.light.page};color:${emailTheme.light.title};font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    Usa este enlace para restablecer tu contraseña de Viggo. Expira en 30 minutos.
  </div>
  <table class="email-page" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:${emailTheme.light.page};">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table class="email-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:${emailTheme.light.card};border:1px solid ${emailTheme.light.border};border-radius:22px;">
          <tr>
            <td align="center" style="padding:32px 24px;background-color:#102019;border-radius:22px 22px 0 0;">
              <img src="cid:viggo-logo" width="54" height="54" alt="Viggo" style="display:block;width:54px;height:54px;margin:0 auto 12px;border:0;object-fit:contain;" />
              <div style="font-size:28px;line-height:1;font-weight:800;letter-spacing:3px;color:#ffffff;">VIGGO</div>
              <div style="margin-top:10px;font-size:14px;line-height:1.5;color:#a9e995;">Seguridad de tu cuenta</div>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px 32px;">
              <div style="font-size:12px;line-height:1.4;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#347b48;">Recuperación de acceso</div>
              <h1 class="email-title" style="margin:10px 0 14px;font-size:28px;line-height:1.2;color:${emailTheme.light.title};">Restablece tu contraseña</h1>
              <p class="email-body" style="margin:0 0 10px;font-size:16px;line-height:1.7;color:${emailTheme.light.body};">
                Hola, <strong class="email-strong" style="color:${emailTheme.light.title};">${safeName}</strong>. Recibimos una solicitud para cambiar la contraseña de tu cuenta.
              </p>
              <p class="email-muted" style="margin:0;font-size:14px;line-height:1.7;color:${emailTheme.light.muted};">Cuenta: <strong class="email-body" style="color:${emailTheme.light.body};">${safeEmail}</strong></p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0;">
                <tr>
                  <td align="center" bgcolor="#2f7d46" style="border-radius:12px;">
                    <a href="${safeLink}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:15px 26px;font-size:16px;line-height:1.2;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">Cambiar mi contraseña</a>
                  </td>
                </tr>
              </table>
              <div class="email-callout" style="margin:0 0 24px;padding:14px 16px;background-color:${emailTheme.light.callout};border-left:4px solid #3d9155;border-radius:8px;font-size:14px;line-height:1.6;color:${emailTheme.light.body};">
                Este enlace expirará en <strong>30 minutos</strong> y solo podrá utilizarse una vez.
              </div>
              <p class="email-muted" style="margin:0 0 10px;font-size:13px;line-height:1.6;color:${emailTheme.light.muted};">Si el botón no funciona, abre este enlace:</p>
              <div class="email-surface" style="padding:13px 14px;background-color:${emailTheme.light.surface};border:1px solid ${emailTheme.light.border};border-radius:10px;word-break:break-all;">
                <a class="email-link" href="${safeLink}" target="_blank" rel="noopener noreferrer" style="font-size:12px;line-height:1.6;color:${emailTheme.brand.link};text-decoration:underline;">${safeLink}</a>
              </div>
              <p class="email-muted email-divider" style="margin:24px 0 0;padding-top:20px;border-top:1px solid ${emailTheme.light.border};font-size:13px;line-height:1.6;color:${emailTheme.light.muted};">
                Si no solicitaste este cambio, ignora el correo. Tu contraseña seguirá siendo la misma.
              </p>
            </td>
          </tr>
        </table>
        <p class="email-muted" style="margin:18px 0 0;font-size:12px;line-height:1.5;color:${emailTheme.light.muted};">Mensaje automático de Viggo. No respondas a este correo.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
};
