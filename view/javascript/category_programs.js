(function () {
  const API_BASE = "http://localhost:8080/api";
  const PAGE_SIZE = 12;
  const SKELETON_COUNT = 12;

  const CATEGORY_RULES = [
    {
      keywords: ["교육", "education"],
      icon: "📘",
      description: "배움의 기회가 필요한 곳에 교육 인프라와 멘토링을 전합니다.",
    },
    {
      keywords: ["환경", "environment", "green"],
      icon: "🌿",
      description: "지구를 지키는 재조림, 탄소 저감, 생태계 보전을 지원합니다.",
    },
    {
      keywords: ["보건", "의료", "health", "medical"],
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
      description: "아이들이 안전하고 건강하게 성장하도록 돌봄과 보호를 제공합니다.",
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

  const state = {
    allPrograms: [],
    rendered: 0,
    category: "",
    categoryName: "",
    categoryMeta: DEFAULT_CATEGORY_META,
    observer: null,
  };

  const elements = {
    list: document.querySelector('[data-role="program-list"]'),
    empty: document.querySelector('[data-role="program-empty"]'),
    count: document.querySelector('[data-role="program-count"]'),
    skeleton: document.querySelector('[data-role="skeletons"]'),
    loadMore: document.querySelector('[data-action="load-more"]'),
    sentinel: document.querySelector('[data-role="sentinel"]'),
  };

  function getParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      category: params.get("category") || "",
      name: params.get("name") || "",
    };
  }

  function applyCategoryContext({ category, name }) {
    state.category = category;
    state.categoryName = name;
    state.categoryMeta = resolveCategoryMeta(name);

    document.querySelectorAll('[data-field="category-name"]').forEach((node) => {
      node.textContent = name || "기부 분야";
    });

    const title = document.querySelector('[data-field="category-title"]');
    if (title) title.textContent = `${name || "기부 분야"} 프로그램`;

    const description = document.querySelector('[data-field="category-description"]');
    if (description) description.textContent = state.categoryMeta.description;
  }

  function ensureSkeletons() {
    if (!elements.skeleton) return;
    if (elements.skeleton.childElementCount) return;

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < SKELETON_COUNT; i += 1) {
      const card = document.createElement("div");
      card.className = "skeleton-card";

      const thumb = document.createElement("div");
      thumb.className = "skeleton-card__thumb";
      card.appendChild(thumb);

      const body = document.createElement("div");
      body.className = "skeleton-card__body";

      const barShort = document.createElement("div");
      barShort.className = "skeleton-bar skeleton-bar--short";
      body.appendChild(barShort);

      const barLong = document.createElement("div");
      barLong.className = "skeleton-bar skeleton-bar--long";
      body.appendChild(barLong);

      const barMedium = document.createElement("div");
      barMedium.className = "skeleton-bar skeleton-bar--medium";
      body.appendChild(barMedium);

      card.appendChild(body);
      fragment.appendChild(card);
    }

    elements.skeleton.appendChild(fragment);
  }

  function showSkeleton() {
    if (!elements.skeleton) return;
    ensureSkeletons();
    elements.skeleton.removeAttribute("hidden");
    elements.skeleton.style.display = "grid";
  }

  function hideSkeleton() {
    if (elements.skeleton) {
      elements.skeleton.setAttribute("hidden", "true");
      elements.skeleton.style.display = "none";
      elements.skeleton.replaceChildren();
    }
  }

  function formatDate(value) {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}.${month}.${day}`;
  }

  function formatPeriod(startDate, endDate) {
    const start = formatDate(startDate);
    const end = formatDate(endDate);
    if (start && end) return `${start}~${end}`;
    if (start) return `${start} 시작`;
    if (end) return `${end} 종료`;
    return "일정 미정";
  }

  function updateCount() {
    if (!elements.count) return;
    elements.count.textContent = `진행 중 프로그램 ${state.allPrograms.length}건`;
  }

  function createProgramCard(program) {
    const card = document.createElement("article");
    card.className = "program-card";

    const thumb = document.createElement("div");
    thumb.className = "program-card__thumb";
    const cover =
      program.thumbnail_url ||
      program.thumbnail ||
      program.image_url ||
      program.image ||
      program.banner_url ||
      null;

    const categoryName = program.category_name || state.categoryName || "기부 분야";
    const meta = resolveCategoryMeta(categoryName);

    if (cover) {
      thumb.classList.add("program-card__thumb--photo");
      thumb.style.backgroundImage = `url(${cover})`;
    } else {
      thumb.textContent = meta.icon;
    }

    const body = document.createElement("div");
    body.className = "program-card__body";

    const badge = document.createElement("span");
    badge.className = "program-card__badge";
    badge.textContent = categoryName;

    const title = document.createElement("h2");
    title.className = "program-card__title";
    title.textContent = program.title || program.program_name || "프로그램";

    const footer = document.createElement("div");
    footer.className = "program-card__footer";

    const period = document.createElement("span");
    period.className = "program-card__period";
    period.textContent = formatPeriod(program.start_date, program.end_date);

    const detailLink = document.createElement("a");
    detailLink.className = "detail-link";
    detailLink.textContent = "상세 보기";
    const query = new URLSearchParams({
      programId: program.program_id,
      category: state.category,
      name: categoryName,
    }).toString();
    detailLink.href = `program_detail.html?${query}`;

    footer.append(period, detailLink);
    body.append(badge, title);
    card.append(thumb, body, footer);

    card.addEventListener("click", () => {
      window.location.href = detailLink.href;
    });

    detailLink.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    return card;
  }

  function appendPrograms(programs = []) {
    if (!elements.list || !programs.length) return;
    const fragment = document.createDocumentFragment();
    programs.forEach((program) => {
      fragment.appendChild(createProgramCard(program));
    });
    elements.list.appendChild(fragment);
  }

  function toggleEmptyState(show) {
    if (!elements.empty) return;
    if (show) {
      elements.empty.removeAttribute("hidden");
    } else {
      elements.empty.setAttribute("hidden", "true");
    }
  }

  function disableInfiniteLoading() {
    elements.sentinel?.setAttribute("hidden", "true");
    elements.loadMore?.setAttribute("hidden", "true");
    state.observer?.disconnect();
    state.observer = null;
  }

  function enableLoadMoreButton() {
    elements.sentinel?.setAttribute("hidden", "true");
    if (state.rendered < state.allPrograms.length) {
      elements.loadMore?.removeAttribute("hidden");
    } else {
      elements.loadMore?.setAttribute("hidden", "true");
    }
  }

  function setupObserver() {
    if (!elements.sentinel) return;
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }

    if (!("IntersectionObserver" in window)) {
      enableLoadMoreButton();
      return;
    }

    if (state.rendered >= state.allPrograms.length) {
      disableInfiniteLoading();
      return;
    }

    elements.loadMore?.setAttribute("hidden", "true");
    elements.sentinel.removeAttribute("hidden");

    state.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          renderNextBatch();
        }
      });
    });
    state.observer.observe(elements.sentinel);
  }

  function renderNextBatch() {
    if (state.rendered >= state.allPrograms.length) {
      disableInfiniteLoading();
      return;
    }

    const next = state.allPrograms.slice(state.rendered, state.rendered + PAGE_SIZE);
    appendPrograms(next);
    state.rendered += next.length;
    updateCount();

    if (state.rendered >= state.allPrograms.length) {
      disableInfiniteLoading();
    }
  }

  async function loadPrograms(categoryId) {
    if (!elements.list || !elements.count) return;

    if (!categoryId) {
      elements.list.innerHTML = "";
      elements.count.textContent = "카테고리가 지정되지 않았습니다.";
      toggleEmptyState(true);
      hideSkeleton();
      return;
    }

    state.category = categoryId;
    state.allPrograms = [];
    state.rendered = 0;

    elements.list.innerHTML = "";
    elements.count.textContent = "프로그램 불러오는 중...";
    toggleEmptyState(false);
    showSkeleton();
    disableInfiniteLoading();

    try {
      const response = await fetch(
        `${API_BASE}/programs?status=running&category=${encodeURIComponent(categoryId)}`
      );
      if (!response.ok) {
        throw new Error("프로그램 정보를 불러오지 못했습니다.");
      }

      const programs = await response.json();
      const normalizedPrograms = Array.isArray(programs) ? programs : [];
      const runningPrograms = normalizedPrograms.filter(
        (program) => (program.status || "").toLowerCase() === "running"
      );

      if (!state.categoryName && runningPrograms[0]?.category_name) {
        state.categoryName = runningPrograms[0].category_name;
        state.categoryMeta = resolveCategoryMeta(state.categoryName);

        document.querySelectorAll('[data-field="category-name"]').forEach((node) => {
          node.textContent = state.categoryName;
        });
        const description = document.querySelector('[data-field="category-description"]');
        if (description) description.textContent = state.categoryMeta.description;
      }

      state.allPrograms = runningPrograms;
      hideSkeleton();

      if (!runningPrograms.length) {
        elements.count.textContent = "진행 중 프로그램 0건";
        toggleEmptyState(true);
        return;
      }

      toggleEmptyState(false);
      renderNextBatch();
      setupObserver();
    } catch (error) {
      console.error(error);
      hideSkeleton();
      elements.count.textContent = "프로그램을 불러오지 못했습니다.";
      toggleEmptyState(true);
      const emptyMessage =
        "프로그램 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
      if (elements.empty) elements.empty.textContent = emptyMessage;
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const params = getParams();
    applyCategoryContext(params);
    ensureSkeletons();

    if (!params.category) {
      if (elements.count) elements.count.textContent = "카테고리가 선택되지 않았습니다.";
      toggleEmptyState(true);
      hideSkeleton();
      return;
    }

    await loadPrograms(params.category);

    elements.loadMore?.addEventListener("click", () => {
      renderNextBatch();
      setupObserver();
    });

    const refreshButton = document.querySelector('[data-action="refresh"]');
    refreshButton?.addEventListener("click", () => {
      loadPrograms(state.category);
    });
  });
})();
