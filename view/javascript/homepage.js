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

  const accountSlot = document.querySelector("[data-account-slot]");

  if (accountSlot) {
    const renderAccount = () => {
      const session = window.donorSession?.getSession?.();

      if (!session) {
        accountSlot.innerHTML =
          '<a class="btn btn-secondary" href="login_view.html">로그인</a>';
        return;
      }

      accountSlot.innerHTML = `
        <div class="account-summary">
          <span class="account-label">내 정보</span>
          <strong class="account-name">${session.name}님</strong>
          <span class="account-email">${session.email}</span>
          <button type="button" class="btn btn-secondary account-logout" data-action="logout">로그아웃</button>
        </div>
      `;

      const logoutButton = accountSlot.querySelector("[data-action='logout']");
      logoutButton?.addEventListener("click", (event) => {
        event.preventDefault();
        window.donorSession?.clearSession?.();
        alert("로그아웃되었습니다.");
        renderAccount();
      });
    };

    renderAccount();
    document.addEventListener("donor:login", renderAccount);
    document.addEventListener("donor:logout", renderAccount);
  }
});
