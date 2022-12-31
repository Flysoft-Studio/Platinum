#include <iostream>
#include <string>
#include <Windows.h>
#include <dwmapi.h>
#include <TlHelp32.h>
#pragma comment(lib,"dwmapi.lib")

using namespace std;

#define DWMWA_SYSTEMBACKDROP_TYPE 38

typedef BOOL(WINAPI* pNtSuspendOrResumeProcess)(HANDLE);

int main(int argc, char* argv[])
{
    if (argc < 2) return -1;
    string command = string(argv[1]);
    if ((command == "process_suspend" || command == "process_resume") && argc == 3) {
        DWORD pid = stoul(argv[2]);
        HANDLE process = OpenProcess(PROCESS_ALL_ACCESS, NULL, pid);
        const HINSTANCE ntdll = LoadLibrary(L"ntdll.dll");
        if (ntdll != 0) {
            const pNtSuspendOrResumeProcess NtSuspendProcess =
                (pNtSuspendOrResumeProcess)GetProcAddress(ntdll, "NtSuspendProcess");
            const pNtSuspendOrResumeProcess NtResumeProcess =
                (pNtSuspendOrResumeProcess)GetProcAddress(ntdll, "NtResumeProcess");
            if (NtSuspendProcess && NtResumeProcess) {
                if (command == "process_suspend") NtSuspendProcess(process);
                else if (command == "process_resume") NtResumeProcess(process);
            }
        }
        CloseHandle(process);
    }
    else if (command == "set_taskbar_visibility" && argc == 3) {
        bool show = string(argv[2]) == "show";
        HWND taskbar = FindWindow(L"Shell_TrayWnd", NULL);
        ShowWindow(taskbar, (show) ? (SW_SHOWNORMAL) : (SW_HIDE));
    }
    else if (command == "set_window_backdrop" && argc == 4) {
        HWND window = (HWND)stoull(argv[2]);
        int backdropType = stoi(argv[3]);
        MARGINS margins = { -1 };
        DwmExtendFrameIntoClientArea(window, &margins);
        DwmSetWindowAttribute(window, DWMWA_SYSTEMBACKDROP_TYPE, &backdropType, sizeof(int));
    }
    else if (command == "show_layout_panel" && argc == 2) {
        keybd_event(VK_LWIN, NULL, 0, 0);
        keybd_event(0x5A, NULL, 0, 0);
        keybd_event(0x5A, NULL, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_LWIN, NULL, KEYEVENTF_KEYUP, 0);
    }
    else return -1;
    return 0;
}