param([string]$ApiUrl = '', [ValidateSet('arm64-v8a','x86_64','armeabi-v7a','x86')][string]$Architecture = 'arm64-v8a')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'env.ps1')
if ($ApiUrl) {
    if ($ApiUrl -notmatch '^https?://[^\s]+/api/?$') {throw 'Informe uma URL terminando em /api.'}
    $nexoUrlLiteral = ConvertTo-Json -InputObject $ApiUrl.TrimEnd('/') -Compress
    Set-Content -LiteralPath (Join-Path $nexoRoot 'NexoFormsApp/src/workspace/config.ts') -Value "// Initial API address; the owner may update it through Settings.`nexport const DEFAULT_API_URL = $nexoUrlLiteral;" -Encoding utf8
}
Push-Location (Join-Path $nexoRoot 'NexoFormsApp')
try {
    $ErrorActionPreference = 'Continue'
    & ./android/gradlew.bat -p android assembleRelease "-PreactNativeArchitectures=$Architecture" --console=plain
    $nexoBuildExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($nexoBuildExit -ne 0) {throw 'A compilação Android falhou.'}
    $nexoApk = Get-ChildItem -LiteralPath android/app/build/outputs/apk/release -Filter *.apk | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $nexoArtifacts = Join-Path $nexoRoot '.artifacts'
    New-Item -ItemType Directory -Force -Path $nexoArtifacts | Out-Null
    Copy-Item -LiteralPath $nexoApk.FullName -Destination (Join-Path $nexoArtifacts "NexoForms-$Architecture.apk") -Force
    Write-Host "APK de teste pronto em .artifacts/NexoForms-$Architecture.apk"
} finally {Pop-Location}
