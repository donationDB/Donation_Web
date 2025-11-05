document.addEventListener("DOMContentLoaded", () => {
  const session = window.donorSession?.getSession?.();
  if (!session || session.role !== "admin") {
    alert("관리자 로그인이 필요합니다.");
    window.location.replace("login_view.html");
    return;
  }

  const API_BASE = "http://localhost:8080";
  const params = new URLSearchParams(window.location.search);
  const programId = params.get("id") || params.get("programId");

  if (!programId) {
    alert("프로그램 ID가 전달되지 않았습니다.");
    window.location.replace("admin_dashboard.html");
    return;
  }

  const fields = {
    title: document.querySelector("[data-field='title']"),
    programId: document.querySelector("[data-field='program-id']"),
    startDate: document.querySelector("[data-field='start-date']"),
    endDate: document.querySelector("[data-field='end-date']"),
    location: document.querySelector("[data-field='location']"),
    status: document.querySelector("[data-field='status']"),
    goal: document.querySelector("[data-field='goal']"),
    category: document.querySelector("[data-field='category']"),
    organization: document.querySelector("[data-field='organization']"),
    contact: document.querySelector("[data-field='contact']"),
  };

  const approveButton = document.querySelector("[data-action='approve']");
  const rejectButton = document.querySelector("[data-action='reject']");

  const categoryLabels = {
    children: "아동",
    environment: "환경",
    education: "교육",
    animal: "동물",
    health: "보건",
    others: "기타",
  };

  const statusLabels = {
    pending: "승인 전",
    approved: "승인 완료",
    rejected: "반려",
    in_progress: "진행 중",
    completed: "진행 완료",
  };

  const state = {
    program: null,
  };

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return `${date.toLocaleDateString("ko-KR")} ${date.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })}`;
  }

  function setField(node, value) {
    if (!node) return;
    node.textContent = value ?? "-";
  }

  function updateButtons(status) {
    const isPending = status === "pending";
    approveButton.disabled = !isPending;
    rejectButton.disabled = !isPending;
  }

  function renderProgram(program) {
    state.program = program;
    const statusCode = (program.status ?? "").toString().toLowerCase().replace(/\s+/g, "_");
    const statusLabel = program.status_label ?? statusLabels[statusCode] ?? program.status ?? "정보 없음";
    const categoryCode = (program.category ?? "").toString().toLowerCase();
    const categoryLabel = program.category_label ?? categoryLabels[categoryCode] ?? program.category ?? "-";

    const safe = {
      id: program.program_id ?? program.id ?? "-",
      name: program.program_name ?? program.name ?? "-",
      start: program.start_date ?? program.start_at ?? program.startDate,
      end: program.end_date ?? program.end_at ?? program.endDate,
      location: program.location ?? program.place ?? program.address ?? "제공되지 않음",
      goalText: program.goal_description ?? program.goal_text ?? program.purpose ?? "제공되지 않음",
      organization: program.organization ?? program.company_name ?? "제공되지 않음",
      contact: program.contact ?? program.company_phone ?? program.phone ?? "제공되지 않음",
      statusCode,
      statusLabel,
      categoryLabel,
    };

    setField(fields.title, `${safe.name} 상세 정보`);
    setField(fields.programId, `프로그램 번호: ${safe.id}`);
    setField(fields.startDate, formatDate(safe.start));
    setField(fields.endDate, formatDate(safe.end));
    setField(fields.location, safe.location);
    setField(fields.goal, safe.goalText);
    setField(fields.category, safe.categoryLabel);
    setField(fields.organization, safe.organization);
    setField(fields.contact, safe.contact);
    setField(fields.status, safe.statusLabel);

    updateButtons(safe.statusCode);
  }

  async function fetchProgram() {
    try {
      const response = await fetch(`${API_BASE}/api/programs/${encodeURIComponent(programId)}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "프로그램 정보를 불러오지 못했습니다.");
      }
      const program = await response.json();
      renderProgram(program);
    } catch (error) {
      console.error(error);
      alert(error.message || "프로그램 정보를 불러오지 못했습니다.");
      window.location.replace("admin_dashboard.html");
    }
  }

  async function updateStatus(nextStatus) {
    if (!state.program) return;
    const programName = state.program.program_name ?? state.program.name ?? programId;
    const message =
      nextStatus === "approved"
        ? `${programName} 프로그램을 승인하시겠습니까?`
        : `${programName} 프로그램을 반려하시겠습니까?`;
    if (!window.confirm(message)) return;

    try {
      const response = await fetch(`${API_BASE}/api/programs/${encodeURIComponent(programId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "프로그램 상태를 변경하지 못했습니다.");
      }

      const program = await response.json();
      renderProgram(program);
      alert(`${program.program_name || "프로그램"} 상태가 변경되었습니다.`);
    } catch (error) {
      console.error(error);
      alert(error.message || "프로그램 상태 변경 중 오류가 발생했습니다.");
    }
  }

  approveButton.addEventListener("click", () => updateStatus("approved"));
  rejectButton.addEventListener("click", () => updateStatus("rejected"));

  fetchProgram();
});
