document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = form.personalName?.value?.trim();
    const email = form.personalEmail?.value?.trim();
    const phone = form.personalPhone?.value?.trim();
    const password = form.personalPassword?.value ?? "";

    if (!name || !email || !phone || !password) {
      alert("필수 정보를 모두 입력해주세요.");
      return;
    }

    const payload = { name, email, phone, password };

    try {
      const response = await fetch("http://localhost:8080/api/donors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "회원가입에 실패했습니다.");
      }

      alert("회원가입이 완료되었습니다. 로그인 페이지로 이동합니다.");
      window.location.href = "login_view.html";
    } catch (error) {
      console.error(error);
      alert(error.message || "회원가입 처리 중 오류가 발생했습니다.");
    }
  });
});
