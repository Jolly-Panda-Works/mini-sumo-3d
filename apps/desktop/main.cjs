// Mini Sumo desktop shell.
// Serves the bundled web client from a local HTTP server on 127.0.0.1 so it gets a normal
// http origin (CORS to the Colyseus server and localStorage work exactly like on the web).
const { app, BrowserWindow, shell } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const WEB_ROOT = path.join(__dirname, "web");
// A fixed port keeps the origin stable, so saved settings survive restarts.
const PREFERRED_PORT = 41730;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function handleRequest(req, res) {
  let pathname = "/";
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  let filePath = path.normalize(path.join(WEB_ROOT, pathname));
  if (!filePath.startsWith(WEB_ROOT)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(WEB_ROOT, "index.html");
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handleRequest);
    server.once("error", (error) => {
      if (error.code !== "EADDRINUSE") return reject(error);
      // Preferred port taken: fall back to any free port.
      server.listen(0, "127.0.0.1", () => resolve(server.address().port));
    });
    server.listen(PREFERRED_PORT, "127.0.0.1", () => resolve(server.address().port));
  });
}

let mainWindow = null;

async function createWindow() {
  const port = await startStaticServer();
  const origin = `http://127.0.0.1:${port}`;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 540,
    backgroundColor: "#2F5C8A",
    title: "Mini Sumo",
    autoHideMenuBar: true,
    icon: path.join(WEB_ROOT, "icon-512.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);

  // External links open in the system browser; the game never navigates away.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(origin)) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });
  // F11 toggles fullscreen.
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F11") {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    }
  });

  await mainWindow.loadURL(`${origin}/`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(createWindow);
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
}
