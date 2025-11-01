/**
 * Smoothly scrolls to in-page anchors and marks nav links as active.
 * Keeps JS lightweight so the page remains fast while leaving clear
 * extension points for future features (e.g., login modal, live stats).
 */
document.addEventListener("DOMContentLoaded", () => {
    const navLinks = document.querySelectorAll(".nav a[href^='#']");

    function setActive(link) {
        navLinks.forEach((item) => item.classList.remove("is-active"));
        link.classList.add("is-active");
    }

    navLinks.forEach((link) => {
        link.addEventListener("click", (event) => {
            const targetId = link.getAttribute("href")?.substring(1);
            const target = targetId ? document.getElementById(targetId) : null;

            if (target) {
                event.preventDefault();
                setActive(link);
                target.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        });
    });
});
