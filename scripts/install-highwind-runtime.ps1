$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskRelease = (Get-Content -LiteralPath (Join-Path $taskRoot 'artifacts\highwind-auto-release\latest.txt') -Raw).Trim()
$taskManifest = Get-Content -LiteralPath (Join-Path $taskRelease 'manifest.json') -Raw | ConvertFrom-Json
if ($taskManifest.root -ne $taskRoot -or $taskManifest.live -ne 'C:/nginx/html/chalons') { throw 'Unexpected release target.' }
foreach ($file in $taskManifest.files) {
    if ($file.file -notin @('walk-loading.js','walk-config.js','fps-highwind.js','map-highwind.js')) { throw 'Unexpected runtime file.' }
    if ((Get-FileHash -LiteralPath (Join-Path $taskManifest.live $file.file)).Hash.ToLowerInvariant() -ne $file.before) { throw ('Concurrent live change: ' + $file.file) }
    if ((Get-FileHash -LiteralPath (Join-Path $taskRelease ('files\' + $file.file))).Hash.ToLowerInvariant() -ne $file.after) { throw 'Prepared file changed.' }
    if ((Get-FileHash -LiteralPath (Join-Path $taskRelease ('files\' + $file.file + '.gz'))).Hash.ToLowerInvariant() -ne $file.gzip) { throw 'Prepared gzip changed.' }
}
if ((Get-FileHash -LiteralPath 'C:\nginx\conf\chalons.conf').Hash.ToLowerInvariant() -ne $taskManifest.'chalons.conf') { throw 'Concurrent Nginx configuration change.' }
$taskName = 'ChalonsHighwindExport'
$taskRunner = Join-Path $PSScriptRoot 'run-highwind-service.ps1'
$taskArguments = '-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $taskRunner + '"'
$taskExisting = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$taskCreated = $false
if ($taskExisting) {
    if ($taskExisting.Actions.Arguments -ne $taskArguments) { throw 'An unrelated scheduled task has the same name.' }
} else {
    $taskAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $taskArguments -WorkingDirectory $taskRoot
    $taskUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $taskUser
    $taskPrincipal = New-ScheduledTaskPrincipal -UserId $taskUser -LogonType Interactive -RunLevel Limited
    $taskSettings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -StartWhenAvailable
    Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings -Description 'Prépare les fichiers Highwind-vN.blend locaux à la demande pour le jeu, sur 127.0.0.1:5195.' | Out-Null
    $taskCreated = $true
}
$taskConfigChanged = $false
$taskCodeChanged = $false
try {
    Start-ScheduledTask -TaskName $taskName
    $taskReady = $false
    for ($attempt=0; $attempt -lt 20; $attempt++) {
        try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:5195/health' -TimeoutSec 2; if ($health.service -eq 'highwind-auto-export') { $taskReady=$true; break } } catch {}
        Start-Sleep -Milliseconds 300
    }
    if (!$taskReady) { throw 'Highwind export service did not start.' }
    $taskVersion = (Get-Content -LiteralPath (Join-Path $taskRoot 'fps-config.json') -Raw | ConvertFrom-Json).highwind.modele
    if ($taskVersion -match '^v[1-9][0-9]*$') { $null = Invoke-RestMethod -Uri ('http://127.0.0.1:5195/data/highwind/' + $taskVersion + '/index.json') -TimeoutSec 60 }
    Copy-Item -LiteralPath (Join-Path $taskRelease 'highwind.conf') -Destination 'C:\nginx\conf\highwind.conf'
    $taskConfig = [IO.File]::ReadAllText('C:\nginx\conf\chalons.conf')
    if (!$taskConfig.Contains('include C:/nginx/conf/highwind.conf;')) { [IO.File]::WriteAllText('C:\nginx\conf\chalons.conf', $taskConfig + "`r`ninclude C:/nginx/conf/highwind.conf;`r`n", [Text.UTF8Encoding]::new($false)); $taskConfigChanged=$true }
    & 'C:\nginx\nginx.exe' -p C:/nginx/ -c conf/nginx.conf -t
    if ($LASTEXITCODE -ne 0) { throw 'Nginx configuration validation failed.' }
    foreach ($file in $taskManifest.files) {
        $taskCodeChanged=$true
        Copy-Item -LiteralPath (Join-Path $taskRelease ('files\' + $file.file + '.gz')) -Destination (Join-Path $taskManifest.live ($file.file + '.gz'))
        Copy-Item -LiteralPath (Join-Path $taskRelease ('files\' + $file.file)) -Destination (Join-Path $taskManifest.live $file.file)
    }
    & 'C:\nginx\nginx.exe' -p C:/nginx/ -c conf/nginx.conf -s reload
    if ($LASTEXITCODE -ne 0) { throw 'Nginx reload failed.' }
    [pscustomobject]@{installed=$true; task=$taskName; model=$taskVersion; backup=$taskRelease} | ConvertTo-Json
} catch {
    if ($taskCodeChanged) { foreach ($file in $taskManifest.files) {
        Copy-Item -LiteralPath (Join-Path $taskRelease ('backup\' + $file.file)) -Destination (Join-Path $taskManifest.live $file.file)
        if ($file.oldGzip) { Copy-Item -LiteralPath (Join-Path $taskRelease ('backup\' + $file.file + '.gz')) -Destination (Join-Path $taskManifest.live ($file.file + '.gz')) }
    } }
    if ($taskConfigChanged) { Copy-Item -LiteralPath (Join-Path $taskRelease 'chalons.conf') -Destination 'C:\nginx\conf\chalons.conf'; & 'C:\nginx\nginx.exe' -p C:/nginx/ -c conf/nginx.conf -s reload }
    if ($taskCreated) { Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
    throw
}
