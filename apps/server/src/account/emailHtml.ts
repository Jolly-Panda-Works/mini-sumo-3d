/**
 * The verification email, built on the server (English and Persian, in the studio's style:
 * the same colours and layout as jollypanda.ir's emails, with the white studio logo).
 *
 * EmailJS gets the finished HTML in its "html" parameter, so the studio's existing generic
 * template ({{email_subject}}, {{{html}}}) sends it as it is. Every value is escaped here.
 */
export interface EmailValues {
  subject: string;
  heading: string;
  message: string;
  to_name: string;
  code: string;
  expires_minutes: string;
  verify_link: string;
  game_url: string;
  logo_url: string;
}

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function escaped(values: EmailValues): EmailValues {
  return Object.fromEntries(Object.entries(values).map(([k, val]) => [k, escape(String(val))])) as unknown as EmailValues;
}

export function verificationEmailHtml(lang: "en" | "fa", values: EmailValues): string {
  const v = escaped(values);
  return lang === "fa" ? fa(v) : en(v);
}

const en = (v: EmailValues) => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${v.subject}</title></head>
<body style="margin:0;padding:0;background:#f7ecdf;font-family:Arial,Helvetica,sans-serif;color:#34211f;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7ecdf;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ead9c8;">

<!-- header -->
<tr><td align="center" style="background:#f0852e;padding:24px 28px 20px;">
  <img src="${v.logo_url}" alt="Jolly Panda Studio" width="150" style="width:150px;max-width:60%;height:auto;border:0;display:block;margin:0 auto;">
  <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#fff6d8;font-weight:bold;margin-top:14px;">Mini Sumo</div>
  <div style="font-size:24px;font-weight:bold;color:#ffffff;margin-top:4px;">${v.heading}</div>
</td></tr>

<!-- intro -->
<tr><td style="padding:26px 28px 6px;font-size:15px;line-height:1.6;">
  <p style="margin:0 0 12px;">Hi ${v.to_name},</p>
  <p style="margin:0 0 12px;">${v.message}</p>
</td></tr>

<!-- code -->
<tr><td style="padding:10px 28px 0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff6d8;border:1px solid #fcdd4e;border-radius:10px;">
    <tr><td align="center" style="padding:18px 16px;">
      <div style="font-size:12px;color:#6b504b;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;">Your code</div>
      <div style="font-size:36px;font-weight:bold;color:#34211f;letter-spacing:.35em;margin:6px 0 2px;padding-left:.35em;font-family:'Courier New',Courier,monospace;">${v.code}</div>
      <div style="font-size:12px;color:#6b504b;">Valid for ${v.expires_minutes} minutes</div>
    </td></tr>
  </table>
</td></tr>

<!-- how -->
<tr><td style="padding:18px 28px 0;">
  <div style="font-size:13px;font-weight:bold;color:#be5a29;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #fdead9;padding-bottom:6px;">How to use it</div>
  <p style="margin:10px 0 0;font-size:14px;line-height:1.6;">Go back to Mini Sumo and type this code where the game asks for it.</p>
  <p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:#6b504b;">Playing in the browser? You can also open the game with the code already filled in:</p>
  <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:12px;">
    <tr><td style="background:#f0852e;border-radius:10px;">
      <a href="${v.verify_link}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">Open Mini Sumo</a>
    </td></tr>
  </table>
</td></tr>

<!-- safety -->
<tr><td style="padding:20px 28px 0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fbf5ef;border-radius:10px;">
    <tr><td style="padding:12px 14px;font-size:12px;line-height:1.6;color:#6b504b;">
      <strong style="color:#34211f;">Keep this code to yourself.</strong> Jolly Panda will never ask you for it. If you didn't ask for this code, you can safely ignore this email: nothing changes on your account.
    </td></tr>
  </table>
</td></tr>

<!-- footer -->
<tr><td style="padding:24px 28px 26px;">
  <p style="margin:0;font-size:12px;line-height:1.6;color:#9c8078;">This email was sent because someone entered this address in Mini Sumo.<br>— Jolly Panda Studio · <a href="${v.game_url}" style="color:#be5a29;text-decoration:none;">Mini Sumo</a> · jollypanda.ir</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>
`;

const fa = (v: EmailValues) => `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${v.subject}</title></head>
<body dir="rtl" style="margin:0;padding:0;background:#f7ecdf;font-family:Tahoma,'Segoe UI',Arial,sans-serif;color:#34211f;direction:rtl;text-align:right;">
<table role="presentation" dir="rtl" width="100%" cellspacing="0" cellpadding="0" style="background:#f7ecdf;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" dir="rtl" width="640" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ead9c8;">

<!-- header -->
<tr><td align="center" style="background:#f0852e;padding:24px 28px 20px;text-align:center;">
  <img src="${v.logo_url}" alt="استودیو Jolly Panda" width="150" style="width:150px;max-width:60%;height:auto;border:0;display:block;margin:0 auto;">
  <div style="font-size:13px;color:#fff6d8;font-weight:bold;margin-top:14px;">مینی سومو</div>
  <div style="font-size:24px;font-weight:bold;color:#ffffff;margin-top:4px;">${v.heading}</div>
</td></tr>

<!-- intro -->
<tr><td style="padding:26px 28px 6px;font-size:15px;line-height:2;text-align:right;">
  <p style="margin:0 0 12px;">${v.to_name} عزیز، سلام</p>
  <p style="margin:0 0 12px;">${v.message}</p>
</td></tr>

<!-- code (digits left to right) -->
<tr><td style="padding:10px 28px 0;">
  <table role="presentation" dir="rtl" width="100%" cellspacing="0" cellpadding="0" style="background:#fff6d8;border:1px solid #fcdd4e;border-radius:10px;">
    <tr><td align="center" style="padding:18px 16px;text-align:center;">
      <div style="font-size:13px;color:#6b504b;font-weight:bold;">کد شما</div>
      <div dir="ltr" style="font-size:36px;font-weight:bold;color:#34211f;letter-spacing:.35em;margin:6px 0 2px;padding-left:.35em;font-family:'Courier New',Courier,monospace;direction:ltr;unicode-bidi:isolate;">${v.code}</div>
      <div style="font-size:13px;color:#6b504b;">اعتبار: ${v.expires_minutes} دقیقه</div>
    </td></tr>
  </table>
</td></tr>

<!-- how -->
<tr><td style="padding:18px 28px 0;">
  <div style="font-size:14px;font-weight:bold;color:#be5a29;border-bottom:2px solid #fdead9;padding-bottom:6px;">نحوه‌ی استفاده</div>
  <p style="margin:10px 0 0;font-size:14px;line-height:2;text-align:right;">به مینی سومو برگردید و این کد را در جایی که بازی می‌خواهد وارد کنید.</p>
  <p style="margin:8px 0 0;font-size:13px;line-height:1.9;color:#6b504b;text-align:right;">در مرورگر بازی می‌کنید؟ می‌توانید بازی را با کدی که از قبل وارد شده باز کنید:</p>
  <table role="presentation" dir="rtl" cellspacing="0" cellpadding="0" style="margin-top:12px;">
    <tr><td style="background:#f0852e;border-radius:10px;">
      <a href="${v.verify_link}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">باز کردن مینی سومو</a>
    </td></tr>
  </table>
</td></tr>

<!-- safety -->
<tr><td style="padding:20px 28px 0;">
  <table role="presentation" dir="rtl" width="100%" cellspacing="0" cellpadding="0" style="background:#fbf5ef;border-radius:10px;">
    <tr><td style="padding:12px 14px;font-size:12px;line-height:1.9;color:#6b504b;text-align:right;">
      <strong style="color:#34211f;">این کد را به کسی ندهید.</strong> Jolly Panda هرگز این کد را از شما نمی‌خواهد. اگر شما این کد را درخواست نکرده‌اید، این ایمیل را نادیده بگیرید؛ هیچ تغییری در حساب شما ایجاد نمی‌شود.
    </td></tr>
  </table>
</td></tr>

<!-- footer -->
<tr><td style="padding:24px 28px 26px;text-align:right;">
  <p style="margin:0;font-size:12px;line-height:1.9;color:#9c8078;">این ایمیل به این دلیل فرستاده شد که کسی این نشانی را در مینی سومو وارد کرده است.<br>— استودیو Jolly Panda · <a href="${v.game_url}" style="color:#be5a29;text-decoration:none;">مینی سومو</a> · jollypanda.ir</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>
`;
