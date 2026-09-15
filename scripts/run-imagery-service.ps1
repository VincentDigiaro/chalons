$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskLogs = Join-Path $taskRoot 'artifacts/imagery-service'
New-Item -ItemType Directory -Path $taskLogs -Force | Out-Null
$taskNode = (Get-Command node.exe -ErrorAction Stop).Source
$taskScript = Join-Path $PSScriptRoot 'serve-imagery.mjs'
# Task Scheduler starts this wrapper with -WindowStyle Hidden. Keep the task
# alive until Node exits, so its restart policy also covers server failures.
& $taskNode $taskScript 1>> (Join-Path $taskLogs 'stdout.log') 2>> (Join-Path $taskLogs 'stderr.log')
exit $LASTEXITCODE
