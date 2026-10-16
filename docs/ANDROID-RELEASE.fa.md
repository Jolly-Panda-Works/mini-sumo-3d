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

## ۴. ساخت نسخه‌ی Release (کاملاً خودکار)

**هر push به `main` که تغییری در بازی دارد، خودش یک Release می‌سازد.** نسخه از روی پیام commitها تعیین می‌شود:

| پیام commitها از آخرین Release | نسخه‌ی بعدی (مثلاً از 1.4.2) |
|---|---|
| `feat!:` یا `BREAKING CHANGE` | 2.0.0 |
| حداقل یک `feat:` | 1.5.0 |
| `fix:`، `perf:`، `refactor:` یا پیام بدون نوع | 1.4.3 |
| فقط `docs:`، `chore:`، `ci:`، `test:`، `style:`، `build:` | بدون Release |

GitHub نسخه را در `package.json` بالا می‌برد، تگ `vX.Y.Z` می‌زند و Release را با فایل‌های نهایی و لیست تغییرات («What's changed») منتشر می‌کند. بعد از هر Release یک `git pull` بزنید.

- برای انتخاب دستی نسخه، `version` را در `package.json` بالاتر بگذارید و push کنید.
- **Actions ← Build ← Run workflow** هم هست: `auto` (از روی commitها)، یا `patch` / `minor` / `major`.

در **Releases** این فایل‌ها ساخته می‌شوند:
- `MiniSumo-1.0.2-Android.aab`: برای آپلود در Google Play (روی گوشی نصب نمی‌شود)
- `MiniSumo-1.0.2-Android.apk`: نسخه‌ی امضاشده برای نصب مستقیم و تست
- `MiniSumo-1.0.2-Android-debug.apk`: نسخه‌ی دیباگ، فقط برای عیب‌یابی

`versionCode` اندروید از روی نسخه حساب می‌شود (مثلاً 1.0.2 می‌شود 1000002)، پس با هر نسخه‌ی جدید بزرگ‌تر می‌شود.

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

## ۸.۵ ورود با Google Play و ذخیره‌ی پیشرفت (Play Games Services)

این بخش **به سرور ما نیازی ندارد**: پیشرفت بازیکن (سکه، سطح، آیتم‌ها، اسم و ظاهر) روی گوشی است و با قابلیت **Saved Games** در حساب Google Play خود بازیکن هم ذخیره می‌شود.

۱. Play Console ← اپ Mini Sumo ← **Grow users ← Play Games Services ← Setup and management ← Configuration**. گزینه‌ی «No, my game doesn't use Google APIs» و نام بازی را بزنید.
۲. در **Properties**، گزینه‌ی **Saved games** را روشن کنید.
۳. در **Credentials ← Add credential ← Android**، یک OAuth client بسازید (Play Console شما را به Google Cloud می‌برد):
   - Package name: `com.jollypanda.mini_sumo`
   - SHA-1 کلید **App signing** (Play Console ← Test and release ← App integrity ← App signing key certificate)
   - یک credential دیگر هم با SHA-1 **کلید upload خودتان** بسازید تا APK امضاشده‌ای که مستقیم نصب می‌کنید هم کار کند:
     ```cmd
     keytool -list -v -keystore mini-sumo-upload.keystore -alias minisumo
     ```
۴. عدد **Project ID** را از بالای صفحه‌ی Configuration بردارید (فقط عدد، مثلاً `123456789012`).
۵. GitHub ← Settings ← Secrets and variables ← Actions ← **Variables** ← `PLAY_GAMES_APP_ID` = همان عدد.
۶. تا وقتی Play Games Services منتشر نشده، حساب‌های تست را در **Testers** همان بخش اضافه کنید. بعد از تست، در **Review and publish** آن را منتشر کنید.
۷. **Data safety**: چون پیشرفت در حساب Google بازیکن ذخیره می‌شود، «App activity / Game progress» را با هدف «App functionality» علامت بزنید (توسط Google نگه‌داری می‌شود، به ما ارسال نمی‌شود).

بدون `PLAY_GAMES_APP_ID` بازی مثل قبل ساخته می‌شود و دکمه‌ی Google Play در پروفایل «coming soon» نشان می‌دهد.

## ۹. انتشار

ترتیب انتشار: **Internal testing ← Closed testing ← Production**. برای هر مرحله یادداشت انتشار (Release notes) بنویسید.

## ۱۰. به‌روزرسانی‌های بعدی

۱. **Actions ← Build ← Run workflow** با bump مناسب.
۲. فایل `.aab` جدید را از Release در Play Console آپلود کنید.

> **پرداخت در آینده:** خرید بسته‌های سکه در اندروید باید با **Google Play Billing** انجام شود. وقتی خواستید این بخش را فعال کنید، بگویید تا یکپارچه‌سازی را اضافه کنم.
