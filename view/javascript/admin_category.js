document.addEventListener("DOMContentLoaded", () => {
  const session = window.donorSession?.getSession?.();
  if (!session || session.role !== "admin") {
    alert("관리자 로그인이 필요합니다.");
    window.location.replace("login_view.html");
    return;
  }

  const API_BASE = "http://localhost:8080";

  const addForm = document.querySelector("[data-role='category-add-form']");
  const searchForm = document.querySelector(
    "[data-role='category-search-form']"
  );
  const activeFilters = document.querySelector(
    "[data-role='category-active-filters']"
  );
  const tableBody = document.querySelector("[data-role='category-table-body']");

  const state = {
    keyword: "",
    searchField: "all",
    sortField: "category_id",
    hasSearched: false,
    loading: false,
    results: [],
  };

  function createChip(text) {
    const chip = document.createElement("span");
    chip.className = "filter-chip";
    chip.textContent = text;
    return chip;
  }

  function renderActiveFilters() {
    if (!activeFilters) return;

    activeFilters.innerHTML = "";

    if (!state.hasSearched) {
      activeFilters.innerHTML =
        '<p class="active-filters__empty">카테고리 검색 조건을 설정해 주세요.</p>';
      return;
    }

    const label = document.createElement("span");
    label.className = "active-filters__label";
    label.textContent = "선택한 조건";
    activeFilters.appendChild(label);

    activeFilters.appendChild(createChip(`검색어: ${state.keyword || "전체"}`));

    const searchLabel =
      state.searchField === "category_id"
        ? "카테고리 ID"
        : state.searchField === "category_name"
        ? "카테고리명"
        : "전체";
    activeFilters.appendChild(createChip(`검색 기준: ${searchLabel}`));

    const sortLabel =
      state.sortField === "category_name" ? "카테고리명" : "카테고리 ID";
    activeFilters.appendChild(createChip(`정렬 기준: ${sortLabel}`));
  }

  function renderTable({ rows = [], loading = false }) {
    if (!tableBody) return;

    tableBody.innerHTML = "";

    if (loading) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 2;
      cell.textContent = "카테고리 정보를 불러오는 중입니다...";
      row.appendChild(cell);
      tableBody.appendChild(row);
      return;
    }

    if (!rows.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 2;
      cell.textContent = "조건에 맞는 카테고리가 없습니다.";
      row.appendChild(cell);
      tableBody.appendChild(row);
      return;
    }

    rows.forEach((category) => {
      const row = document.createElement("tr");

      const idCell = document.createElement("td");
      idCell.textContent = category.category_id;
      row.appendChild(idCell);

      const nameCell = document.createElement("td");
      nameCell.textContent = category.category_name;
      row.appendChild(nameCell);

      tableBody.appendChild(row);
    });
  }

  async function fetchCategories() {
    const params = new URLSearchParams();
    if (state.keyword) params.set("keyword", state.keyword);
    if (state.searchField && state.searchField !== "all")
      params.set("searchField", state.searchField);
    if (state.sortField) params.set("sortField", state.sortField);

    const query = params.toString();
    const url = query
      ? `${API_BASE}/api/categories?${query}`
      : `${API_BASE}/api/categories`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("카테고리 정보를 가져오지 못했습니다.");
      }
      const data = await response.json();
      state.results = Array.isArray(data) ? data : [];
    } catch (error) {
      console.error(error);
      alert(error.message || "카테고리를 불러오는 중 오류가 발생했습니다.");
      state.results = [];
    }
  }

  async function handleSearch(event) {
    event.preventDefault();
    state.keyword = searchForm.keyword?.value?.trim() ?? "";
    state.searchField = searchForm.searchField?.value ?? "all";
    state.sortField = searchForm.sortField?.value ?? "category_id";
    state.hasSearched =
      Boolean(state.keyword) ||
      state.searchField !== "all" ||
      state.sortField !== "category_id";
    state.loading = true;

    renderTable({ loading: true });
    renderActiveFilters();

    await fetchCategories();

    state.loading = false;
    renderTable({ rows: state.results });
    renderActiveFilters();
  }

  async function handleReset(event) {
    event.preventDefault();
    searchForm.reset();

    state.keyword = "";
    state.searchField = "all";
    state.sortField = "category_id";
    state.hasSearched = false;
    state.loading = false;

    await fetchCategories();
    renderTable({ rows: state.results });
    renderActiveFilters();
  }

  async function addCategory(event) {
    event.preventDefault();

    const rawCategoryId = addForm.categoryId?.value?.trim();
    const categoryName = addForm.categoryName?.value?.trim();
    const categoryDescription = addForm.categoryDescription?.value?.trim();

    if (!categoryName) {
      alert("카테고리명을 입력해주세요.");
      return;
    }

    try {
      const payload = {
        category_name: categoryName,
        description: categoryDescription || undefined,
      };
      if (rawCategoryId) payload.category_id = Number(rawCategoryId);

      const response = await fetch(`${API_BASE}/api/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "카테고리를 추가하지 못했습니다.");
      }

      await fetchCategories();
      renderTable({ rows: state.results });
      renderActiveFilters();

      addForm.reset();
      alert("카테고리가 추가되었습니다.");
    } catch (error) {
      console.error(error);
      alert(error.message || "카테고리 추가 중 오류가 발생했습니다.");
    }
  }

  async function deleteCategory() {
    const categoryId = addForm.categoryId?.value?.trim();
    if (!categoryId) {
      alert("삭제할 카테고리 ID를 입력해주세요.");
      return;
    }

    if (!window.confirm(`${categoryId} 카테고리를 삭제하시겠습니까?`)) return;

    try {
      const response = await fetch(
        `${API_BASE}/api/categories/${encodeURIComponent(categoryId)}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "카테고리를 삭제하지 못했습니다.");
      }

      await fetchCategories();
      renderTable({ rows: state.results });
      renderActiveFilters();

      alert("카테고리가 삭제되었습니다.");
    } catch (error) {
      console.error(error);
      alert(error.message || "카테고리 삭제 중 오류가 발생했습니다.");
    }
  }

  addForm?.addEventListener("submit", addCategory);
  addForm
    ?.querySelector("[data-action='delete-category']")
    ?.addEventListener("click", deleteCategory);

  searchForm?.addEventListener("submit", handleSearch);
  searchForm?.addEventListener("reset", handleReset);

  (async () => {
    state.loading = true;
    renderTable({ loading: true });
    await fetchCategories();
    state.loading = false;
    renderTable({ rows: state.results });
  })();
});
