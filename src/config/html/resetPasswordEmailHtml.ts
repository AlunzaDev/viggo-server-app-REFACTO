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
  const safeName = escapeHtml(name?.trim() || "Hola");

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Recupera tu contrasena - Viggo</title>
</head>
<body style="margin:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#1f1f1f;">
  <div style="max-width:600px;margin:40px auto;padding:0 16px;">
    <div style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.12);">
      <div style="background:linear-gradient(135deg,#00d000,#00a651);padding:36px 28px;text-align:center;">
        <div style="font-size:36px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">VIGGO</div>
        <div style="margin-top:8px;color:#eaffea;font-size:16px;">Recuperacion de contrasena</div>
      </div>

      <div style="padding:32px 28px;">
        <h1 style="margin:0 0 12px;text-align:center;font-size:28px;line-height:1.2;color:#1f1f1f;">
          Restablece tu contrasena
        </h1>

        <p style="margin:0 0 12px;font-size:16px;line-height:1.7;color:#505050;text-align:center;">
          ${safeName}, recibimos una solicitud para cambiar la contrasena de tu cuenta.
        </p>

        <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:#505050;text-align:center;">
          Esta solicitud esta asociada al correo <strong style="color:#1f1f1f;">${safeEmail}</strong>.
        </p>

        <div style="text-align:center;margin:28px 0;">
          <a href="${safeLink}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:16px 34px;border-radius:12px;background:linear-gradient(135deg,#00c853,#00a651);color:#ffffff;text-decoration:none;font-size:17px;font-weight:800;box-shadow:0 8px 22px rgba(0,160,80,.24);">
            Cambiar mi contrasena
          </a>
        </div>

        <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#707070;text-align:center;">
          Si el boton no funciona, copia y pega este enlace en tu navegador:
        </p>

        <div style="padding:14px 16px;border-radius:12px;background:#f7f8fb;border:1px solid #d9f0df;word-break:break-all;text-align:center;">
          <a href="${safeLink}" target="_blank" rel="noopener noreferrer" style="color:#17803d;text-decoration:none;font-size:13px;">
            ${safeLink}
          </a>
        </div>

        <div style="height:1px;background:#ececec;margin:28px 0;"></div>

        <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#707070;text-align:center;">
          El enlace expirara en 30 minutos y solo podra usarse una vez.
        </p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#707070;text-align:center;">
          Si no solicitaste este cambio, puedes ignorar este correo.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
`;
};
