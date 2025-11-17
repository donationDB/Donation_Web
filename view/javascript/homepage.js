/**
 * Homepage interactions: navigation, session handling, dynamic category list,
 * and CTA guards to require donor login before entering donation flow.
 */
const API_BASE = "http://localhost:8080/api";
const CATEGORY_DISPLAY_LIMIT = 6;

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

const FALLBACK_CATEGORIES = [
  {
    category_id: "1",
    category_name: "교육 (Education)",
    description: "교육 접근성 향상, 교실 보수, 장학, 디지털 격차 해소 등을 포함",
  },
  {
    category_id: "2",
    category_name: "환경 및 자연보호 (Environment/Nature)",
    description: "탄소감축, 재조림, 해양·습지 보호, 생물다양성 보전을 지원합니다.",
  },
  {
    category_id: "6",
    category_name: "아동·청소년 지원 (Children/Youth)",
    description: "멘토링, 방과후, 보호, 심리·정서 지원을 통해 성장을 돕습니다.",
  },
  {
    category_id: "5",
    category_name: "재난구호 (Disaster Relief)",
    description: "재난 피해 지역에 임시 거처 및 구호 물자를 신속하게 전달합니다.",
  },
];

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

async function loadCategories(elements) {
  const { listContainer, skeletonContainer, emptyElement } = elements;
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

    if (!categories.length) {
      renderCategories(elements, FALLBACK_CATEGORIES.slice(0, CATEGORY_DISPLAY_LIMIT));
      return;
    }

    renderCategories(elements, categories);
  } catch (error) {
    console.error(error);
    renderCategories(elements, FALLBACK_CATEGORIES.slice(0, CATEGORY_DISPLAY_LIMIT));
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
        <div class="account-summary account-summary--auth">
          <div class="account-summary__info">
            <span class="account-label">내 정보</span>
            <strong class="account-name">${session.name}님</strong>
            <span class="account-email">${session.email}</span>
          </div>
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
