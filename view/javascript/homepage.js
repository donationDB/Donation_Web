/**
 * Homepage interactions: navigation, session handling, dynamic category list,
 * and CTA guards to require donor login before entering donation flow.
 */
const API_BASE = "http://localhost:8080/api";
const CATEGORY_DISPLAY_LIMIT = Infinity;
const CATEGORY_ACCESS_ROLES = new Set(["admin", "donor", "company"]);

const CATEGORY_RULES = [
  {
    keywords: ["교육", "education"],
    icon: "📘",
    description: "배움의 기회가 필요한 곳에 교육 인프라와 멘토링을 전합니다.",
  },
  {
    keywords: ["환경", "environment"],
    icon: "🌿",
    description: "지구를 지키는 재조림, 탄소 저감, 생태계 보전을 지원합니다.",
  },
  {
    keywords: ["보건", "의료", "health"],
    icon: "🩺",
    description: "기초 의료와 건강 증진을 위한 프로젝트를 돕습니다.",
  },
  {
    keywords: ["재난", "disaster"],
    icon: "🚑",
    description: "재난 피해 지역에 긴급 구호와 회복을 지원합니다.",
  },
  {
    keywords: ["아동", "청소년", "children", "youth"],
    icon: "🧒",
    description: "아이들이 안전하고 건강하게 성장할 수 있도록 돕습니다.",
  },
  {
    keywords: ["동물", "animal"],
    icon: "🐾",
    description: "소중한 생명을 지키는 동물 보호 활동을 응원합니다.",
  },
  {
    keywords: ["노인", "elderly"],
    icon: "🤝",
    description: "어르신들의 건강과 정서적 안정을 위한 돌봄을 이어갑니다.",
  },
  {
    keywords: ["지역", "community"],
    icon: "🏘️",
    description: "지역사회의 자립과 인프라 개선을 함께 만들어갑니다.",
  },
  {
    keywords: ["빈곤", "기아", "poverty", "hunger"],
    icon: "🍚",
    description: "기초 생활을 위한 식량·주거 지원으로 희망을 전합니다.",
  },
];

const DEFAULT_CATEGORY_META = {
  icon: "🤝",
  description: "관심 있는 분야를 선택하고 진행 중인 기부 프로그램을 만나보세요.",
};

function resolveCategoryMeta(name = "") {
  const lower = name.toLowerCase();
  const match = CATEGORY_RULES.find((rule) =>
    rule.keywords.some((keyword) => lower.includes(keyword.toLowerCase()))
  );
  return match ? match : DEFAULT_CATEGORY_META;
}

function renderCategorySkeleton(container, count = 4) {
  if (!container || container.childElementCount) return;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i += 1) {
    const card = document.createElement("article");
    card.className = "cause-card cause-card--skeleton";

    const inner = document.createElement("div");
    inner.className = "cause-card--skeleton-inner";

    const iconBlock = document.createElement("div");
    iconBlock.className = "skeleton-block skeleton-block--icon";

    const titleBlock = document.createElement("div");
    titleBlock.className = "skeleton-block skeleton-block--title";

    const textBlock = document.createElement("div");
    textBlock.className = "skeleton-block skeleton-block--text";

    const buttonBlock = document.createElement("div");
    buttonBlock.className = "skeleton-block skeleton-block--button";

    inner.append(iconBlock, titleBlock, textBlock, buttonBlock);
    card.appendChild(inner);
    fragment.appendChild(card);
  }
  container.appendChild(fragment);
}

function renderCategories({ listContainer, skeletonContainer, emptyElement }, categories = []) {
  if (!listContainer) return;

  listContainer.innerHTML = "";
  if (skeletonContainer) {
    skeletonContainer.replaceChildren();
    skeletonContainer.setAttribute("hidden", "true");
    skeletonContainer.style.display = "none";
  }

  if (!Array.isArray(categories) || !categories.length) {
    emptyElement?.removeAttribute("hidden");
    return;
  }

  emptyElement?.setAttribute("hidden", "true");

  const fragment = document.createDocumentFragment();
  categories.forEach((category) => {
    const card = document.createElement("article");
    card.className = "cause-card";
    card.dataset.categoryId = String(category.category_id ?? category.id ?? "");
    card.dataset.categoryName = category.category_name ?? category.name ?? "";
    card.tabIndex = 0;

    const meta = resolveCategoryMeta(card.dataset.categoryName);

    const descriptionText = category.description?.trim?.() || meta.description;

    card.innerHTML = `
      <div class="cause-card__icon" aria-hidden="true">${meta.icon}</div>
      <h3>${card.dataset.categoryName}</h3>
      <p class="cause-card__description">${descriptionText}</p>
      <button type="button" class="text-link" data-action="view-programs">프로그램 보기</button>
    `;

    fragment.appendChild(card);
  });

  listContainer.appendChild(fragment);
}

function getFallbackCategories() {
  return [];
}

function hideSkeleton(container) {
  if (!container) return;
  container.replaceChildren();
  container.setAttribute("hidden", "true");
  container.style.display = "none";
}

async function loadCategories(elements) {
  const { listContainer, skeletonContainer } = elements;
  if (!listContainer) return;

  // 항상 DB 카테고리만 사용 (샘플 데이터 사용 안 함)
  renderCategorySkeleton(skeletonContainer);
  if (skeletonContainer) {
    skeletonContainer.removeAttribute("hidden");
    skeletonContainer.style.display = "grid";
  }

  try {
    const response = await fetch(`${API_BASE}/categories?sortField=category_id`);
    if (!response.ok) throw new Error("카테고리를 불러오지 못했습니다.");

    const data = await response.json();
    const categories = Array.isArray(data) ? data.slice(0, CATEGORY_DISPLAY_LIMIT) : [];

    renderCategories(elements, categories);
  } catch (error) {
    console.error(error);
    listContainer.innerHTML = "";
    hideSkeleton(skeletonContainer);
    const emptyElement = elements?.emptyElement;
    if (emptyElement) emptyElement.removeAttribute("hidden");
  }
}

function navigateToCategory(card) {
  const categoryId = card.dataset.categoryId;
  if (!categoryId) return;

  const categoryName = card.dataset.categoryName || card.querySelector("h3")?.textContent || "기부 분야";
  const query = new URLSearchParams({
    category: categoryId,
    name: categoryName,
  }).toString();

  window.location.href = `category_programs.html?${query}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const BASE_SURVEY_DONE_KEY = "donorSurveyCompleted";
  const BASE_SURVEY_PENDING_KEY = "donorSurveyPending";
  const getSurveyKeys = (account) => {
    const id = account?.donor_id;
    return {
      doneKey: id ? `${BASE_SURVEY_DONE_KEY}:${id}` : BASE_SURVEY_DONE_KEY,
      pendingKey: id ? `${BASE_SURVEY_PENDING_KEY}:${id}` : BASE_SURVEY_PENDING_KEY,
    };
  };
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

      const isAdmin = session.role === "admin";
      const isCompany = session.role === "company";
      const displayName = isCompany
        ? session.company_name || session.name || session.email
        : session.name || session.email;
      const myPageButton =
        session.role === "donor"
          ? `<a class="btn account-dashboard" href="mypage.html">마이페이지</a>`
          : "";
      const dashboardButton = isAdmin
        ? `<a class="btn account-dashboard" href="admin_dashboard.html">관리자 대시보드</a>`
        : "";
      const programApplyButton = isCompany
        ? `<a class="btn account-dashboard" href="program_apply.html">프로그램 신청</a>`
        : "";
      const programStatusButton = isCompany
        ? `<a class="btn account-dashboard btn-ghost" href="program_apply_status.html">신청 현황</a>`
        : "";

      accountSlot.innerHTML = `
        <div class="account-summary account-summary--auth${isAdmin ? " account-summary--admin" : ""}">
          <div class="account-summary__info">
            <span class="account-label">내 정보</span>
            <strong class="account-name">${displayName}님</strong>
            <span class="account-email">${session.email}</span>
          </div>
          <div class="account-summary__actions">
            ${dashboardButton}
            ${programApplyButton}
            ${programStatusButton}
            ${myPageButton}
            <button type="button" class="btn btn-secondary account-logout" data-action="logout">로그아웃</button>
          </div>
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

  const donateButtons = document.querySelectorAll("[data-action='donate-now']");

  donateButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      const session = window.donorSession?.getSession?.();
      if (!session) {
        event.preventDefault();
        window.location.href = "login_view.html";
      }
    });
  });

  /* 설문 모달 (홈 노출) */
  const surveyModal = document.querySelector("[data-role='onboarding-survey']");
  const surveyForm = document.getElementById("onboarding-survey-form");
  const surveySubmitButton = surveyForm?.querySelector("button[type='submit']");
  let surveyTriggeredByPending = false;
  const session = window.donorSession?.getSession?.();
  const { doneKey, pendingKey } = getSurveyKeys(session);
  const surveyBackdrop = surveyModal?.querySelector(".survey-modal__backdrop");
  const recommendModal = document.querySelector("[data-role='recommend-modal']");
  const recommendList = document.querySelector("[data-role='recommend-list']");
  const recommendEmpty = document.querySelector("[data-role='recommend-empty']");
  const recommendLoading = document.querySelector("[data-role='recommend-loading']");
  const recommendInlineList = document.querySelector("[data-role='recommend-inline-list']");
  const recommendInlineEmpty = document.querySelector("[data-role='recommend-inline-empty']");
  const recommendKey = session?.donor_id ? `donorRecommendations:${session.donor_id}` : null;

  const toggleSurveyModal = (isOpen) => {
    if (!surveyModal) return;
    surveyModal.classList.toggle("is-open", isOpen);
    surveyModal.setAttribute("aria-hidden", isOpen ? "false" : "true");
    if (!isOpen) {
      surveyModal.style.display = "none";
    } else {
      surveyModal.style.display = "block";
    }
  };

  const toggleRecommendModal = (isOpen) => {
    if (!recommendModal) return;
    recommendModal.classList.toggle("is-open", isOpen);
    recommendModal.setAttribute("aria-hidden", isOpen ? "false" : "true");
  };

  const toggleRecommendLoading = (isLoading) => {
    if (!recommendLoading) return;
    recommendLoading.toggleAttribute("hidden", !isLoading);
    recommendLoading.classList.toggle("is-active", !!isLoading);
  };

  // 초기 상태에서 모달이 열린 경우 강제 닫기 (이전 에러로 overlay가 남는 현상 방지)
  const closeAllModals = () => {
    toggleSurveyModal(false);
    toggleRecommendModal(false);
  };
  closeAllModals();

  function buildDonateLink(item) {
    const programId = item.program_id || item.id;
    const funding = (item.funding_type || "").toString().toUpperCase();
    if (funding === "SUBSCRIPTION" || funding === "BOTH") {
      return `monthly_donation.html?programId=${programId ?? ""}`;
    }
    return `donation.html?programId=${programId ?? ""}`;
  }

  const renderRecommendations = (items = []) => {
    const targets = [
      { list: recommendList, empty: recommendEmpty },
      { list: recommendInlineList, empty: recommendInlineEmpty },
    ];

    targets.forEach(({ list, empty }) => {
      if (!list) return;
      list.innerHTML = "";
      if (!Array.isArray(items) || !items.length) {
        empty?.removeAttribute("hidden");
        return;
      }
      empty?.setAttribute("hidden", "true");
      const frag = document.createDocumentFragment();
      items.forEach((item) => {
        const link = buildDonateLink(item);
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
          <div class="recommend-card__actions">
            <a class="btn btn-primary" href="${link}">기부하러 가기</a>
          </div>
        `;
        frag.appendChild(card);
      });
      list.appendChild(frag);
    });
  };

  const saveRecommendations = (items = []) => {
    if (!recommendKey) return;
    try {
      localStorage.setItem(recommendKey, JSON.stringify({ items, updated_at: new Date().toISOString() }));
    } catch (e) {
      console.error("추천 결과 저장 실패", e);
    }
  };

  const loadSavedRecommendations = () => {
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

  const markSurveyDone = () => {
    localStorage.setItem(doneKey, "1");
    localStorage.removeItem(pendingKey);
  };

  document.querySelectorAll("[data-action='close-survey']").forEach((button) => {
    button.addEventListener("click", () => {
      if (surveyTriggeredByPending) markSurveyDone();
      toggleSurveyModal(false);
    });
  });

  document.querySelectorAll("[data-action='close-recommend']").forEach((button) => {
    button.addEventListener("click", () => toggleRecommendModal(false));
  });

  document.querySelector("[data-action='skip-survey']")?.addEventListener("click", () => {
    markSurveyDone();
    toggleSurveyModal(false);
  });

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
      donor_id: session?.donor_id ?? null,
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
    // 이전 추천 상태 초기화
    recommendEmpty?.setAttribute("hidden", "true");
    if (recommendList) recommendList.innerHTML = "";
    // 설문 모달 닫고 로딩 표시
    toggleSurveyModal(false);
    toggleRecommendLoading(true);
    // 추천 모달은 더 이상 강제 오픈하지 않고, 페이지 섹션에 렌더
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
        console.error("추천 API 응답 오류", data);
      }
      let items = Array.isArray(data?.items) ? data.items : [];
      if (!items.length) {
        items = buildFallbackRecommendations(payload);
      }
      if (items.length) {
        markSurveyDone();
        // 2초 로딩 후 추천 노출
        setTimeout(() => {
          renderRecommendations(items);
          saveRecommendations(items);
          toggleRecommendLoading(false);
          // 추천 섹션으로 스크롤
          document.getElementById("recommendations")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 2000);
      } else {
        recommendEmpty?.removeAttribute("hidden");
        toggleRecommendLoading(false);
      }
      return data;
    } finally {
      if (surveySubmitButton) surveySubmitButton.disabled = false;
      // 설문 모달은 항상 닫아 회색 오버레이가 남지 않도록 처리
      toggleSurveyModal(false);
      if (!recommendModal?.classList.contains("is-open")) {
        toggleRecommendLoading(false);
      }
    }
  }

  surveyForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitSurvey(surveyForm)
      .catch((error) => {
        console.error(error);
        alert(error.message || "설문 응답 전송 중 오류가 발생했습니다.");
        toggleRecommendModal(false);
        toggleSurveyModal(false);
      });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (recommendModal?.classList.contains("is-open")) {
        toggleRecommendModal(false);
        return;
      }
      if (surveyModal?.classList.contains("is-open")) {
        if (surveyTriggeredByPending) markSurveyDone();
        toggleSurveyModal(false);
      }
    }
  });

  const surveyDone = localStorage.getItem(doneKey) === "1";
  let surveyPending = localStorage.getItem(pendingKey) === "1";
  const isRestrictedRole = session?.role === "admin" || session?.role === "company";
  const shouldAutoOpen = !isRestrictedRole && !surveyDone;

  if (shouldAutoOpen && surveyModal) {
    surveyTriggeredByPending = true;
    // 아직 pending 플래그가 없었다면 설정해 다음 방문에서도 한 번 더 노출
    if (!surveyPending) {
      localStorage.setItem(pendingKey, "1");
      localStorage.setItem(basePendingKey, "1");
      surveyPending = true;
    }
    toggleSurveyModal(true);
  }

  const saved = loadSavedRecommendations();
  if (saved?.items?.length && recommendList) {
    renderRecommendations(saved.items);
  }

  // 추천 새로고침 (인라인)
  document.querySelector("[data-action='refresh-recommend']")?.addEventListener("click", () => {
    if (!surveyForm) {
      alert("설문을 먼저 완료해 주세요.");
      return;
    }
    submitSurvey(surveyForm);
  });

  const categoryList = document.querySelector("[data-role='category-list']");
  const categorySkeleton = document.querySelector("[data-role='category-skeleton']");
  const categoryEmpty = document.querySelector("[data-role='category-empty']");

  if (categoryList) {
    loadCategories({
      listContainer: categoryList,
      skeletonContainer: categorySkeleton,
      emptyElement: categoryEmpty,
    });

    categoryList.addEventListener("click", (event) => {
      const card = event.target.closest(".cause-card");
      if (!card || !categoryList.contains(card)) return;
      navigateToCategory(card);
    });

    categoryList.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      const card = event.target.closest(".cause-card");
      if (!card || !categoryList.contains(card)) return;
      event.preventDefault();
      navigateToCategory(card);
    });
  }
});
