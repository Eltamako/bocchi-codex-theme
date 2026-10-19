# Windows shortcuts can inherit PowerShell 7 module paths while starting Windows PowerShell 5.
# Resolve built-in modules from this host before running any theme operation.
# The inherited module path is restored before launching the client or its helper.
if($PSVersionTable.PSEdition -eq 'Desktop'){
  $bocchiSavedModulePath=$env:PSModulePath
  $bocchiNativeModuleRoot=[IO.Path]::Combine($PSHOME,'Modules')
  try{
    $env:PSModulePath=$bocchiNativeModuleRoot
    foreach($bocchiModuleName in @('Microsoft.PowerShell.Utility','Microsoft.PowerShell.Management','Microsoft.PowerShell.Security','CimCmdlets','Appx','NetTCPIP')){
      $bocchiManifest=[IO.Path]::Combine($bocchiNativeModuleRoot,$bocchiModuleName,($bocchiModuleName+'.psd1'))
      if(-not [IO.File]::Exists($bocchiManifest)){throw ('Required Windows module is missing: '+$bocchiModuleName)}
      foreach($bocchiLoadedModule in @(Get-Module -Name $bocchiModuleName -All)){
        if($bocchiLoadedModule.Path.EndsWith('.psd1',[StringComparison]::OrdinalIgnoreCase) -and -not $bocchiLoadedModule.Path.StartsWith($bocchiNativeModuleRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){
          Remove-Module -ModuleInfo $bocchiLoadedModule -Force -ErrorAction Stop
        }
      }
      Import-Module -Name $bocchiManifest -Force -ErrorAction Stop
    }
  }finally{$env:PSModulePath=$bocchiSavedModulePath}
}
