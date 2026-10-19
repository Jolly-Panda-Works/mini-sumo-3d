/**
 * Sends the verification emails through EmailJS's REST API (the service the studio's website
 * already uses), with the templates in docs/email/. Configured through EMAILJS_SERVICE_ID,
 * EMAILJS_TEMPLATE_ID (English), EMAILJS_TEMPLATE_ID_FA (Persian, optional), EMAILJS_PUBLIC_KEY
 * and EMAILJS_PRIVATE_KEY. In EmailJS: Account > Security > "Allow EmailJS API for non-browser
 * applications" must be on.
 *
 * Without the keys the mailer is off; with EMAIL_DEV_LOG=true it prints the email to the log
 * instead (local testing only).
 */
export interface VerificationEmail {
  to: string;
  name: string;
  code: string;
  link: string;
  purpose: "link" | "restore";
  lang: "en" | "fa";
  minutes: number;
}

export interface Mailer {
  send(email: VerificationEmail): Promise<void>;
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

const COPY = {
  en: {
    link: { subject: "Your Mini Sumo code", heading: "Save your progress", message: "Use this code in Mini Sumo to save your progress with this email. With it you can get your wrestler, coins and items back on any device." },
    restore: { subject: "Your Mini Sumo code", heading: "Restore your progress", message: "Use this code in Mini Sumo to bring your wrestler, coins and items to this device." },
  },
  fa: {
    link: { subject: "کد مینی سومو", heading: "ذخیره‌ی پیشرفت شما", message: "این کد را در مینی سومو وارد کنید تا پیشرفت شما با این ایمیل ذخیره شود. با آن می‌توانید کشتی‌گیر، سکه‌ها و آیتم‌هایتان را روی هر دستگاهی برگردانید." },
    restore: { subject: "کد مینی سومو", heading: "بازگرداندن پیشرفت", message: "این کد را در مینی سومو وارد کنید تا کشتی‌گیر، سکه‌ها و آیتم‌هایتان به این دستگاه منتقل شوند." },
  },
} as const;

export interface EmailJsConfig {
  serviceId: string;
  templateId: string;
  templateIdFa: string;
  publicKey: string;
  privateKey: string;
  /** Public address of the game, for the logo and the link in the email. */
  publicUrl: string;
}

export function emailJsConfigFromEnv(env: Record<string, string | undefined> = process.env): EmailJsConfig | null {
  const serviceId = env.EMAILJS_SERVICE_ID?.trim();
  const templateId = env.EMAILJS_TEMPLATE_ID?.trim();
  const publicKey = env.EMAILJS_PUBLIC_KEY?.trim();
  const privateKey = env.EMAILJS_PRIVATE_KEY?.trim();
  if (!serviceId || !templateId || !publicKey || !privateKey) return null;
  return {
    serviceId,
    templateId,
    templateIdFa: env.EMAILJS_TEMPLATE_ID_FA?.trim() || templateId,
    publicKey,
    privateKey,
    publicUrl: (env.PUBLIC_URL?.trim() || "https://sumo.ryujin.fans/").replace(/\/?$/, "/"),
  };
}

export class EmailJsMailer implements Mailer {
  constructor(
    private readonly config: EmailJsConfig,
    private readonly fetchImpl: Fetch = fetch as unknown as Fetch,
  ) {}

  async send(email: VerificationEmail): Promise<void> {
    const copy = COPY[email.lang][email.purpose];
    const res = await this.fetchImpl("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: this.config.serviceId,
        template_id: email.lang === "fa" ? this.config.templateIdFa : this.config.templateId,
        user_id: this.config.publicKey,
        accessToken: this.config.privateKey,
        template_params: {
          to_email: email.to,
          to_name: email.name,
          subject: copy.subject,
          heading: copy.heading,
          message: copy.message,
          code: email.code,
          verify_link: email.link,
          expires_minutes: String(email.minutes),
          logo_url: `${this.config.publicUrl}email/jolly-panda-logo.png`,
          game_url: this.config.publicUrl,
        },
      }),
    });
    if (!res.ok) throw new Error(`EmailJS refused the email (${res.status}): ${await res.text()}`);
  }
}

/** Local testing: prints the email instead of sending it. */
export class LogMailer implements Mailer {
  async send(email: VerificationEmail): Promise<void> {
    console.log(`[email] to ${email.to} (${email.purpose}, ${email.lang}): code ${email.code} · ${email.link}`);
  }
}
