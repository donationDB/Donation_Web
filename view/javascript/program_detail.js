(function () {
  // API 엔드포인트: window.API_BASE 우선, 없으면 현재 origin을 기반으로 결정
  const API_BASE = (() => {
    const custom = window.API_BASE && window.API_BASE.replace(/\/$/, "");
    if (custom) return custom;
    const origin = window.location.origin.replace(/\/$/, "");
    if (!origin.includes(":8080")) {
      return "http://127.0.0.1:8080/api";
    }
    return `${origin}/api`;
  })();

  function getParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      programId: params.get("programId") || "",
      category: params.get("category") || "",
      categoryName: params.get("name") || "",
    };
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

  function formatCurrency(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) return "-";
    if (amount === 0) return "0원";
    return `${amount.toLocaleString("ko-KR")}원`;
  }

  function applyCover(element, program) {
    if (!element) return;
    const cover =
      program.thumbnail_url ||
      program.thumbnail ||
      program.image_url ||
      program.image ||
      program.banner_url ||
      null;

    if (cover) {
      element.style.backgroundImage = `url(${cover})`;
    }
  }

  async function loadProgram(programId) {
    const detail = document.querySelector('[data-role="program-detail"]');
    const empty = document.querySelector('[data-role="empty-state"]');

    if (!programId || !detail || !empty) {
      empty.removeAttribute("hidden");
      return;
    }

    const fetchDetail = async () => {
      const urls = [
        `${API_BASE}/programs/${encodeURIComponent(programId)}`,
        `${API_BASE}/donor/programs/${encodeURIComponent(programId)}`,
      ];
      let lastError;
      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (!res.ok) {
            lastError = new Error(`요청 실패: ${res.status}`);
            continue;
          }
          return await res.json();
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError || new Error("프로그램을 찾을 수 없습니다.");
    };

    try {
      const program = await fetchDetail();

      const title = detail.querySelector('[data-field="title"]');
      const category = detail.querySelector('[data-field="category"]');
      const summary = detail.querySelector('[data-field="summary"]');
      const status = detail.querySelector('[data-field="status"]');
      const period = detail.querySelector('[data-field="period"]');
      const locationField = detail.querySelector('[data-field="location"]');
      const goal = detail.querySelector('[data-field="goal"]');
      const total = detail.querySelector('[data-field="total"]');
      const description = detail.querySelector('[data-field="description"]');
      const additionalSection = document.querySelector('[data-role="additional-info"]');
      const additional = detail.querySelector('[data-field="additional"]');
      const donateButton = detail.querySelector('[data-action="donate"]');

      if (title) title.textContent = program.title || program.program_name || "프로그램";
      if (category) category.textContent = program.category_name || "기부 분야";
      if (summary) {
        const summaryText = program.summary || program.goal_description || program.description || "";
        summary.textContent = summaryText.trim() || "진행 중 프로그램을 확인하고 따뜻한 마음을 나눠보세요.";
      }
      if (status) {
        const label = program.status_label || program.status || program.status_code || "진행 중";
        status.textContent = label;
      }
      if (period) period.textContent = formatPeriod(program.start_date, program.end_date);
      if (locationField) locationField.textContent = program.location || program.place || "장소 미정";
      if (goal) goal.textContent = formatCurrency(program.goal_amount);
      if (total) total.textContent = formatCurrency(program.total_amount);
      if (description) {
        const desc = program.description || program.goal_description || "상세 설명이 준비 중입니다.";
        description.textContent = desc;
      }

      if (additionalSection && additional) {
        const extra = program.additional_info || program.organization || program.contact || "";
        if (extra) {
          additional.textContent = typeof extra === "string" ? extra : JSON.stringify(extra, null, 2);
          additionalSection.removeAttribute("hidden");
        } else {
          additionalSection.setAttribute("hidden", "true");
        }
      }

      applyCover(detail.querySelector('[data-field="cover"]'), program);

      if (donateButton) {
        if (program.program_id) {
          donateButton.href = `donation.html?programId=${encodeURIComponent(program.program_id)}`;
        } else {
          donateButton.href = "donation.html";
        }
      }

      detail.removeAttribute("hidden");
    } catch (error) {
      console.error(error);
      empty.removeAttribute("hidden");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const params = getParams();
    const backToCategory = document.querySelector('[data-role="back-to-category"]');
    if (backToCategory && params.category) {
      const search = new URLSearchParams({
        category: params.category,
        name: params.categoryName || "",
      }).toString();
      backToCategory.href = `category_programs.html?${search}`;
    }

    loadProgram(params.programId);
  });
})();
