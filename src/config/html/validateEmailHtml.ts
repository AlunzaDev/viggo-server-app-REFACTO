const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export const emailValidationHTML = (link: string, email: string): string => {
  const safeLink = escapeHtml(link);
  const safeEmail = escapeHtml(email);

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Valida tu correo - Viggo</title>
</head>
<body style="margin:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#1f1f1f;">
  <div style="max-width:600px;margin:40px auto;padding:0 16px;">
    <div style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.12);">
      <div style="background:linear-gradient(135deg,#00d000,#00a651);padding:36px 28px;text-align:center;">
        <div style="font-size:36px;font-weight:800;color:#ffffff;">VIGGO</div>
        <div style="margin-top:8px;color:#eaffea;font-size:16px;">Validación de correo</div>
      </div>

      <div style="padding:32px 28px;text-align:center;">
        <h1 style="margin:0 0 12px;font-size:28px;color:#1f1f1f;">Valida tu correo</h1>

        <p style="margin:0 0 20px;font-size:16px;line-height:1.7;color:#505050;">
          Para activar tu cuenta asociada a <strong>${safeEmail}</strong>, confirma tu correo.
        </p>

        <a href="${safeLink}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:16px 34px;border-radius:12px;background:linear-gradient(135deg,#00c853,#00a651);color:#ffffff;text-decoration:none;font-size:17px;font-weight:800;">
          Validar mi correo
        </a>

        <p style="margin:24px 0 10px;font-size:14px;line-height:1.6;color:#707070;">
          Si el botón no funciona, copia y pega este enlace:
        </p>

        <div style="padding:14px 16px;border-radius:12px;background:#f7f8fb;border:1px solid #d9f0df;word-break:break-all;">
          <a href="${safeLink}" target="_blank" rel="noopener noreferrer" style="color:#17803d;text-decoration:none;font-size:13px;">
            ${safeLink}
          </a>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`;
};
