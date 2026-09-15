; GitOdile hooks for the NSIS installer Tauri generates.
;
; Tauri `!include`s this file into its installer.nsi, so the template's defines
; (${PRODUCTNAME}, ${MAINBINARYNAME}, $INSTDIR, $AppStartMenuFolder) and the
; macros from its utils.nsh (IsShortcutTarget, SetLnkAppUserModelId) are in
; scope. Only the hooks Tauri documents are defined here.
;
; Why this exists: the shortcuts Tauri creates carry no icon location, so
; Explorer resolves their icon from the target executable. The passive
; installer the updater runs overwrites that executable in place, and any
; shell refresh that lands while the file is missing or half-written caches a
; blank icon for the shortcut, which then sticks. After every install we
; therefore (1) rewrite our own shortcuts with an explicit icon location and
; (2) tell the shell that anything it cached for those paths is stale.

!define GITODILE_SHCNE_UPDATEITEM 0x00002000
!define GITODILE_SHCNE_ASSOCCHANGED 0x08000000
!define GITODILE_SHCNF_PATHW 0x0005
!define GITODILE_SHCNF_FLUSH 0x1000

; Re-creates `shortcut` when it exists and already points at the installed
; executable. The shortcut keeps its target and AppUserModelId (so taskbar
; grouping and pins are unaffected) and gains an explicit icon: the executable
; itself, icon index 0. Shortcuts the user removed are left removed.
!macro GITODILE_REFRESH_SHORTCUT shortcut
  ${If} ${FileExists} "${shortcut}"
    !insertmacro IsShortcutTarget "${shortcut}" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      CreateShortcut "${shortcut}" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
      !insertmacro SetLnkAppUserModelId "${shortcut}"
      System::Call 'shell32::SHChangeNotify(i ${GITODILE_SHCNE_UPDATEITEM}, i ${GITODILE_SHCNF_PATHW}|${GITODILE_SHCNF_FLUSH}, w "${shortcut}", p 0)'
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Runs after Tauri copied the executable and created the start-menu
  ; shortcut, and (for passive/silent runs, i.e. updates) the desktop one. On an
  ; interactive first install the desktop shortcut is created later by the
  ; finish page and picks up the explicit icon on the first update instead.
  !insertmacro GITODILE_REFRESH_SHORTCUT "$DESKTOP\${PRODUCTNAME}.lnk"
  !insertmacro GITODILE_REFRESH_SHORTCUT "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
  !insertmacro GITODILE_REFRESH_SHORTCUT "$SMPROGRAMS\${PRODUCTNAME}.lnk"

  ; The executable was just replaced in place. Ask the shell to drop the icons
  ; it extracted from the old file so the desktop, Start menu and taskbar
  ; re-read them instead of keeping whatever was cached mid-replacement.
  System::Call 'shell32::SHChangeNotify(i ${GITODILE_SHCNE_ASSOCCHANGED}, i ${GITODILE_SHCNF_FLUSH}, p 0, p 0)'
!macroend
