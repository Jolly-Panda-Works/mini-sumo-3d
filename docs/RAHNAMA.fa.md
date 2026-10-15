# راهنمای سریع راه‌اندازی Mini Sumo

سازنده: **Usef Farahmand** ([useffarahmand.com](https://www.useffarahmand.com)) | صفحه‌ی بازی: <https://www.useffarahmand.com/en/projects/mini-sumo>

## پیش‌نیاز
- Node.js نسخه ۲۲٫۱۳ یا جدیدتر
- npm نسخه ۱۰ به بالا

## نصب
```bash
cd mini-sumo
npm install
cp .env.example .env
```

## اجرا در حالت توسعه
```bash
npm run dev
```
- کلاینت: http://localhost:5173
- سرور: ws://localhost:2567 (سلامت سرور: http://localhost:2567/health)

دو یا چند تب مرورگر باز کنید، در یکی «Create private room» بزنید و لینک دعوت را در تب‌های دیگر باز کنید.

## تست و بررسی تایپ
```bash
npm test
npm run typecheck
```

## ساخت نسخه نهایی
```bash
VITE_SERVER_URL=wss://your-server.example.com npm run build
npm start
```
پوشه `apps/client/dist` را روی هاست استاتیک بگذارید و سرور را روی یک هاست Node.js با HTTPS/WSS اجرا کنید.

جزئیات کامل در `README.md` آمده است.

## خروجی وب، دسکتاپ و اندروید با GitHub Actions
فایل `.github/workflows/build.yml` با هر push به `main`، هر تگ `v*` یا اجرای دستی، این خروجی‌ها را می‌سازد:
- وب (و در صورت فعال‌بودن، انتشار روی GitHub Pages)
- دسکتاپ: Windows (`.exe`)، macOS (`.dmg`)، Linux (`.AppImage` و `.deb`)
- اندروید: `.apk` دیباگ، و در صورت تعریف keystore نسخه‌ی امضاشده‌ی `.apk` و `.aab`

تنظیمات لازم در Settings → Secrets and variables → Actions:
- متغیر `VITE_SERVER_URL` (ضروری)، مثلاً `wss://sumo-api.example.com`
- متغیر `DEPLOY_PAGES=true` (اختیاری، برای GitHub Pages)
- سکرت‌های `ANDROID_KEYSTORE_BASE64`، `ANDROID_KEYSTORE_PASSWORD`، `ANDROID_KEY_ALIAS`، `ANDROID_KEY_PASSWORD` (اختیاری)

برای ساخت Release: `git tag v1.0.0 && git push origin v1.0.0`
