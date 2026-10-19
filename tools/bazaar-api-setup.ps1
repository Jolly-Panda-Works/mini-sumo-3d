# Cafe Bazaar Developer API setup (purchase validation on the game server).
#
# Asks for your Client ID and Client Secret, opens Bazaar's Authorize page, takes the code from
# the address Bazaar sends you back to, exchanges it for a refresh token, checks that it works,
# and writes the values into the project's .env file (ignored by git; copy it to the server).
#
# Run it with tools\bazaar-api-setup.cmd from the project folder.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $Root ".env"
$TokenUrl = "https://pardakht.cafebazaar.ir/devapi/v2/auth/token/"

function Step($text) { Write-Host ""; Write-Host "== $text" -ForegroundColor Yellow }
function Fail($text) { Write-Host ""; Write-Host "ERROR: $text" -ForegroundColor Red; exit 1 }
function ErrorText($err) {
  if ($err.ErrorDetails -and $err.ErrorDetails.Message) { return $err.ErrorDetails.Message }
  return $err.Exception.Message
}

Write-Host "Cafe Bazaar Developer API setup for Mini Sumo" -ForegroundColor Cyan
Write-Host "You need a Client from the Bazaar developer panel: Developer API > New Client."

# ---------------------------------------------------------------- 1. the Client
Step "1/5  Your Client"
$ClientId = (Read-Host "Client ID").Trim()
if (-not $ClientId) { Fail "The Client ID is empty." }
$secure = Read-Host "Client Secret (hidden while you type)" -AsSecureString
$ClientSecret = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()
if (-not $ClientSecret) { Fail "The Client Secret is empty." }
$Redirect = (Read-Host "Redirect URI, exactly as in the panel [https://sumo.ryujin.fans/]").Trim()
if (-not $Redirect) { $Redirect = "https://sumo.ryujin.fans/" }

# The app's package name, from the Android project settings
$PackageName = "com.jollypanda.mini_sumo"
$capConfig = Join-Path $Root "apps\mobile\capacitor.config.json"
if (Test-Path $capConfig) {
  try { $PackageName = (Get-Content $capConfig -Raw | ConvertFrom-Json).appId } catch { }
}

# ---------------------------------------------------------------- 2. authorize
Step "2/5  Authorize in the browser"
$authUrl = "https://pardakht.cafebazaar.ir/devapi/v2/auth/authorize/?response_type=code&access_type=offline&redirect_uri=$([uri]::EscapeDataString($Redirect))&client_id=$([uri]::EscapeDataString($ClientId))"
Write-Host "Opening Bazaar's Authorize page. Click Authorize there."
Write-Host "If the browser doesn't open, open this address yourself:"
Write-Host $authUrl -ForegroundColor Gray
Start-Process $authUrl

# ---------------------------------------------------------------- 3. the code
Step "3/5  The code"
Write-Host "After Authorize, the browser goes to $Redirect"
Write-Host "Copy the WHOLE address from the address bar (it contains ?code=...) and paste it here."
Write-Host "Be quick: the code works once and only for a short time."
$pasted = (Read-Host "Address (or just the code)").Trim()
if ($pasted -match "[?&]code=([^&#\s]+)") { $Code = [uri]::UnescapeDataString($Matches[1]) } else { $Code = $pasted }
if (-not $Code) { Fail "No code found." }

# ---------------------------------------------------------------- 4. tokens
Step "4/5  Getting the refresh token"
try {
  $tokens = Invoke-RestMethod -Method Post -Uri $TokenUrl -Body @{
    grant_type    = "authorization_code"
    code          = $Code
    client_id     = $ClientId
    client_secret = $ClientSecret
    redirect_uri  = $Redirect
  }
} catch {
  Fail ("Bazaar refused the code: " + (ErrorText $_) + "`nThe code may have expired or been used already, or the Redirect URI isn't exactly the same as in the panel (the slash at the end too). Run this again for a new code.")
}
$RefreshToken = $tokens.refresh_token
if (-not $RefreshToken) { Fail "Bazaar's answer had no refresh_token: $($tokens | ConvertTo-Json -Compress)" }
Write-Host "Got a refresh token." -ForegroundColor Green

# Check it the way the server will use it: a refresh gives a fresh access token.
try {
  $check = Invoke-RestMethod -Method Post -Uri $TokenUrl -Body @{
    grant_type    = "refresh_token"
    client_id     = $ClientId
    client_secret = $ClientSecret
    refresh_token = $RefreshToken
  }
  if ($check.access_token) { Write-Host "Checked: the refresh token works." -ForegroundColor Green }
} catch {
  Write-Host ("Warning: the check with the refresh token failed: " + (ErrorText $_)) -ForegroundColor DarkYellow
}

# ---------------------------------------------------------------- 5. .env
Step "5/5  Writing .env"
$values = [ordered]@{
  BAZAAR_CLIENT_ID     = $ClientId
  BAZAAR_CLIENT_SECRET = $ClientSecret
  BAZAAR_REFRESH_TOKEN = $RefreshToken
  BAZAAR_PACKAGE_NAME  = $PackageName
}
$lines = @()
if (Test-Path $EnvFile) { $lines = @(Get-Content $EnvFile) }
foreach ($key in $values.Keys) {
  $line = "$key=$($values[$key])"
  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s*$key\s*=") { $lines[$i] = $line; $found = $true }
  }
  if (-not $found) { $lines += $line }
}
# UTF-8 without BOM, so Docker Compose reads it cleanly
[IO.File]::WriteAllLines($EnvFile, [string[]]$lines, (New-Object Text.UTF8Encoding($false)))
Write-Host "Saved to $EnvFile" -ForegroundColor Green
Write-Host "(.env is ignored by git: it never goes to GitHub.)"

Write-Host ""
Write-Host "Next, on the server (in the project folder):" -ForegroundColor Cyan
Write-Host "  git pull"
Write-Host "  bash tools/server-bazaar-setup.sh"
Write-Host "  It asks for these values, checks them from the server and restarts the game."
Write-Host "  (Or put these four lines in the server's .env yourself and run: docker compose up -d --build)"
foreach ($key in $values.Keys) {
  $shown = if ($key -eq "BAZAAR_CLIENT_SECRET" -or $key -eq "BAZAAR_REFRESH_TOKEN") { "<in your .env>" } else { $values[$key] }
  Write-Host "     $key=$shown"
}
Write-Host ""
Write-Host "Keep the Client Secret and the refresh token private: don't share them or put them in the code."
