$env:ADV_VER = "20.2"
$PROJECT_PATH = ".\msstore\project.aip"
$DIST_PATH = ".\dist\publish\"
$DIST_FILES = ".\msstore\Build_MSIX_APPXSetupFiles"
Write-Output "AdvancedInstaller $env:ADV_VER builder"
Write-Output "Project File: $PROJECT_PATH"
if ($null -eq $env:ADV_PATH) {
    $env:ADV_PATH = "${env:ProgramFiles(x86)}\Caphyon\Advanced  Installer $env:ADV_VER\bin\x86\AdvancedInstaller.com"
    if ((Test-Path $env:ADV_PATH) -eq $false) {
        $env:ADV_PATH = "${env:ProgramFiles(x86)}\Advanced  Installer\bin\x86\AdvancedInstaller.com"
    }
}
if ((Test-Path $env:ADV_PATH) -eq $false) {
    Write-Error "AdvancedInstaller $env:ADV_VER not found."
}

&"$env:ADV_PATH" /build $PROJECT_PATH
Move-Item "$DIST_FILES\*.*" $DIST_PATH -Force