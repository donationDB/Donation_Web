document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");
  if (!form) return;

  const BASE_SURVEY_DONE_KEY = "donorSurveyCompleted";
  const BASE_SURVEY_PENDING_KEY = "donorSurveyPending";
  const getSurveyKeys = (account) => {
    const id = account?.donor_id;
    return {
      doneKey: id ? `${BASE_SURVEY_DONE_KEY}:${id}` : BASE_SURVEY_DONE_KEY,
      pendingKey: id ? `${BASE_SURVEY_PENDING_KEY}:${id}` : BASE_SURVEY_PENDING_KEY,
    };
  };

  let pendingRedirect = "homepage.html";
  let surveyTriggeredByLogin = false;
  let currentAccount = null;
  const stored = window.donorSession?.getSession?.();
  if (stored) {
    let redirect = "homepage.html";
    if (stored.role === "admin") redirect = "admin_dashboard.html";
    if (stored.role === "company") redirect = "program_apply.html";
    window.location.replace(redirect);
    return;
  }

  document.querySelectorAll(".toggle-password").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.getAttribute("data-target");
      const input = targetId ? document.getElementById(targetId) : null;
      if (!input) return;
      const nextType = input.getAttribute("type") === "password" ? "text" : "password";
      input.setAttribute("type", nextType);
    });
  });

  const surveyModal = document.querySelector("[data-role='onboarding-survey']");
  const surveyForm = document.getElementById("onboarding-survey-form");
  const surveySubmitButton = surveyForm?.querySelector("button[type='submit']");
  const markSurveyDone = () => {
    const { doneKey, pendingKey } = getSurveyKeys(currentAccount);
    localStorage.setItem(doneKey, "1");
    localStorage.removeItem(pendingKey);
  };
  const finalizeLogin = () => {
    window.location.replace(pendingRedirect);
  };

  function collectSurveyPayload(form) {
    if (!form) return {};
    const categories = Array.from(form.querySelectorAll("input[name='preferredCategory']:checked")).map(
      (input) => input.value
    );
    const subscription = form.querySelector("input[name='subscriptionType']:checked")?.value || "ANY";
    const regions = Array.from(form.querySelectorAll("input[name='preferredRegion']:checked")).map(
      (input) => input.value
    );
    const emergencyRaw = form.querySelector("input[name='emergencyPreference']:checked")?.value;
    const preferEmergency = emergencyRaw === "1" || emergencyRaw === "YES" || emergencyRaw === "true";
    const keyword = form.querySelector("textarea[name='currentFocusKeyword']")?.value?.trim() || "";

    return {
      donor_id: currentAccount?.donor_id ?? null,
      preferred_categories: categories,
      subscription_type: subscription,
      preferred_regions: regions,
      prefer_emergency: preferEmergency,
      focus_keyword: keyword,
      limit: 10,
    };
  }

  async function submitSurvey(form) {
    const payload = collectSurveyPayload(form);
    try {
      if (surveySubmitButton) surveySubmitButton.disabled = true;
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "설문 응답을 전송하지 못했습니다.");
      }
      return data;
    } finally {
      if (surveySubmitButton) surveySubmitButton.disabled = false;
    }
  }
  const toggleSurveyModal = (isOpen) => {
    if (!surveyModal) return;
    surveyModal.classList.toggle("is-open", isOpen);
    surveyModal.setAttribute("aria-hidden", isOpen ? "false" : "true");
  };

  document.querySelectorAll("[data-action='open-survey']").forEach((button) => {
    button.addEventListener("click", () => {
      surveyTriggeredByLogin = false;
      toggleSurveyModal(true);
    });
  });

  document.querySelectorAll("[data-action='close-survey']").forEach((button) => {
    button.addEventListener("click", () => {
      if (surveyTriggeredByLogin) {
        markSurveyDone();
        toggleSurveyModal(false);
        finalizeLogin();
      } else {
        toggleSurveyModal(false);
      }
    });
  });

  const skipSurvey = document.querySelector("[data-action='skip-survey']");
  if (skipSurvey) {
    skipSurvey.addEventListener("click", () => {
      if (surveyTriggeredByLogin) {
        markSurveyDone();
        toggleSurveyModal(false);
        finalizeLogin();
      } else {
        toggleSurveyModal(false);
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (surveyTriggeredByLogin) {
        markSurveyDone();
        toggleSurveyModal(false);
        finalizeLogin();
      } else {
        toggleSurveyModal(false);
      }
    }
  });

  surveyForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitSurvey(surveyForm)
      .catch((error) => {
        console.error(error);
        alert(error.message || "설문 응답 전송 중 오류가 발생했습니다.");
      })
      .finally(() => {
        markSurveyDone();
        toggleSurveyModal(false);
        finalizeLogin();
      });
  });

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

      const account = await response.json();
      window.donorSession?.setSession?.(account);

      if (account.role === "admin") {
        alert("관리자님 환영합니다!");
        window.location.replace("admin_dashboard.html");
        return;
      }

      if (account.role === "company") {
        alert(`${account.company_name ?? account.email} 파트너님 환영합니다!`);
        window.location.replace("program_apply.html");
        return;
      }

      // 첫 로그인 설문을 홈에서 노출하기 위해 플래그만 남기고 바로 이동
      currentAccount = account;
      const { doneKey, pendingKey } = getSurveyKeys(account);
      pendingRedirect = "homepage.html";
      const surveyDone = localStorage.getItem(doneKey) === "1";
      if (!surveyDone) localStorage.setItem(pendingKey, "1");
      alert(`${account.name ?? account.email}님 환영합니다!`);
      window.location.replace(pendingRedirect);
    } catch (error) {
      console.error(error);
      alert(error.message || "로그인 처리 중 오류가 발생했습니다.");
    }
  });
});
