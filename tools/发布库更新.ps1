$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$libraryPath = Join-Path $projectRoot 'library\library.json'
$manifestPath = Join-Path $projectRoot 'library\manifest.json'
try {
  $libraryText = Get-Content -Raw -Encoding UTF8 -LiteralPath $libraryPath
  $library = $libraryText | ConvertFrom-Json
} catch {
  throw "无法解析 library/library.json。请确认文件内容从 { 开始、以 } 结束，不要包含 ```json、报错文字或反斜杠转义的引号。原始错误：$($_.Exception.Message)"
}
if (-not $library.version) {
  throw 'library/library.json 缺少 version 字段。'
}
$parts = @($library.version -split '\.') | ForEach-Object { [int]$_ }
while ($parts.Count -lt 3) { $parts += 0 }
$parts[2]++
$version = "$($parts[0]).$($parts[1]).$($parts[2])"
$library.version = $version
$library.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
$library | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $libraryPath -Encoding UTF8
@{ schemaVersion = 1; version = $version; updatedAt = $library.updatedAt; library = 'library.json' } | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding UTF8

git add library/library.json library/manifest.json
git commit -m "chore: update Kvasir story library $version"
git push
Write-Host "Kvasir 故事库已发布：$version" -ForegroundColor Green
