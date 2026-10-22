$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
. (Join-Path $root 'engine/installation-guard.ps1')
. (Join-Path $PSScriptRoot 'termination-contract.ps1')
$install=[pscustomobject]@{schema='bocchi-local-install/1';stateRoot=(Join-Path $root '.local')}
if((Assert-BocchiInstallation $install $root) -ne $install.stateRoot){throw 'Valid installation rejected'}
foreach($mutation in @('schema','copied','relative')){
  $bad=[pscustomobject]@{schema=$install.schema;stateRoot=$install.stateRoot}
  if($mutation -eq 'schema'){$bad.schema='other'}
  if($mutation -eq 'copied'){$bad.stateRoot=Join-Path (Split-Path $root -Parent) '.local'}
  if($mutation -eq 'relative'){$bad.stateRoot='.local'}
  $rejected=$false;try{$null=Assert-BocchiInstallation $bad $root}catch{$rejected=$true}
  if(-not $rejected){throw ('Accepted '+$mutation)}
}
$source=Get-Content -LiteralPath (Join-Path $root '管理主题.ps1') -Raw -Encoding utf8
foreach($mutation in @('extra','target')){
  $changed=if($mutation -eq 'extra'){$source+"`nStop-Process -Name ChatGPT"}else{$source.Replace('Stop-Process -InputObject $loaderProcess','Stop-Process -Name ChatGPT')}
  $tokens=$null;$errors=$null
  $ast=[Management.Automation.Language.Parser]::ParseInput($changed,[ref]$tokens,[ref]$errors)
  $rejected=$false;try{Assert-BocchiTerminationContract $ast}catch{$rejected=$true}
  if(-not $rejected){throw ('Termination contract missed '+$mutation)}
}
Write-Output 'PASS: installation schema, copied/relative roots and two termination mutations rejected; no processes touched.'

# Execute the real manager prefix in a copy with a foreign stateRoot. The guard
# must throw before a state-directory write, client probe or process operation.
$fixture=Join-Path $root ('.test-output/copied-root-'+[Guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path (Join-Path $fixture 'engine') -Force
foreach($file in @('bootstrap-shell.ps1','common-windows.ps1','config-utf8.ps1','installation-guard.ps1')){
  Copy-Item -LiteralPath (Join-Path $root ('engine/'+$file)) -Destination (Join-Path $fixture ('engine/'+$file))
}
$prefix=$source.Substring(0,$source.IndexOf(". (Join-Path `$engine 'i18n.ps1')"))
$utf8=[Text.UTF8Encoding]::new($true)
[IO.File]::WriteAllText((Join-Path $fixture 'prefix.ps1'),$prefix,$utf8)
[IO.File]::WriteAllText((Join-Path $fixture 'installation.json'),($install|ConvertTo-Json),$utf8)
$rejected=$false;try{& (Join-Path $fixture 'prefix.ps1') -Action Pause}catch{$rejected=$_.Exception.Message -eq 'INSTALLATION_ROOT_MISMATCH'}
if(-not $rejected){throw 'Copied manager did not reject foreign state root before use'}
if(Test-Path -LiteralPath (Join-Path $fixture '.local')){throw 'Copied manager wrote a state directory'}
Write-Output 'PASS: copied real manager prefix refuses foreign stateRoot before state writes or client access.'
