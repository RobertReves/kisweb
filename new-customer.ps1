# Új ügyfél:
#   .\new-customer.ps1 -Slug szalon-eva -Name "Szalon Éva" -Url https://szalon-eva.hu -Api https://kisweb-api.valami.workers.dev -Desc "Fodrász a belvárosban"
# -Core: ha a közös kódot (core/) egy központi címről akarod kiszolgálni, pl. https://core.sajatdomain.hu/v1 ; ekkor a sablon frissítése minden ügyfélnél egyszerre életbe lép.
#        Nélküle az ügyfél mappájába bemásolódik a core/ (önálló, de frissítéskor kézzel kell újramásolni).
param(
  [Parameter(Mandatory)][string]$Slug,
  [Parameter(Mandatory)][string]$Name,
  [Parameter(Mandatory)][string]$Url,
  [Parameter(Mandatory)][string]$Api,
  [string]$Desc = "",
  [string]$Accent = "#b8860b",
  [string]$Core = ""
)
$ErrorActionPreference = "Stop"
if ($Slug -notmatch '^[a-z0-9-]+$') { throw "A slug csak kisbetű, szám és kötőjel lehet." }
foreach ($u in $Url, $Api) { if ($u -notmatch '^https://[^/\s]+') { throw "Csak https cím engedélyezett: $u" } }
if ($Core -and $Core -notmatch '^https://[^/\s]+') { throw "A -Core cím https-sel kezdődjön." }
$dst = Join-Path $PSScriptRoot "customers\$Slug"
if (Test-Path $dst) { throw "Már létezik: $dst" }
Copy-Item (Join-Path $PSScriptRoot "template") $dst -Recurse
$utf8 = New-Object Text.UTF8Encoding($false)   # BOM nélkül, különben a CNAME fájl hibás
function Rw($path, [scriptblock]$edit) { $t = [IO.File]::ReadAllText($path); [IO.File]::WriteAllText($path, (& $edit $t), $utf8) }

$siteHost = ([Uri]$Url).Host
$apiOrigin = ([Uri]$Api).GetLeftPart('Authority')
$coreSrc = if ($Core) { ([Uri]$Core).GetLeftPart('Authority') } else { "" }
if ($Core) { Remove-Item (Join-Path $dst "core") -Recurse -Force }

# Biztonsági irányelv (CSP): csak a saját kód, a Turnstile és a térkép futhat/tölthet be. A GitHub Pages nem enged fejlécet, ezért meta tag.
$csp = "default-src 'self'; script-src 'self' $coreSrc https://challenges.cloudflare.com https://static.cloudflareinsights.com; style-src 'self' $coreSrc 'unsafe-inline'; img-src 'self' data: https:; " +
       "connect-src 'self' $apiOrigin https://cloudflareinsights.com; frame-src https://challenges.cloudflare.com https://maps.google.com https://www.google.com; " +
       "object-src 'none'; base-uri 'none'; form-action 'self'"
$cspTag = "<meta http-equiv=`"Content-Security-Policy`" content=`"$($csp -replace '\s+', ' ')`">"
$rep = @{ "__NAME__" = $Name; "__DESC__" = $Desc; "__URL__" = $Url; "__ACCENT__" = $Accent; "__INITIAL__" = $Name.Substring(0, 1).ToUpper() }

foreach ($f in "index.html", "admin.html", "adatvedelem.html", "404.html", "robots.txt", "sitemap.xml", "manifest.webmanifest", "icon.svg") {
  Rw (Join-Path $dst $f) {
    param($t)
    foreach ($k in $rep.Keys) { $t = $t.Replace($k, [Security.SecurityElement]::Escape($rep[$k])) }
    $t = $t.Replace("<!--CSP-->", $cspTag)
    if ($Core) { $t = [regex]::Replace($t, '(["''])/?core/', ('$1' + $Core + '/')) }
    $t
  }
}
Rw (Join-Path $dst "config.js") {
  param($t)
  $t = $t -replace '(?m)^(\s*)slug: "[^"]*"', "`$1slug: `"$Slug`"" -replace '(?m)^(\s*)name: "[^"]*"', "`$1name: `"$Name`"" -replace '(?m)^(\s*)url: "[^"]*"', "`$1url: `"$Url`"" -replace '(?m)^(\s*)api: ""', "`$1api: `"$Api`"" -replace '(?m)^(\s*)accent: "[^"]*"', "`$1accent: `"$Accent`""
  $t
}
[IO.File]::WriteAllText((Join-Path $dst "CNAME"), $siteHost, $utf8)

# admin jelszó: 192 bit véletlen; az adatbázisba csak a SHA-256 lenyomata kerül
$bytes = New-Object byte[] 24; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$token = ([BitConverter]::ToString($bytes) -replace '-', '').ToLower()
$hash = ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($token))) -replace '-', '').ToLower()

Write-Host "`nKész: $dst"
Write-Host "1) Szerkeszd: $(Join-Path $dst 'config.js')  (hours, services, staff, phone, turnstile...)"
Write-Host "2) Futtasd a D1-en:  wrangler d1 execute kisweb --remote --command ""<az alábbi sor>"" :`n"
Write-Host "INSERT INTO tenants(slug,origin,token_hash) VALUES('$Slug','https://$siteHost,https://www.$siteHost','$hash');"
Write-Host "`n3) Az ügyfél admin jelszava (CSAK MOST látod, add át biztonságosan, pl. jelszókezelőből): $token"
Write-Host "   Admin: $Url/admin.html"
Write-Host "4) Telegram chat id-t később: UPDATE tenants SET tg_chat='123456' WHERE slug='$Slug';"
