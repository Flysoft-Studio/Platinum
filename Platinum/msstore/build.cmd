@echo off
set ADV_VER=19.1
set ADV_PATH=%ProgramFiles(x86)%\Caphyon\Advanced Installer %ADV_VER%\bin\x86\AdvancedInstaller.com
set PROJECT_PATH=%~dp0project.aip
set DIST_PATH=%~dp0..\dist
set DIST_FILES=%~dp0Build_MSIX_APPXSetupFiles
echo AdvancedInstaller %ADV_VER% builder
echo Project File: %PROJECT_PATH%
if not exist "%ADV_PATH%" (
    echo Error: AdvancedInstaller %ADV_VER% not found.
    goto:eof
)
if not exist "%PROJECT_PATH%" (
    echo Error: Project File %PROJECT_PATH% not found.
    goto:eof
)
"%ADV_PATH%" /build "%PROJECT_PATH%"
move /y "%DIST_FILES%\*.*" "%DIST_PATH%"