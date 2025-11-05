document.addEventListener("DOMContentLoaded", () => {
  const session = window.donorSession?.getSession?.();

  if (!session || session.role !== "admin") {
    alert("관리자 로그인이 필요합니다.");
    window.location.replace("login_view.html");
    return;
  }

  const donorForm = document.querySelector("[data-role='search-form']");
  const donorActiveFilters = document.querySelector("[data-role='active-filters']");
  const donorTableBody = document.querySelector("[data-role='donor-table-body']");
  const programForm = document.querySelector("[data-role='program-form']");
  const programActiveFilters = document.querySelector("[data-role='program-active-filters']");
  const programTableBody = document.querySelector("[data-role='program-table-body']");
  const companyForm = document.querySelector("[data-role='company-form']");
  const companyActiveFilters = document.querySelector("[data-role='company-active-filters']");
  const companyTableBody = document.querySelector("[data-role='company-table-body']");
  const logoutButton = document.querySelector("[data-action='logout']");
  const API_BASE = "http://localhost:8080";

  const donorState = {
    searchTerm: "",
    searchField: "all",
    sortField: "donor_id",
    hasSearched: false,
    loading: false,
    results: [],
  };

  const companyState = {
    keyword: "",
    hasSearched: false,
    loading: false,
    results: [],
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
  };

  const programCategoryLabels = {
    all: "전체",
    children: "아동",
    environment: "환경",
    education: "교육",
    animal: "동물",
    health: "보건",
    others: "기타",
  };

  const programCategoryFallback = {
    아동: "children",
    환경: "environment",
    교육: "education",
    동물: "animal",
    보건: "health",
    기타: "others",
  };

  const programStatusLabels = {
    pending: "승인 전",
    approved: "승인 완료",
    rejected: "반려",
    in_progress: "진행 중",
    completed: "진행 완료",
  };

  const programStatusFallback = {
    "승인 전": "pending",
    승인전: "pending",
    "승인 완료": "approved",
    승인완료: "approved",
    반려: "rejected",
    "진행 중": "in_progress",
    진행중: "in_progress",
    "진행 완료": "completed",
    진행완료: "completed",
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

  function resolveCategoryInfo(program = {}) {
    const rawCode = (program.category ?? program.category_name ?? "").toString().toLowerCase();
    const rawLabel = program.category_label ?? "";

    if (rawLabel && rawCode) return { code: rawCode, label: rawLabel };

    if (rawLabel && programCategoryFallback[rawLabel]) {
      const code = programCategoryFallback[rawLabel];
      return { code, label: rawLabel };
    }

    if (rawCode && programCategoryLabels[rawCode]) {
      return { code: rawCode, label: programCategoryLabels[rawCode] };
    }

    if (rawCode && programCategoryFallback[rawCode]) {
      const code = programCategoryFallback[rawCode];
      return { code, label: programCategoryLabels[code] ?? rawLabel ?? rawCode };
    }

    return { code: rawCode || "others", label: rawLabel || rawCode || "-" };
  }

  function resolveStatusInfo(program = {}) {
    const rawCode = (program.status ?? program.status_name ?? "").toString().toLowerCase().replace(/\s+/g, "_");
    const rawLabel = program.status_label ?? program.status_name ?? program.status ?? "";

    if (rawLabel && rawCode && programStatusLabels[rawCode]) {
      return { code: rawCode, label: rawLabel };
    }

    if (rawLabel && programStatusFallback[rawLabel]) {
      const code = programStatusFallback[rawLabel];
      return { code, label: programStatusLabels[code] ?? rawLabel };
    }

    if (rawCode && programStatusLabels[rawCode]) {
      return { code: rawCode, label: programStatusLabels[rawCode] };
    }

    if (programStatusFallback[rawCode]) {
      const code = programStatusFallback[rawCode];
      return { code, label: programStatusLabels[code] ?? rawLabel ?? program.status ?? "-" };
    }

    return { code: rawCode || "pending", label: rawLabel || program.status || "-" };
  }

  function renderDonorActiveFilters() {
    if (!donorActiveFilters) return;

    donorActiveFilters.innerHTML = "";

    if (!donorState.hasSearched) {
      donorActiveFilters.innerHTML = '<p class="active-filters__empty">검색 조건을 설정해 주세요.</p>';
      return;
    }

    const label = document.createElement("span");
    label.className = "active-filters__label";
    label.textContent = "선택한 조건";
    donorActiveFilters.appendChild(label);

    donorActiveFilters.appendChild(createChip(`검색어: ${donorState.searchTerm || "전체"}`));
    donorActiveFilters.appendChild(
      createChip(`검색 기준: ${donorFieldLabels[donorState.searchField] || donorState.searchField}`),
    );
    donorActiveFilters.appendChild(
      createChip(`정렬 기준: ${donorFieldLabels[donorState.sortField] || donorState.sortField}`),
    );
  }

  function renderDonorTable({ rows = [], emptyMessage = "", loading = false }) {
    if (!donorTableBody) return;

    donorTableBody.innerHTML = "";

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

    rows.forEach((donor) => {
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
      const categoryValue = donor.preferred_category ?? donor.category ?? "미등록";
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
    const url = query ? `${API_BASE}/api/donors?${query}` : `${API_BASE}/api/donors`;

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

  function renderProgramActiveFilters() {
    if (!programActiveFilters) return;

    programActiveFilters.innerHTML = "";

    if (!programState.hasSearched) {
      programActiveFilters.innerHTML = '<p class="active-filters__empty">프로그램 검색 조건을 설정해 주세요.</p>';
      return;
    }

    const label = document.createElement("span");
    label.className = "active-filters__label";
    label.textContent = "선택한 조건";
    programActiveFilters.appendChild(label);

    programActiveFilters.appendChild(createChip(`검색어: ${programState.keyword || "전체"}`));
    programActiveFilters.appendChild(
      createChip(`카테고리: ${programCategoryLabels[programState.category] || programState.category}`),
    );
    programActiveFilters.appendChild(
      createChip(
        `상태: ${
          programState.status === "all"
            ? "모든 상태"
            : programStatusLabels[programState.status] || programState.status
        }`,
      ),
    );
    programActiveFilters.appendChild(
      createChip(`정렬 기준: ${programSortLabels[programState.sort] || programState.sort}`),
    );
  }

  function renderProgramTable({ rows = [], emptyMessage = "", loading = false }) {
    if (!programTableBody) return;

    programTableBody.innerHTML = "";

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

    rows.forEach((program) => {
      const row = document.createElement("tr");

      const programId = program.program_id ?? program.id ?? "-";
      const programName = program.program_name ?? program.name ?? "-";
      const statusInfo = resolveStatusInfo(program);
      const categoryInfo = resolveCategoryInfo(program);
      const isPending = statusInfo.code === "pending";

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
      badge.className = `status-badge status-badge--${statusInfo.code ?? "pending"}`;
      badge.textContent = statusInfo.label ?? "-";
      statusCell.appendChild(badge);
      row.appendChild(statusCell);

      const startCell = document.createElement("td");
      startCell.textContent = formatDate(program.start_date ?? program.start_at ?? program.startDate);
      row.appendChild(startCell);

      const endCell = document.createElement("td");
      endCell.textContent = formatDate(program.end_date ?? program.end_at ?? program.endDate);
      row.appendChild(endCell);

      const amountCell = document.createElement("td");
      amountCell.dataset.type = "amount";
      amountCell.textContent = formatCurrency(program.total_amount ?? program.totalAmount);
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

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "btn-link btn-link--danger";
      deleteButton.dataset.action = "delete-program";
      deleteButton.dataset.programId = programId;
      deleteButton.dataset.programName = programName;
      deleteButton.disabled = !isPending;
      deleteButton.classList.toggle("is-disabled", !isPending);
      deleteButton.setAttribute("aria-disabled", String(!isPending));
      deleteButton.textContent = "삭제";
      actionCell.appendChild(deleteButton);

      row.appendChild(actionCell);

      programTableBody.appendChild(row);
    });
  }

  async function fetchPrograms() {
    const params = new URLSearchParams();

    if (programState.keyword) params.set("keyword", programState.keyword);
    if (programState.category && programState.category !== "all") params.set("category", programState.category);
    if (programState.status && programState.status !== "all") params.set("status", programState.status);
    if (programState.sort) params.set("sort", programState.sort);

    const query = params.toString();
    const url = query ? `${API_BASE}/api/programs?${query}` : `${API_BASE}/api/programs`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("프로그램 정보를 가져오지 못했습니다.");
      }
      const data = await response.json();
      programState.results = Array.isArray(data) ? data : [];
    } catch (error) {
      console.error(error);
      alert(error.message || "프로그램 정보를 불러오는 중 오류가 발생했습니다.");
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
      companyActiveFilters.innerHTML = '<p class="active-filters__empty">회사 검색 조건을 설정해 주세요.</p>';
      return;
    }

    const label = document.createElement("span");
    label.className = "active-filters__label";
    label.textContent = "선택한 조건";
    companyActiveFilters.appendChild(label);

    companyActiveFilters.appendChild(createChip(`검색어: ${companyState.keyword}`));
  }

  function renderCompanyTable({ rows = [], emptyMessage = "", loading = false }) {
    if (!companyTableBody) return;

    companyTableBody.innerHTML = "";

    if (loading) {
      const loadingRow = document.createElement("tr");
      const loadingCell = document.createElement("td");
      loadingCell.colSpan = 4;
      loadingCell.textContent = "회사 정보를 불러오는 중입니다...";
      loadingRow.appendChild(loadingCell);
      companyTableBody.appendChild(loadingRow);
      return;
    }

    if (!rows.length) {
      const emptyRow = document.createElement("tr");
      const emptyCell = document.createElement("td");
      emptyCell.colSpan = 4;
      emptyCell.textContent = emptyMessage;
      emptyRow.appendChild(emptyCell);
      companyTableBody.appendChild(emptyRow);
      return;
    }

    rows.forEach((company) => {
      const row = document.createElement("tr");

      const nameCell = document.createElement("td");
      nameCell.textContent = company.company_name ?? "-";
      row.appendChild(nameCell);

      const contactCell = document.createElement("td");
      contactCell.textContent = company.contact || "-";
      row.appendChild(contactCell);

      const addressCell = document.createElement("td");
      addressCell.textContent = company.address || "-";
      row.appendChild(addressCell);

      const programCell = document.createElement("td");
      const programList = document.createElement("ul");
      programList.className = "company-programs";

      if (Array.isArray(company.programs) && company.programs.length) {
        company.programs.forEach((program) => {
          const item = document.createElement("li");
          item.className = "company-programs__item";

          const link = document.createElement("a");
          link.href = `admin_program_detail.html?id=${encodeURIComponent(program.program_id)}`;
          link.className = "company-programs__link";
          link.dataset.action = "open-program";
          link.dataset.programId = program.program_id;
          link.textContent = program.program_name ?? program.program_id ?? "프로그램";
          item.appendChild(link);

          const badge = document.createElement("span");
          badge.className = `status-badge status-badge--${program.status ?? "pending"}`;
          badge.textContent = program.status_label ?? programStatusLabels[program.status] ?? program.status ?? "-";
          item.appendChild(badge);

          programList.appendChild(item);
        });
      } else {
        const item = document.createElement("li");
        item.className = "company-programs__item";
        item.textContent = "등록된 프로그램이 없습니다.";
        programList.appendChild(item);
      }

      programCell.appendChild(programList);
      row.appendChild(programCell);

      companyTableBody.appendChild(row);
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
    const url = query ? `${API_BASE}/api/companies?${query}` : `${API_BASE}/api/companies`;

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

  async function handleCompanySubmit(event) {
    event.preventDefault();
    companyState.keyword = companyForm.companyKeyword?.value?.trim() ?? "";
    companyState.hasSearched = Boolean(companyState.keyword);
    companyState.loading = true;

    renderCompanyState({ loading: true });
    renderCompanyActiveFilters();

    await fetchCompanies();

    companyState.loading = false;
    renderCompanyState();
    renderCompanyActiveFilters();
  }

  function handleCompanyReset(event) {
    event.preventDefault();
    companyForm.reset();

    companyState.keyword = "";
    companyState.hasSearched = false;
    companyState.loading = false;
    companyState.results = [];

    renderCompanyState();
    renderCompanyActiveFilters();
  }

  async function deleteProgramById(programId, programName) {
    if (!programId) return;

    try {
      const response = await fetch(`${API_BASE}/api/programs/${encodeURIComponent(programId)}`, {
        method: "DELETE",
      });

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

  donorTableBody?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action='show-donations']");
    if (!button) return;

    const donorName = button.dataset.donorName ?? "";
    window.alert(`개인 후원 내역 조회는 추후 연결 예정입니다.\n(후원자: ${donorName})`);
  });

  programTableBody?.addEventListener("click", async (event) => {
    const deleteButton = event.target.closest("[data-action='delete-program']");
    if (deleteButton) {
      event.preventDefault();
      const programId = deleteButton.dataset.programId ?? "";
      const programName = deleteButton.dataset.programName ?? programId;
      if (!programId) return;

      const confirmed = window.confirm(`${programName} 프로그램을 삭제하시겠습니까?`);
      if (!confirmed) return;

      await deleteProgramById(programId, programName);
      return;
    }

    const detailButton = event.target.closest("[data-action='show-program']");
    if (!detailButton) return;

    event.preventDefault();
    const programId = detailButton.dataset.programId ?? "";
    if (!programId) return;
    window.location.href = `admin_program_detail.html?id=${encodeURIComponent(programId)}`;
  });

  companyTableBody?.addEventListener("click", (event) => {
    const link = event.target.closest("[data-action='open-program']");
    if (!link) return;

    event.preventDefault();
    const programId = link.dataset.programId ?? "";
    if (!programId) return;
    window.location.href = `admin_program_detail.html?id=${encodeURIComponent(programId)}`;
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
    companyState.loading = true;
    renderCompanyState({ loading: true });
    await fetchCompanies();
    companyState.loading = false;
    renderCompanyState();
  })();
});
