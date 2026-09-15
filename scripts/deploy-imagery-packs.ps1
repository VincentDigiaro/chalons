$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskRelease = Join-Path $taskRoot 'artifacts/imagery-packs-release'
$taskConfig = 'C:\nginx\conf\chalons.conf'
$taskBefore = Join-Path $taskRelease 'chalons-before.conf'
$taskAfter = Join-Path $taskRelease 'chalons.conf'
if ((Get-FileHash -LiteralPath $taskConfig).Hash -ne (Get-FileHash -LiteralPath $taskBefore).Hash) { throw 'Nginx configuration changed after preparation.' }
$taskService = Get-ScheduledTask -TaskName 'ChalonsImageryCache' -TaskPath '\'
$taskExe = Join-Path $taskRoot 'artifacts/imagery-service/runtime/ChalonsImageryCache.exe'
if ($taskService.Actions.Count -ne 1 -or $taskService.Actions[0].Execute -ine $taskExe) { throw 'Unexpected imagery task action.' }
$taskListener = @(Get-NetTCPConnection -State Listen -LocalPort 5174)
if ($taskListener.Count -ne 1 -or $taskListener[0].LocalAddress -ne '127.0.0.1') { throw 'Unexpected imagery port owner.' }
$taskNode = Get-CimInstance Win32_Process -Filter "ProcessId=$($taskListener[0].OwningProcess)"
if ($taskNode.CommandLine -notlike ('*"' + (Join-Path $taskRoot 'scripts/serve-imagery.mjs') + '"*')) { throw 'Unexpected imagery process.' }
$taskParent = Get-CimInstance Win32_Process -Filter "ProcessId=$($taskNode.ParentProcessId)"
if ($taskParent.ExecutablePath -ine $taskExe) { throw 'Unexpected imagery supervisor.' }
Export-ScheduledTask -TaskName $taskService.TaskName | Set-Content -LiteralPath (Join-Path $taskRelease 'task-before.xml') -Encoding Unicode

$taskRestarted = $false
try {
    Copy-Item -LiteralPath $taskAfter -Destination $taskConfig
    & 'C:\nginx\nginx.exe' -p 'C:/nginx/' -t
    if ($LASTEXITCODE -ne 0) { throw 'Nginx validation failed.' }
    & 'C:\nginx\nginx.exe' -p 'C:/nginx/' -s reload
    if ($LASTEXITCODE -ne 0) { throw 'Nginx reload failed.' }
    Stop-ScheduledTask -TaskName $taskService.TaskName -TaskPath $taskService.TaskPath
    $taskRestarted = $true
    $taskOldHandle = Get-Process -Id $taskNode.ProcessId -ErrorAction SilentlyContinue
    if ($taskOldHandle -and !$taskOldHandle.WaitForExit(5000)) { throw 'Imagery supervisor did not stop its child.' }
    # The new packet must remain readable from Nginx while Node is stopped.
    $taskOffline = Invoke-WebRequest -UseBasicParsing -Uri 'https://digiaro.duckdns.org/chalons/data/imagery/ign/packs/v1/4/18/134248/90072.bin' -TimeoutSec 10
    if ($taskOffline.StatusCode -ne 200 -or $taskOffline.RawContentLength -le 8) { throw 'Saved packet unavailable without Node.' }
    Start-ScheduledTask -TaskName $taskService.TaskName -TaskPath $taskService.TaskPath
    $taskResponse = $null
    for ($i=0; $i -lt 30 -and !$taskResponse; $i++) {
        try { $taskResponse = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5174/imagery-config.json' -TimeoutSec 1 }
        catch { Start-Sleep -Milliseconds 250 }
    }
    if (!$taskResponse -or $taskResponse.StatusCode -ne 200) { throw 'Updated imagery service failed HTTP health check.' }
    $taskResult = [pscustomobject]@{deployed=$true;staticPacketWhileNodeStopped=$taskOffline.StatusCode;configEndpoint=$taskResponse.StatusCode;taskActionPreserved=$true;time=[DateTime]::UtcNow.ToString('o')}
    $taskResult | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRelease 'service-deployment.json') -Encoding UTF8
    $taskResult | ConvertTo-Json -Compress
} catch {
    $taskFailure = $_
    Copy-Item -LiteralPath $taskBefore -Destination $taskConfig
    & 'C:\nginx\nginx.exe' -p 'C:/nginx/' -s reload
    if ($taskRestarted) { Start-ScheduledTask -TaskName $taskService.TaskName -TaskPath $taskService.TaskPath }
    throw $taskFailure
}
