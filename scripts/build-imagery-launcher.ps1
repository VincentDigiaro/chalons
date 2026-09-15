param([string]$OutputPath)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (!$OutputPath) { $OutputPath = Join-Path $projectRoot 'artifacts/imagery-service/runtime/ChalonsImageryCache.exe' }
$OutputPath = [IO.Path]::GetFullPath($OutputPath)
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$source = Join-Path $PSScriptRoot 'windows/ChalonsImageryCache.cs'
New-Item -ItemType Directory -Path (Split-Path -Parent $OutputPath) -Force | Out-Null
& $compiler /nologo /target:winexe /optimize+ /reference:System.Web.Extensions.dll ('/out:' + $OutputPath) $source
if ($LASTEXITCODE -ne 0) { throw 'Compilation du lanceur IGN impossible.' }
Write-Output $OutputPath
