@echo off
rem Lance WanGP en mode Hermes : serveur MCP sur ce PC seulement (127.0.0.1:7866), sans interface.
rem A poser dans le dossier "scripts" de Wan2GP, a cote de run.bat. Fermer cette fenetre arrete WanGP.
rem Pour retrouver l'interface habituelle : fermer cette fenetre, puis run.bat comme avant.
set "ICI=%~dp0"
rem Un args.txt oublie par une fenetre fermee trop tot : on le retire.
if exist "%ICI%args.txt" findstr /c:"--mcp" "%ICI%args.txt" >nul && del "%ICI%args.txt"
if exist "%ICI%args.txt" ren "%ICI%args.txt" args.txt.avant-hermes
echo --mcp --mcp-transport streamable-http --mcp-host 127.0.0.1 --mcp-port 7866> "%ICI%args.txt"
call "%ICI%run.bat"
del "%ICI%args.txt"
if exist "%ICI%args.txt.avant-hermes" ren "%ICI%args.txt.avant-hermes" args.txt
