# Validate installation ownership before selecting any writable state path.
function Assert-BocchiInstallation([object]$Install,[string]$Root){
  if(-not $Install -or $Install.schema -cne 'bocchi-local-install/1'){throw 'INSTALLATION_SCHEMA_INVALID'}
  $expected=[IO.Path]::GetFullPath((Join-Path $Root '.local')).TrimEnd('\','/')
  if(-not $Install.stateRoot -or -not [IO.Path]::IsPathRooted([string]$Install.stateRoot) -or
    -not [string]::Equals($expected,[IO.Path]::GetFullPath([string]$Install.stateRoot).TrimEnd('\','/'),[StringComparison]::OrdinalIgnoreCase)){throw 'INSTALLATION_ROOT_MISMATCH'}
  if($Install.root -and -not [string]::Equals([IO.Path]::GetFullPath($Root).TrimEnd('\','/'),[IO.Path]::GetFullPath([string]$Install.root).TrimEnd('\','/'),[StringComparison]::OrdinalIgnoreCase)){throw 'INSTALLATION_ROOT_MISMATCH'}
  # Reject a state directory redirected through a reparse point.
  if(Test-Path -LiteralPath $expected){if((Get-Item -Force -LiteralPath $expected).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'INSTALLATION_STATE_LINK_REJECTED'}}
  return $expected
}
