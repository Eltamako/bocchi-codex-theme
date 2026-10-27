function Get-BocchiVerifiedPackageScripts([string]$Root){
  $required=@('入口.ps1','安装.ps1','管理主题.ps1','Language.ps1','engine/app-version.ps1','engine/bootstrap-shell.ps1','engine/common-windows.ps1','engine/config-utf8.ps1','engine/i18n.ps1','engine/install-shortcut.ps1','engine/installation-guard.ps1','engine/package-integrity.ps1','engine/session-guard.ps1','engine/shell-link-unicode.ps1')
  $rootPath=[IO.Path]::GetFullPath($Root).TrimEnd('\','/')
  if((Get-Item -LiteralPath $rootPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'PACKAGE_LINKED_ROOT'}
  $manifest=Join-Path $rootPath 'CHECKSUMS.sha256'
  if((Get-Item -LiteralPath $manifest -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'PACKAGE_LINKED_MANIFEST'}
  $seen=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  $scripts=New-Object 'Collections.Generic.List[object]'
  foreach($line in (Get-Content -LiteralPath $manifest -Encoding utf8)){
    if($line -notmatch '^([a-fA-F0-9]{64})  (.+)$'){throw 'PACKAGE_MANIFEST_INVALID'}
    $expected=$Matches[1];$relative=$Matches[2]
    if($relative -match '(^/|\\|:|[\x00-\x1f]|(^|/)\.\.?(/|$)|[. ](/|$))' -or -not $seen.Add($relative)){throw 'PACKAGE_MANIFEST_PATH_INVALID'}
    $current=$rootPath
    foreach($part in $relative.Split('/')){
      if(-not $part){throw 'PACKAGE_MANIFEST_PATH_INVALID'}
      $current=Join-Path $current $part
      if((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'PACKAGE_LINKED_FILE'}
    }
    if(-not [IO.File]::Exists($current) -or (Get-FileHash -LiteralPath $current -Algorithm SHA256).Hash -ine $expected){throw ('PACKAGE_HASH_MISMATCH: '+$relative)}
    if($required -contains $relative){$scripts.Add([pscustomobject]@{path=$current;hash=$expected;root=$rootPath;relative=$relative})}
  }
  # The startup entry and its verifier must be covered even by a stale manifest.
  foreach($name in $required){
    if(-not $seen.Contains($name)){throw ('PACKAGE_REQUIRED_FILE_MISSING: '+$name)}
  }
  return $scripts.ToArray()
}

function Unblock-BocchiVerifiedPackageScripts([object[]]$Scripts){
  # Revalidate the complete supplied list before removing any source marker.
  foreach($item in $Scripts){
    $current=$item.root
    if((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'PACKAGE_LINKED_ROOT'}
    foreach($part in $item.relative.Split('/')){
      $current=Join-Path $current $part
      if((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'PACKAGE_LINKED_FILE'}
    }
    if((Get-Item -LiteralPath $item.path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'PACKAGE_LINKED_FILE'}
    if((Get-FileHash -LiteralPath $item.path -Algorithm SHA256).Hash -ine $item.hash){throw 'PACKAGE_CHANGED_BEFORE_UNBLOCK'}
  }
  $count=0
  foreach($item in $Scripts){
    if(Get-Item -LiteralPath $item.path -Stream Zone.Identifier -ErrorAction SilentlyContinue){
      Unblock-File -LiteralPath $item.path -ErrorAction Stop
      if(Get-Item -LiteralPath $item.path -Stream Zone.Identifier -ErrorAction SilentlyContinue){throw 'PACKAGE_UNBLOCK_FAILED'}
      $count++
    }
  }
  return $count
}
