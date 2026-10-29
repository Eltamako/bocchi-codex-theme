# One catalog is shared by the Windows tools and the renderer. PowerShell 5.1.
function Get-BocchiSystemLanguage {
  if((Get-UICulture).Name -match '^zh(?:-|$)'){return 'zh-CN'}
  return 'en'
}
function Get-BocchiLanguagePreference([string]$StateRoot){
  $fallback=[pscustomobject]@{schema='bocchi-language/1';language='auto';systemLanguage=(Get-BocchiSystemLanguage)}
  $file=Join-Path $StateRoot 'language.json'
  if(-not (Test-Path -LiteralPath $file)){return $fallback}
  try{
    if((Get-Item -LiteralPath $file).Length -gt 4096){return $fallback}
    $value=Get-Content -LiteralPath $file -Raw -Encoding utf8|ConvertFrom-Json
    if($value.schema -cne 'bocchi-language/1' -or @('auto','zh-CN','en') -cnotcontains $value.language){return $fallback}
    return $value
  }catch{return $fallback}
}
function Initialize-BocchiLanguage([string]$Root,[string]$Language='',[string]$StateRoot=''){
  if(-not $StateRoot){$StateRoot=Join-Path $Root '.local'}
  $script:BocchiMessages=Get-Content -LiteralPath (Join-Path $Root 'theme/messages.json') -Raw -Encoding utf8|ConvertFrom-Json
  if(-not $Language){$Language=(Get-BocchiLanguagePreference $StateRoot).language}
  $script:BocchiLanguage=if($Language -eq 'auto'){Get-BocchiSystemLanguage}else{$Language}
}
function Get-BocchiText([string]$Key,[object[]]$Values=@()){
  $text=$script:BocchiMessages.($script:BocchiLanguage).$Key
  if(-not $text){$text=$script:BocchiMessages.en.$Key}
  if(-not $text){return $Key}
  for($i=0;$i -lt $Values.Count;$i++){$text=$text.Replace(('{'+$i+'}'),[string]$Values[$i])}
  return $text
}
function Save-BocchiLanguage([string]$StateRoot,[ValidateSet('auto','zh-CN','en')][string]$Language){
  New-Item -ItemType Directory -Path $StateRoot -Force|Out-Null
  $value=[ordered]@{schema='bocchi-language/1';language=$Language;systemLanguage=(Get-BocchiSystemLanguage)}
  $file=Join-Path $StateRoot 'language.json';$tmp=$file+'.tmp-'+[Guid]::NewGuid().ToString('N')
  try{[IO.File]::WriteAllText($tmp,($value|ConvertTo-Json),[Text.UTF8Encoding]::new($false));Move-Item -LiteralPath $tmp -Destination $file -Force}
  finally{if(Test-Path -LiteralPath $tmp){Remove-Item -LiteralPath $tmp}}
}
function Throw-BocchiError([string]$Key,[object[]]$Values=@(),[string]$Diagnostic=''){
  $exception=[InvalidOperationException]::new($(if($Diagnostic){$Diagnostic}else{$Key}))
  $exception.Data['BocchiMessageKey']=$Key;$exception.Data['BocchiMessageValues']=$Values
  throw $exception
}
function Get-BocchiErrorText([object]$Record){
  $exception=$Record.Exception
  $key=[string]$exception.Data['BocchiMessageKey']
  if(-not $key){
    $key=switch -Regex ($exception.Message){
      '^CODEX_APPX_MODULE_UNAVAILABLE' {'discovery.module';break}
      '^CODEX_APPX_QUERY_DENIED' {'discovery.denied';break}
      '^CODEX_APPX_QUERY_FAILED' {'discovery.query';break}
      '^CODEX_PACKAGE_NOT_REGISTERED' {'discovery.missing';break}
      '^CODEX_DISTRIBUTION_UNSUPPORTED' {'discovery.distribution';break}
      '^CODEX_ARCHITECTURE_UNSUPPORTED' {'discovery.architecture';break}
      '^CODEX_INSTALL_LAYOUT_CHANGED' {'discovery.layout';break}
      '^CODEX_MANIFEST_READ_FAILED' {'discovery.manifest';break}
      'Client version changed' {'manager.updated';break}
      '^Listener is not the theme profile' {'manager.otherThemeProfile';break}
      'Current theme renderer did not confirm' {'manager.waiting';break}
      default {'manager.generic'}
    }
  }
  return (Get-BocchiText -Key $key -Values @($exception.Data['BocchiMessageValues']))
}
