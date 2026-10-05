$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$libraryPath = Join-Path $projectRoot 'library\library.json'
$manifestPath = Join-Path $projectRoot 'library\manifest.json'
$library = Get-Content -Raw -LiteralPath $libraryPath | ConvertFrom-Json
$parts = @($library.version -split '\.') | ForEach-Object { [int]$_ }
while ($parts.Count -lt 3) { $parts += 0 }
$parts[2]++
$version = "$($parts[0]).$($parts[1]).$($parts[2])"
$library.version = $version
$library.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
$library | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $libraryPath -Encoding utf8
@{ schemaVersion = 1; version = $version; updatedAt = $library.updatedAt; library = 'library.json' } | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding utf8

git add library/library.json library/manifest.json
git commit -m "chore: update Kvasir story library $version"
git push
Write-Host "Kvasir 故事库已发布：$version" -ForegroundColor Green
