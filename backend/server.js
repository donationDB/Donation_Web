import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import cron from "node-cron";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

const SAMPLE_PROGRAMS = [
  {
    program_id: "PRG-1001",
    program_name: "따뜻한 겨울나기 캠페인",
    category: "children",
    status: "approved",
    start_date: "2024-12-01",
    end_date: "2025-02-28",
    total_amount: 12500000,
    company_id: "C-1001",
    location: "경산아동센터 위치",
    goal_description: "겨울철 어린이 온기 지원",
    organization: "경산아동센터",
    contact: "010-1111-2222",
  },
  {
    program_id: "PRG-1002",
    program_name: "초록 숲 가꾸기 프로젝트",
    category: "environment",
    status: "in_progress",
    start_date: "2024-10-01",
    end_date: "2025-03-31",
    total_amount: 7800000,
    company_id: "C-1002",
    location: "수원 광교산 일대",
    goal_description: "미세먼지 저감을 위한 도시 숲 조성",
    organization: "푸른도시연구회",
    contact: "02-345-6789",
  },
  {
    program_id: "PRG-1003",
    program_name: "농어촌 아동 교육 지원",
    category: "education",
    status: "pending",
    start_date: "2025-03-01",
    end_date: "2025-12-31",
    total_amount: 0,
    company_id: "C-1001",
    location: "전남 완도군 아동센터",
    goal_description: "디지털 격차 해소를 위한 기초 교육",
    organization: "희망나눔재단",
    contact: "031-200-1234",
  },
  {
    program_id: "PRG-1004",
    program_name: "반려동물 치료비 후원",
    category: "animal",
    status: "completed",
    start_date: "2023-05-01",
    end_date: "2023-10-31",
    total_amount: 18200000,
    company_id: "C-1003",
    location: "서울 반려동물 지원센터",
    goal_description: "치료가 시급한 반려동물 치료비 지원",
    organization: "함께하는 PAWS",
    contact: "010-5555-9876",
  },
  {
    program_id: "PRG-1005",
    program_name: "희망 헌혈 릴레이",
    category: "health",
    status: "rejected",
    start_date: "2024-08-15",
    end_date: "2024-11-30",
    total_amount: 0,
    company_id: "C-1004",
    location: "부산 시민회관 앞 광장",
    goal_description: "수혈이 필요한 환자 지원을 위한 헌혈 캠페인",
    organization: "희망혈액원",
    contact: "051-800-7777",
  },
];

const PROGRAM_STATUS = {
  pending: { code: "pending", label: "승인 전" },
  approved: { code: "approved", label: "승인 완료" },
  rejected: { code: "rejected", label: "반려" },
  in_progress: { code: "in_progress", label: "진행 중" },
  completed: { code: "completed", label: "진행 완료" },
};

const STATUS_LABEL_TO_CODE = Object.values(PROGRAM_STATUS).reduce((acc, item) => {
  acc[item.label] = item.code;
  return acc;
}, {});

const PROGRAM_CATEGORY = {
  children: { code: "children", label: "아동" },
  environment: { code: "environment", label: "환경" },
  education: { code: "education", label: "교육" },
  animal: { code: "animal", label: "동물" },
  health: { code: "health", label: "보건" },
  others: { code: "others", label: "기타" },
};

const CATEGORY_LABEL_TO_CODE = Object.values(PROGRAM_CATEGORY).reduce((acc, item) => {
  acc[item.label] = item.code;
  return acc;
}, {});

function normalizeStatus(raw) {
  if (!raw) return PROGRAM_STATUS.pending;

  const rawString = raw.toString().trim();
  const normalizedKey = rawString.toLowerCase().replace(/\s+/g, "_");

  if (PROGRAM_STATUS[normalizedKey]) return PROGRAM_STATUS[normalizedKey];

  const byLabel = STATUS_LABEL_TO_CODE[rawString];
  if (byLabel && PROGRAM_STATUS[byLabel]) return PROGRAM_STATUS[byLabel];

  return { code: normalizedKey || "pending", label: rawString || PROGRAM_STATUS.pending.label };
}

function normalizeCategory(raw) {
  if (!raw) return PROGRAM_CATEGORY.children;

  const rawString = raw.toString().trim();
  const normalizedKey = rawString.toLowerCase();

  if (PROGRAM_CATEGORY[normalizedKey]) return PROGRAM_CATEGORY[normalizedKey];

  const byLabel = CATEGORY_LABEL_TO_CODE[rawString];
  if (byLabel && PROGRAM_CATEGORY[byLabel]) return PROGRAM_CATEGORY[byLabel];

  return { code: normalizedKey || "others", label: rawString || "기타" };
}

function normalizeProgram(program = {}) {
  const statusInfo = normalizeStatus(program.status ?? program.status_name ?? program.status_label);
  const categoryInfo = normalizeCategory(program.category ?? program.category_name ?? program.category_label);

  return {
    program_id: program.program_id ?? program.id ?? null,
    program_name: program.program_name ?? program.name ?? "",
    category: categoryInfo.code,
    category_label: categoryInfo.label,
    company_id: program.company_id ?? program.provider_company_id ?? program.companyId ?? null,
    status: statusInfo.code,
    status_label: statusInfo.label,
    start_date: program.start_date ?? program.start_at ?? program.startDate ?? null,
    end_date: program.end_date ?? program.end_at ?? program.endDate ?? null,
    total_amount: program.total_amount ?? program.totalAmount ?? 0,
    goal_amount: program.goal_amount ?? program.goalAmount ?? null,
    description: program.description ?? "",
    goal_description: program.goal_description ?? program.goal_text ?? program.purpose ?? "",
    location: program.location ?? program.place ?? program.address ?? "",
    organization: program.organization ?? program.company_name ?? "",
    contact: program.contact ?? program.company_phone ?? program.phone ?? "",
    created_at: program.created_at ?? null,
    updated_at: program.updated_at ?? null,
  };
}

let sampleProgramState = SAMPLE_PROGRAMS.map((program) => normalizeProgram(program));

function mapPrograms(programs) {
  if (!Array.isArray(programs)) return [];
  return programs.map((program) => normalizeProgram(program)).filter(Boolean);
}

const SAMPLE_CATEGORIES = [
  { category_id: "children", category_name: "아동" },
  { category_id: "environment", category_name: "환경" },
  { category_id: "education", category_name: "교육" },
  { category_id: "animal", category_name: "동물" },
  { category_id: "health", category_name: "보건" },
  { category_id: "emergency", category_name: "긴급 구호" },
  { category_id: "culture", category_name: "문화 예술" },
];

let sampleCategoryState = [...SAMPLE_CATEGORIES];

function filterCategories(categories, { keyword = "", searchField = "all" }) {
  if (!keyword) return categories;
  const lower = keyword.toLowerCase();

  return categories.filter((category) => {
    const id = category.category_id?.toString().toLowerCase() ?? "";
    const name = category.category_name?.toString().toLowerCase() ?? "";

    if (searchField === "category_id") return id.includes(lower);
    if (searchField === "category_name") return name.includes(lower);
    return id.includes(lower) || name.includes(lower);
  });
}

function sortCategories(categories, sortField = "category_id") {
  const list = [...categories];
  const comparator = (a, b, key) => {
    const left = a?.[key]?.toString().toLowerCase() ?? "";
    const right = b?.[key]?.toString().toLowerCase() ?? "";
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  };

  switch (sortField) {
    case "category_name":
      return list.sort((a, b) => comparator(a, b, "category_name"));
    case "category_id":
    default:
      return list.sort((a, b) => comparator(a, b, "category_id"));
  }
}

const SAMPLE_COMPANIES_RAW = [
  {
    company_id: "C-1001",
    company_name: "경산아동센터",
    contact: "010-1111-2222",
    address: "경산시 중산로 15",
    program_ids: ["PRG-1001", "PRG-1003"],
  },
  {
    company_id: "C-1002",
    company_name: "푸른도시연구회",
    contact: "02-345-6789",
    address: "서울시 서초구 서초대로 123",
    program_ids: ["PRG-1002"],
  },
  {
    company_id: "C-1003",
    company_name: "함께하는 PAWS",
    contact: "010-5555-9876",
    address: "서울시 마포구 월드컵북로 45",
    program_ids: ["PRG-1004"],
  },
  {
    company_id: "C-1004",
    company_name: "희망혈액원",
    contact: "051-800-7777",
    address: "부산시 해운대구 센텀중앙로 99",
    program_ids: ["PRG-1005"],
  },
];

function normalizeCompany(company = {}, programLookup = new Map()) {
  const companyId = company.company_id ?? company.id ?? null;
  if (!companyId) return null;

  const programs =
    Array.isArray(company.programs) && company.programs.length
      ? mapPrograms(company.programs)
      : Array.isArray(company.program_ids)
        ? company.program_ids
            .map((programId) => programLookup.get(programId))
            .filter(Boolean)
        : programLookup.get(companyId) ?? [];

  const uniquePrograms = programs.reduce((acc, program) => {
    if (!program || !program.program_id) return acc;
    acc.set(program.program_id, program);
    return acc;
  }, new Map());

  const programList = Array.from(uniquePrograms.values());

  return {
    company_id: companyId,
    company_name: company.company_name ?? company.name ?? "",
    contact: company.contact ?? company.phone ?? company.tel ?? "",
    address: company.address ?? company.location ?? "",
    program_count: programList.length,
    programs: sortPrograms(programList, "deadline_asc"),
  };
}

function buildSampleCompanies() {
  const programMap = sampleProgramState.reduce((acc, program) => {
    const key = program.company_id ?? "UNASSIGNED";
    const list = acc.get(key) ?? [];
    list.push(program);
    acc.set(key, list);
    return acc;
  }, new Map());

  return SAMPLE_COMPANIES_RAW.map((company) => {
    const programs = programMap.get(company.company_id) ?? [];
    return normalizeCompany({ ...company, programs }, programMap);
  }).filter(Boolean);
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function compareDatesAsc(a, b) {
  const left = parseDate(a);
  const right = parseDate(b);
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.getTime() - right.getTime();
}

function compareDatesDesc(a, b) {
  return compareDatesAsc(b, a);
}

function compareNumbersAsc(a, b) {
  return Number(a || 0) - Number(b || 0);
}

function compareNumbersDesc(a, b) {
  return compareNumbersAsc(b, a);
}

function sortPrograms(programs, sortKey) {
  const list = [...programs];
  switch (sortKey) {
    case "deadline_desc":
      return list.sort((a, b) => compareDatesDesc(a.end_date, b.end_date));
    case "start_asc":
      return list.sort((a, b) => compareDatesAsc(a.start_date, b.start_date));
    case "start_desc":
      return list.sort((a, b) => compareDatesDesc(a.start_date, b.start_date));
    case "amount_asc":
      return list.sort((a, b) => compareNumbersAsc(a.total_amount, b.total_amount));
    case "amount_desc":
      return list.sort((a, b) => compareNumbersDesc(a.total_amount, b.total_amount));
    case "deadline_asc":
    default:
      return list.sort((a, b) => compareDatesAsc(a.end_date, b.end_date));
  }
}

app.get("/api/health", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ ok: rows[0]?.ok === 1 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/donors", async (req, res) => {
  const {
    keyword: rawKeyword,
    searchField: rawSearchField,
    sortField: rawSortField,
  } = req.query ?? {};

  const keyword = typeof rawKeyword === "string" && rawKeyword.trim().length ? rawKeyword.trim() : null;
  const searchField = typeof rawSearchField === "string" ? rawSearchField : "all";

  const allowedSortFields = {
    donor_id: "d.donor_id",
    name: "d.name",
    phone: "d.phone",
    category: "preferred_category",
  };
  const sortField =
    typeof rawSortField === "string" && rawSortField in allowedSortFields ? rawSortField : "donor_id";

  const params = [];
  const whereClauses = [];

  const preferredCategoryExpr = "'미등록'";

  if (keyword) {
    const likeValue = `%${keyword}%`;
    switch (searchField) {
      case "donor_id":
        whereClauses.push("CAST(d.donor_id AS CHAR) LIKE ?");
        params.push(likeValue);
        break;
      case "name":
        whereClauses.push("d.name LIKE ?");
        params.push(likeValue);
        break;
      case "phone":
        whereClauses.push("d.phone LIKE ?");
        params.push(likeValue);
        break;
      case "category":
        whereClauses.push(`${preferredCategoryExpr} LIKE ?`);
        params.push(likeValue);
        break;
      default:
        whereClauses.push(
          `(CAST(d.donor_id AS CHAR) LIKE ? OR d.name LIKE ? OR d.phone LIKE ? OR ${preferredCategoryExpr} LIKE ?)`
        );
        params.push(likeValue, likeValue, likeValue, likeValue);
        break;
    }
  }

  const sql = `
    SELECT
      d.donor_id,
      d.name,
      d.email,
      d.phone,
      ${preferredCategoryExpr} AS preferred_category,
      d.created_at
    FROM donor d
    ${whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : ""}
    ORDER BY ${allowedSortFields[sortField]} ASC, d.donor_id ASC
  `;

  try {
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error("후원자 조회 실패", e);
    res.status(500).json({ error: "후원자 정보를 불러오지 못했습니다." });
  }
});

app.post("/api/donors", async (req, res) => {
  const { name, email = null, phone = null, password } = req.body ?? {};
  if (!name || !password) return res.status(400).json({ error: "name, password 필수" });
  try {
    // 실제 운영에서는 bcrypt 해시 사용 권장
    const sql =
      "INSERT INTO donor (name, email, phone, password, created_at) VALUES (?, ?, ?, ?, NOW())";
    const [r] = await pool.execute(sql, [name, email, phone, password]);
    const created_at = new Date();
    res.status(201).json({ donor_id: r.insertId, name, email, phone, created_at });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  const loginId = email?.trim();
  const loginPw = password;

  if (!loginId || !loginPw) {
    return res.status(400).json({ error: "email, password 필수" });
  }

  const adminId = process.env.ADMIN_ID ?? "manager";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "0000";

  if (loginId === adminId && loginPw === adminPassword) {
    return res.json({
      role: "admin",
      name: "관리자",
      email: adminId,
      login_id: adminId,
    });
  }

  try {
    const sql =
      "SELECT donor_id, name, email, phone, password AS stored_password, created_at FROM donor WHERE email = ? LIMIT 1";
    const [rows] = await pool.query(sql, [loginId]);
    const donor = Array.isArray(rows) ? rows[0] : undefined;

    if (!donor || donor.stored_password !== loginPw) {
      return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
    }

    const { stored_password, ...safeDonor } = donor;
    res.json({ ...safeDonor, role: "donor" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function runProgramMaintenance() {
  try {
    const connection = await pool.getConnection();
    try {
      const [toInProgress] = await connection.execute(
        `
        UPDATE program
        SET status = 'in_progress'
        WHERE status = 'approved'
          AND start_date IS NOT NULL
          AND start_date <= CURDATE()
      `
      );

      const [toCompleted] = await connection.execute(
        `
        UPDATE program
        SET status = 'completed'
        WHERE status = 'in_progress'
          AND end_date IS NOT NULL
          AND end_date < CURDATE()
      `
      );

      const [deleted] = await connection.execute(
        `
        DELETE FROM program
        WHERE end_date IS NOT NULL
          AND end_date < DATE_SUB(CURDATE(), INTERVAL 3 YEAR)
      `
      );

      const updatedCount =
        Number(toInProgress?.affectedRows || 0) + Number(toCompleted?.affectedRows || 0) + Number(deleted?.affectedRows || 0);

      if (updatedCount > 0) {
        console.log(
          `[program-maintenance] in_progress:${toInProgress?.affectedRows ?? 0}, completed:${
            toCompleted?.affectedRows ?? 0
          }, deleted:${deleted?.affectedRows ?? 0}`
        );
      }
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("[program-maintenance] failed", error);
  }
}

cron.schedule(
  "0 0 * * *",
  () => {
    runProgramMaintenance();
  },
  { timezone: "Asia/Seoul" }
);

runProgramMaintenance();

app.get("/api/companies", async (req, res) => {
  const { keyword: rawKeyword } = req.query ?? {};
  const keyword = typeof rawKeyword === "string" ? rawKeyword.trim() : "";

  try {
    const [companyRows] = await pool.query(
      "SELECT company_id, company_name, contact, phone, address FROM company"
    );
    const companies = Array.isArray(companyRows) ? companyRows : [];

    if (companies.length) {
      const ids = companies
        .map((company) => company.company_id)
        .filter((id) => id !== null && id !== undefined);

      let programMap = new Map();

      if (ids.length) {
        const [programRows] = await pool.query(
          "SELECT program_id, program_name, status, category, company_id, start_date, end_date, goal_amount, goal_description, location FROM program WHERE company_id IN (?)",
          [ids]
        );
        const normalizedPrograms = mapPrograms(programRows);
        programMap = normalizedPrograms.reduce((acc, program) => {
          const key = program.company_id ?? "UNASSIGNED";
          const list = acc.get(key) ?? [];
          list.push(program);
          acc.set(key, list);
          return acc;
        }, new Map());
      }

      const normalizedCompanies = companies
        .map((company) => {
          const contact = company.contact ?? company.phone ?? "";
          const programs = programMap.get(company.company_id) ?? [];
          return normalizeCompany({ ...company, contact, programs }, programMap);
        })
        .filter(Boolean);

      const filteredCompanies = keyword
        ? normalizedCompanies.filter((company) => {
            const base = `${company.company_name} ${company.contact} ${company.address}`.toLowerCase();
            const matchCompany = base.includes(keyword.toLowerCase());
            const matchProgram = company.programs?.some((program) =>
              (program.program_name ?? "").toLowerCase().includes(keyword.toLowerCase())
            );
            return matchCompany || matchProgram;
          })
        : normalizedCompanies;

      if (filteredCompanies.length) {
        res.json(filteredCompanies);
        return;
      }
    }
  } catch (error) {
    console.error("회사 목록 조회 실패", error);
  }

  const fallbackCompanies = buildSampleCompanies();
  const filteredFallback = keyword
    ? fallbackCompanies.filter((company) => {
        const base = `${company.company_name} ${company.contact} ${company.address}`.toLowerCase();
        const matchCompany = base.includes(keyword.toLowerCase());
        const matchProgram = company.programs?.some((program) =>
          (program.program_name ?? "").toLowerCase().includes(keyword.toLowerCase())
        );
        return matchCompany || matchProgram;
      })
    : fallbackCompanies;

  res.json(filteredFallback);
});

app.get("/api/categories", async (req, res) => {
  const {
    keyword: rawKeyword,
    searchField: rawSearchField,
    sortField: rawSortField,
  } = req.query ?? {};

  const keyword = typeof rawKeyword === "string" ? rawKeyword.trim() : "";
  const searchField = ["category_id", "category_name"].includes(rawSearchField)
    ? rawSearchField
    : "all";
  const sortField = ["category_id", "category_name"].includes(rawSortField)
    ? rawSortField
    : "category_id";

  try {
    const clauses = [];
    const params = [];

    if (keyword) {
      const likeValue = `%${keyword}%`;
      if (searchField === "category_id") {
        clauses.push("category_id LIKE ?");
        params.push(likeValue);
      } else if (searchField === "category_name") {
        clauses.push("category_name LIKE ?");
        params.push(likeValue);
      } else {
        clauses.push("(category_id LIKE ? OR category_name LIKE ?)");
        params.push(likeValue, likeValue);
      }
    }

    const orderBy = sortField === "category_name" ? "category_name" : "category_id";
    const sql = `SELECT category_id, category_name FROM category ${
      clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    } ORDER BY ${orderBy} ASC`;

    const [rows] = await pool.query(sql, params);
    const normalized = rows.map((row) => ({
      category_id: row.category_id,
      category_name: row.category_name,
    }));

    if (normalized.length) {
      const filtered = filterCategories(normalized, { keyword, searchField });
      res.json(sortCategories(filtered, sortField));
      return;
    }
  } catch (error) {
    console.error("카테고리 조회 실패", error);
  }

  const filteredSample = filterCategories(sampleCategoryState, { keyword, searchField });
  res.json(sortCategories(filteredSample, sortField));
});

app.post("/api/categories", async (req, res) => {
  const { category_id: rawId, category_name: rawName } = req.body ?? {};
  const category_id = rawId?.toString().trim();
  const category_name = rawName?.toString().trim();

  if (!category_id || !category_name) {
    return res.status(400).json({ error: "category_id, category_name 필수" });
  }

  try {
    await pool.execute("INSERT INTO category (category_id, category_name) VALUES (?, ?)", [
      category_id,
      category_name,
    ]);
    const category = { category_id, category_name };
    sampleCategoryState = sortCategories(
      [...sampleCategoryState.filter((c) => c.category_id !== category_id), category],
      "category_id"
    );
    res.status(201).json(category);
    return;
  } catch (error) {
    console.error("카테고리 추가 실패", error);
  }

  if (sampleCategoryState.some((category) => category.category_id === category_id)) {
    return res.status(409).json({ error: "이미 존재하는 카테고리입니다." });
  }

  const category = { category_id, category_name };
  sampleCategoryState = sortCategories([...sampleCategoryState, category], "category_id");
  res.status(201).json(category);
});

app.delete("/api/categories/:categoryId", async (req, res) => {
  const { categoryId } = req.params ?? {};
  if (!categoryId) return res.status(400).json({ error: "categoryId 필수" });

  try {
    const [result] = await pool.execute("DELETE FROM category WHERE category_id = ?", [categoryId]);
    if (result?.affectedRows) {
      sampleCategoryState = sampleCategoryState.filter((category) => category.category_id !== categoryId);
      res.status(204).end();
      return;
    }
  } catch (error) {
    console.error("카테고리 삭제 실패", error);
  }

  const index = sampleCategoryState.findIndex((category) => category.category_id === categoryId);
  if (index === -1) return res.status(404).json({ error: "삭제할 카테고리를 찾지 못했습니다." });

  sampleCategoryState.splice(index, 1);
  res.status(204).end();
});

app.get("/api/programs", async (req, res) => {
  const {
    keyword: rawKeyword,
    category: rawCategory,
    status: rawStatus,
    sort: rawSort,
  } = req.query ?? {};

  const keyword = typeof rawKeyword === "string" && rawKeyword.trim().length ? rawKeyword.trim() : null;
  const category = typeof rawCategory === "string" && rawCategory.trim().length ? rawCategory.trim() : null;

  const allowedStatuses = new Set(["all", "pending", "approved", "rejected", "in_progress", "completed"]);
  const status =
    typeof rawStatus === "string" && allowedStatuses.has(rawStatus) && rawStatus !== "all" ? rawStatus : null;

  const allowedSorts = new Set([
    "deadline_asc",
    "deadline_desc",
    "start_asc",
    "start_desc",
    "amount_asc",
    "amount_desc",
  ]);
  const sort = typeof rawSort === "string" && allowedSorts.has(rawSort) ? rawSort : "deadline_asc";

  try {
    const [rows] = await pool.query("CALL search_programs(?, ?, ?, ?)", [keyword, category, status, sort]);
    const resultSet = Array.isArray(rows)
      ? Array.isArray(rows[0])
        ? rows[0]
        : rows
      : [];
    const normalized = sortPrograms(mapPrograms(resultSet), sort);
    if (normalized.length) {
      res.json(normalized);
      return;
    }

    const fallback = sampleProgramState.filter((program) => {
      const matchCategory = category ? String(program.category) === String(category) : true;
      const matchStatus = status ? String(program.status) === String(status) : true;
      const matchKeyword = keyword
        ? [program.program_id, program.program_name]
            .map((value) => String(value ?? "").toLowerCase())
            .some((value) => value.includes(keyword.toLowerCase()))
        : true;
      return matchCategory && matchStatus && matchKeyword;
    });

    res.json(sortPrograms(mapPrograms(fallback), sort));
  } catch (e) {
    console.error("프로그램 조회 실패", e);
    res.json(sortPrograms(mapPrograms(sampleProgramState), sort));
  }
});

app.get("/api/programs/:programId", async (req, res) => {
  const { programId } = req.params ?? {};
  if (!programId) return res.status(400).json({ error: "programId 필수" });

  try {
    const [rows] = await pool.query("SELECT * FROM program WHERE program_id = ? LIMIT 1", [programId]);
    if (Array.isArray(rows) && rows[0]) {
      res.json(normalizeProgram(rows[0]));
      return;
    }
  } catch (error) {
    console.error("프로그램 상세 조회 실패", error);
  }

  const fallback = sampleProgramState.find((program) => String(program.program_id) === String(programId));
  if (fallback) {
    res.json(normalizeProgram(fallback));
    return;
  }

  res.status(404).json({ error: "프로그램을 찾을 수 없습니다." });
});

app.patch("/api/programs/:programId/status", async (req, res) => {
  const { programId } = req.params ?? {};
  const { status: nextStatus } = req.body ?? {};

  const allowedStatuses = new Set(["approved", "rejected"]);
  if (!programId || !nextStatus || !allowedStatuses.has(nextStatus)) {
    return res.status(400).json({ error: "programId, status(approved|rejected) 필수" });
  }

  try {
    const [result] = await pool.execute(
      "UPDATE program SET status = ?, updated_at = NOW() WHERE program_id = ? AND status = 'pending'",
      [nextStatus, programId]
    );

    if (result?.affectedRows) {
      const [rows] = await pool.query("SELECT * FROM program WHERE program_id = ? LIMIT 1", [programId]);
      res.json(normalizeProgram(rows?.[0]));
      return;
    }
  } catch (error) {
    console.error("프로그램 상태 변경 실패", error);
  }

  const index = sampleProgramState.findIndex((program) => String(program.program_id) === String(programId));
  if (index === -1) return res.status(404).json({ error: "프로그램을 찾을 수 없습니다." });

  if (sampleProgramState[index].status !== "pending") {
    return res.status(409).json({ error: "승인 전 프로그램만 상태를 변경할 수 있습니다." });
  }

  const statusInfo = PROGRAM_STATUS[nextStatus] ?? normalizeStatus(nextStatus);

  sampleProgramState[index] = {
    ...sampleProgramState[index],
    status: statusInfo.code,
    status_label: statusInfo.label,
    updated_at: new Date().toISOString(),
  };

  res.json(sampleProgramState[index]);
});

app.delete("/api/programs/:programId", async (req, res) => {
  const { programId } = req.params ?? {};
  if (!programId) {
    return res.status(400).json({ error: "programId 필수" });
  }

  try {
    const [result] = await pool.execute(
      "DELETE FROM program WHERE program_id = ? AND status = 'pending'",
      [programId]
    );
    if (result?.affectedRows) {
      res.status(204).end();
      return;
    }
  } catch (error) {
    console.error("프로그램 삭제 실패", error);
  }

  const index = sampleProgramState.findIndex((program) => String(program.program_id) === String(programId));
  if (index === -1) return res.status(404).json({ error: "삭제할 프로그램을 찾지 못했습니다." });

  if (sampleProgramState[index].status !== "pending") {
    return res.status(409).json({ error: "승인 전 상태의 프로그램만 삭제할 수 있습니다." });
  }

  sampleProgramState.splice(index, 1);
  res.status(204).end();
});

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
