#include "installer.h"
#include <string>
#include <thread>
#include <iostream>
#include <map>
#include <windows.h>
#include <commctrl.h>
#include <shobjidl.h>
#include <shlobj.h>
#include <atlbase.h>

#pragma comment(lib,"comctl32.lib")
#pragma comment(linker,"/manifestdependency:\"type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'\"")

#define TD_ERROR_BG_ICON (PCWSTR)65529
#define TD_WARNING_BG_ICON (PCWSTR)65530

std::map<std::string, PCWSTR> lang_zh_cn{
	{"com_title",L"Platinum 安装程序"},
	{"com_next",L"下一步"},
	{"com_ok",L"确定"},
	{"com_cancel",L"取消"},
	{"com_close",L"关闭"},
	{"quit_title",L"退出安装"},
	{"quit_content",L"是否退出 Platinum 安装程序？\n\n如果您退出安装程序，您可以稍后再进行安装。"},
	{"welcome_title",L"欢迎使用 Platinum"},
	{"welcome_content",L"Platinum 是一款轻量、快速、强大的浏览器。\n\n此程序将会在您的电脑上安装 Platinum。"},
	{"dir_title",L"选定安装位置"},
	{"dir_content",L"安装程序将安装 Platinum 到下列文件夹："},
	{"dir_change",L"更改安装目录"},
	{"install_title",L"正在安装 Platinum"},
	{"install_content",L"请稍等..."},
	{"install_error_title",L"安装 Platinum 失败"},
	{"install_error_content",L"启动安装时遇到问题，安装包可能已经损坏。\n\n重新下载安装程序可能可以解决此问题。"},
	{"ok_title",L"安装成功"},
	{"ok_content",L"感谢您安装 Platinum 浏览器。\n\n点击 \"运行\" 立刻试用吧！"},
	{"ok_run",L"运行 Platinum"},
};

std::map<std::string, PCWSTR> lang_en_us{
	{"com_title",L"Platinum Installer"},
	{"com_next",L"Next"},
	{"com_ok",L"OK"},
	{"com_cancel",L"Cancel"},
	{"com_close",L"Close"},
	{"quit_title",L"Quit?"},
	{"quit_content",L"Installation isn't complete.\n\nYou may run the installer again at another time to complete the installation.\n\nAre you sure to quit now?"},
	{"welcome_title",L"Welcome to Platinum Installer"},
	{"welcome_content",L"Platinum is a lightweight, fast, powerful web browser.\nThis will install Platinum on your PC."},
	{"dir_title",L"Choose install location"},
	{"dir_content",L"Installer will install Platinum in the follow folder:"},
	{"dir_change",L"Choose another folder"},
	{"install_title",L"Installing Platinum..."},
	{"install_content",L"Please wait..."},
	{"install_error_title",L"Failed to install Platinum"},
	{"install_error_content",L"Something went wrong.\n\nThe installation package may have been damaged.\n\nPlease try re-downloading the installer."},
	{"ok_title",L"Installation completed"},
	{"ok_content",L"Thanks for using Platinum!\n\nPress \"Run\" to try it now!"},
	{"ok_run",L"Run Platinum"},
};

std::map<std::string, PCWSTR> lang = lang_en_us;

std::wstring selectFolder() {
	std::wstring ret;
	CComPtr<IFileOpenDialog> dialog;
	if (SUCCEEDED(dialog.CoCreateInstance(__uuidof(FileOpenDialog)))) {
		FILEOPENDIALOGOPTIONS options;
		if (SUCCEEDED(dialog->GetOptions(&options))) {
			dialog->SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM);
			if (SUCCEEDED(dialog->Show(NULL))) {
				CComPtr<IShellItem> spResult;
				if (SUCCEEDED(dialog->GetResult(&spResult))) {
					wchar_t* name;
					if (SUCCEEDED(spResult->GetDisplayName(SIGDN_FILESYSPATH, &name))) {
						ret = name;
						CoTaskMemFree(name);
					}
				}
			}
		}
	}
	return ret;
}

void exit() {
	CoUninitialize();
	exit(0);
}

int showWizard(PCWSTR title, PCWSTR content, PCWSTR icon, const TASKDIALOG_BUTTON buttons[], int buttonsCount) {
	HICON hicon = LoadIcon(GetModuleHandle(NULL), MAKEINTRESOURCE(IDI_ICON));

	TASKDIALOGCONFIG config{};
	config.cbSize = sizeof(config);
	config.hInstance = 0;
	config.pszMainInstruction = title;
	config.pszWindowTitle = lang["com_title"];
	config.pszContent = content;
	config.pButtons = buttons;
	config.cButtons = buttonsCount;
	config.dwFlags = TDF_USE_COMMAND_LINKS | TDF_ALLOW_DIALOG_CANCELLATION;
	if (icon != NULL) config.pszMainIcon = icon;
	else {
		config.hMainIcon = hicon;
		config.dwFlags |= TDF_USE_HICON_MAIN;
	}

	int buttonPressed = NULL;
	TaskDialogIndirect(&config, &buttonPressed, NULL, NULL);

	DestroyIcon(hicon);

	return buttonPressed;
}

void showErrorBox(PCWSTR title, PCWSTR content) {
	const TASKDIALOG_BUTTON buttons[] = {
			{IDOK,lang["com_ok"]}
	};
	TASKDIALOGCONFIG config{};
	config.cbSize = sizeof(config);
	config.hInstance = 0;
	config.pszMainIcon = TD_ERROR_BG_ICON;
	config.pszMainInstruction = title;
	config.pszWindowTitle = lang["com_title"];
	config.pszContent = content;
	config.pButtons = buttons;
	config.cButtons = ARRAYSIZE(buttons);
	config.dwFlags = TDF_ALLOW_DIALOG_CANCELLATION;

	TaskDialogIndirect(&config, NULL, NULL, NULL);
}

bool confirmQuit() {
	const TASKDIALOG_BUTTON buttons[] = {
			{IDOK,lang["com_ok"]},
			{IDCANCEL,lang["com_cancel"]}
	};
	TASKDIALOGCONFIG config{};
	config.cbSize = sizeof(config);
	config.hInstance = 0;
	config.pszMainIcon = TD_WARNING_BG_ICON;
	config.pszMainInstruction = lang["quit_title"];
	config.pszWindowTitle = lang["com_title"];
	config.pszContent = lang["quit_content"];
	config.nDefaultButton = IDCANCEL;
	config.pButtons = buttons;
	config.cButtons = ARRAYSIZE(buttons);
	config.dwFlags = TDF_ALLOW_DIALOG_CANCELLATION;

	int buttonPressed = NULL;
	TaskDialogIndirect(&config, &buttonPressed, NULL, NULL);

	if (buttonPressed == IDOK) {
		exit();
		return false;
	}
	else return true;
}

std::wstring getProgramDir() {
	wchar_t path[MAX_PATH];
	GetModuleFileName(NULL, path, MAX_PATH);
	std::wstring pathStr(path);
	return pathStr.substr(0, pathStr.find_last_of('\\'));
}

std::wstring installerCmdLine;
bool installerOK = false;

HRESULT __stdcall Pftaskdialogcallback(
	HWND hWnd,
	UINT Msg,
	WPARAM wParam,
	LPARAM lParam,
	LONG_PTR lpRefData
) {
	if (Msg == TDN_CREATED) {
		SendMessage(hWnd, TDM_ENABLE_BUTTON, IDCANCEL, FALSE);
		SendMessage(hWnd, TDM_SET_PROGRESS_BAR_MARQUEE, TRUE, 10);
		std::thread([hWnd] {
			STARTUPINFO si{};
			si.cb = sizeof(si);
			si.dwFlags = STARTF_USESHOWWINDOW;
			si.wShowWindow = SW_HIDE;
			PROCESS_INFORMATION pi{};

			if (!CreateProcess(NULL, (LPWSTR)installerCmdLine.c_str(), NULL, NULL, TRUE, 0, NULL, NULL, &si, &pi)) {
				showErrorBox(lang["install_error_title"], lang["install_error_content"]);
				exit();
			}
			else {
				WaitForSingleObject(pi.hProcess, INFINITE);
				CloseHandle(pi.hProcess);
				CloseHandle(pi.hThread);

				installerOK = true;
				SendMessage(hWnd, TDM_ENABLE_BUTTON, IDCANCEL, TRUE);
				SendMessage(hWnd, TDM_CLICK_BUTTON, IDCANCEL, NULL);
			}
			}).detach();
	}
	else if (Msg == TDN_BUTTON_CLICKED) {
		if (installerOK) return S_OK;
		else return S_FALSE;
	}

	return 1;
}

int APIENTRY wWinMain(_In_ HINSTANCE hInstance,
	_In_opt_ HINSTANCE hPrevInstance,
	_In_ LPWSTR    lpCmdLine,
	_In_ int       nCmdShow)
{
	HRESULT hr = CoInitialize(NULL);
	if (!SUCCEEDED(hr)) return-1;

	INITCOMMONCONTROLSEX picce{};
	picce.dwSize = sizeof(picce);
	picce.dwICC = ICC_STANDARD_CLASSES;
	InitCommonControlsEx(&picce);

	const TASKDIALOG_BUTTON buttons[] = {
			{100,L"English"},
			{101,L"简体中文"},
			{IDCANCEL,lang["com_cancel"]}
	};
	int buttonPressed = showWizard(L"Language", L"Press select a language:", TD_WARNING_BG_ICON, buttons, ARRAYSIZE(buttons));
	if (buttonPressed == 100);
	else if (buttonPressed == 101) lang = lang_zh_cn;
	else if (buttonPressed == IDCANCEL) exit();

	while (true) {
		const TASKDIALOG_BUTTON buttons[] = {
			{IDOK,lang["com_next"]},
			{IDCANCEL,lang["com_cancel"]}
		};
		int buttonPressed = showWizard(lang["welcome_title"], lang["welcome_content"], NULL, buttons, ARRAYSIZE(buttons));
		if (buttonPressed == IDOK) break;
		else if (buttonPressed == IDCANCEL)  confirmQuit();
	}

	wchar_t path[MAX_PATH];
	ZeroMemory(path, sizeof(path));

	DWORD valueSize = MAX_PATH;
	wchar_t value[MAX_PATH];
	ZeroMemory(value, sizeof(value));

	HKEY hkeyRet;
	if (RegOpenKeyEx(HKEY_LOCAL_MACHINE, L"SOFTWARE\\Clients\\StartMenuInternet\\Platinum\\Capabilities", NULL, KEY_QUERY_VALUE, &hkeyRet) == ERROR_SUCCESS && RegQueryValueEx(hkeyRet, L"ApplicationDir", NULL, NULL, (LPBYTE)&value, &valueSize) == ERROR_SUCCESS) {
		StrCpyN(path, value, MAX_PATH);
	}
	else {
		SHGetSpecialFolderPath(NULL, path, CSIDL_PROGRAM_FILES, TRUE);
		lstrcat(path, L"\\Platinum Browser");
	}

	while (true) {
		const TASKDIALOG_BUTTON buttons[] = {
			{100,lang["dir_change"]},
			{IDOK,lang["com_next"]},
			{IDCANCEL,lang["com_cancel"]}
		};
		int buttonPressed = showWizard(lang["dir_title"], (std::wstring(lang["dir_content"]) + std::wstring(L"\n") + std::wstring(path)).c_str(), TD_INFORMATION_ICON, buttons, ARRAYSIZE(buttons));
		if (buttonPressed == IDOK) break;
		else if (buttonPressed == IDCANCEL) confirmQuit();
		else if (buttonPressed == 100) {
			std::wstring ret = selectFolder();
			if (!ret.empty()) StrCpyN(path, ret.c_str(), MAX_PATH);
		}
	}

	{
		installerCmdLine = (std::wstring(L"\"") + getProgramDir() + std::wstring(L"\\platinum_installer.exe\" /S \"/D=") + std::wstring(path) + std::wstring(L"\""));
		const TASKDIALOG_BUTTON buttons[] = {
			{IDCANCEL,lang["com_cancel"]}
		};
		TASKDIALOGCONFIG config{};
		config.cbSize = sizeof(config);
		config.hInstance = 0;
		config.pfCallback = &Pftaskdialogcallback;
		config.pszMainIcon = TD_INFORMATION_ICON;
		config.pszMainInstruction = lang["install_title"];
		config.pszWindowTitle = lang["com_title"];
		config.pszContent = lang["install_content"];
		config.pButtons = buttons;
		config.cButtons = ARRAYSIZE(buttons);
		config.dwFlags = TDF_SHOW_PROGRESS_BAR | TDF_SHOW_MARQUEE_PROGRESS_BAR;

		TaskDialogIndirect(&config, NULL, NULL, NULL);
	}

	{
		const TASKDIALOG_BUTTON buttons[] = {
						{IDOK,lang["ok_run"]},
						{IDCANCEL,lang["com_close"]}
		};
		int buttonPressed = showWizard(lang["ok_title"], lang["ok_content"], TD_INFORMATION_ICON, buttons, ARRAYSIZE(buttons));
		if (buttonPressed == IDOK) {
			DWORD valueSize = MAX_PATH;
			wchar_t value[MAX_PATH];
			ZeroMemory(value, sizeof(value));

			HKEY hkeyRet;
			if (RegOpenKeyEx(HKEY_LOCAL_MACHINE, L"SOFTWARE\\Clients\\StartMenuInternet\\Platinum\\shell\\open\\command", NULL, KEY_QUERY_VALUE, &hkeyRet) == ERROR_SUCCESS && RegQueryValueEx(hkeyRet, NULL, NULL, NULL, (LPBYTE)&value, &valueSize) == ERROR_SUCCESS) {
				ShellExecute(NULL, L"open", value, L"", NULL, SW_NORMAL);
			}
		}
		else if (buttonPressed == IDCANCEL)
			exit();
	}

	return 0;
}
