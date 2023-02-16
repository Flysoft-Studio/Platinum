import { isBackdropSupported } from "../platform/win32";
import * as com from "./common";

export let isAnyDialogShowed = false;

export class Dialog {
    public dialog: HTMLElement;
    public id: string;
    public showed: boolean;
    public focus: boolean = false;
    constructor(id: string) {
        this.id = "dialog_" + id;
        this.dialog = <HTMLElement>document.querySelector("#" + this.id);
        this.dialog.tabIndex = 0;
        this.dialog.setAttribute("role", "dialog");
        // refocus when lost focus
        this.dialog.addEventListener("focusin", () => {
            this.focus = true;
        });
        this.dialog.addEventListener("focusout", () => {
            this.focus = false;
            // if we use "Tab" key to move focus to elements within the dialog, the "focusout" event will be emited, and the "focusin" event will be emited next frame
            // if we move focus outside, the  "focusout" event will be emited, but the "focusin" event isn't emited
            requestAnimationFrame(() => {
                if (!this.focus) this.dialog.focus();
            });
        });
    }
    public show() {
        if (this.showed || isAnyDialogShowed) return;
        this.showed = isAnyDialogShowed = true;
        document.body.classList.add("show_dialog");
        this.dialog.classList.add("dialog_show");
        this.dialog.focus();
        if (!useBackDrop()) com.hideTabbar();
    }
    public hide() {
        if (!this.showed || !isAnyDialogShowed) return;
        this.showed = isAnyDialogShowed = false;
        document.body.classList.remove("show_dialog");
        this.dialog.classList.remove("dialog_show");
        this.dialog.classList.add("dialog_hide");
        setTimeout(
            () =>
                requestAnimationFrame(() => {
                    this.dialog.classList.remove("dialog_hide");
                }),
            100
        );
        this.dialog.blur();
        com.showTabbar();
    }
}

function useBackDrop() {
    let isBlur = com.store.get("appearance.visual.blur") as boolean;
    let useBackDrop =
        (com.store.get("appearance.visual.usebackdrop") as boolean) &&
        isBlur &&
        isBackdropSupported;
    return useBackDrop;
}
