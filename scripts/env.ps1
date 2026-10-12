$nexoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nexoTools = Join-Path $nexoRoot '.tools'
$nexoJdk = Get-ChildItem -LiteralPath (Join-Path $nexoTools 'java') -Directory | Where-Object Name -like 'jdk-17*' | Select-Object -First 1
if (-not $nexoJdk) { throw 'JDK 17 não encontrado na pasta .tools/java.' }
$env:JAVA_HOME = $nexoJdk.FullName
$env:ANDROID_HOME = Join-Path $nexoTools 'android'
$env:ANDROID_USER_HOME = Join-Path $nexoTools 'android-user'
$env:ANDROID_AVD_HOME = Join-Path $nexoTools 'avd'
$env:GRADLE_USER_HOME = Join-Path $nexoTools 'gradle'
$env:DOTNET_ROOT = Join-Path $nexoTools 'dotnet'
$env:DOTNET_CLI_HOME = Join-Path $nexoTools 'dotnet-user'
$env:DOTNET_ADD_GLOBAL_TOOLS_TO_PATH = '0'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:NUGET_PACKAGES = Join-Path $nexoTools 'nuget'
$env:PATH = "$env:DOTNET_ROOT;$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:PATH"
New-Item -ItemType Directory -Force -Path $env:ANDROID_USER_HOME,$env:ANDROID_AVD_HOME,$env:GRADLE_USER_HOME,$env:DOTNET_CLI_HOME,$env:NUGET_PACKAGES | Out-Null
$nexoSdkPath = $env:ANDROID_HOME.Replace('\', '/')
Set-Content -LiteralPath (Join-Path $nexoRoot 'NexoFormsApp/android/local.properties') -Value "sdk.dir=$nexoSdkPath" -Encoding ascii
