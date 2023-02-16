import * as lang from "./language";
import * as com from "./common";
import { registerRipple } from "./ripple";

let app: HTMLElement;
let menuBackdropBox: HTMLElement;
let menus: Array<Menu> = [];

export class Menu {
    public id: string;
    public menu: HTMLElement;
    public backdrop: HTMLElement;
    public focusable: boolean;
    public focus: boolean = false;
    public showed: boolean = false;
    private animateTimer: NodeJS.Timeout;
    constructor(id: string, focusable: boolean = true) {
        menus.push(this);
        this.id = "menu_" + id;
        this.focusable = focusable;
        this.menu = document.querySelector("#" + this.id);
        this.menu.tabIndex = 0;
        this.menu.setAttribute("role", "menu");
        // hides when lost focus
        this.menu.addEventListener("focusin", () => {
            this.focus = true;
        });
        this.menu.addEventListener("focusout", () => {
            this.focus = false;
            // if we use "Tab" key to move focus to items within the menu, the "focusout" event will be emited, and the "focusin" event will be emited next frame
            // if we move focus outside, the  "focusout" event will be emited, but the "focusin" event isn't emited
            requestAnimationFrame(() => {
                if (!this.focus) this.hide();
            });
        });
        this.backdrop = document.createElement("div");
        this.backdrop.classList.add("menu_backdrop");
        menuBackdropBox.appendChild(this.backdrop);
        let section: HTMLElement = <HTMLElement>this.menu.firstElementChild;
        while (section) {
            let element: HTMLElement = <HTMLElement>section.firstElementChild;
            while (element) {
                this.registerEventsForElement(element);
                element = <HTMLElement | null>element.nextElementSibling;
            }
            section = <HTMLElement | null>section.nextElementSibling;
        }
    }
    public registerEventsForElement(element: HTMLElement) {
        let prevent = (event) => {
            if (!this.focusable) event.preventDefault();
        };
        if (!element.classList.contains("menu_item_text"))
            element.setAttribute("role", "menuitem");
        else element.setAttribute("role", "presentation");
        element.addEventListener("mousedown", prevent);
        if (!element.classList.contains("menu_item_advanced")) {
            element.classList.add("stitle");
            element.setAttribute("role", "menuitem");
            element.ariaLabel = lang.decode(
                (<HTMLElement>element.firstElementChild.nextElementSibling).innerHTML
            );
            element.classList.add("ripple");
            registerRipple(element);
        }
        if (!element.classList.contains("no_hide"))
            element.addEventListener("click", () => setTimeout(() => this.hide(), 500));
        element.tabIndex = this.focusable ? 0 : -1;
    }
    public showMenuUnderElement(elementID: string, sections: Array<string> = []) {
        this.showed = false;
        let rect = (<HTMLElement>(
            document.querySelector(elementID)
        )).getBoundingClientRect();
        this.show(
            rect.left,
            document.body.classList.contains("fullscreen") &&
                !document.body.classList.contains("fullscreen_show")
                ? 30
                : rect.bottom + 10,
            sections
        );
    }
    public show(x: number, y: number, sections: Array<string> = []) {
        if (this.showed) return;
        this.showed = true;
        if (this.animateTimer) {
            clearTimeout(this.animateTimer);
            this.animateTimer = null;
        }

        let lastVisibleSection: HTMLElement;
        let section: HTMLElement = <HTMLElement>this.menu.firstElementChild;
        while (section) {
            let visibility =
                sections.length == 0
                    ? true
                    : sections.includes(section.id.replace(this.id + "_", ""));
            // section.dataset.visibility = (visibility) ? "true" : "false";
            com.setElementVisible(section, visibility);
            section.style.borderBottom = null;
            if (visibility) lastVisibleSection = section;
            section = <HTMLElement | null>section.nextElementSibling;
        }
        if (lastVisibleSection) lastVisibleSection.style.borderBottom = "none";

        let rect = this.menu.getBoundingClientRect();
        let clientRect = app.getBoundingClientRect();
        requestAnimationFrame(() => {
            // set the pos of menu and its backdrop
            if (x > clientRect.width - rect.width - 10)
                x = clientRect.width - rect.width - 10;
            if (y > clientRect.height - rect.height - 10)
                y = clientRect.height - rect.height - 10;
            setElePos(this.menu, x, y);
            setElePos(this.backdrop, x, y, rect.width, rect.height);

            this.menu.style.visibility = "visible";

            requestAnimationFrame(() => {
                this.menu.style.opacity = "1";
                this.backdrop.style.opacity = "1";

                if (this.focusable) {
                    this.menu.focus();
                    // focus the first visible button
                    // section = <HTMLElement>this.menu.firstElementChild;
                    // let isFirstBtn = true;
                    // while (section) {
                    //     let visibility = (section.dataset.visibility == "true") ? true : false;
                    //     if (visibility) {
                    //         if (isFirstBtn) {
                    //             let button = <HTMLElement>section.firstElementChild;
                    //             while (button) {
                    //                 if (!button.classList.contains("template")) {
                    //                     setTimeout(() => {
                    //                         button.focus();
                    //                     }, 100);
                    //                     isFirstBtn = false;
                    //                     break;
                    //                 }
                    //                 button = <HTMLElement | null>button.nextElementSibling;
                    //             }
                    //         }
                    //     }
                    //     section = <HTMLElement | null>section.nextElementSibling;
                    // }
                }
            });
        });
    }
    public hide() {
        if (!this.showed) return;
        this.showed = false;
        if (this.animateTimer) clearTimeout(this.animateTimer);
        this.menu.style.opacity = null;
        this.backdrop.style.opacity = null;
        this.animateTimer = setTimeout(() => {
            this.animateTimer = null;
            this.menu.style.visibility = "hidden";
            setElePos(this.menu);
            setElePos(this.backdrop);
        }, 200);
    }
    // Sets menu item's title
    public setItemTitle(item: string, langname: string, args: Array<string>) {
        (<HTMLElement>document.querySelector("#" + this.id + "_" + item)).innerHTML =
            lang.encode(lang.get(langname, args));
    }
}

export function closeAll() {
    for (let i = 0; i < menus.length; i++) {
        if (!menus[i].focusable) menus[i].hide();
    }
}

function setElePos(element: HTMLElement, l?: number, t?: number, w?: number, h?: number) {
    element.style.left = l ? l + "px" : null;
    element.style.top = t ? t + "px" : null;
    element.style.width = w ? w + "px" : null;
    element.style.height = h ? h + "px" : null;
}

window.addEventListener("load", async () => {
    app = <HTMLElement>document.querySelector("#app");
    menuBackdropBox = <HTMLElement>document.querySelector("#menu_backdrop_box");
    app.addEventListener("mouseup", () => closeAll());
    app.addEventListener("keydown", () => closeAll());
});
