document.addEventListener("DOMContentLoaded", () => {
  const session = window.donorSession?.getSession?.();

  if (!session || session.role !== "admin") {
    alert("관리자 로그인이 필요합니다.");
    window.location.replace("login_view.html");
    return;
  }

  const donorForm = document.querySelector("[data-role='search-form']");
  const donorActiveFilters = document.querySelector(
    "[data-role='active-filters']"
  );
  const donorTableBody = document.querySelector(
    "[data-role='donor-table-body']"
  );
  const donorPagination = document.querySelector(
    "[data-role='donor-pagination']"
  );
  const programForm = document.querySelector("[data-role='program-form']");
  const programActiveFilters = document.querySelector(
    "[data-role='program-active-filters']"
  );
  const programTableBody = document.querySelector(
    "[data-role='program-table-body']"
  );
  const programPagination = document.querySelector(
    "[data-role='program-pagination']"
  );
  const companyForm = document.querySelector("[data-role='company-form']");
  const companyActiveFilters = document.querySelector(
    "[data-role='company-active-filters']"
  );
  const companyTableBody = document.querySelector(
    "[data-role='company-table-body']"
  );
  const companyPagination = document.querySelector(
    "[data-role='company-pagination']"
  );
  const companyModal = document.querySelector("[data-role='company-modal']");
  const companyModalTitle = document.querySelector("[data-role='company-modal-title']");
  const companyModalBody = document.querySelector("[data-role='company-modal-body']");
  const donorModal = document.querySelector("[data-role='donor-modal']");
  const donorModalTitle = document.querySelector("[data-role='donor-modal-title']");
  const donorModalBody = document.querySelector("[data-role='donor-modal-body']");
  const logoutButton = document.querySelector("[data-action='logout']");
  const categorySearchForm = document.querySelector("[data-role='category-search-form']");
  const categoryAddForm = document.querySelector("[data-role='category-add-form']");
  const categoryTableBody = document.querySelector("[data-role='category-table-body']");
  const categoryPagination = document.querySelector("[data-role='category-pagination']");
  const API_BASE = "http://localhost:8080";

  const donorState = {
    searchTerm: "",
    searchField: "all",
    sortField: "donor_id",
    hasSearched: false,
    loading: false,
    results: [],
    currentPage: 1,
    pageSize: 6,
  };

  const companyState = {
    keyword: "",
    hasSearched: false,
    loading: false,
    results: [],
    currentPage: 1,
    pageSize: 6,
  };

  const categoryState = {
    keyword: "",
    searchField: "all",
    sortField: "category_id",
    hasSearched: false,
    loading: false,
    results: [],
    currentPage: 1,
    pageSize: 6,
  };

  const donorFieldLabels = {
    all: "전체",
    donor_id: "후원자 ID",
    name: "이름",
    phone: "휴대폰 번호",
    category: "선호 카테고리",
  };

  const programState = {
    keyword: "",
    category: "all",
    status: "all",
    sort: "deadline_asc",
    hasSearched: false,
    loading: false,
    results: [],
    currentPage: 1,
    pageSize: 6,
  };

  const programCategoryLabels = {
    all: "전체",
    others: "기타",
  };

  const programStatusLabels = {
    pending: "신청대기",
    planned: "계획",
    running: "진행 중",
    finished: "종료",
    rejected: "반려",
  };

  const programStatusFallback = {
    PENDING: "pending",
    PLANNED: "planned",
    RUNNING: "running",
    FINISHED: "finished",
    REJECTED: "rejected",
    pending: "pending",
    approved: "running",
    completed: "finished",
    "승인 전": "pending",
    승인전: "pending",
    대기: "pending",
    신청대기: "pending",
    계획: "planned",
    "계획 중": "planned",
    "진행 중": "running",
    진행중: "running",
    진행: "running",
    종료: "finished",
    완료: "finished",
    반려: "rejected",
  };

  const programSortLabels = {
    deadline_asc: "마감일 빠른 순",
    deadline_desc: "마감일 느린 순",
    start_asc: "시작일 빠른 순",
    start_desc: "시작일 느린 순",
    amount_asc: "총 후원금액 적은 순",
    amount_desc: "총 후원금액 많은 순",
  };

  function createChip(text) {
    const chip = document.createElement("span");
    chip.className = "filter-chip";
    chip.textContent = text;
    return chip;
  }

  function paginate(state, rows = []) {
    const pageSize = state.pageSize ?? 6;
    const total = rows.length;
    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    const current = Math.min(Math.max(1, state.currentPage ?? 1), maxPage);
    const start = (current - 1) * pageSize;
    const pageRows = rows.slice(start, start + pageSize);
    return { pageRows, total, current, maxPage, pageSize };
  }

  function renderPagination(container, { current = 1, maxPage = 1, total = 0 } = {}) {
    if (!container) return;
    if (!total || maxPage <= 1) {
      container.innerHTML = "";
      return;
    }

    const prevDisabled = current <= 1;
    const nextDisabled = current >= maxPage;

    const windowSize = 5;
    let start = Math.max(1, current - 2);
    let end = Math.min(maxPage, start + windowSize - 1);
    if (end - start < windowSize - 1) {
      start = Math.max(1, end - windowSize + 1);
    }

    const numberButtons = [];
    for (let page = start; page <= end; page += 1) {
      numberButtons.push(
        `<button type="button" class="pager-btn ${page === current ? "is-active" : ""}" data-action="page" data-page="${page}">${page}</button>`
      );
    }

    container.innerHTML = `
      <span class="pagination-meta">총 ${total}건</span>
      <div class="pagination-buttons">
        <button type="button" class="pager-btn" data-action="page" data-page="1" ${prevDisabled ? "disabled" : ""}>&laquo;</button>
        <button type="button" class="pager-btn" data-action="page" data-page="${Math.max(1, current - 1)}" ${prevDisabled ? "disabled" : ""}>&lsaquo;</button>
        ${numberButtons.join("")}
        <button type="button" class="pager-btn" data-action="page" data-page="${Math.min(maxPage, current + 1)}" ${nextDisabled ? "disabled" : ""}>&rsaquo;</button>
        <button type="button" class="pager-btn" data-action="page" data-page="${maxPage}" ${nextDisabled ? "disabled" : ""}>&raquo;</button>
      </div>
    `;
  }

  function resolveCategoryInfo(program = {}) {
    const code = program.category_id ?? program.category ?? null;
    const label =
      program.category_name ??
      program.category_label ??
      program.category ??
      "-";
    return { code, label };
  }

  function resolveStatusInfo(program = {}) {
    const rawValue = program.status ?? program.status_name ?? "";
    const rawString = rawValue.toString();
    const normalized =
      programStatusFallback[rawString] ??
      programStatusFallback[rawString.toUpperCase()] ??
      rawString.toLowerCase();
    const code = programStatusLabels[normalized]
      ? normalized
      : programStatusFallback[normalized] ?? normalized;
    const fallbackLabel =
      program.status_label ?? programStatusLabels[code] ?? rawString;
    const label = fallbackLabel ? fallbackLabel : "-";
    return { code, label };
  }

  function renderDonorActiveFilters() {
    if (!donorActiveFilters) return;

    donorActiveFilters.innerHTML = "";

    if (!donorState.hasSearched) {
      donorActiveFilters.innerHTML =
        '<p class="active-filters__empty">검색 조건을 설정해 주세요.</p>';
      return;
    }

    const label = document.createElement("span");
    label.className = "active-filters__label";
    label.textContent = "선택한 조건";
    donorActiveFilters.appendChild(label);

    donorActiveFilters.appendChild(
      createChip(`검색어: ${donorState.searchTerm || "전체"}`)
    );
    donorActiveFilters.appendChild(
      createChip(
        `검색 기준: ${
          donorFieldLabels[donorState.searchField] || donorState.searchField
        }`
      )
    );
    donorActiveFilters.appendChild(
      createChip(
        `정렬 기준: ${
          donorFieldLabels[donorState.sortField] || donorState.sortField
        }`
      )
    );
  }

  function renderDonorTable({ rows = [], emptyMessage = "", loading = false }) {
    if (!donorTableBody) return;

    donorTableBody.innerHTML = "";
    if (donorPagination) donorPagination.innerHTML = "";

    if (loading) {
      const loadingRow = document.createElement("tr");
      const loadingCell = document.createElement("td");
      loadingCell.colSpan = 5;
      loadingCell.textContent = "후원자 정보를 불러오는 중입니다...";
      loadingRow.appendChild(loadingCell);
      donorTableBody.appendChild(loadingRow);
      return;
    }

    if (!rows.length) {
      const emptyRow = document.createElement("tr");
      const emptyCell = document.createElement("td");
      emptyCell.colSpan = 5;
      emptyCell.textContent = emptyMessage;
      emptyRow.appendChild(emptyCell);
      donorTableBody.appendChild(emptyRow);
      return;
    }

    const { pageRows, total, current, maxPage } = paginate(donorState, rows);
    donorState.currentPage = current;
    donorState.maxPage = maxPage;
    donorState.totalCount = total;
    renderPagination(donorPagination, { total, current, maxPage });

    pageRows.forEach((donor) => {
      const row = document.createElement("tr");

      const idCell = document.createElement("td");
      idCell.textContent = donor.donor_id;
      row.appendChild(idCell);

      const nameCell = document.createElement("td");
      nameCell.textContent = donor.name;
      row.appendChild(nameCell);

      const phoneCell = document.createElement("td");
      phoneCell.textContent = donor.phone;
      row.appendChild(phoneCell);

      const categoryCell = document.createElement("td");
      const categoryValue =
        donor.preferred_category ?? donor.category ?? "미등록";
      categoryCell.textContent = categoryValue || "미등록";
      row.appendChild(categoryCell);

      const actionCell = document.createElement("td");
      const detailButton = document.createElement("button");
      detailButton.type = "button";
      detailButton.className = "btn-link";
      detailButton.dataset.action = "show-donations";
      detailButton.dataset.donorId = donor.donor_id;
      detailButton.dataset.donorName = donor.name;
      detailButton.textContent = "내역 보기";
      actionCell.appendChild(detailButton);
      row.appendChild(actionCell);

      donorTableBody.appendChild(row);
    });
  }

  async function fetchDonors() {
    const params = new URLSearchParams();

    if (donorState.searchTerm) params.set("keyword", donorState.searchTerm);
    if (donorState.searchField && donorState.searchField !== "all") {
      params.set("searchField", donorState.searchField);
    }
    if (donorState.sortField) params.set("sortField", donorState.sortField);

    const query = params.toString();
    const url = query
      ? `${API_BASE}/api/donors?${query}`
      : `${API_BASE}/api/donors`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("후원자 정보를 가져오지 못했습니다.");
      }
      const data = await response.json();
      donorState.results = Array.isArray(data) ? data : [];
    } catch (error) {
      console.error(error);
      donorState.results = [];
      alert(error.message || "후원자 정보를 불러오는 중 오류가 발생했습니다.");
    }
  }

  async function handleDonorSubmit(event) {
    event.preventDefault();

    donorState.searchTerm = donorForm.searchTerm?.value?.trim() ?? "";
    donorState.searchField = donorForm.searchField?.value ?? "all";
    donorState.sortField = donorForm.sortField?.value ?? "donor_id";
    donorState.hasSearched = true;
    donorState.loading = true;

    renderDonorTable({
      rows: [],
      loading: true,
    });
    renderDonorActiveFilters();

    await fetchDonors();

    donorState.loading = false;
    donorState.currentPage = 1;
    renderDonorTable({
      rows: donorState.results,
      emptyMessage: "조건에 맞는 후원자가 없습니다.",
    });
    renderDonorActiveFilters();
  }

  function handleDonorReset(event) {
    event.preventDefault();
    donorForm.reset();

    donorState.searchTerm = "";
    donorState.searchField = "all";
    donorState.sortField = "donor_id";
    donorState.hasSearched = false;
    donorState.loading = false;
    donorState.results = [];
    donorState.currentPage = 1;

    renderDonorTable({
      rows: [],
      emptyMessage: "검색 조건을 적용하면 결과가 여기에 표시됩니다.",
    });
    renderDonorActiveFilters();
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("ko-KR");
  }

  function formatCurrency(value) {
    if (value === null || value === undefined) return "-";
    const amount = Number(value);
    if (Number.isNaN(amount)) return String(value);
    return `${amount.toLocaleString("ko-KR")}원`;
  }

  function formatAmount(value) {
    return formatCurrency(value);
  }

  function renderDonorModal(donorName, donations = [], summary = {}) {
    if (!donorModal || !donorModalBody || !donorModalTitle) return;
    donorModalTitle.textContent = `${donorName || "후원자"}님의 후원 내역`;

    if (!Array.isArray(donations) || !donations.length) {
      donorModalBody.innerHTML = '<p class="donor-history__empty">후원 내역이 없습니다.</p>';
    } else {
      const items = donations
        .map((item) => {
          const programTitle = item?.program?.program_name ?? item?.program?.title ?? "프로그램";
          const donatedAt = formatDate(item?.donated_at);
          const amountText = formatCurrency(item?.amount);
          const statusLabel = item?.program?.status_label ?? item?.program?.status ?? "";
          return `
            <div class="donor-history__item">
              <div class="donor-history__title">${programTitle}</div>
              <div class="donor-history__meta">후원일: ${donatedAt}</div>
              <div class="donor-history__meta">${amountText}</div>
              <span class="status-badge donor-history__badge">${statusLabel}</span>
            </div>
          `;
        })
        .join("");

      const totalAmount = formatCurrency(summary.total_amount ?? 0);
      const donationCount = summary.donation_count ?? donations.length;

      donorModalBody.innerHTML = `
        <div class="donor-history">
          <div class="donor-history__summary">
            <span>총 후원금: <strong>${totalAmount}</strong></span>
            <span>총 ${donationCount}회</span>
          </div>
          ${items}
        </div>
      `;
    }

    donorModal.classList.add("is-open");
    donorModal.setAttribute("aria-hidden", "false");
  }

  function closeDonorModal() {
    if (!donorModal) return;
    donorModal.classList.remove("is-open");
    donorModal.setAttribute("aria-hidden", "true");
  }

  function renderProgramActiveFilters() {
    if (!programActiveFilters) return;

    programActiveFilters.innerHTML = "";

    if (!programState.hasSearched) {
      programActiveFilters.innerHTML =
        '<p class="active-filters__empty">프로그램 검색 조건을 설정해 주세요.</p>';
      return;
    }

    const label = document.createElement("span");
    label.className = "active-filters__label";
    label.textContent = "선택한 조건";
    programActiveFilters.appendChild(label);

    programActiveFilters.appendChild(
      createChip(`검색어: ${programState.keyword || "전체"}`)
    );
    const categoryLabel =
      programState.category === "all"
        ? "전체"
        : programCategoryLabels[programState.category] ??
          `카테고리 ${programState.category}`;
    programActiveFilters.appendChild(createChip(`카테고리: ${categoryLabel}`));
    const statusLabel =
      programState.status === "all"
        ? "모든 상태"
        : programStatusLabels[programState.status] ?? programState.status;
    programActiveFilters.appendChild(createChip(`상태: ${statusLabel}`));
    programActiveFilters.appendChild(
      createChip(
        `정렬 기준: ${
          programSortLabels[programState.sort] || programState.sort
        }`
      )
    );
  }

  function renderProgramTable({
    rows = [],
    emptyMessage = "",
    loading = false,
  }) {
    if (!programTableBody) return;

    programTableBody.innerHTML = "";
    if (programPagination) programPagination.innerHTML = "";

    if (loading) {
      const loadingRow = document.createElement("tr");
      const loadingCell = document.createElement("td");
      loadingCell.colSpan = 8;
      loadingCell.textContent = "프로그램 정보를 불러오는 중입니다...";
      loadingRow.appendChild(loadingCell);
      programTableBody.appendChild(loadingRow);
      return;
    }

    if (!rows.length) {
      const emptyRow = document.createElement("tr");
      const emptyCell = document.createElement("td");
      emptyCell.colSpan = 8;
      emptyCell.textContent = emptyMessage;
      emptyRow.appendChild(emptyCell);
      programTableBody.appendChild(emptyRow);
      return;
    }

    const { pageRows, total, current, maxPage } = paginate(programState, rows);
    programState.currentPage = current;
    programState.maxPage = maxPage;
    programState.totalCount = total;
    renderPagination(programPagination, { total, current, maxPage });

    pageRows.forEach((program) => {
      const row = document.createElement("tr");

      const programId = program.program_id ?? program.id ?? "-";
      const programName = program.program_name ?? program.name ?? "-";
      const statusInfo = resolveStatusInfo(program);
      const categoryInfo = resolveCategoryInfo(program);
      const isPlanned = statusInfo.code === "planned";

      const idCell = document.createElement("td");
      idCell.textContent = programId;
      row.appendChild(idCell);

      const nameCell = document.createElement("td");
      nameCell.textContent = programName;
      row.appendChild(nameCell);

      const categoryCell = document.createElement("td");
      categoryCell.textContent = categoryInfo.label;
      row.appendChild(categoryCell);

      const statusCell = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = `status-badge status-badge--${
        statusInfo.code ?? "planned"
      }`;
      badge.textContent = statusInfo.label ?? "-";
      statusCell.appendChild(badge);
      row.appendChild(statusCell);

      const startCell = document.createElement("td");
      startCell.textContent = formatDate(
        program.start_date ?? program.start_at ?? program.startDate
      );
      row.appendChild(startCell);

      const endCell = document.createElement("td");
      endCell.textContent = formatDate(
        program.end_date ?? program.end_at ?? program.endDate
      );
      row.appendChild(endCell);

      const amountCell = document.createElement("td");
      amountCell.dataset.type = "amount";
      amountCell.textContent = formatCurrency(
        program.total_amount ?? program.totalAmount
      );
      row.appendChild(amountCell);

      const actionCell = document.createElement("td");
      actionCell.className = "program-actions";
      const detailButton = document.createElement("button");
      detailButton.type = "button";
      detailButton.className = "btn-link";
      detailButton.dataset.action = "show-program";
      detailButton.dataset.programId = programId;
      detailButton.dataset.programName = programName;
      detailButton.textContent = "상세 보기";
      actionCell.appendChild(detailButton);

      row.appendChild(actionCell);

      programTableBody.appendChild(row);
    });
  }

  async function fetchPrograms() {
    const params = new URLSearchParams();

    if (programState.keyword) params.set("keyword", programState.keyword);
    if (programState.category && programState.category !== "all")
      params.set("category", programState.category);
    if (programState.status && programState.status !== "all")
      params.set("status", programState.status);
    if (programState.sort) params.set("sort", programState.sort);

    const query = params.toString();
    const url = query
      ? `${API_BASE}/api/programs?${query}`
      : `${API_BASE}/api/programs`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("프로그램 정보를 가져오지 못했습니다.");
      }
      const data = await response.json();
      programState.results = Array.isArray(data) ? data : [];
    } catch (error) {
      console.error(error);
      alert(
        error.message || "프로그램 정보를 불러오는 중 오류가 발생했습니다."
      );
      programState.results = [];
    }
  }

  async function handleProgramSubmit(event) {
    event.preventDefault();

    programState.keyword = programForm.keyword?.value?.trim() ?? "";
    programState.category = programForm.category?.value ?? "all";
    programState.status = programForm.status?.value ?? "all";
    programState.sort = programForm.sort?.value ?? "deadline_asc";
    programState.hasSearched = true;
    programState.loading = true;

    renderProgramTable({
      rows: [],
      loading: true,
    });
    renderProgramActiveFilters();

    await fetchPrograms();

    programState.loading = false;
    programState.currentPage = 1;
    renderProgramTable({
      rows: programState.results,
      emptyMessage: "조건에 맞는 프로그램이 없습니다.",
    });
    renderProgramActiveFilters();
  }

  function handleProgramReset(event) {
    event.preventDefault();
    programForm.reset();

    programState.keyword = "";
    programState.category = "all";
    programState.status = "all";
    programState.sort = "deadline_asc";
    programState.hasSearched = false;
    programState.loading = false;
    programState.results = [];
    programState.currentPage = 1;

    renderProgramTable({
      rows: [],
      emptyMessage: "프로그램 검색 결과가 여기에 표시됩니다.",
    });
    renderProgramActiveFilters();
  }

  function getCompanyEmptyMessage() {
    return companyState.hasSearched
      ? "조건에 맞는 회사가 없습니다."
      : "검색하면 회사 목록이 여기에 표시됩니다.";
  }

  function renderCompanyActiveFilters() {
    if (!companyActiveFilters) return;

    companyActiveFilters.innerHTML = "";

    if (!companyState.hasSearched || !companyState.keyword) {
      companyActiveFilters.innerHTML =
        '<p class="active-filters__empty">회사 검색 조건을 설정해 주세요.</p>';
      return;
    }

    const label = document.createElement("span");
    label.className = "active-filters__label";
    label.textContent = "선택한 조건";
    companyActiveFilters.appendChild(label);

    companyActiveFilters.appendChild(
      createChip(`검색어: ${companyState.keyword}`)
    );
  }

  function renderCompanyTable({
    rows = [],
    emptyMessage = "",
    loading = false,
  }) {
    if (!companyTableBody) return;

    companyTableBody.innerHTML = "";
    if (companyPagination) companyPagination.innerHTML = "";

    if (loading) {
      const loadingRow = document.createElement("tr");
      const loadingCell = document.createElement("td");
      loadingCell.colSpan = 3;
      loadingCell.textContent = "회사 정보를 불러오는 중입니다...";
      loadingRow.appendChild(loadingCell);
      companyTableBody.appendChild(loadingRow);
      return;
    }

    if (!rows.length) {
      const emptyRow = document.createElement("tr");
      const emptyCell = document.createElement("td");
      emptyCell.colSpan = 3;
      emptyCell.textContent = emptyMessage;
      emptyRow.appendChild(emptyCell);
      companyTableBody.appendChild(emptyRow);
      return;
    }

    const { pageRows, total, current, maxPage } = paginate(companyState, rows);
    companyState.currentPage = current;
    companyState.maxPage = maxPage;
    companyState.totalCount = total;
    renderPagination(companyPagination, { total, current, maxPage });

    pageRows.forEach((company) => {
      const row = document.createElement("tr");
      row.dataset.action = "show-company-programs";
      row.dataset.companyId = company.company_id;

      const nameCell = document.createElement("td");
      nameCell.textContent = company.company_name ?? "-";
      row.appendChild(nameCell);

      const contactCell = document.createElement("td");
      contactCell.textContent = company.contact || "-";
      row.appendChild(contactCell);

      const addressCell = document.createElement("td");
      addressCell.textContent = company.address || "-";
      row.appendChild(addressCell);

      companyTableBody.appendChild(row);
    });
  }

  function renderCategoryTable({
    rows = [],
    emptyMessage = "카테고리를 검색하거나 추가해 주세요.",
    loading = false,
  }) {
    if (!categoryTableBody) return;

    categoryTableBody.innerHTML = "";
    if (categoryPagination) categoryPagination.innerHTML = "";

    if (loading) {
      const loadingRow = document.createElement("tr");
      const loadingCell = document.createElement("td");
      loadingCell.colSpan = 4;
      loadingCell.textContent = "카테고리를 불러오는 중입니다...";
      loadingRow.appendChild(loadingCell);
      categoryTableBody.appendChild(loadingRow);
      return;
    }

    if (!rows.length) {
      const emptyRow = document.createElement("tr");
      const emptyCell = document.createElement("td");
      emptyCell.colSpan = 4;
      emptyCell.textContent = emptyMessage;
      emptyRow.appendChild(emptyCell);
      categoryTableBody.appendChild(emptyRow);
      return;
    }

    const sortedRows = [...rows].sort((a, b) => Number(a.category_id || 0) - Number(b.category_id || 0));
    const { pageRows, total, current, maxPage } = paginate(categoryState, sortedRows);
    categoryState.currentPage = current;
    categoryState.maxPage = maxPage;
    categoryState.totalCount = total;
    renderPagination(categoryPagination, { total, current, maxPage });

    pageRows.forEach((category) => {
      const row = document.createElement("tr");

      const idCell = document.createElement("td");
      idCell.textContent = category.category_id;
      row.appendChild(idCell);

      const nameCell = document.createElement("td");
      nameCell.textContent = category.category_name;
      row.appendChild(nameCell);

      const descCell = document.createElement("td");
      descCell.textContent = category.description || "-";
      row.appendChild(descCell);

      const actionCell = document.createElement("td");
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "btn-delete-plain";
      deleteButton.dataset.action = "delete-category";
      deleteButton.dataset.categoryId = category.category_id;
      deleteButton.textContent = "삭제";
      actionCell.appendChild(deleteButton);
      row.appendChild(actionCell);

      categoryTableBody.appendChild(row);
    });
  }

  function renderCompanyState({ loading = false } = {}) {
    renderCompanyTable({
      rows: companyState.results,
      loading,
      emptyMessage: getCompanyEmptyMessage(),
    });
  }

  async function fetchCompanies() {
    const params = new URLSearchParams();
    if (companyState.keyword) params.set("keyword", companyState.keyword);

    const query = params.toString();
    const url = query
      ? `${API_BASE}/api/companies?${query}`
      : `${API_BASE}/api/companies`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("회사 정보를 가져오지 못했습니다.");
      }
      const data = await response.json();
      companyState.results = Array.isArray(data) ? data : [];
    } catch (error) {
      console.error(error);
      alert(error.message || "회사 정보를 불러오는 중 오류가 발생했습니다.");
      companyState.results = [];
    }
  }

  async function fetchCategories() {
    const params = new URLSearchParams();
    if (categoryState.keyword) params.set("keyword", categoryState.keyword);
    if (categoryState.searchField && categoryState.searchField !== "all") {
      params.set("searchField", categoryState.searchField);
    }
    if (categoryState.sortField) params.set("sortField", categoryState.sortField);

    const query = params.toString();
    const url = query
      ? `${API_BASE}/api/categories?${query}`
      : `${API_BASE}/api/categories`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("카테고리를 불러오지 못했습니다.");
      }
      const data = await response.json();
      categoryState.results = Array.isArray(data) ? data : [];
    } catch (error) {
      console.error(error);
      alert(error.message || "카테고리를 불러오는 중 오류가 발생했습니다.");
      categoryState.results = [];
    }
  }

  async function handleCompanySubmit(event) {
    event.preventDefault();
    companyState.keyword = companyForm.companyKeyword?.value?.trim() ?? "";
    companyState.hasSearched = Boolean(companyState.keyword);
    companyState.loading = true;
    companyState.currentPage = 1;

    renderCompanyState({ loading: true });
    renderCompanyActiveFilters();

    await fetchCompanies();

    companyState.loading = false;
    renderCompanyState();
    renderCompanyActiveFilters();
  }

  async function handleCompanyReset(event) {
    event.preventDefault();
    companyForm.reset();

    companyState.keyword = "";
    companyState.hasSearched = false;
    companyState.loading = true;
    companyState.currentPage = 1;
    renderCompanyState({ loading: true });
    await fetchCompanies();
    companyState.loading = false;
    renderCompanyState();
    renderCompanyActiveFilters();
  }

  async function handleCategorySearch(event) {
    event?.preventDefault?.();
    categoryState.keyword = categorySearchForm.keyword?.value?.trim() ?? "";
    categoryState.searchField = categorySearchForm.searchField?.value ?? "all";
    categoryState.sortField = categorySearchForm.sortField?.value ?? "category_id";
    categoryState.hasSearched = true;
    categoryState.loading = true;
    categoryState.currentPage = 1;

    renderCategoryTable({ loading: true });
    await fetchCategories();

    categoryState.loading = false;
    renderCategoryTable({
      rows: categoryState.results,
      emptyMessage: "조건에 맞는 카테고리가 없습니다.",
    });
  }

  async function handleCategoryReset(event) {
    event?.preventDefault?.();
    categorySearchForm?.reset();
    categoryState.keyword = "";
    categoryState.searchField = "all";
    categoryState.sortField = "category_id";
    categoryState.hasSearched = false;
    categoryState.loading = false;
    categoryState.currentPage = 1;
    categoryState.results = [];
    renderCategoryTable({
      rows: [],
      emptyMessage: "카테고리를 검색하거나 추가해 주세요.",
    });
  }

  async function handleCategoryAdd(event) {
    event.preventDefault();
    const name = categoryAddForm.category_name?.value?.trim();
    const description = categoryAddForm.description?.value?.trim() || null;
    if (!name) {
      alert("카테고리명을 입력해주세요.");
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/api/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_name: name, description }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "카테고리를 추가하지 못했습니다.");
      }
      categoryAddForm.reset();
      await handleCategorySearch();
      alert("카테고리가 추가되었습니다.");
    } catch (error) {
      console.error(error);
      alert(error.message || "카테고리를 추가하지 못했습니다.");
    }
  }

  async function deleteProgramById(programId, programName) {
    if (!programId) return;

    try {
      const response = await fetch(
        `${API_BASE}/api/programs/${encodeURIComponent(programId)}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "프로그램 삭제에 실패했습니다.");
      }

      programState.results = programState.results.filter((program) => {
        const currentId = program.program_id ?? program.id ?? "";
        return String(currentId) !== String(programId);
      });

      if (programState.hasSearched) {
        programState.loading = true;
        renderProgramTable({
          rows: [],
          loading: true,
        });
        await fetchPrograms();
        programState.loading = false;
      }

      const emptyMessage = programState.hasSearched
        ? "조건에 맞는 프로그램이 없습니다."
        : "프로그램 검색 결과가 여기에 표시됩니다.";

      renderProgramTable({
        rows: programState.results,
        emptyMessage,
      });
      renderProgramActiveFilters();

      alert(`${programName || "프로그램"}이(가) 삭제되었습니다.`);
    } catch (error) {
      console.error(error);
      alert(error.message || "프로그램 삭제 중 오류가 발생했습니다.");
    }
  }

  logoutButton?.addEventListener("click", (event) => {
    event.preventDefault();
    window.donorSession?.clearSession?.();
    window.location.replace("login_view.html");
  });

  donorForm?.addEventListener("submit", handleDonorSubmit);
  donorForm?.addEventListener("reset", handleDonorReset);

  programForm?.addEventListener("submit", handleProgramSubmit);
  programForm?.addEventListener("reset", handleProgramReset);

  companyForm?.addEventListener("submit", handleCompanySubmit);
  companyForm?.addEventListener("reset", handleCompanyReset);
  categorySearchForm?.addEventListener("submit", handleCategorySearch);
  categorySearchForm?.addEventListener("reset", handleCategoryReset);
  categoryAddForm?.addEventListener("submit", handleCategoryAdd);

  function handlePaginationClick(event, state, renderFn) {
    const button = event.target.closest("[data-action='page']");
    if (!button) return;
    const targetPage = Number(button.dataset.page);
    if (!Number.isFinite(targetPage)) return;
    const maxPage = state.maxPage ?? 1;
    state.currentPage = Math.min(Math.max(1, targetPage), maxPage);
    renderFn({ rows: state.results, emptyMessage: "" });
  }

  donorPagination?.addEventListener("click", (event) =>
    handlePaginationClick(event, donorState, renderDonorTable)
  );
  programPagination?.addEventListener("click", (event) =>
    handlePaginationClick(event, programState, renderProgramTable)
  );
  companyPagination?.addEventListener("click", (event) =>
    handlePaginationClick(event, companyState, renderCompanyTable)
  );
  categoryPagination?.addEventListener("click", (event) =>
    handlePaginationClick(event, categoryState, renderCategoryTable)
  );

  async function loadInitialData() {
    donorState.loading = true;
    programState.loading = true;
    donorState.currentPage = 1;
    programState.currentPage = 1;
    renderDonorTable({ rows: [], loading: true });
    renderProgramTable({ rows: [], loading: true });

    try {
      await Promise.all([fetchDonors(), fetchPrograms()]);
      donorState.hasSearched = true;
      programState.hasSearched = true;
    } catch (error) {
      console.error(error);
    } finally {
      donorState.loading = false;
      programState.loading = false;
      renderDonorTable({
        rows: donorState.results,
        emptyMessage: "조건에 맞는 후원자가 없습니다.",
      });
      renderDonorActiveFilters();
      renderProgramTable({
        rows: programState.results,
        emptyMessage: "조건에 맞는 프로그램이 없습니다.",
      });
      renderProgramActiveFilters();
    }
  }

  donorTableBody?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action='show-donations']");
    if (!button) return;

    const donorId = button.dataset.donorId;
    const donorName = button.dataset.donorName ?? "";
    if (!donorId) return;

    (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/donors/${encodeURIComponent(donorId)}/summary`);
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "후원 내역을 불러오지 못했습니다.");
        }
        const data = await response.json();
        renderDonorModal(donorName, data.donations || [], data.summary || {});
      } catch (error) {
        console.error(error);
        alert(error.message || "후원 내역을 불러오지 못했습니다.");
      }
    })();
  });

  programTableBody?.addEventListener("click", async (event) => {
    const detailButton = event.target.closest("[data-action='show-program']");
    if (!detailButton) return;

    event.preventDefault();
    const programId = detailButton.dataset.programId ?? "";
    if (!programId) return;
    window.location.href = `admin_program_detail.html?id=${encodeURIComponent(
      programId
    )}`;
  });

  function openCompanyModal(company) {
    if (!companyModal || !companyModalBody || !companyModalTitle) return;

    const programs =
      Array.isArray(company.programs) && company.programs.length
        ? company.programs
        : [];

    companyModalTitle.textContent = `${company.company_name || "회사"}의 프로그램`;
    if (!programs.length) {
      companyModalBody.innerHTML = '<p class="active-filters__empty">등록된 프로그램이 없습니다.</p>';
    } else {
      const items = programs
        .map((program) => {
          const statusCode =
            programStatusFallback[program.status] ??
            program.status?.toLowerCase?.() ??
            "planned";
          const statusLabel =
            program.status_label ?? programStatusLabels[statusCode] ?? program.status ?? "-";
          const endDate = formatDate(program.end_date ?? program.endDate);
          return `
            <li class="company-programs-modal__item">
              <div class="company-programs-modal__info">
                <span class="company-programs-modal__title">${program.program_name ?? program.program_id ?? "프로그램"}</span>
                <span class="company-programs-modal__meta">종료일: ${endDate}</span>
              </div>
              <div class="program-actions">
                <span class="status-badge status-badge--${statusCode}">${statusLabel}</span>
                <a class="btn btn-outline btn-compact" href="admin_program_detail.html?id=${encodeURIComponent(
                  program.program_id
                )}">상세</a>
              </div>
            </li>
          `;
        })
        .join("");

      companyModalBody.innerHTML = `
        <div class="company-programs-modal">
          <ul class="company-programs-modal__list">
            ${items}
          </ul>
        </div>
      `;
    }

    companyModal.classList.add("is-open");
    companyModal.setAttribute("aria-hidden", "false");
  }

  function closeCompanyModal() {
    if (!companyModal) return;
    companyModal.classList.remove("is-open");
    companyModal.setAttribute("aria-hidden", "true");
  }

  companyTableBody?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-action='show-company-programs']");
    if (!row) return;
    const companyId = row.dataset.companyId;
    const company = companyState.results.find(
      (item) => String(item.company_id) === String(companyId)
    );
    if (!company) return;
    openCompanyModal(company);
  });

  companyModal?.addEventListener("click", (event) => {
    const closeTarget = event.target.closest("[data-action='close-company-modal']");
    if (closeTarget) {
      event.preventDefault();
      closeCompanyModal();
    }
  });

  donorModal?.addEventListener("click", (event) => {
    const closeTarget = event.target.closest("[data-action='close-donor-modal']");
    if (closeTarget) {
      event.preventDefault();
      closeDonorModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCompanyModal();
      closeDonorModal();
    }
  });

  categoryTableBody?.addEventListener("click", async (event) => {
    const deleteBtn = event.target.closest("[data-action='delete-category']");
    if (!deleteBtn) return;
    const categoryId = deleteBtn.dataset.categoryId;
    if (!categoryId) return;
    const confirmed = window.confirm("해당 카테고리를 삭제하시겠습니까?");
    if (!confirmed) return;

    try {
      const response = await fetch(`${API_BASE}/api/categories/${encodeURIComponent(categoryId)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "카테고리를 삭제하지 못했습니다.");
      }
      categoryState.results = categoryState.results.filter(
        (item) => String(item.category_id) !== String(categoryId)
      );
      categoryState.results = sortedRows;
      renderCategoryTable({
        rows: categoryState.results,
        emptyMessage: "카테고리를 검색하거나 추가해 주세요.",
      });
    } catch (error) {
      console.error(error);
      alert(error.message || "카테고리를 삭제하지 못했습니다.");
    }
  });

  renderDonorTable({
    emptyMessage: "검색 조건을 적용하면 결과가 여기에 표시됩니다.",
  });
  renderDonorActiveFilters();

  renderProgramTable({
    rows: [],
    emptyMessage: "프로그램 검색 결과가 여기에 표시됩니다.",
  });
  renderProgramActiveFilters();

  renderCompanyState();
  renderCompanyActiveFilters();

  (async () => {
    await loadInitialData();
    companyState.loading = true;
    renderCompanyState({ loading: true });

    try {
      await fetchCompanies();
      await handleCategorySearch();
    } catch (error) {
      console.error(error);
    }

    companyState.loading = false;
    renderCompanyState();

    // 회사 목록 로드 실패 여부와 관계없이 신청 목록은 시도
    await fetchApplications();
  })();
});
