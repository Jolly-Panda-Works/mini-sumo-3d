# راهنمای انتشار نسخه‌ی Release اندروید (Google Play)

شناسه‌ی اپ: **`com.jollypanda.mini_sumo`** (در `apps/mobile/capacitor.config.json`).
> در شناسه‌ی اندروید خط تیره (`-`) مجاز نیست؛ نزدیک‌ترین شکل معتبر به `mini-sumo` همین `mini_sumo` است. بعد از اولین انتشار در Google Play دیگر قابل تغییر نیست.

## ۱. ساخت کلید امضا (فقط یک بار)

با JDK 21 (یا JDK داخل Android Studio) در cmd:

```cmd
keytool -genkeypair -v -keystore mini-sumo-upload.keystore -alias minisumo -keyalg RSA -keysize 2048 -validity 10000
```

- یک رمز قوی بگذارید و سؤال‌های نام و سازمان را پر کنید.
- فایل `mini-sumo-upload.keystore` و رمزها را **در دو جای امن** (مثلاً password manager و یک فلش) نگه دارید.
- این فایل را **هرگز** در گیت commit نکنید.

## ۲. تبدیل کلید به متن (Base64)

در PowerShell، در پوشه‌ی فایل:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("mini-sumo-upload.keystore")) | Set-Clipboard
```

حالا متن در clipboard است.

## ۳. تعریف Secretها در GitHub

**Settings → Secrets and variables → Actions → Secrets → New repository secret**

| نام | مقدار |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | متن مرحله‌ی ۲ |
| `ANDROID_KEYSTORE_PASSWORD` | رمز keystore |
| `ANDROID_KEY_ALIAS` | `minisumo` |
| `ANDROID_KEY_PASSWORD` | رمز کلید (اگر جدا نگذاشتید، همان رمز keystore) |

در **Variables**:
- `VITE_SERVER_URL` را **تعریف نکنید** تا بازی کاملاً آفلاین ساخته شود.
- اگر Google Play پیام «target API level» داد، متغیر `ANDROID_TARGET_SDK` را بسازید (مثلاً `36`).

## ۴. ساخت نسخه‌ی Release

۱. در `package.json` ریشه، `version` را مثلاً `1.0.0` کنید و push کنید.
۲. تگ بزنید:
   ```cmd
   git tag v1.0.0
   git push origin v1.0.0
   ```
۳. در تب **Actions** صبر کنید تا Build سبز شود. در **Releases** این فایل‌ها ساخته می‌شوند:
   - `MiniSumo-1.0.0-Android.aab`: برای آپلود در Google Play (روی گوشی نصب نمی‌شود)
   - `MiniSumo-1.0.0-Android.apk`: نسخه‌ی امضاشده برای نصب مستقیم و تست
   - `MiniSumo-1.0.0-Android-debug.apk`: نسخه‌ی دیباگ، فقط برای عیب‌یابی
۴. `versionCode` خودکار شماره‌ی اجرای workflow است و همیشه بزرگ‌تر می‌شود (Google Play همین را می‌خواهد).

## ۵. تست روی گوشی

فایل `…-Android.apk` را روی گوشی نصب کنید (اگر قبلاً نسخه‌ی دیباگ یا نسخه‌ای با کلید دیگر نصب بوده، اول آن را حذف کنید) و این‌ها را چک کنید: باز شدن، صفحه‌ی loading، حالت عمودی، Training، wardrobe، صدا و لرزش.

## ۶. Google Play Console

۱. **حساب توسعه‌دهنده:** در play.google.com/console ثبت‌نام (۲۵ دلار یک‌بار) و تأیید هویت.
۲. **Create app:** نام Mini Sumo، زبان پیش‌فرض، نوع **Game**، **Free**.
۳. **App signing:** گزینه‌ی پیش‌فرض **Play App Signing** را بپذیرید. کلید شما «upload key» می‌شود.
۴. **Testing → Internal testing:** یک release بسازید و فایل `.aab` را آپلود کنید.
۵. **حساب شخصی جدید:** اگر حسابتان شخصی است و بعد از نوامبر ۲۰۲۳ ساخته شده، قبل از Production باید یک **Closed testing** با **حداقل ۱۲ تستر به مدت ۱۴ روز پیوسته** اجرا کنید.

## ۷. Store listing

| مورد | فایل یا مقدار |
|---|---|
| آیکن ۵۱۲×۵۱۲ | `docs/store/icon-512.png` |
| Feature graphic ۱۰۲۴×۵۰۰ | `docs/store/feature-graphic.png` |
| اسکرین‌شات‌ها (۲ تا ۸ عدد) | از گوشی، در حالت عمودی |
| توضیح کوتاه (حداکثر ۸۰ کاراکتر) | مثلاً: Push your friends out of the ring! A cute 3D sumo party game. |
| دسته‌بندی | Games → Casual (یا Sports) |

## ۸. App content (اجباری)

- **Privacy policy:** یک صفحه در سایتتان بسازید (مثلاً `www.useffarahmand.com/en/projects/mini-sumo/privacy`) و متن `PRIVACY.md` را آنجا بگذارید. آدرسش را وارد کنید.
- **Ads:** No.
- **App access:** All functionality is available without special access.
- **Content rating:** پرسشنامه‌ی IARC. بازی کارتونی و بدون خشونت واقعی است؛ معمولاً Everyone / PEGI 3 می‌گیرد.
- **Target audience:** اگر بازی را مخصوص کودکان معرفی نمی‌کنید، **13+** را انتخاب کنید. گروه‌های سنی زیر ۱۳ سال شامل قوانین Families می‌شوند.
- **Data safety:** نسخه‌ی آفلاین هیچ داده‌ای جمع‌آوری یا ارسال نمی‌کند. نام و تنظیمات فقط روی خود دستگاه می‌مانند. گزینه‌ی «No data collected» را بزنید.

## ۹. انتشار

ترتیب انتشار: **Internal testing ← Closed testing ← Production**. برای هر مرحله یادداشت انتشار (Release notes) بنویسید.

## ۱۰. به‌روزرسانی‌های بعدی

۱. version را بالا ببرید (مثلاً `1.0.1`).
۲. تگ `v1.0.1` بزنید.
۳. فایل `.aab` جدید را در Play Console آپلود کنید.

> **پرداخت در آینده:** خرید بسته‌های سکه در اندروید باید با **Google Play Billing** انجام شود. وقتی خواستید این بخش را فعال کنید، بگویید تا یکپارچه‌سازی را اضافه کنم.
