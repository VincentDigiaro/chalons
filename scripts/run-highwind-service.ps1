$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskLogs = Join-Path $taskRoot 'artifacts\highwind-service'
New-Item -ItemType Directory -Force -Path $taskLogs | Out-Null
$taskNode = (Get-Command node.exe -ErrorAction Stop).Source
$taskScript = Join-Path $PSScriptRoot 'serve-highwind.mjs'
$taskProcess = Start-Process -FilePath $taskNode -ArgumentList ('"' + $taskScript + '"') -WorkingDirectory $taskRoot -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $taskLogs 'stdout.log') -RedirectStandardError (Join-Path $taskLogs 'stderr.log')
exit $taskProcess.ExitCode
