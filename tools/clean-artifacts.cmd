@echo off
rem Deletes every stored Actions artifact of this repository (they fill the private-repo
rem storage quota). Releases and their files are NOT touched.
rem Needs the GitHub CLI (https://cli.github.com), signed in once with:  gh auth login
setlocal
set REPO=Jolly-Panda-Works/mini-sumo-3d
where gh >nul 2>nul || (echo The GitHub CLI "gh" is not installed: https://cli.github.com & exit /b 1)
echo Deleting stored artifacts of %REPO% ...
set COUNT=0
for /f %%i in ('gh api "repos/%REPO%/actions/artifacts?per_page=100" --paginate --jq ".artifacts[].id"') do (
  gh api -X DELETE "repos/%REPO%/actions/artifacts/%%i" >nul && set /a COUNT+=1 >nul
)
echo Done. GitHub recalculates the storage use within 6 to 12 hours.
endlocal
