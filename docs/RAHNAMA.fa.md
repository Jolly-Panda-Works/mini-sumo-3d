# راهنمای سریع راه‌اندازی Mini Sumo

## پیش‌نیاز
- Node.js نسخه ۲۰٫۱۲ یا جدیدتر (پیشنهاد: ۲۲)
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
