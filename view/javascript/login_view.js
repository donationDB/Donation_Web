document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");
  if (!form) return;

  const stored = window.donorSession?.getSession?.();
  if (stored) {
    window.location.replace("homepage.html");
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = form.loginEmail?.value?.trim();
    const password = form.loginPassword?.value ?? "";

    if (!email || !password) {
      alert("이메일과 비밀번호를 입력해주세요.");
      return;
    }

    try {
      const response = await fetch("http://localhost:8080/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "로그인에 실패했습니다.");
      }

      const donor = await response.json();
      window.donorSession?.setSession?.(donor);
      alert(`${donor.name}님 환영합니다!`);
      window.location.href = "homepage.html";
    } catch (error) {
      console.error(error);
      alert(error.message || "로그인 처리 중 오류가 발생했습니다.");
    }
  });
});
