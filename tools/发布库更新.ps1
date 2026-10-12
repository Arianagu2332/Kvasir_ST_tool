$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$libraryPath = Join-Path $projectRoot 'library\library.json'
$manifestPath = Join-Path $projectRoot 'library\manifest.json'

try {
  $libraryText = Get-Content -Raw -Encoding UTF8 -LiteralPath $libraryPath
  $library = $libraryText | ConvertFrom-Json
} catch {
  throw "Cannot parse library/library.json. The file must contain JSON only, starting with { and ending with }. Original error: $($_.Exception.Message)"
}

if (-not $library.version) {
  throw 'library/library.json is missing the version field.'
}

$parts = @($library.version -split '\.') | ForEach-Object { [int]$_ }
while ($parts.Count -lt 3) { $parts += 0 }
$parts[2]++
$version = "$($parts[0]).$($parts[1]).$($parts[2])"
$library.version = $version
$library.updatedAt = (Get-Date).ToUniversalTime().ToString('o')

$library | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $libraryPath -Encoding UTF8
@{ schemaVersion = 1; version = $version; updatedAt = $library.updatedAt; library = 'library.json' } |
  ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding UTF8

git -c safe.directory="$projectRoot" add library/library.json library/manifest.json
if ($LASTEXITCODE -ne 0) {
  throw "Git add failed. Please check repository permissions."
}
git -c safe.directory="$projectRoot" commit -m "chore: update Kvasir story library $version"
if ($LASTEXITCODE -ne 0) {
  throw "Git commit failed. Please check repository permissions or Git identity."
}
$pushSucceeded = $false
for ($attempt = 1; $attempt -le 3; $attempt++) {
  git -c safe.directory="$projectRoot" push
  if ($LASTEXITCODE -eq 0) {
    $pushSucceeded = $true
    break
  }

  if ($attempt -eq 3) { break }

  Write-Host "Remote changed during publishing. Syncing and retrying ($attempt/3)..." -ForegroundColor Yellow
  git -c safe.directory="$projectRoot" fetch origin
  if ($LASTEXITCODE -ne 0) {
    throw "Git fetch failed. The local story library commit was kept, but not published."
  }
  git -c safe.directory="$projectRoot" pull --rebase origin main
  if ($LASTEXITCODE -ne 0) {
    throw "Git rebase failed. The local story library commit was kept; resolve the Git conflict, then push again."
  }
}

if (-not $pushSucceeded) {
  throw "Git push failed after 3 attempts. The local story library commit was kept, but the remote story library was not updated."
}
Write-Host "Kvasir story library published: $version" -ForegroundColor Green
