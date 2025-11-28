document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");
  const titleInput = document.getElementById("program-title");
  const checkButton = document.getElementById("check-duplicate");
  const duplicateResult = document.getElementById("duplicate-result");
  const categorySelect = document.getElementById("program-category");
  const monthlyCheckbox = document.getElementById("monthly-donation");
  const monthlyHelper = document.getElementById("monthly-helper");
  const startDateInput = document.getElementById("start-date");
  const endDateInput = document.getElementById("end-date");

  const session = window.donorSession?.getSession?.();
  if (!session || session.role !== "company") {
    alert("기업 계정으로 로그인한 후 이용해주세요.");
    window.location.replace("login_view.html");
    return;
  }

  let lastCheckedTitle = null;
  let isTitleAvailable = false;

  async function fetchCategories() {
    try {
      const res = await fetch("http://localhost:8080/api/categories");
      const data = await res.json();
      const categories = Array.isArray(data) ? data : [];
      categories.forEach((category) => {
        const id = category.category_id ?? category.id;
        const label = category.category_name ?? category.name ?? `카테고리 ${id}`;
        if (!id) return;
        const option = document.createElement("option");
        option.value = id;
        option.textContent = label;
        categorySelect.appendChild(option);
      });
    } catch (error) {
      console.error("카테고리 불러오기 실패", error);
    }
  }

  function setDuplicateMessage(message, status) {
    duplicateResult.textContent = message;
    duplicateResult.classList.remove("ok", "error");
    if (status) duplicateResult.classList.add(status);
  }

  function isMonthlyAllowed() {
    const startValue = startDateInput?.value;
    const endValue = endDateInput?.value;
    if (!startValue || !endValue) return false;

    const start = new Date(startValue);
    const end = new Date(endValue);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;

    const threshold = new Date(start);
    threshold.setMonth(threshold.getMonth() + 6);
    return end.getTime() >= threshold.getTime();
  }

  function updateMonthlyAvailability() {
    const allowed = isMonthlyAllowed();
    if (!monthlyCheckbox) return;

    if (allowed) {
      monthlyCheckbox.disabled = false;
      if (monthlyHelper) monthlyHelper.textContent = "6개월 이상 진행되는 프로그램은 정기 기부를 받을 수 있습니다.";
    } else {
      monthlyCheckbox.checked = false;
      monthlyCheckbox.disabled = true;
      if (monthlyHelper)
        monthlyHelper.textContent = "정기 기부는 최소 6개월 이상 진행되는 프로그램만 설정할 수 있습니다.";
    }
  }

  async function checkDuplicate() {
    const title = titleInput?.value?.trim();
    if (!title) {
      setDuplicateMessage("프로그램 이름을 입력해주세요.", "error");
      return;
    }

    try {
      const res = await fetch(`http://localhost:8080/api/programs?keyword=${encodeURIComponent(title)}`);
      const data = await res.json();
      const programs = Array.isArray(data) ? data : [];
      const hasDuplicate = programs.some((p) => {
        const candidate = (p.title ?? p.program_name ?? "").trim().toLowerCase();
        return candidate === title.toLowerCase();
      });

      lastCheckedTitle = title;
      isTitleAvailable = !hasDuplicate;

      if (hasDuplicate) {
        setDuplicateMessage("이미 같은 이름의 프로그램이 있습니다.", "error");
      } else {
        setDuplicateMessage("사용 가능한 이름입니다.", "ok");
      }
    } catch (error) {
      console.error(error);
      setDuplicateMessage("중복 확인 중 오류가 발생했습니다.", "error");
    }
  }

  titleInput?.addEventListener("input", () => {
    isTitleAvailable = false;
    lastCheckedTitle = null;
    duplicateResult.textContent = "";
    duplicateResult.className = "helper-text";
  });

  checkButton?.addEventListener("click", checkDuplicate);

  startDateInput?.addEventListener("change", updateMonthlyAvailability);
  endDateInput?.addEventListener("change", updateMonthlyAvailability);

  fetchCategories();
  updateMonthlyAvailability();

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const title = titleInput?.value?.trim();
    const categoryId = categorySelect?.value;
    const startDate = form.startDate?.value;
    const endDate = form.endDate?.value;
    const place = form.programPlace?.value?.trim();
    const accountNumber = form.accountNumber?.value?.trim();
    const goalAmount = form.goalAmount?.value;
    const description = form.programDescription?.value?.trim();
    const monthlyAllowed = isMonthlyAllowed();
    const monthlyDonation = monthlyAllowed && Boolean(monthlyCheckbox?.checked);

    if (!title || !categoryId || !startDate || !endDate || !description) {
      alert("필수 정보를 모두 입력해주세요.");
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      alert("마감 날짜는 시작 날짜 이후여야 합니다.");
      return;
    }

    if (lastCheckedTitle !== title) {
      const confirmSkip = confirm("중복 확인을 하지 않았습니다. 그대로 진행할까요?");
      if (!confirmSkip) return;
    } else if (!isTitleAvailable) {
      const confirmDup = confirm("같은 이름의 프로그램이 있습니다. 계속 진행할까요?");
      if (!confirmDup) return;
    }

    const payload = {
      title,
      category_id: Number(categoryId),
      start_date: startDate,
      end_date: endDate,
      place: place || null,
      account_number: accountNumber || null,
      goal_amount: goalAmount ? Number(goalAmount) : null,
      description,
      status: "PENDING",
      host_company_id: session.company_id,
      monthly: monthlyDonation,
    };

    try {
      const res = await fetch("http://localhost:8080/api/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "프로그램 신청에 실패했습니다.");
      }

      alert("프로그램 신청이 완료되었습니다. 신청 현황을 확인해주세요.");
      window.location.href = "program_apply_status.html";
    } catch (error) {
      console.error(error);
      alert(error.message || "프로그램 신청 중 오류가 발생했습니다.");
    }
  });
});
