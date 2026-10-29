$ErrorActionPreference='Stop'
$utf8=[Text.UTF8Encoding]::new($true)
$stage=Split-Path $PSScriptRoot -Parent
$target=Join-Path $stage '管理主题.ps1'
. (Join-Path $stage 'engine/i18n.ps1')
Initialize-BocchiLanguage -Root $stage -Language 'zh-CN'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($target,[ref]$tokens,[ref]$errors)
$checks=[Collections.Generic.List[object]]::new()
function Check([string]$Name,[bool]$Ok){$checks.Add([pscustomobject]@{name=$Name;passed=$Ok});if(-not $Ok){throw $Name}}
Check 'Windows PowerShell syntax' ($errors.Count -eq 0)
$definitions=@()
foreach($name in @('ConvertTo-UtcStamp','Enter-BocchiOperationLock','Test-BocchiCompletedStart')){
  $def=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
  $definitions+=$def.Extent.Text
  . ([scriptblock]::Create($def.Extent.Text))
}
$fixture=Join-Path (Join-Path $stage '.test-output') ('测试 空格-'+[Guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path (Join-Path $fixture 'theme') -Force
[IO.File]::WriteAllText((Join-Path $fixture 'gate.ps1'),$definitions[1],$utf8)
$worker=@'
param($Directory,$MutexName,$Mode,[int]$TimeoutMilliseconds=10000,$PackageRoot)
$ErrorActionPreference='Stop'
. (Join-Path $Directory 'gate.ps1')
. (Join-Path $PackageRoot 'engine/i18n.ps1')
Initialize-BocchiLanguage -Root $PackageRoot -Language 'zh-CN'
$mutex=New-Object Threading.Mutex($false,$MutexName)
$locked=$false
try {
  if($Mode -eq 'abandon'){
    $null=$mutex.WaitOne(0)
    [IO.File]::WriteAllText((Join-Path $Directory 'abandon-ready'),'ready')
    exit 0
  }
  [IO.File]::WriteAllText((Join-Path $Directory ($Mode+'-ready')),'ready')
  $watch=[Diagnostics.Stopwatch]::StartNew()
  $gate=Enter-BocchiOperationLock -Mutex $mutex -TimeoutMilliseconds $TimeoutMilliseconds
  $locked=$gate.acquired
  $result=@{acquired=$locked;waited=$gate.waited;elapsed=$watch.ElapsedMilliseconds}
} catch {
  $result=@{acquired=$false;message=$_.Exception.Message;key=$_.Exception.Data['BocchiMessageKey']}
} finally {
  if($locked){$mutex.ReleaseMutex()}
  $mutex.Dispose()
}
[IO.File]::WriteAllText((Join-Path $Directory ($Mode+'-result.json')),($result|ConvertTo-Json))
'@
[IO.File]::WriteAllText((Join-Path $fixture 'worker.ps1'),$worker,$utf8)
$shell=(Get-Process -Id $PID).Path
function Run-Worker($Name,$Mode,$Timeout=10000){
  $arguments='-NoProfile -File "'+(Join-Path $fixture 'worker.ps1')+'" -Directory "'+$fixture+'" -MutexName "'+$Name+'" -Mode '+$Mode+' -TimeoutMilliseconds '+$Timeout+' -PackageRoot "'+$stage+'"'
  Start-Process -FilePath $shell -ArgumentList $arguments -WindowStyle Hidden -PassThru
}
function Wait-Marker($Name){
  $deadline=[datetime]::UtcNow.AddSeconds(10)
  while(-not (Test-Path -LiteralPath (Join-Path $fixture $Name)) -and [datetime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 30}
  if(-not (Test-Path -LiteralPath (Join-Path $fixture $Name))){throw 'Test worker did not become ready'}
}
$lockName='Local\BocchiTest-'+[Guid]::NewGuid().ToString('N')
$mutex=New-Object Threading.Mutex($false,$lockName)
$held=$false
try {
  $gate=Enter-BocchiOperationLock $mutex
  $held=$gate.acquired
  Check 'idle mutex acquired immediately' ($held -and -not $gate.waited)
  $child=Run-Worker $lockName 'overlap'
  Wait-Marker 'overlap-ready'
  Start-Sleep -Milliseconds 650
  Check 'second process waits while first owns lock' (-not $child.HasExited)
  $mutex.ReleaseMutex();$held=$false
  Check 'queued process completes after first releases lock' ($child.WaitForExit(15000))
  $result=Get-Content -LiteralPath (Join-Path $fixture 'overlap-result.json') -Raw -Encoding utf8|ConvertFrom-Json
  Check 'overlap acquired without an error' ($result.acquired -and $result.waited -and $result.elapsed -ge 500)
  $child.Dispose()
  $held=$mutex.WaitOne(0)
  $child=Run-Worker $lockName 'timeout' 200
  Check 'blocked request has a bounded wait' ($child.WaitForExit(15000))
  $result=Get-Content -LiteralPath (Join-Path $fixture 'timeout-result.json') -Raw -Encoding utf8|ConvertFrom-Json
  Check 'timeout does not claim success' (-not $result.acquired -and ($result.key -eq 'manager.operationTimeout'))
  $child.Dispose()
  $mutex.ReleaseMutex();$held=$false
  $child=Run-Worker $lockName 'abandon'
  Check 'abandoned owner exits' ($child.WaitForExit(15000))
  $child.Dispose()
  $gate=Enter-BocchiOperationLock $mutex
  $held=$gate.acquired
  Check 'abandoned mutex recovered with ownership' $held
} finally {if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}

# Real session matching and ready checks, with only process inspection stubbed.
. (Join-Path $stage 'engine/session-guard.ps1')
function Test-DreamSkinPathEqual([string]$Left,[string]$Right){[string]::Equals($Left,$Right,[StringComparison]::OrdinalIgnoreCase)}
$script:daemonAlive=$true;$script:visibleWindow=1
function Test-OwnDaemon {param($State)$script:daemonAlive}
function Get-Process {param($Id,$ErrorAction)[pscustomobject]@{MainWindowHandle=$script:visibleWindow}}
$root=$fixture;$profile=Join-Path $fixture 'profile';$appVersion='test-app';$runtimeHash='test-runtime'
$codex=[pscustomobject]@{Version='test-package';PackageRoot='C:\VerifiedPackage'}
$install=[pscustomobject]@{themeVersion='test-theme'}
$controlPath=Join-Path $fixture 'control.json';$statusPath=Join-Path $fixture 'status.json'
[IO.File]::WriteAllText((Join-Path $fixture 'theme/renderer.js'),'test theme')
$themeHash=(Get-FileHash -LiteralPath (Join-Path $fixture 'theme/renderer.js')).Hash
$saved=[pscustomobject]@{schema='bocchi-runtime/1';browserId='browser';ownerPid=11;ownerCreated='2026-10-20T01:02:03Z';profile=$profile;appVersion=$appVersion;packageVersion=$codex.Version;packageRoot=$codex.PackageRoot;runtimeHash=$runtimeHash;daemonPid=22;generation='generation'}
$own=[pscustomobject]@{pid=11;created=$saved.ownerCreated;identity=[pscustomobject]@{BrowserId='browser'}}
function Reset-Fixture {
  $script:control=@{paused=$false;stop=$false;requestId='request'}
  $script:ready=@{state='running';requestId='request';generation='generation';browserId='browser';daemonPid=22;runtimeHash=$runtimeHash;themeHash=$themeHash;at=[datetime]::UtcNow.ToString('o');renderers=@(@{installed=$true;ready=$true;imageLoaded=$true;version='test-theme'})}
}
function Can-Reuse {
  [IO.File]::WriteAllText($controlPath,($script:control|ConvertTo-Json -Depth 5))
  [IO.File]::WriteAllText($statusPath,($script:ready|ConvertTo-Json -Depth 5))
  Test-BocchiCompletedStart -State $saved -Own $own
}
Reset-Fixture
Check 'completed matching visible theme can be reused' (Can-Reuse)
$script:daemonAlive=$false
Check 'dead loader is not treated as successful' (-not (Can-Reuse))
$script:daemonAlive=$true;$script:visibleWindow=0
Check 'closed window continues through normal activation' (-not (Can-Reuse))
$script:visibleWindow=1
$own.identity.BrowserId='other'
Check 'different live session is not reused' (-not (Can-Reuse))
$own.identity.BrowserId='browser'
foreach($field in @('paused','stop')){
  Reset-Fixture;$script:control[$field]=$true
  Check ($field+' operation is not bypassed') (-not (Can-Reuse))
}
foreach($field in @('requestId','generation','browserId','runtimeHash')){
  Reset-Fixture;$script:ready[$field]='different'
  Check ('mismatched '+$field+' is rejected') (-not (Can-Reuse))
}
$saved.profile='C:\OtherProfile'
Check 'different profile is not reused' (-not (Can-Reuse))
$saved.profile=$profile
Reset-Fixture;$script:ready.at=[datetime]::UtcNow.AddSeconds(-20).ToString('o')
Check 'stale success is not reused' (-not (Can-Reuse))
Reset-Fixture;$script:ready.renderers[0].imageLoaded=$false
Check 'unloaded wallpaper is not called successful' (-not (Can-Reuse))
Reset-Fixture;$script:ready.renderers[0].installed=$false
Check 'failed renderer is not called successful' (-not (Can-Reuse))
Reset-Fixture;$script:ready.renderers[0].version='other'
Check 'wrong theme version is not reused' (-not (Can-Reuse))
Reset-Fixture;$script:ready.state='failed'
Check 'failed first start continues through recovery' (-not (Can-Reuse))
Reset-Fixture
[IO.File]::WriteAllText($statusPath,'{broken')
Check 'incomplete status does not bypass normal recovery' (-not (Test-BocchiCompletedStart $saved $own))
# Execute the actual queued-start branch with only activation and tracing stubbed.
# Replace its terminal exit with return so the isolated test process can continue.
Reset-Fixture
$null=Can-Reuse
$queued=$ast.Find({param($n)$n -is [Management.Automation.Language.IfStatementAst] -and $n.Extent.Text.StartsWith('if($gate.waited -and')},$true)
Check 'queued-start branch is available for behavior test' ($null -ne $queued)
$queuedBlock=[scriptblock]::Create($queued.Extent.Text.Replace('exit 0','return'))
$gate=[pscustomobject]@{waited=$true};$Action='Start';$script:queuedRestores=0;$script:minimized=$true;$script:queuedTrace=''
function Open-BocchiOwnedWindow {param($Codex,$Own)$script:queuedRestores++;$script:minimized=$false;return $Own}
function Write-BocchiStartupTrace {param($Stage,$Own)$script:queuedTrace=$Stage}
& $queuedBlock|Out-Null
Check 'queued ready start reaches window restoration before success' ($script:queuedRestores -eq 1 -and -not $script:minimized -and $script:queuedTrace -ceq 'reused-completed-start')
$gate.waited=$false;$script:minimized=$true
& $queuedBlock|Out-Null
Check 'nonqueued request does not activate through the fast path' ($script:queuedRestores -eq 1 -and $script:minimized)
$source=Get-Content -LiteralPath $target -Raw -Encoding utf8
Check 'coalescing limited to queued start or resume' ($source.Contains('$gate.waited -and $Action -in @(''Start'',''Resume'')'))
Check 'normal readiness and recovery preserved' ($source.Contains('if(-not (Wait-ThemeReady -State $state -RequestId $requestId))'))
. (Join-Path $PSScriptRoot 'termination-contract.ps1')
Assert-BocchiTerminationContract $ast
$report=@{passed=$true;count=$checks.Count;checks=$checks;scope='isolated named-mutex process tests and fixture session checks; actual client untouched'}
[IO.File]::WriteAllText((Join-Path $stage '.test-output/duplicate-start-checks.json'),($report|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
[ordered]@{passed=$report.passed;count=$report.count;scope=$report.scope}|ConvertTo-Json -Compress
