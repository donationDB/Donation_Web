document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");
  if (!form) return;

  const passwordInput = form.companyPassword;
  const passwordConfirmInput = form.companyPasswordConfirm;

  const setPasswordErrorState = (isError) => {
    if (!passwordConfirmInput) return;
    passwordConfirmInput.classList.toggle("input-error", isError);
  };

  const checkPasswordMismatch = () => {
    const passwordValue = passwordInput?.value ?? "";
    const confirmValue = passwordConfirmInput?.value ?? "";
    const mismatch =
      passwordValue.length > 0 &&
      confirmValue.length > 0 &&
      passwordValue !== confirmValue;
    setPasswordErrorState(mismatch);
    return mismatch;
  };

  passwordInput?.addEventListener("input", checkPasswordMismatch);
  passwordConfirmInput?.addEventListener("input", checkPasswordMismatch);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = form.companyEmail?.value?.trim();
    const password = form.companyPassword?.value ?? "";
    const passwordConfirm = form.companyPasswordConfirm?.value ?? "";
    const companyName = form.companyName?.value?.trim();
    const companyAddress = form.companyAddress?.value?.trim();
    const companyPhone = form.companyPhone?.value?.trim();
    const businessNo = form.companyRegistration?.value?.trim();

    if (!email || !password || !passwordConfirm || !companyName) {
      alert("이메일, 비밀번호, 비밀번호 확인, 단체 이름을 모두 입력해주세요.");
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      alert("올바른 이메일 주소를 입력해주세요.");
      return;
    }

    if (password !== passwordConfirm) {
      setPasswordErrorState(true);
      alert("비밀번호와 비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    const payload = {
      email,
      password,
      companyName,
      companyAddress,
      companyPhone,
      businessNo,
    };

    try {
      const response = await fetch("http://localhost:8080/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "회원가입에 실패했습니다.");
      }

      alert("기업 회원가입이 완료되었습니다. 로그인 페이지로 이동합니다.");
      window.location.href = "login_view.html";
    } catch (error) {
      console.error(error);
      alert(error.message || "회원가입 처리 중 오류가 발생했습니다.");
    }
  });
});
