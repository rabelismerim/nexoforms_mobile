param([int]$Port = 5000)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'env.ps1')
$nexoCodePath = Join-Path $nexoTools 'owner-setup-code.txt'
if (-not (Test-Path -LiteralPath $nexoCodePath)) {
    $nexoBytes = New-Object byte[] 32
    $nexoRandom = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $nexoRandom.GetBytes($nexoBytes)
    $nexoRandom.Dispose()
    [System.BitConverter]::ToString($nexoBytes).Replace('-', '') | Set-Content -LiteralPath $nexoCodePath -Encoding ascii
}
$env:NEXO_SETUP_CODE = (Get-Content -LiteralPath $nexoCodePath -Raw).Trim()
$env:ASPNETCORE_ENVIRONMENT = 'Development'
Write-Host 'Administrador configurado: r.abelismerim@gmail.com'
Write-Host 'Código do primeiro cadastro: arquivo .tools/owner-setup-code.txt (não compartilhe com participantes).'
dotnet restore (Join-Path $nexoRoot 'NexoFormsApi/NexoFormsApi.csproj') --configfile (Join-Path $nexoRoot 'NuGet.Config')
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível restaurar a API.' }
dotnet run --project (Join-Path $nexoRoot 'NexoFormsApi') --no-launch-profile --no-restore --urls "http://0.0.0.0:$Port"
