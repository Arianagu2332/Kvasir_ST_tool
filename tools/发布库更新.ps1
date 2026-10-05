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

git add library/library.json library/manifest.json
git commit -m "chore: update Kvasir story library $version"
git push
Write-Host "Kvasir story library published: $version" -ForegroundColor Green
