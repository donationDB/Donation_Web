document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = (() => {
    const custom = window.API_BASE && window.API_BASE.replace(/\/$/, "");
    if (custom) return custom;
    const origin = window.location.origin.replace(/\/$/, "");
    if (!origin.includes(":8080")) {
      return "http://127.0.0.1:8080/api";
    }
    return `${origin}/api`;
  })();

  const body = document.querySelector("[data-role='program-status-body']");
  const refreshButton = document.querySelector("[data-action='refresh-status']");
  const session = window.donorSession?.getSession?.();
  const hostCompanyId = session?.company_id ?? session?.host_company_id ?? null;

  if (!session || session.role !== "company" || !hostCompanyId) {
    alert("기업 계정으로 로그인한 후 이용해주세요.");
    window.location.replace("login_view.html");
    return;
  }

  function renderRows(rows = [], loading = false) {
    if (!body) return;
    body.innerHTML = "";

    if (loading) {
      const row = document.createElement("div");
      row.className = "status-row status-row--loading";
      row.textContent = "데이터를 불러오는 중입니다...";
      body.appendChild(row);
      return;
    }

    const pendingList = rows.filter(
      (program) => (program.status ?? "").toString().toUpperCase() === "PENDING"
    );
    const otherList = rows.filter(
      (program) => (program.status ?? "").toString().toUpperCase() !== "PENDING"
    );

    const renderList = (list = [], titleText = "") => {
      if (!list.length) return;
      const groupTitle = document.createElement("div");
      groupTitle.className = "status-row__group-title";
      groupTitle.textContent = titleText;
      body.appendChild(groupTitle);

      list.forEach((program) => {
        const row = document.createElement("div");
        row.className = "status-row";
        const status = (program.status ?? "planned").toString().toUpperCase();
        const statusLabel =
          status === "PENDING"
            ? "신청대기"
            : status === "RUNNING"
            ? "진행 중"
            : status === "FINISHED"
            ? "종료"
            : status === "REJECTED"
            ? "반려"
            : "계획";

        const title = program.title ?? program.program_name ?? "-";
        const start = formatDate(program.start_date ?? program.startDate);
        const end = formatDate(program.end_date ?? program.endDate);
        const goalValue = Number(program.goal_amount ?? program.goalAmount ?? 0);
        const currentValue = Number(program.total_amount ?? program.totalAmount ?? 0);
        const donorCount = Number(program.donor_count ?? program.donorCount ?? 0);
        const goal = formatAmount(goalValue);
        const current = formatAmount(currentValue);
        const percent = goalValue > 0 ? Math.min(999, Math.round((currentValue / goalValue) * 100)) : 0;

        const titleCol = document.createElement("div");
        titleCol.className = "status-row__title";
        titleCol.textContent = title;

        const dateCol = document.createElement("div");
        dateCol.className = "status-row__meta";
        dateCol.innerHTML = `<strong>기간</strong><span>${start} ~ ${end}</span>`;

        const goalCol = document.createElement("div");
        goalCol.className = "status-row__meta";
        goalCol.innerHTML = `<strong>목표 금액</strong><span>${goal}</span>`;

        const statusCol = document.createElement("div");
        statusCol.innerHTML = `<span class="badge badge--${status.toLowerCase()}">${statusLabel}</span>`;

        row.append(titleCol, dateCol, goalCol);

        if (status !== "PENDING") {
          const amountCol = document.createElement("div");
          amountCol.className = "status-row__meta";
          amountCol.innerHTML = `<strong>현재 모금</strong><span>${current} (${percent}%)</span>`;
          const donorCol = document.createElement("div");
          donorCol.className = "status-row__meta";
          donorCol.innerHTML = `<strong>후원자 수</strong><span>${donorCount}명</span>`;
          row.append(amountCol, donorCol);
        }

        row.append(statusCol);
        body.appendChild(row);
      });
    };

    if (!pendingList.length && !otherList.length) {
      const row = document.createElement("div");
      row.className = "status-row status-row--empty";
      row.textContent = "신청한 프로그램이 없습니다.";
      body.appendChild(row);
      return;
    }

    renderList(pendingList, "신청 대기");
    renderList(otherList, "기존/진행 프로그램");
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toISOString().split("T")[0];
  }

  function formatAmount(value) {
    if (value === null || value === undefined) return "-";
    const num = Number(value);
    if (Number.isNaN(num)) return value;
    return num.toLocaleString("ko-KR");
  }

  async function loadPrograms() {
    renderRows([], true);
    try {
      const res = await fetch(`${API_BASE}/programs?host_company_id=${encodeURIComponent(hostCompanyId)}`);
      if (!res.ok) {
        throw new Error("신청 목록을 불러오지 못했습니다.");
      }
      const data = await res.json();
      const programs = (Array.isArray(data) ? data : []).filter(
        (program) => Number(program.host_company_id ?? program.company_id) === Number(hostCompanyId)
      );
      renderRows(programs, false);
    } catch (error) {
      console.error(error);
      renderRows([], false);
    }
  }

  loadPrograms();
  refreshButton?.addEventListener("click", (event) => {
    event.preventDefault();
    loadPrograms();
  });
});
