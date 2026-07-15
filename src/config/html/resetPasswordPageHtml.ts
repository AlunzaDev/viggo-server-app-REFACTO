import {
  PASSWORD_POLICY_MESSAGE,
  passwordPolicyPlugin,
} from "../plugins/password-policy.plugin";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export const resetPasswordPageHtml = (
  token: string,
  submitUrl: string,
): string => {
  const safeToken = JSON.stringify(token);
  const safeSubmitUrl = JSON.stringify(submitUrl);
  const safePasswordPolicyMessage = JSON.stringify(PASSWORD_POLICY_MESSAGE);
  const safePasswordPolicySource = JSON.stringify(passwordPolicyPlugin.regex.source);
  const hiddenToken = escapeHtml(token);

  return `
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Nueva contraseña - Viggo</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #202020;
      --panel: rgba(49,49,49,.92);
      --border: rgba(119,130,176,.45);
      --text: #f5f7ff;
      --muted: #b9bfd3;
      --primary: #4d6bff;
      --primary-dark: #2946dd;
      --danger: #ff6b6b;
      --success: #31c48d;
      --success-soft: rgba(49,196,141,.16);
      --success-border: rgba(49,196,141,.34);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      font-family: Arial, Helvetica, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(77,107,255,.18), transparent 32%),
        radial-gradient(circle at bottom right, rgba(255,255,255,.08), transparent 24%),
        var(--bg);
    }
    .card {
      width: min(100%, 460px);
      padding: 32px;
      border-radius: 24px;
      background: var(--panel);
      border: 1px solid var(--border);
      box-shadow: 0 18px 60px rgba(0,0,0,.35);
    }
    .brand {
      margin: 0 0 10px;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: .22em;
      color: #d6dcff;
      text-transform: uppercase;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 31px;
      line-height: 1.1;
    }
    p {
      margin: 0 0 24px;
      color: var(--muted);
      line-height: 1.6;
    }
    label {
      display: block;
      margin-bottom: 8px;
      font-size: 14px;
      font-weight: 700;
      color: #e8ebff;
    }
    input {
      width: 100%;
      padding: 14px 16px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,.14);
      background: rgba(255,255,255,.05);
      color: var(--text);
      outline: none;
      transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
    }
    input:focus {
      border-color: rgba(77,107,255,.95);
      box-shadow: 0 0 0 4px rgba(77,107,255,.18);
    }
    .field {
      margin-bottom: 18px;
    }
    .password-shell {
      position: relative;
    }
    .password-shell input {
      padding-right: 58px;
    }
    .toggle-password {
      position: absolute;
      top: 50%;
      right: 10px;
      transform: translateY(-50%);
      width: 40px;
      height: 40px;
      border: 0;
      border-radius: 12px;
      display: grid;
      place-items: center;
      cursor: pointer;
      color: #dce3ff;
      background: rgba(255,255,255,.06);
      transition: background .2s ease, transform .2s ease, color .2s ease;
    }
    .toggle-password:hover {
      background: rgba(255,255,255,.12);
      transform: translateY(-50%) scale(1.02);
    }
    .toggle-password:focus-visible {
      outline: 2px solid rgba(77,107,255,.95);
      outline-offset: 2px;
    }
    .toggle-password svg {
      width: 19px;
      height: 19px;
      stroke: currentColor;
      fill: none;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .toggle-password .icon-hide {
      display: none;
    }
    .toggle-password.is-visible .icon-show {
      display: none;
    }
    .toggle-password.is-visible .icon-hide {
      display: block;
    }
    .submit,
    .secondary-link {
      width: 100%;
      border: 0;
      border-radius: 16px;
      padding: 15px 18px;
      font-size: 16px;
      font-weight: 800;
      color: #fff;
      cursor: pointer;
      text-align: center;
      text-decoration: none;
      background: linear-gradient(135deg, var(--primary), #6f89ff);
      box-shadow: 0 14px 28px rgba(77,107,255,.3);
      transition: transform .2s ease, box-shadow .2s ease, filter .2s ease, opacity .2s ease;
    }
    .submit:hover,
    .secondary-link:hover {
      transform: translateY(-1px);
      box-shadow: 0 18px 32px rgba(77,107,255,.36);
      filter: brightness(1.03);
    }
    .submit:disabled {
      cursor: wait;
      opacity: .78;
      transform: none;
      box-shadow: none;
    }
    .message {
      display: none;
      margin-top: 18px;
      padding: 14px 16px;
      border-radius: 14px;
      font-size: 14px;
      line-height: 1.5;
    }
    .message.error {
      display: block;
      color: #fff1f1;
      background: rgba(255,107,107,.16);
      border: 1px solid rgba(255,107,107,.34);
    }
    .message.success {
      display: block;
      color: #effff8;
      background: var(--success-soft);
      border: 1px solid var(--success-border);
    }
    .helper {
      margin-top: 16px;
      font-size: 12px;
      color: #98a2c8;
      text-align: center;
    }
    .policy {
      margin: -4px 0 20px;
      font-size: 12px;
      line-height: 1.5;
      color: #aeb7da;
    }
    .success-panel {
      display: none;
      margin-top: 14px;
      padding: 18px 16px;
      border-radius: 18px;
      background: linear-gradient(180deg, rgba(49,196,141,.16), rgba(49,196,141,.08));
      border: 1px solid var(--success-border);
    }
    .success-panel.visible {
      display: block;
    }
    .success-title {
      margin: 0 0 6px;
      font-size: 22px;
      font-weight: 800;
      color: #f3fff9;
    }
    .success-copy {
      margin: 0 0 18px;
      color: #dff8ec;
    }
    .countdown {
      margin: 0 0 18px;
      color: #dff8ec;
      font-size: 14px;
    }
    .countdown strong {
      color: #fff;
      font-size: 18px;
    }
    .form-hidden .field,
    .form-hidden .submit {
      display: none;
    }
    .form-hidden .helper {
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <section class="card">
    <div class="brand">COTIZA</div>
    <h1>Crea tu nueva contraseña</h1>
    <p id="intro-copy">Ingresa una nueva contraseña para completar la recuperación de tu cuenta.</p>

    <form id="reset-form">
      <input type="hidden" id="token" name="token" value="${hiddenToken}" />

      <div class="field">
        <label for="newPassword">Nueva contraseña</label>
        <div class="password-shell">
          <input id="newPassword" name="newPassword" type="password" minlength="8" required autocomplete="new-password" />
          <button
            type="button"
            class="toggle-password"
            data-toggle-password="newPassword"
            aria-label="Mostrar contraseña"
            aria-pressed="false"
          >
            <svg class="icon-show" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <svg class="icon-hide" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 3l18 18"></path>
              <path d="M10.6 10.7A3 3 0 0 0 13.4 13.5"></path>
              <path d="M9.9 5.2A11.3 11.3 0 0 1 12 5c6.5 0 10 7 10 7a18.5 18.5 0 0 1-4 4.8"></path>
              <path d="M6.2 6.3C3.7 8 2 12 2 12a18.8 18.8 0 0 0 6.7 6"></path>
            </svg>
          </button>
        </div>
      </div>

      <div class="field">
        <label for="confirmPassword">Confirmar contraseña</label>
        <div class="password-shell">
          <input id="confirmPassword" name="confirmPassword" type="password" minlength="8" required autocomplete="new-password" />
          <button
            type="button"
            class="toggle-password"
            data-toggle-password="confirmPassword"
            aria-label="Mostrar contraseña"
            aria-pressed="false"
          >
            <svg class="icon-show" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <svg class="icon-hide" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 3l18 18"></path>
              <path d="M10.6 10.7A3 3 0 0 0 13.4 13.5"></path>
              <path d="M9.9 5.2A11.3 11.3 0 0 1 12 5c6.5 0 10 7 10 7a18.5 18.5 0 0 1-4 4.8"></path>
              <path d="M6.2 6.3C3.7 8 2 12 2 12a18.8 18.8 0 0 0 6.7 6"></path>
            </svg>
          </button>
        </div>
      </div>

      <div class="policy">Usa al menos 8 caracteres, una mayuscula, una minuscula y un numero.</div>

      <button class="submit" id="submit" type="submit">Guardar nueva contraseña</button>
      <div id="message" class="message"></div>

      <div id="success-panel" class="success-panel" aria-live="polite">
        <div class="success-title">Contrasena actualizada</div>
        <p class="success-copy">Tu cambio quedo guardado correctamente.</p>
        <p class="countdown">Te redirigiremos al login en <strong id="countdown-value">4</strong> segundos.</p>
        <a id="login-link" class="secondary-link" href="/login">Ir al login ahora</a>
      </div>

      <div class="helper">Por seguridad, el enlace solo puede usarse una vez.</div>
    </form>
  </section>

  <script>
    const token = ${safeToken};
    const submitUrl = ${safeSubmitUrl};
    const passwordPolicyMessage = ${safePasswordPolicyMessage};
    const passwordPolicyRegex = new RegExp(${safePasswordPolicySource});
    const form = document.getElementById("reset-form");
    const message = document.getElementById("message");
    const submitButton = document.getElementById("submit");
    const passwordInput = document.getElementById("newPassword");
    const confirmInput = document.getElementById("confirmPassword");
    const toggleButtons = document.querySelectorAll("[data-toggle-password]");
    const successPanel = document.getElementById("success-panel");
    const introCopy = document.getElementById("intro-copy");
    const countdownValue = document.getElementById("countdown-value");
    const loginLink = document.getElementById("login-link");

    const resolveLoginUrl = () => {
      const current = new URL(window.location.href);

      if (current.port === "3000" && (current.hostname === "localhost" || current.hostname === "127.0.0.1")) {
        return current.protocol + "//" + current.hostname + ":3001/login";
      }

      if (current.port === "3000") {
        return current.protocol + "//" + current.hostname + ":3001/login";
      }

      return current.origin + "/login";
    };

    const loginUrl = resolveLoginUrl();
    loginLink.href = loginUrl;

    let redirectTimer = null;
    let countdownTimer = null;

    const setMessage = (text, type) => {
      message.textContent = text;
      message.className = "message " + type;
    };

    const syncToggleState = (input, button) => {
      const visible = input.type === "text";
      button.classList.toggle("is-visible", visible);
      button.setAttribute("aria-pressed", String(visible));
      button.setAttribute(
        "aria-label",
        visible ? "Ocultar contraseña" : "Mostrar contraseña"
      );
    };

    toggleButtons.forEach((button) => {
      const input = document.getElementById(button.getAttribute("data-toggle-password"));
      if (!input) return;

      syncToggleState(input, button);

      button.addEventListener("click", () => {
        input.type = input.type === "password" ? "text" : "password";
        syncToggleState(input, button);
      });
    });

    const clearRedirectTimers = () => {
      if (redirectTimer) window.clearTimeout(redirectTimer);
      if (countdownTimer) window.clearInterval(countdownTimer);
      redirectTimer = null;
      countdownTimer = null;
    };

    const showSuccessState = (text) => {
      clearRedirectTimers();
      setMessage("", "success");
      message.className = "message";
      introCopy.textContent = "Ya no necesitas quedarte en esta pantalla.";
      form.classList.add("form-hidden");
      passwordInput.disabled = true;
      confirmInput.disabled = true;
      successPanel.classList.add("visible");

      const successCopy = successPanel.querySelector(".success-copy");
      if (successCopy) successCopy.textContent = text;

      let seconds = 4;
      countdownValue.textContent = String(seconds);

      countdownTimer = window.setInterval(() => {
        seconds -= 1;
        if (seconds <= 0) {
          countdownValue.textContent = "0";
          window.clearInterval(countdownTimer);
          countdownTimer = null;
          return;
        }
        countdownValue.textContent = String(seconds);
      }, 1000);

      redirectTimer = window.setTimeout(() => {
        window.location.href = loginUrl;
      }, 4000);
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const newPassword = passwordInput.value;
      const confirmPassword = confirmInput.value;

      if (!passwordPolicyRegex.test(newPassword)) {
        setMessage(passwordPolicyMessage, "error");
        return;
      }

      if (newPassword !== confirmPassword) {
        setMessage("Las contraseñas no coinciden.", "error");
        return;
      }

      submitButton.disabled = true;
      setMessage("Guardando tu nueva contraseña...", "success");

      try {
        const response = await fetch(submitUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            token,
            newPassword,
            confirmPassword
          })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || data.message || "No fue posible restablecer la contraseña.");
        }

        showSuccessState(
          data.message || "Tu contraseña se actualizó correctamente. Ya puedes iniciar sesión."
        );
      } catch (error) {
        setMessage(error.message || "No fue posible restablecer la contraseña.", "error");
      } finally {
        submitButton.disabled = false;
      }
    });
  </script>
</body>
</html>
`;
};
