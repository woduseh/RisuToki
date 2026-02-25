; ============================================================
; RisuToki Custom NSIS Installer - MomoTalk Theme
; ============================================================
; This file is included BEFORE MUI2.nsh, so !define values
; here take precedence over MUI defaults.

; --- Color Theme (MomoTalk Pink) ---
; MUI_BGCOLOR affects: header area, Welcome page, Finish page
; Format: RRGGBB (no # prefix)
!define MUI_BGCOLOR "FFF0F3"
!define MUI_TEXTCOLOR "2A323E"

; Progress list colors on InstFiles page: "foreground background"
!define MUI_INSTFILESPAGE_COLORS "2A323E FFF5F7"

; --- Welcome/Finish Page Text ---
!define MUI_WELCOMEPAGE_TITLE "RisuToki 설치"
!define MUI_WELCOMEPAGE_TEXT "RisuToki — RisuAI .charx 파일 에디터를 설치합니다.$\r$\n$\r$\n설치를 계속하려면 '다음'을 클릭하세요."
!define MUI_FINISHPAGE_TITLE "설치 완료"
!define MUI_FINISHPAGE_TEXT "RisuToki가 성공적으로 설치되었습니다.$\r$\n$\r$\n'마침'을 클릭하여 설치를 종료하세요."

; --- Uninstaller Text ---
!define MUI_UNCONFIRMPAGE_TEXT_TOP "RisuToki를 제거합니다."
