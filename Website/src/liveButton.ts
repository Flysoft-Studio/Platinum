export function load() {
    let btns = <NodeListOf<HTMLButtonElement>>document.querySelectorAll(".button");
    for (let i = 0; i < btns.length; i++) {
        const btn = btns.item(i);
        btn.addEventListener("mousemove", (event) => {
            btn.style.setProperty("--shadow-x", event.offsetX + "px");
            btn.style.setProperty("--shadow-y", event.offsetY + "px");
        });
        btn.addEventListener("touchstart", (event) => {
            btn.classList.add("no_hover");
            let rect = btn.getBoundingClientRect();
            btn.style.setProperty("--shadow-x", event.touches[0].clientX - rect.left + "px");
            btn.style.setProperty("--shadow-y", event.touches[0].clientY - rect.top + "px");
        });
    }
}