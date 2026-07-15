import nodemailer from "nodemailer";
import { envs } from "../../../config";

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  htmlBody: string;
}

export class EmailService {
  private readonly isMailerConfigured = Boolean(
    envs.MAILER_HOST && envs.MAILER_EMAIL && envs.MAILER_SECRET_KEY,
  );

  private readonly transporter = this.isMailerConfigured
    ? nodemailer.createTransport({
        host: envs.MAILER_HOST,
        port: envs.MAILER_PORT,
        secure: envs.MAILER_SECURE,
        auth: {
          user: envs.MAILER_EMAIL,
          pass: envs.MAILER_SECRET_KEY,
        },
      })
    : null;

  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    const { to, subject, htmlBody } = options;

    if (!this.transporter) {
      console.warn(
        "Email not sent: SMTP configuration is incomplete. Set MAILER_HOST, MAILER_EMAIL and MAILER_SECRET_KEY to enable email delivery.",
      );
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: envs.MAILER_FROM_NAME
          ? `"${envs.MAILER_FROM_NAME}" <${envs.MAILER_EMAIL}>`
          : envs.MAILER_EMAIL,
        to,
        subject,
        html: htmlBody,
      });

      return true;
    } catch (error) {
      console.error("Error sending email:", error);
      return false;
    }
  }
}
