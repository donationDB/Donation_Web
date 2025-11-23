document.addEventListener("DOMContentLoaded", () => {
  const body = document.querySelector("[data-role='program-status-body']");
  const session = window.donorSession?.getSession?.();

  if (!session || session.role !== "company") {
    alert("기업 계정으로 로그인한 후 이용해주세요.");
    window.location.replace("login_view.html");
    return;
  }

  function renderRows(rows = [], loading = false) {
    if (!body) return;
    body.innerHTML = "";

    if (loading) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.textContent = "데이터를 불러오는 중입니다...";
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }

    if (!rows.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.textContent = "신청한 프로그램이 없습니다.";
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }

    rows.forEach((program) => {
      const row = document.createElement("tr");
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

      const columns = [
        program.program_id ?? program.id ?? "-",
        program.title ?? program.program_name ?? "-",
        statusLabel,
        formatDate(program.start_date ?? program.startDate),
        formatDate(program.end_date ?? program.endDate),
        formatAmount(program.goal_amount ?? program.goalAmount),
      ];

      columns.forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value ?? "-";
        row.appendChild(cell);
      });

      body.appendChild(row);
    });
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
      const res = await fetch(
        `http://localhost:8080/api/programs?host_company_id=${encodeURIComponent(
          session.company_id
        )}`
      );
      const data = await res.json();
      const programs = Array.isArray(data) ? data : [];
      renderRows(programs, false);
    } catch (error) {
      console.error(error);
      renderRows([], false);
    }
  }

  loadPrograms();
});
