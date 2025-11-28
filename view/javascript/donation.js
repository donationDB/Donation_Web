document.addEventListener("DOMContentLoaded", () => {
  // API 엔드포인트: window.API_BASE 우선, 없으면 백엔드 기본 포트(8080)로 폴백
  const API_BASE = (() => {
    const custom = window.API_BASE && window.API_BASE.replace(/\/$/, "");
    if (custom) return custom;
    const origin = window.location.origin.replace(/\/$/, "");
    // 개발용 정적 서버(예: 5500)일 때는 백엔드 8080으로 폴백
    if (!origin.includes(":8080")) {
      return "http://127.0.0.1:8080/api";
    }
    return `${origin}/api`;
  })();
  const monthlyOnly = document.body?.dataset?.monthlyOnly === "true";

  const loaderEl = document.querySelector("[data-role='loader']");
  const errorEl = document.querySelector("[data-role='error']");
  const emptyEl = document.querySelector("[data-role='empty']");
  const filterEmptyEl = document.querySelector("[data-role='filter-empty']");
  const listEl = document.querySelector("[data-role='program-list']");
  const panelEl = document.querySelector("[data-role='donation-panel']");
  const formEl = panelEl?.querySelector("[data-role='donation-form']");
  const submitButton = panelEl?.querySelector("[data-role='submit-button']");
  const cancelButton = panelEl?.querySelector("[data-action='cancel-donation']");
  const panelTitleEl = panelEl?.querySelector("[data-field='panel-title']");
  const panelDescriptionEl = panelEl?.querySelector("[data-field='panel-description']");
  const cycleSelect = panelEl?.querySelector("select[name='cycle']");
  const startDateInput = panelEl?.querySelector("input[name='startDate']");
  const donorNameEl = document.querySelector("[data-field='donor-name']");
  const logoutButton = document.querySelector("[data-action='logout']");
  const categoryListEl = document.querySelector("[data-role='donation-categories']");
  const categoryEmptyEl = document.querySelector("[data-role='donation-category-empty']");
  const searchInput = document.querySelector("[data-role='program-search']");
  const clearSearchButton = document.querySelector("[data-action='clear-search']");
  const programsSection = document.querySelector(".donation-programs");

  const urlParams = new URLSearchParams(window.location.search);
  const initialProgramId = urlParams.get("programId");

  let session = window.donorSession?.getSession?.();
  let selectedProgram = null;
  let allPrograms = [];
  let activeCategoryKey = "";
  let searchQuery = "";

  const FALLBACK_CATEGORIES = [
    { category_id: "1", category_name: "교육 지원" },
    { category_id: "2", category_name: "환경 보호" },
    { category_id: "3", category_name: "보건·의료" },
    { category_id: "4", category_name: "재난 구호" },
    { category_id: "5", category_name: "아동·청소년" },
    { category_id: "6", category_name: "지역 공동체" },
  ];

  if (!session || session.role !== "donor") {
    alert("로그인한 후 이용해주세요.");
    window.location.replace("login_view.html");
    return;
  }

  function setDonorName() {
    donorNameEl.textContent = session?.name ?? "기부자";
  }

  setDonorName();

  if (monthlyOnly && startDateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = `${today.getMonth() + 1}`.padStart(2, "0");
    const dd = `${today.getDate()}`.padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;
    startDateInput.min = todayStr;
    startDateInput.value = todayStr;
  }

  logoutButton?.addEventListener("click", () => {
    window.donorSession?.clearSession?.();
    window.location.replace("homepage.html");
  });

  document.addEventListener("donor:logout", () => {
    window.location.replace("login_view.html");
  });

  document.addEventListener("donor:login", () => {
    session = window.donorSession?.getSession?.() ?? session;
    setDonorName();
  });

  function formatDate(value) {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    const year = parsed.getFullYear();
    const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
    const day = `${parsed.getDate()}`.padStart(2, "0");
    return `${year}.${month}.${day}`;
  }

  function formatCurrency(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return "집계 준비 중";
    return `${amount.toLocaleString("ko-KR")}원`;
  }

  function createMetaRow(label, value) {
    const item = document.createElement("span");
    const labelEl = document.createElement("strong");
    labelEl.className = "meta-label";
    labelEl.textContent = label;
    const valueEl = document.createElement("span");
    valueEl.className = "meta-value";
    valueEl.textContent = value;
    item.append(labelEl, valueEl);
    return item;
  }

  function normalizeText(value = "") {
    return String(value ?? "").toLowerCase().trim();
  }

  function isMonthly(program = {}) {
    const value =
      program.monthly ??
      program.monthly_flag ??
      (program.funding_type &&
        ["subscription", "both"].includes(program.funding_type.toString().toLowerCase())) ??
      program.is_recurring ??
      program.allow_monthly_donation ??
      program.recurring ??
      (program.duration_months >= 6 ? true : null);
    if (value === true || value === 1) return true;
    if (typeof value === "string") {
      const normalized = value.toLowerCase();
      return ["1", "true", "yes", "y", "on"].includes(normalized);
    }
    return false;
  }

  function programMatchesCategory(program, categoryKey) {
    if (!categoryKey) return true;
    const candidates = [
      program.category_id,
      program.categoryId,
      program.category_name,
      program.categoryName,
    ]
      .map((value) => normalizeText(value))
      .filter(Boolean);
    return candidates.some((value) => value === categoryKey || value.includes(categoryKey));
  }

  function programMatchesSearch(program, query) {
    if (!query) return true;
    const candidates = [
      program.title,
      program.program_name,
      program.organization,
      program.company_name,
      program.category_name,
      program.location,
    ]
      .map((value) => normalizeText(value))
      .filter(Boolean);
    return candidates.some((value) => value.includes(query));
  }

  function renderCategoryPills(categories = []) {
    if (!categoryListEl) return;
    categoryListEl.innerHTML = "";

    if (!Array.isArray(categories) || !categories.length) {
      categoryEmptyEl?.removeAttribute("hidden");
      return;
    }

    categoryEmptyEl?.setAttribute("hidden", "true");

    const fragment = document.createDocumentFragment();
    categories.forEach((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "donation-category-pill";

      const name = category.category_name ?? category.name ?? "기부 분야";
      const identifier = category.category_id ?? category.id ?? name;

      button.textContent = name;
      button.dataset.categoryName = name;
      button.dataset.categoryId = String(identifier);
      button.dataset.categoryKey = normalizeText(name) || normalizeText(identifier);

      fragment.appendChild(button);
    });

    categoryListEl.appendChild(fragment);
  }

  async function loadCategories() {
    if (!categoryListEl) return;
    try {
      const response = await fetch(`${API_BASE}/categories?sortField=category_id`);
      if (!response.ok) throw new Error("카테고리를 불러오지 못했습니다.");
      const data = await response.json();
      const categories = Array.isArray(data) && data.length ? data : FALLBACK_CATEGORIES;
      renderCategoryPills(categories);
    } catch (error) {
      console.error(error);
      renderCategoryPills(FALLBACK_CATEGORIES);
    }
  }

  function renderPrograms(programs, { isFiltered = false } = {}) {
    if (!listEl) return;
    listEl.innerHTML = "";

    if (!Array.isArray(programs) || !programs.length) {
      if (isFiltered) {
        filterEmptyEl?.removeAttribute("hidden");
        emptyEl?.setAttribute("hidden", "true");
      } else {
        emptyEl?.removeAttribute("hidden");
        filterEmptyEl?.setAttribute("hidden", "true");
      }
      return;
    }

    emptyEl?.setAttribute("hidden", "true");
    errorEl?.setAttribute("hidden", "true");
    filterEmptyEl?.setAttribute("hidden", "true");

    programs.forEach((program) => {
      const card = document.createElement("article");
      card.className = "program-card";
      card.dataset.programId = String(program.program_id);

      const title = document.createElement("h3");
      title.className = "program-card__title";
      title.textContent = program.title || program.program_name || "제목 미정";
      card.appendChild(title);

      const meta = document.createElement("div");
      meta.className = "program-card__meta";
      meta.append(
        createMetaRow("종료일", formatDate(program.end_date)),
        createMetaRow("누적 모금", formatCurrency(program.total_amount)),
        createMetaRow("목표 금액", formatCurrency(program.goal_amount)),
        createMetaRow("장소", program.location || program.place || "-")
      );
      card.appendChild(meta);

      const footer = document.createElement("div");
      footer.className = "program-card__footer";

      const badge = document.createElement("span");
      badge.className = "program-card__badge";
      badge.textContent = program.category_name || "카테고리 미정";
      footer.appendChild(badge);

      const detailButton = document.createElement("button");
      detailButton.type = "button";
      detailButton.className = "btn btn-secondary btn-ghost";
      detailButton.dataset.action = "view-detail";
      detailButton.textContent = "상세보기";
      footer.appendChild(detailButton);

      const actionButton = document.createElement("button");
      actionButton.type = "button";
      actionButton.className = "btn btn-primary";
      actionButton.dataset.action = "select-program";
      actionButton.textContent = "기부하기";
      footer.appendChild(actionButton);

      card.appendChild(footer);

      card.dataset.programTitle = title.textContent;
      card.dataset.programEndDate = formatDate(program.end_date);
      card.dataset.programOrganization = program.organization || program.company_name || "";

      listEl.appendChild(card);
    });
  }

  function applyFilters({ shouldScroll = false } = {}) {
    if (!Array.isArray(allPrograms)) return;
    const normalizedQuery = normalizeText(searchQuery);
    const hasFilters = Boolean(activeCategoryKey || normalizedQuery);

    let filtered = [...allPrograms];

    if (activeCategoryKey) {
      filtered = filtered.filter((program) => programMatchesCategory(program, activeCategoryKey));
    }

    if (normalizedQuery) {
      filtered = filtered.filter((program) => programMatchesSearch(program, normalizedQuery));
    }

    renderPrograms(filtered, { isFiltered: hasFilters });

    if (shouldScroll && programsSection) {
      programsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function updateCategorySelection(key) {
    activeCategoryKey = key;
    if (!categoryListEl) return;
    categoryListEl.querySelectorAll(".donation-category-pill").forEach((button) => {
      const pillKey = button.dataset.categoryKey;
      const isActive = Boolean(activeCategoryKey && pillKey === activeCategoryKey);
      button.classList.toggle("is-active", isActive);
    });
  }

  function syncClearButtonState() {
    if (!clearSearchButton) return;
    clearSearchButton.disabled = !searchInput?.value;
  }

  function preselectProgram(programId) {
    if (!programId) return;
    const card = listEl?.querySelector(`.program-card[data-program-id='${String(programId)}']`);
    if (!card) return;
    openPanel(card);
    panelEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function loadPrograms(preselectId) {
    loaderEl?.removeAttribute("hidden");
    errorEl?.setAttribute("hidden", "true");
    emptyEl?.setAttribute("hidden", "true");

    try {
      if (monthlyOnly) {
        // 1차: monthly=1 필터만 적용
        let data = [];
        let response = await fetch(`${API_BASE}/programs?monthly=1`);
        if (response.ok) {
          data = await response.json();
        }
        let list = Array.isArray(data) ? data : [];

        // 2차: 비어있으면 planned/running 전체 가져와서 월간 필터
        if (!list.length) {
          response = await fetch(`${API_BASE}/programs?status=planned,running`);
          if (response.ok) {
            data = await response.json();
            list = Array.isArray(data) ? data : [];
          }
        }

        // 3차: 여전히 비어있으면 전체 프로그램에서 월간만 필터
        if (!list.length) {
          response = await fetch(`${API_BASE}/programs`);
          if (response.ok) {
            data = await response.json();
            list = Array.isArray(data) ? data : [];
          }
        }

        allPrograms = list.filter((program) => isMonthly(program));
      } else {
        const response = await fetch(`${API_BASE}/donor/programs`);
        if (!response.ok) throw new Error("프로그램을 불러오지 못했습니다.");
        const data = await response.json();
        allPrograms = Array.isArray(data) ? data : [];
      }

      if (activeCategoryKey || normalizeText(searchQuery)) {
        applyFilters();
      } else {
        renderPrograms(allPrograms);
      }
      preselectProgram(preselectId);
    } catch (error) {
      console.error(error);
      errorEl?.removeAttribute("hidden");
      allPrograms = [];
    } finally {
      loaderEl?.setAttribute("hidden", "true");
    }
  }

  function closePanel() {
    if (panelEl) {
      panelEl.setAttribute("hidden", "true");
    }
    formEl?.reset();
    selectedProgram = null;
  }

  function openPanel(programCard) {
    if (!panelEl || !formEl) return;
    const programId = Number(programCard.dataset.programId);
    if (!programId) return;

    selectedProgram = {
      program_id: programId,
      title: programCard.dataset.programTitle || "",
      end_date: programCard.dataset.programEndDate || "",
      organization: programCard.dataset.programOrganization || "",
    };

    if (panelTitleEl) {
      panelTitleEl.textContent = `${selectedProgram.title}에 기부하기`;
    }
    if (panelDescriptionEl) {
      const org = selectedProgram.organization || "주최 기관 미정";
      if (monthlyOnly) {
        panelDescriptionEl.textContent = `정기 결제 · ${org}`;
      } else {
        panelDescriptionEl.textContent = `종료일 ${selectedProgram.end_date} · ${org}`;
      }
    }

    const hiddenInput = formEl.querySelector("input[name='programId']");
    if (hiddenInput) hiddenInput.value = programId;
    panelEl.removeAttribute("hidden");
    formEl.amount.focus();
  }

  function goToProgramDetail(programCard) {
    const programId = programCard?.dataset?.programId;
    if (!programId) return;
    const search = new URLSearchParams({ programId }).toString();
    window.location.href = `program_detail.html?${search}`;
  }

  listEl?.addEventListener("click", (event) => {
    const detailButton = event.target.closest("[data-action='view-detail']");
    if (detailButton) {
      const card = detailButton.closest(".program-card");
      if (card) goToProgramDetail(card);
      return;
    }

    const button = event.target.closest("[data-action='select-program']");
    if (!button) return;
    const card = button.closest(".program-card");
    if (!card) return;
    openPanel(card);
  });

  listEl?.addEventListener("click", (event) => {
    const card = event.target.closest(".program-card");
    if (!card || !listEl.contains(card)) return;
    if (event.target.closest("button")) return; // 버튼 클릭은 이미 별도 처리
    goToProgramDetail(card);
  });

  categoryListEl?.addEventListener("click", (event) => {
    const pill = event.target.closest(".donation-category-pill");
    if (!pill || !categoryListEl.contains(pill)) return;
    const key = pill.dataset.categoryKey;
    if (!key) return;
    const nextKey = activeCategoryKey === key ? "" : key;
    updateCategorySelection(nextKey);
    applyFilters({ shouldScroll: true });
  });

  categoryListEl?.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    const pill = event.target.closest(".donation-category-pill");
    if (!pill || !categoryListEl.contains(pill)) return;
    event.preventDefault();
    const key = pill.dataset.categoryKey;
    if (!key) return;
    const nextKey = activeCategoryKey === key ? "" : key;
    updateCategorySelection(nextKey);
    applyFilters({ shouldScroll: true });
  });

  searchInput?.addEventListener("input", (event) => {
    searchQuery = event.target.value ?? "";
    syncClearButtonState();
    applyFilters();
  });

  clearSearchButton?.addEventListener("click", () => {
    if (!searchInput) return;
    if (!searchInput.value) return;
    searchInput.value = "";
    searchQuery = "";
    syncClearButtonState();
    applyFilters();
    searchInput.focus();
  });

  cancelButton?.addEventListener("click", () => {
    closePanel();
  });

  formEl?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!formEl || !selectedProgram || !session) return;

    const amountValue = Number(formEl.amount.value);
    if (!Number.isFinite(amountValue) || amountValue < 1000) {
      alert("기부 금액은 1,000원 이상이어야 합니다.");
      return;
    }

    if (amountValue % 1000 !== 0) {
      alert("기부 금액은 1,000원 단위로 입력해주세요.");
      return;
    }

    const payload = {
      donor_id: session.donor_id,
      program_id: selectedProgram.program_id,
      amount: amountValue,
      message: formEl.message?.value?.trim() || null,
    };

    const originalText = submitButton?.textContent;
    submitButton.disabled = true;
    if (submitButton) {
      submitButton.textContent = monthlyOnly ? "정기기부 신청 중..." : "기부 처리 중...";
    }

    try {
      let endpoint = `${API_BASE}/donations`;
      let body = payload;

      if (monthlyOnly) {
        const cycle = (cycleSelect?.value || "MONTHLY").toUpperCase();
        const startDate = startDateInput?.value;

        if (!startDate) {
          alert("첫 결제 시작일을 선택해주세요.");
          return;
        }

        body = {
          donor_id: payload.donor_id,
          program_id: payload.program_id,
          amount: payload.amount,
          cycle,
          start_date: startDate,
          status: "ACTIVE",
        };
        endpoint = `${API_BASE}/subscriptions`;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || (monthlyOnly ? "정기기부 처리 중 오류가 발생했습니다." : "기부 처리 중 오류가 발생했습니다."));
      }

      alert(
        monthlyOnly
          ? "정기기부 신청이 완료되었습니다. 첫 결제일에 맞춰 자동결제가 진행됩니다."
          : "기부가 완료되었습니다. 참여해주셔서 감사합니다!"
      );
      closePanel();
      await loadPrograms();
    } catch (error) {
      console.error(error);
      alert(
        error.message ||
          (monthlyOnly ? "정기기부 처리 중 오류가 발생했습니다." : "기부 처리 중 오류가 발생했습니다.")
      );
    } finally {
      submitButton.disabled = false;
      if (submitButton && originalText) {
        submitButton.textContent = originalText;
      }
    }
  });

  syncClearButtonState();
  loadCategories();
  loadPrograms(initialProgramId);
});
