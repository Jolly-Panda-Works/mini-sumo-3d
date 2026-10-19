# ذخیره‌ی پیشرفت با ایمیل

بازیکن‌ها مهمان هستند: حسابشان روی همان دستگاه ذخیره است. با **ذخیره با ایمیل**، اگر گوشی را عوض کنند یا برنامه را پاک کنند، با یک کد ایمیلی همان کشتی‌گیر، سکه‌ها و آیتم‌ها را برمی‌گردانند. این قابلیت در **همه‌ی نسخه‌ها** هست (کافه بازار، گوگل پلی و وب). در نسخه‌ی گوگل پلی، ورود با **Google Play Games** هم حساب را ذخیره می‌کند.

## روند کار

**ذخیره:** پروفایل ← Save with email ← ایمیل ← کد ۶ رقمی از ایمیل ← ذخیره شد.
**بازگرداندن روی دستگاه جدید:** پروفایل ← Restore your progress ← همان ایمیل ← کد ← بازی با همان بازیکن دوباره باز می‌شود. دستگاه قبلی هم کار می‌کند.

- کد **۶ رقمی** است، **۱۵ دقیقه** اعتبار دارد و **یک بار** مصرف می‌شود.
- بعد از **۵ تلاش اشتباه** باطل می‌شود. بین دو کد **یک دقیقه** فاصله لازم است و حداکثر **۶ کد در ساعت** برای هر ایمیل.
- روی سرور فقط **هش** کد ذخیره می‌شود.
- هر ایمیل فقط مال **یک حساب** است.
- اگر کسی برای بازگرداندن ایمیلی را بزند که حسابی ندارد، بازی همان پیام همیشگی را نشان می‌دهد تا معلوم نشود کدام ایمیل‌ها حساب دارند.

## EmailJS

ایمیل‌ها از طریق **EmailJS** و با **همان Template عمومی سایت استودیو** فرستاده می‌شوند. **سرور خودش کل ایمیل را می‌سازد** (انگلیسی یا فارسی، با تم و لوگوی استودیو) و آن را در فیلد `html` به Template می‌دهد. پس **هیچ Template جدیدی لازم نیست**.

فیلدهای Template موجود که سرور پر می‌کند:

| فیلد Template | مقدار در Template | چیزی که سرور می‌فرستد |
|---|---|---|
| Subject | `{{email_subject}}` | «Your Mini Sumo code» یا «کد مینی سومو» |
| Content | `{{{html}}}` | کل ایمیل (HTML) |
| To Email | `{{to_email}}` | ایمیل بازیکن |
| From Name | `{{from_name}}` | `Jolly Panda Studio` |
| Reply To | `{{reply_to}}` | مقدار `EMAIL_REPLY_TO` (اختیاری) |

طراحی ایمیل در `apps/server/src/account/emailHtml.ts` است.

**کلیدهای لازم:**
۱. **Service ID:** از Email Services، همان سرویس سایت.
۲. **Template ID:** شناسه‌ی همین Template (مثلاً `template_7s37ixs`، از آدرس صفحه‌ی Template).
۳. **Public Key** و **Private Key:** از Account ← General.
۴. **مهم:** Account ← **Security** ← گزینه‌ی **«Allow EmailJS API for non-browser applications»** را روشن کنید. بدون آن، EmailJS ایمیل‌های سرور را رد می‌کند.

> هر ایمیل یک درخواست از سهمیه‌ی ماهانه‌ی EmailJS است (در پلن رایگان ۲۰۰ در ماه، که با فرم سایت مشترک است). اگر بازیکن‌ها زیاد شدند، سهمیه را بیشتر کنید.

## روی سرور

در فایل `.env` کنار `docker-compose.yml`:
```env
EMAILJS_SERVICE_ID=service_xxxxxxx
EMAILJS_TEMPLATE_ID=template_7s37ixs
EMAILJS_PUBLIC_KEY=xxxxxxxxxxxxxxx
EMAILJS_PRIVATE_KEY=xxxxxxxxxxxxxxxxxxxxx
PUBLIC_URL=https://sumo.ryujin.fans/
EMAIL_REPLY_TO=ایمیل-استودیو@jollypanda.ir
```
بعد:
```bash
git pull
docker-compose up -d --build
docker-compose logs web | grep email
```
باید این را ببینید: `[email] saving progress with email on (EmailJS)`

در `https://sumo.ryujin.fans/api/catalog` هم باید `"emailRecovery":true` باشد. تا وقتی نیست، بخش «Save your progress» در پروفایل نمایش داده نمی‌شود.

**لوگوی ایمیل** از `https://sumo.ryujin.fans/email/jolly-panda-logo.png` بارگذاری می‌شود، که همراه بازی روی سرور است.

**تست محلی بدون EmailJS:** با `EMAIL_DEV_LOG=true` سرور کد را به‌جای فرستادن، در لاگ چاپ می‌کند. فقط برای تست است، نه روی سرور اصلی.

## زبان ایمیل

زبان ایمیل از **زبان گوشی یا مرورگر بازیکن** گرفته می‌شود: اگر فارسی باشد، ایمیل فارسی (راست‌به‌چپ) ساخته می‌شود و در غیر این صورت انگلیسی. هر دو با همان یک Template فرستاده می‌شوند.
