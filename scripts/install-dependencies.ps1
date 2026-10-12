$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$nexoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nexoTools = Join-Path $nexoRoot '.tools'
$nexoDownloads = Join-Path $nexoTools 'downloads'
New-Item -ItemType Directory -Force -Path $nexoDownloads | Out-Null
function Get-NexoArchive($Url, $File, $Checksum, $Algorithm = 'SHA256') {
    if (-not (Test-Path -LiteralPath $File)) {Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $File}
    if ((Get-FileHash -LiteralPath $File -Algorithm $Algorithm).Hash.ToLower() -ne $Checksum.ToLower()) {throw "Verificação de integridade falhou: $File"}
}
if (-not (Test-Path -LiteralPath (Join-Path $nexoTools 'dotnet/dotnet.exe'))) {
    $nexoDotnet = Invoke-RestMethod 'https://builds.dotnet.microsoft.com/dotnet/release-metadata/10.0/releases.json'
    $nexoPackage = $nexoDotnet.releases[0].sdk.files | Where-Object { $_.rid -eq 'win-x64' -and $_.name -like '*.zip' } | Select-Object -First 1
    $nexoArchive = Join-Path $nexoDownloads 'dotnet.zip'
    Get-NexoArchive $nexoPackage.url $nexoArchive $nexoPackage.hash 'SHA512'
    Expand-Archive -LiteralPath $nexoArchive -DestinationPath (Join-Path $nexoTools 'dotnet') -Force
}
if (-not (Get-ChildItem -LiteralPath (Join-Path $nexoTools 'java') -Directory -ErrorAction SilentlyContinue | Where-Object Name -like 'jdk-17*')) {
    $nexoJava = Invoke-RestMethod 'https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse'
    $nexoPackage = $nexoJava[0].binary.package
    $nexoArchive = Join-Path $nexoDownloads 'jdk.zip'
    Get-NexoArchive $nexoPackage.link $nexoArchive $nexoPackage.checksum
    Expand-Archive -LiteralPath $nexoArchive -DestinationPath (Join-Path $nexoTools 'java') -Force
}
if (-not (Test-Path -LiteralPath (Join-Path $nexoTools 'android/cmdline-tools/19.0/bin/sdkmanager.bat'))) {
    $nexoArchive = Join-Path $nexoDownloads 'android-tools.zip'
    Get-NexoArchive 'https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip' $nexoArchive '98b565cb657b012dae6794cefc0f66ae1efb4690c699b78a614b4a6a3505b003'
    $nexoStage = Join-Path $nexoTools 'android-tools-stage'
    Expand-Archive -LiteralPath $nexoArchive -DestinationPath $nexoStage -Force
    $nexoSource = (Resolve-Path (Join-Path $nexoStage 'cmdline-tools')).Path
    $nexoDestination = Join-Path $nexoTools 'android/cmdline-tools/19.0'
    if (-not $nexoSource.StartsWith($nexoRoot + '\') -or -not $nexoDestination.StartsWith($nexoRoot + '\')) {throw 'Caminho fora do projeto.'}
    New-Item -ItemType Directory -Force -Path (Split-Path $nexoDestination) | Out-Null
    Move-Item -LiteralPath $nexoSource -Destination $nexoDestination
}
. (Join-Path $PSScriptRoot 'env.ps1')
$ErrorActionPreference = 'Continue'
1..50 | ForEach-Object {'y'} | & "$env:ANDROID_HOME/cmdline-tools/19.0/bin/sdkmanager.bat" --sdk_root=$env:ANDROID_HOME --licenses
& "$env:ANDROID_HOME/cmdline-tools/19.0/bin/sdkmanager.bat" --sdk_root=$env:ANDROID_HOME 'platform-tools' 'platforms;android-35' 'build-tools;35.0.0' 'ndk;27.1.12297006'
if ($LASTEXITCODE -ne 0) {throw 'A instalação do Android SDK falhou.'}
$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $nexoRoot 'NexoFormsApp')
try {
    $ErrorActionPreference = 'Continue'
    npm.cmd ci --cache (Join-Path $nexoTools 'npm-cache') --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {throw 'A instalação das dependências do app falhou.'}
} finally {Pop-Location}
Write-Host 'Dependências prontas. Use scripts/start-api.ps1 e scripts/build-android.ps1.'
