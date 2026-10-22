# Independent command allowlist. AST matching excludes comments and strings.
function Assert-BocchiTerminationContract($Ast){
  $commands=@($Ast.FindAll({param($n) $n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Stop-Process'},$true))
  $expected=@('Stop-Process -InputObject $loaderProcess -ErrorAction Stop','Stop-Process -InputObject $remainingProcess -ErrorAction Stop')
  if($commands.Count -ne $expected.Count){throw 'Unexpected process termination command count'}
  for($i=0;$i -lt $expected.Count;$i++){
    if(($commands[$i].Extent.Text -replace '\s+',' ').Trim() -cne $expected[$i]){throw 'Unexpected process termination target or options'}
  }
}
