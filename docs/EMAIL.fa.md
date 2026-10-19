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

## راه‌اندازی EmailJS (یک بار)

ایمیل‌ها از طریق **EmailJS** فرستاده می‌شوند، همان سرویسی که سایت استودیو استفاده می‌کند.

۱. **Email Service:** همان سرویسی که سایت با آن ایمیل می‌فرستد کافی است. **Service ID** را بردارید.

۲. **دو Template بسازید** (Email Templates ← Create New Template):
   - **انگلیسی:** محتوای `docs/email/verify-code.html` را در بخش Content (حالت **Code / HTML**) بگذارید.
   - **فارسی:** همین کار با `docs/email/verify-code.fa.html`.

   در تنظیمات **هر دو** Template:
   | فیلد | مقدار |
   |---|---|
   | **Subject** | `{{subject}}` |
   | **To Email** | `{{to_email}}` |
   | **From Name** | `Jolly Panda Studio` |
   | **Reply To** | ایمیل استودیو |

   **Template ID** هر دو را بردارید.

۳. **کلیدها:** Account ← General:
   - **Public Key**
   - **Private Key**

۴. **مهم:** Account ← **Security** ← گزینه‌ی **«Allow EmailJS API for non-browser applications»** را روشن کنید. بدون آن، EmailJS ایمیل‌های سرور را رد می‌کند.

## روی سرور

در فایل `.env` کنار `docker-compose.yml`:
```env
EMAILJS_SERVICE_ID=service_xxxxxxx
EMAILJS_TEMPLATE_ID=template_en_xxxx
EMAILJS_TEMPLATE_ID_FA=template_fa_xxxx
EMAILJS_PUBLIC_KEY=xxxxxxxxxxxxxxx
EMAILJS_PRIVATE_KEY=xxxxxxxxxxxxxxxxxxxxx
PUBLIC_URL=https://sumo.ryujin.fans/
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

زبان ایمیل از **زبان گوشی یا مرورگر بازیکن** گرفته می‌شود: اگر فارسی باشد، Template فارسی فرستاده می‌شود و در غیر این صورت انگلیسی. اگر `EMAILJS_TEMPLATE_ID_FA` خالی باشد، همه‌ی ایمیل‌ها انگلیسی می‌روند.
