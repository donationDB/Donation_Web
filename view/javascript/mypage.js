const API_BASE = "http://localhost:8080/api";

function formatCurrency(value = 0) {
  return Number(value || 0).toLocaleString("ko-KR") + "원";
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR");
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString("ko-KR")} ${date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
}

function formatCycle(value = "") {
  const normalized = value.toString().toUpperCase();
  if (normalized === "YEARLY" || normalized === "ANNUAL") return "연간 정기후원";
  if (normalized === "MONTHLY") return "월간 정기후원";
  return "정기후원";
}

function renderSummary(summary = {}) {
  const totalEl = document.querySelector("[data-role='total-amount']");
  const countEl = document.querySelector("[data-role='total-count']");
  const subTotalEl = document.querySelector("[data-role='subscription-total']");
  const subCountEl = document.querySelector("[data-role='subscription-count']");
  if (totalEl) totalEl.textContent = formatCurrency(summary.total_amount || 0);
  if (countEl) countEl.textContent = `${summary.donation_count || 0}회`;
  if (subTotalEl) subTotalEl.textContent = formatCurrency(summary.subscription_total_amount || 0);
  if (subCountEl) subCountEl.textContent = `${summary.subscription_count || 0}건`;
}

function renderDonations(list = []) {
  const container = document.querySelector("[data-role='donation-list']");
  if (!container) return;

  if (!Array.isArray(list) || !list.length) {
    container.innerHTML = '<p class="empty">기부 내역이 없습니다.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  list.forEach((item) => {
    const row = document.createElement("article");
    row.className = "donation-row";
    row.dataset.donationRow = "true";

    const programTitle = item?.program?.program_name || item?.program?.title || "알 수 없는 프로그램";
    const programStatus = item?.program?.status_label || item?.program?.status || "";
    const programStatusCode = item?.program?.status?.toString?.().toLowerCase?.() ?? "";
    const programId = item?.program?.program_id ?? item?.program?.id ?? null;
    const donatedAt = item.donated_at ? new Date(item.donated_at) : null;
    const donatedText = donatedAt ? donatedAt.toLocaleDateString("ko-KR") : "-";

    if (programId) {
      row.dataset.programId = programId;
    }
    if (programStatusCode) {
      row.dataset.programStatus = programStatusCode;
    }

    row.innerHTML = `
      <div>
        <div class="donation-title">${programTitle}</div>
        <div class="donation-meta">${donatedText}</div>
      </div>
      <div>
        <span class="donation-amount">${formatCurrency(item.amount)}</span>
        <div class="donation-meta">${item.message || ""}</div>
      </div>
      <div>
        <span class="badge">${programStatus}</span>
      </div>
      <div class="donation-meta">
        시작: ${formatDate(item.program?.start_date)}<br/>
        종료: ${formatDate(item.program?.end_date)}
      </div>
    `;

    if (programStatusCode === "finished") {
      row.classList.add("donation-row--clickable");
      const hint = document.createElement("div");
      hint.className = "donation-row__hint";
      hint.textContent = "종료된 프로그램 · 영수증 보기";
      const firstColumn = row.querySelector("div");
      firstColumn?.appendChild(hint);
    }

    fragment.appendChild(row);
  });

  container.replaceChildren(fragment);
}

function renderSubscriptions(list = []) {
  const container = document.querySelector("[data-role='subscription-list']");
  if (!container) return;

  if (!Array.isArray(list) || !list.length) {
    container.innerHTML = '<p class="empty">정기후원 내역이 없습니다.</p>';
    return;
  }

  const statusClassMap = {
    ACTIVE: "status-pill--active",
    RUNNING: "status-pill--active",
    PAUSED: "status-pill--paused",
    SUSPENDED: "status-pill--paused",
    CANCELLED: "status-pill--cancelled",
    CANCELED: "status-pill--cancelled",
  };

  const statusLabelMap = {
    ACTIVE: "진행중",
    RUNNING: "진행중",
    PAUSED: "일시중지",
    SUSPENDED: "일시중지",
    CANCELLED: "해지",
    CANCELED: "해지",
  };

  const fragment = document.createDocumentFragment();
  list.forEach((item) => {
    const row = document.createElement("article");
    row.className = "subscription-row";

    const programTitle = item?.program?.program_name || item?.program?.title || "알 수 없는 프로그램";
    const programStatus = item?.program?.status_label || item?.program?.status || "-";
    const cycleText = formatCycle(item.cycle);
    const startText = formatDate(item.start_date);
    const normalizedStatus = (item.status || "").toString().toUpperCase();
    const statusClass = statusClassMap[normalizedStatus] || "";
    const statusLabel = statusLabelMap[normalizedStatus] || "진행 상태 미확인";
    const programDuration =
      `${formatDate(item.program?.start_date)} ~ ${formatDate(item.program?.end_date)}`.replace(/ ~ -$/, "");

    row.innerHTML = `
      <div>
        <div class="subscription-title">${programTitle}</div>
        <div class="subscription-meta">시작일 ${startText}</div>
        <div class="subscription-meta">${programDuration}</div>
      </div>
      <div>
        <span class="subscription-amount">${formatCurrency(item.amount)}</span>
        <div class="subscription-meta">${cycleText}</div>
      </div>
      <div>
        <span class="status-pill ${statusClass}">${statusLabel}</span>
      </div>
      <div class="subscription-meta">프로그램 상태: ${programStatus}</div>
    `;

    fragment.appendChild(row);
  });

  container.replaceChildren(fragment);
}

async function loadSummary(donorId) {
  const response = await fetch(`${API_BASE}/donors/${donorId}/summary`);
  if (!response.ok) throw new Error("기부 현황을 불러오지 못했습니다.");
  return response.json();
}

async function verifyPassword(donorId, password) {
  const response = await fetch(`${API_BASE}/donors/${donorId}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "비밀번호가 올바르지 않습니다.");
  }
  return response.json();
}

async function updateProfile(donorId, payload) {
  const response = await fetch(`${API_BASE}/donors/${donorId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "정보를 수정하지 못했습니다.");
  }
  return response.json();
}

document.addEventListener("DOMContentLoaded", async () => {
  const session = window.donorSession?.getSession?.();
  if (!session) {
    window.location.replace("login_view.html");
    return;
  }

  if (session.role !== "donor") {
    alert("후원자만 접근할 수 있습니다.");
    window.location.replace("homepage.html");
    return;
  }

  const donorId = session.donor_id;
  const profileDetail = document.querySelector("[data-role='profile-detail']");
  const profileForm = document.querySelector("[data-role='profile-form']");
  const statusEl = document.querySelector("[data-role='profile-status']");
  const verifyPanel = document.querySelector("[data-role='verify-panel']");
  const verifyForm = document.querySelector("[data-role='verify-form']");
  const verifyStatus = document.querySelector("[data-role='verify-status']");
  const editPanel = document.querySelector("[data-role='edit-panel']");
  const receiptModal = document.querySelector("[data-role='receipt-modal']");
  const receiptTitle = document.querySelector("[data-role='receipt-title']");
  const receiptSummary = document.querySelector("[data-role='receipt-summary']");
  const receiptExpenses = document.querySelector("[data-role='receipt-expenses']");
  const donationList = document.querySelector("[data-role='donation-list']");
  const subscriptionList = document.querySelector("[data-role='subscription-list']");
  const surveyModal = document.querySelector("[data-role='mypage-survey']");
  const surveyForm = document.getElementById("mypage-survey-form");
  const recommendList = document.querySelector("[data-role='mypage-recommend-list']");
  const recommendEmpty = document.querySelector("[data-role='mypage-recommend-empty']");
  const recommendKey = donorId ? `donorRecommendations:${donorId}` : null;
  let verifiedPassword = null;

   // 필수 요소가 없으면 초기화 중단
  if (!profileDetail || !profileForm) {
    console.error("마이페이지 UI를 찾을 수 없습니다.");
    return;
  }

  const renderRecommendations = (items = []) => {
    if (!recommendList) return;
    recommendList.innerHTML = "";
    if (!Array.isArray(items) || !items.length) {
      recommendEmpty?.removeAttribute("hidden");
      return;
    }
    recommendEmpty?.setAttribute("hidden", "true");
    const frag = document.createDocumentFragment();
    items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "recommend-card";
      card.innerHTML = `
        <h4>${item.title || "추천 프로그램"}</h4>
        <div class="recommend-card__meta">
          <span class="recommend-card__badge">카테고리: ${item.category || "-"}</span>
          <span class="recommend-card__badge">지역: ${item.place || "-"}</span>
          <span class="recommend-card__badge">유형: ${item.funding_type || "-"}</span>
          <span class="recommend-card__badge">긴급: ${item.emergency ? "예" : "아니오"}</span>
          <span class="recommend-card__badge">점수: ${item.score ?? "-"}</span>
        </div>
        <p class="recommend-card__snippet">${item.snippet || ""}</p>
      `;
      frag.appendChild(card);
    });
    recommendList.appendChild(frag);
  };

  const saveRecommendations = (items = []) => {
    if (!recommendKey) return;
    try {
      localStorage.setItem(
        recommendKey,
        JSON.stringify({ items, updated_at: new Date().toISOString() })
      );
    } catch (e) {
      console.error("추천 결과 저장 실패", e);
    }
  };

  const loadRecommendations = () => {
    if (!recommendKey) return null;
    try {
      const raw = localStorage.getItem(recommendKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  };

  const buildFallbackRecommendations = (payload = {}) => {
    const cats = payload.preferred_categories || ["추천 프로그램"];
    const regions = payload.preferred_regions || ["전국"];
    const emergency = !!payload.prefer_emergency;
    const sub = (payload.subscription_type || "").toUpperCase();
    const funding = sub === "RECURRING" || sub === "ANY" ? "SUBSCRIPTION" : "ONE_TIME";
    const keyword = payload.focus_keyword || "";
    const items = cats.map((cat, idx) => ({
      program_id: idx + 1,
      title: `${cat} 추천 프로그램`,
      category: cat,
      place: regions[Math.min(regions.length - 1, idx)] || regions[0] || "전국",
      emergency,
      funding_type: funding,
      score: 0.5,
      snippet: `임시 추천 · 지역: ${regions[0] || "전국"} · 키워드: ${keyword || "없음"}`,
    }));
    return items.length ? items : [{
      program_id: 1,
      title: "추천 프로그램",
      category: "추천",
      place: regions[0] || "전국",
      emergency,
      funding_type: funding,
      score: 0.5,
      snippet: `키워드: ${keyword || "없음"}`,
    }];
  };

  const setFormValues = (data = {}) => {
    if (!profileForm) return;
    profileForm.name.value = data.name || "";
    profileForm.phone.value = data.phone || "";
    profileForm.email.value = data.email || "";
  };

  const fillDetail = (data = {}) => {
    const setText = (selector, value) => {
      const el = profileDetail.querySelector(selector);
      if (el) el.textContent = value;
    };
    setText("[data-field='name']", data.name || "-");
    setText("[data-field='email']", data.email || "-");
    setText("[data-field='phone']", data.phone || "-");
    setFormValues(data);
  };

  fillDetail(session);

  document.querySelector("[data-action='logout']")?.addEventListener("click", (event) => {
    event.preventDefault();
    window.donorSession?.clearSession?.();
    window.location.replace("homepage.html");
  });

  try {
    const data = await loadSummary(donorId);
    if (data.donor) {
      fillDetail(data.donor);
      window.donorSession?.setSession?.({ ...session, ...data.donor });
    }
    renderSummary(data.summary || {});
    renderDonations(data.donations || []);
    renderSubscriptions(data.subscriptions || []);
  } catch (error) {
    console.error(error);
    renderDonations([]);
    renderSubscriptions([]);
    renderSummary({ total_amount: 0, donation_count: 0 });
  }

  document.querySelector("[data-action='start-edit']")?.addEventListener("click", () => {
    verifyPanel?.removeAttribute("hidden");
    editPanel?.setAttribute("hidden", "true");
    verifiedPassword = null;
    if (verifyStatus) verifyStatus.textContent = "";
    if (verifyForm?.password) verifyForm.password.value = "";
    verifyPanel?.scrollIntoView({ behavior: "smooth" });
  });

  verifyForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!verifyForm?.password?.value.trim()) {
      if (verifyStatus) verifyStatus.textContent = "비밀번호를 입력해주세요.";
      return;
    }
    if (verifyStatus) verifyStatus.textContent = "확인 중...";
    try {
      await verifyPassword(donorId, verifyForm.password.value.trim());
      verifiedPassword = verifyForm.password.value.trim();
      if (verifyStatus) verifyStatus.textContent = "확인 완료. 수정이 가능합니다.";
      editPanel?.removeAttribute("hidden");
      verifyPanel?.setAttribute("hidden", "true");
      editPanel?.scrollIntoView({ behavior: "smooth" });
    } catch (error) {
      console.error(error);
      if (verifyStatus) verifyStatus.textContent = error.message || "비밀번호가 올바르지 않습니다.";
    }
  });

  profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (profileForm.newPassword.value.trim() && profileForm.newPasswordConfirm.value.trim()) {
      if (profileForm.newPassword.value.trim() !== profileForm.newPasswordConfirm.value.trim()) {
        if (statusEl) statusEl.textContent = "새 비밀번호가 일치하지 않습니다.";
        return;
      }
    }

    const payload = {
      name: profileForm.name.value.trim(),
      phone: profileForm.phone.value.trim(),
    };

    if (verifiedPassword) {
      payload.currentPassword = verifiedPassword;
    }

    if (profileForm.newPassword.value.trim()) {
      payload.newPassword = profileForm.newPassword.value.trim();
    }

    if (statusEl) statusEl.textContent = "저장 중...";
    try {
      const updated = await updateProfile(donorId, payload);
      window.donorSession?.setSession?.({ ...session, ...updated });
      fillDetail(updated);
      if (statusEl) statusEl.textContent = "저장 완료!";
      profileForm.newPassword.value = "";
      verifiedPassword = null;
      editPanel?.setAttribute("hidden", "true");
    } catch (error) {
      console.error(error);
      if (statusEl) statusEl.textContent = error.message || "저장 실패";
    }
  });

  function closeReceiptModal() {
    if (receiptModal) {
      receiptModal.classList.remove("is-open");
      receiptModal.setAttribute("aria-hidden", "true");
    }
  }

  function openReceiptModal() {
    if (receiptModal) {
      receiptModal.classList.add("is-open");
      receiptModal.setAttribute("aria-hidden", "false");
    }
  }

  function renderReceiptModal(receipt = {}) {
    if (!receiptSummary || !receiptExpenses) return;
    const programName = receipt.program?.program_name || receipt.program?.title || "프로그램";
    const organization = receipt.program?.organization || "-";
    const endDate = formatDate(receipt.program?.end_date);
    const startDate = formatDate(receipt.program?.start_date);

    const donatedTotal = formatCurrency(receipt.totals?.donated || receipt.donation?.total_amount || 0);
    const spentTotal = formatCurrency(receipt.totals?.spent || 0);
    const remaining = formatCurrency(receipt.totals?.remaining || 0);

    if (receiptTitle) {
      receiptTitle.textContent = `${programName} 영수증`;
    }

    receiptSummary.innerHTML = `
      <div class="receipt-summary__grid">
        <div class="summary-item">
          <span class="label">프로그램</span>
          <span class="value">${programName}</span>
        </div>
        <div class="summary-item">
          <span class="label">주관</span>
          <span class="value">${organization}</span>
        </div>
        <div class="summary-item">
          <span class="label">기간</span>
          <span class="value">${startDate} ~ ${endDate}</span>
        </div>
      </div>
      <div class="receipt-totals">
        <div class="total-row"><span>총 후원금</span><span>${donatedTotal}</span></div>
        <div class="total-row"><span>지출 합계</span><span>${spentTotal}</span></div>
        <div class="total-row"><span>잔액</span><span class="${receipt.totals?.remaining < 0 ? "negative" : ""}">${remaining}</span></div>
      </div>
    `;

    const expenses = Array.isArray(receipt.expenses) ? receipt.expenses : [];
    if (!expenses.length) {
      receiptExpenses.innerHTML = '<p class="empty">등록된 영수증이 없습니다.</p>';
      return;
    }

    const rows = expenses
      .map(
        (item) => `
        <tr>
          <td>${formatDate(item.expense_date)}</td>
          <td>${item.vendor}</td>
          <td>${item.description || "-"}</td>
          <td data-align="right">${formatCurrency(item.amount)}</td>
        </tr>
      `
      )
      .join("");

    receiptExpenses.innerHTML = `
      <table class="expense-table">
        <thead>
          <tr>
            <th scope="col">지출일</th>
            <th scope="col">사용처</th>
            <th scope="col">내역</th>
            <th scope="col">금액</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  async function loadReceipt(programId) {
    if (!programId) return;
    try {
      const response = await fetch(`${API_BASE}/donors/${donorId}/programs/${programId}/receipt`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "영수증을 불러오지 못했습니다.");
      }
      const receipt = await response.json();
      renderReceiptModal(receipt);
      openReceiptModal();
    } catch (error) {
      console.error(error);
      alert(error.message || "영수증을 불러오지 못했습니다.");
    }
  }

  donationList?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-donation-row]");
    if (!row) return;

    const status = row.dataset.programStatus?.toLowerCase?.() || "";
    if (status !== "finished") return;

    const programId = row.dataset.programId;
    if (!programId) return;

    loadReceipt(programId);
  });

  const toggleSurveyModal = (isOpen) => {
    if (!surveyModal) return;
    surveyModal.classList.toggle("is-open", isOpen);
    surveyModal.setAttribute("aria-hidden", isOpen ? "false" : "true");
  };

  document.querySelectorAll("[data-action='open-mypage-survey']").forEach((button) => {
    button.addEventListener("click", () => toggleSurveyModal(true));
  });

  document.querySelectorAll("[data-action='close-mypage-survey']").forEach((button) => {
    button.addEventListener("click", () => toggleSurveyModal(false));
  });

  document.querySelector("[data-action='skip-mypage-survey']")?.addEventListener("click", () => {
    toggleSurveyModal(false);
  });

  const collectSurveyPayload = (form) => {
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
      donor_id: donorId,
      preferred_categories: categories,
      subscription_type: subscription,
      preferred_regions: regions,
      prefer_emergency: preferEmergency,
      focus_keyword: keyword,
      limit: 10,
    };
  };

  const surveySubmitButton = surveyForm?.querySelector("button[type='submit']");

  const submitSurvey = async (form) => {
    const payload = collectSurveyPayload(form);
    let data = {};
    try {
      if (surveySubmitButton) surveySubmitButton.disabled = true;
      const response = await fetch(`${API_BASE}/recommendations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      data = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error("추천 요청 실패", data);
      }
      let items = Array.isArray(data?.items) ? data.items : [];
      if (!items.length) {
        items = buildFallbackRecommendations(payload);
      }
      if (items.length) {
        saveRecommendations(items);
        renderRecommendations(items);
      } else {
        recommendEmpty?.removeAttribute("hidden");
      }
    } finally {
      if (surveySubmitButton) surveySubmitButton.disabled = false;
      toggleSurveyModal(false);
      // 저장 성공한 경우에만 덮어쓰기
    }
  };

  surveyForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitSurvey(surveyForm)
      .catch((error) => {
        console.error(error);
        alert(error.message || "추천 요청에 실패했습니다.");
      });
  });

  receiptModal?.addEventListener("click", (event) => {
    const closeTarget = event.target.closest("[data-action='close-receipt']");
    if (closeTarget) {
      event.preventDefault();
      closeReceiptModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (surveyModal?.classList.contains("is-open")) {
        toggleSurveyModal(false);
        return;
      }
      closeReceiptModal();
    }
  });

  // 추천 결과 로드
  const savedRecommendations = loadRecommendations();
  if (savedRecommendations?.items?.length) {
    renderRecommendations(savedRecommendations.items);
  }

  document.querySelector("[data-action='refresh-recommend']")?.addEventListener("click", () => {
    const saved = loadRecommendations();
    if (saved?.items?.length) {
      renderRecommendations(saved.items);
      recommendEmpty?.setAttribute("hidden", "true");
    } else {
      alert("저장된 추천 결과가 없습니다. 설문을 다시 진행해주세요.");
    }
  });
});
