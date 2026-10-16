function Get-BundleVersion([string]$PackageRoot){
  $stream=[IO.File]::OpenRead((Join-Path $PackageRoot 'app\resources\app.asar'))
  try{
    $prefix=New-Object byte[] 16; if($stream.Read($prefix,0,16)-ne 16){throw 'Invalid application archive'}
    $headerSize=[BitConverter]::ToUInt32($prefix,4);$jsonSize=[BitConverter]::ToUInt32($prefix,12)
    if($jsonSize -gt 33554432 -or $headerSize -lt $jsonSize){throw 'Invalid application archive header'}
    $jsonBytes=New-Object byte[] $jsonSize;$read=$stream.Read($jsonBytes,0,$jsonSize)
    if($read -ne $jsonSize){throw 'Application archive read incomplete'}
    $header=[Text.Encoding]::UTF8.GetString($jsonBytes)|ConvertFrom-Json
    $entry=$header.files.'package.json';if($entry.size -gt 1000000 -or $entry.unpacked){throw 'Invalid package metadata'}
    $null=$stream.Seek((8+[long]$headerSize+[long]$entry.offset),[IO.SeekOrigin]::Begin)
    $bytes=New-Object byte[] ([int]$entry.size);if($stream.Read($bytes,0,$bytes.Length)-ne $bytes.Length){throw 'Package metadata read incomplete'}
    return ([Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json).version
  }finally{$stream.Dispose()}
}
