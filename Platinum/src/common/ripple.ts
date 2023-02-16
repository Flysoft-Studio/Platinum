import * as com from "./common";

function getAngle(x1, y1, x2, y2) {
    let x = x2 - x1,
        y = y2 - y1;
    let angle = Math.atan2(y, x) * (180 / Math.PI) + 180;
    return angle;
}

function getDistance(x1, y1, x2, y2) {
    let x = x2 - x1,
        y = y2 - y1;
    let distance = Math.sqrt(x * x + y * y);
    return distance;
}

export function registerRipple(element: HTMLElement) {
    if (!com.store.get("appearance.visual.spotlight") as boolean) return;
    let move = (event: MouseEvent) => {
        if (event.target != element) return;
        let rect = element.getBoundingClientRect();
        // center point x, y
        let cx = rect.left + rect.width / 2,
            cy = rect.top + rect.height / 2;
        let angle = getAngle(cx, cy, event.clientX, event.clientY);
        let distance = getDistance(cx, cy, event.clientX, event.clientY);
        let opacity = 1;
        if (angle >= 315 || angle < 45) opacity = distance / (rect.width / 2);
        else if (angle >= 45 && angle < 135) opacity = distance / (rect.height / 2);
        else if (angle >= 135 && angle < 225) opacity = distance / (rect.width / 2);
        else if (angle >= 225 && angle < 315) opacity = distance / (rect.height / 2);
        opacity *= 2;
        if (opacity > 1) opacity = 1;
        else if (opacity < 0) opacity = 0;
        else if (isNaN(opacity)) opacity = 0;
        element.style.setProperty("--border-degree", (angle + 90).toString() + "deg");
        element.style.setProperty("--border-opacity", opacity.toString());
        element.style.setProperty("--ripple-x", event.offsetX.toString() + "px");
        element.style.setProperty("--ripple-y", event.offsetY.toString() + "px");
    };
    element.dataset.loaded = "true";
    element.addEventListener("mouseover", (event) => {
        element.classList.add("ripple_hover");
        move(event);
    });
    element.addEventListener("mouseout", (event) => {
        element.classList.remove("ripple_hover");
    });
    element.addEventListener("mousemove", (event) => move(event));
    element.addEventListener("touchstart", (event) => {
        if (event.target != element) return;
        let rect = element.getBoundingClientRect();
        element.style.setProperty(
            "--ripple-x",
            (event.touches[0].clientX - rect.left).toString() + "px"
        );
        element.style.setProperty(
            "--ripple-y",
            (event.touches[0].clientY - rect.top).toString() + "px"
        );
    });
    element.addEventListener("mousedown", () => {
        element.classList.add("ripple_active");
        setTimeout(
            () =>
                requestAnimationFrame(() => {
                    if (element) {
                        element.classList.remove("ripple_active");
                        element.classList.remove("ripple_hover");
                    }
                }),
            1000
        );
    });
}

export function registerRipples() {
    if (!com.store.get("appearance.visual.spotlight") as boolean) return;
    var ripples = document.querySelectorAll('.ripple:not([data-loaded="true"])');
    for (var i = 0; i < ripples.length; i++) {
        registerRipple(<HTMLElement>ripples.item(i));
    }
}
