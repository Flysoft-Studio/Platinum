let secret = "!<Secret>!";
let showButtons = ["!<Buttons>!"];
(window as any).platinum.injectStyleSheet();
(<HTMLButtonElement>document.querySelector("#btn_game")).addEventListener("click", () => {
    (window as any).platinum.errorPageController.game(secret);
});
(<HTMLButtonElement>document.querySelector("#btn_proceed_to_unsafe_page")).addEventListener("click", () => {
    (window as any).platinum.errorPageController.proceedToUnsafePage(secret);
});
for (let i = 0; i < showButtons.length; i++) {
    (<HTMLButtonElement>document.querySelector("#btn_" + showButtons[i])).style.display = "block";
}