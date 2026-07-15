export const resetPasswordExpiredHtml = (): string => `
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Enlace no disponible - Viggo</title>
</head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#161616;color:#fff;font-family:Arial,Helvetica,sans-serif;padding:24px;">
  <section style="width:min(100%,520px);background:#222;border:1px solid #333;border-radius:24px;padding:32px;box-shadow:0 18px 60px rgba(0,0,0,.35);text-align:center;">
    <div style="font-size:14px;font-weight:700;letter-spacing:.22em;color:#9cffb3;text-transform:uppercase;">VIGGO</div>
    <h1 style="margin:14px 0 10px;font-size:30px;">Enlace no disponible</h1>
    <p style="margin:0;color:#d0d0d0;line-height:1.7;">
      Este enlace ya no esta disponible. Solicita una nueva recuperacion de contrasena desde el inicio de sesion.
    </p>
  </section>
</body>
</html>
`;
