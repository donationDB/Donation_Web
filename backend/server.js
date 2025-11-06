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
    program_id: 1,
    title: "따뜻한 겨울나기 캠페인",
    category_id: 1,
    status: "PLANNED",
    start_date: "2024-12-01",
    end_date: "2025-02-28",
    goal_amount: 12500000,
    host_company_id: 1,
    place: "경산아동센터 위치",
    description: "겨울철 어린이 온기 지원",
  },
  {
    program_id: 2,
    title: "초록 숲 가꾸기 프로젝트",
    category_id: 2,
    status: "RUNNING",
    start_date: "2024-10-01",
    end_date: "2025-03-31",
    goal_amount: 7800000,
    host_company_id: 2,
    place: "수원 광교산 일대",
    description: "미세먼지 저감을 위한 도시 숲 조성",
  },
  {
    program_id: 3,
    title: "농어촌 아동 교육 지원",
    category_id: 3,
    status: "PLANNED",
    start_date: "2025-03-01",
    end_date: "2025-12-31",
    goal_amount: 0,
    host_company_id: 1,
    place: "전남 완도군 아동센터",
    description: "디지털 격차 해소를 위한 기초 교육",
  },
  {
    program_id: 4,
    title: "반려동물 치료비 후원",
    category_id: 4,
    status: "FINISHED",
    start_date: "2023-05-01",
    end_date: "2023-10-31",
    goal_amount: 18200000,
    host_company_id: 3,
    place: "서울 반려동물 지원센터",
    description: "치료가 시급한 반려동물 치료비 지원",
  },
  {
    program_id: 5,
    title: "희망 헌혈 릴레이",
    category_id: 5,
    status: "PLANNED",
    start_date: "2024-08-15",
    end_date: "2024-11-30",
    goal_amount: 0,
    host_company_id: 4,
    place: "부산 시민회관 앞 광장",
    description: "수혈이 필요한 환자 지원을 위한 헌혈 캠페인",
  },
];

const PROGRAM_STATUS = {
  planned: { code: "planned", label: "계획", db: "PLANNED" },
  running: { code: "running", label: "진행 중", db: "RUNNING" },
  finished: { code: "finished", label: "종료", db: "FINISHED" },
};

const STATUS_LABEL_TO_CODE = Object.values(PROGRAM_STATUS).reduce((acc, item) => {
  acc[item.label] = item.code;
  return acc;
}, {});

const STATUS_DB_TO_CODE = {
  PLANNED: "planned",
  RUNNING: "running",
  FINISHED: "finished",
};

const STATUS_ALIAS_TO_CODE = {
  pending: "planned",
  approved: "running",
  completed: "finished",
  in_progress: "running",
  rejected: "planned",
};

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

let sampleCategoryState = [];

function normalizeStatus(raw) {
  if (!raw) return PROGRAM_STATUS.planned;

  const rawString = raw.toString().trim();
  const upper = rawString.toUpperCase();
  const normalizedKey = rawString.toLowerCase().replace(/\s+/g, "_");

  if (STATUS_DB_TO_CODE[upper] && PROGRAM_STATUS[STATUS_DB_TO_CODE[upper]]) {
    return PROGRAM_STATUS[STATUS_DB_TO_CODE[upper]];
  }

  if (PROGRAM_STATUS[normalizedKey]) return PROGRAM_STATUS[normalizedKey];

  if (STATUS_ALIAS_TO_CODE[normalizedKey] && PROGRAM_STATUS[STATUS_ALIAS_TO_CODE[normalizedKey]]) {
    return PROGRAM_STATUS[STATUS_ALIAS_TO_CODE[normalizedKey]];
  }

  const byLabel = STATUS_LABEL_TO_CODE[rawString];
  if (byLabel && PROGRAM_STATUS[byLabel]) return PROGRAM_STATUS[byLabel];

  if (PROGRAM_STATUS[rawString]) return PROGRAM_STATUS[rawString];

  return { code: normalizedKey || "planned", label: rawString || PROGRAM_STATUS.planned.label };
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

  const rawCategoryId = program.category_id ?? program.category ?? null;
  let categoryName = program.category_name ?? program.category_label ?? program.category ?? "";
  if (!categoryName && rawCategoryId !== null && rawCategoryId !== undefined) {
    const matched = sampleCategoryState.find((category) => Number(category.category_id) === Number(rawCategoryId));
    if (matched) categoryName = matched.category_name;
  }

  const hostCompanyId = program.host_company_id ?? program.company_id ?? program.provider_company_id ?? null;

  return {
    program_id: program.program_id ?? program.id ?? null,
    program_name: program.program_name ?? program.name ?? program.title ?? "",
    title: program.title ?? program.program_name ?? "",
    category_id: rawCategoryId !== undefined ? Number(rawCategoryId) : null,
    category_name: categoryName,
    status: statusInfo.code,
    status_label: statusInfo.label,
    start_date: program.start_date ?? program.start_at ?? program.startDate ?? null,
    end_date: program.end_date ?? program.end_at ?? program.endDate ?? null,
    total_amount: program.total_amount ?? program.totalAmount ?? program.goal_amount ?? null,
    goal_amount: program.goal_amount ?? program.goalAmount ?? program.total_amount ?? null,
    description: program.description ?? "",
    goal_description: program.goal_description ?? program.goal_text ?? program.purpose ?? program.description ?? "",
    location: program.location ?? program.place ?? program.address ?? "",
    organization: program.organization ?? program.company_name ?? "",
    contact: program.contact ?? program.company_phone ?? program.phone ?? "",
    host_company_id: hostCompanyId !== undefined ? Number(hostCompanyId) : null,
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
  { category_id: 1, name: "아동", description: "아동 복지 및 교육 지원" },
  { category_id: 2, name: "환경", description: "환경 보호 및 지속 가능성" },
  { category_id: 3, name: "교육", description: "교육 기회 확대" },
  { category_id: 4, name: "동물", description: "동물 보호 및 복지" },
  { category_id: 5, name: "보건", description: "건강 증진 및 의료 지원" },
  { category_id: 6, name: "긴급 구호", description: "재난 및 위기 대응" },
  { category_id: 7, name: "문화 예술", description: "문화 예술 발전" },
];

function normalizeCategoryRow(row = {}) {
  const rawId = row.category_id ?? row.id;
  const category_id = Number.isFinite(Number(rawId)) ? Number(rawId) : rawId;
  return {
    category_id,
    category_name: row.category_name ?? row.name ?? "",
    description: row.description ?? "",
  };
}

sampleCategoryState = SAMPLE_CATEGORIES.map((category) => normalizeCategoryRow(category));

function filterCategories(categories, { keyword = "", searchField = "all" }) {
  if (!keyword) return categories;
  const lower = keyword.toLowerCase();

  return categories.filter((category) => {
    const id = category.category_id?.toString().toLowerCase() ?? "";
    const name = category.category_name?.toString().toLowerCase() ?? "";
    const description = category.description?.toString().toLowerCase() ?? "";

    if (searchField === "category_id") return id.includes(lower);
    if (searchField === "category_name") return name.includes(lower);
    return id.includes(lower) || name.includes(lower) || description.includes(lower);
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
    company_id: 1,
    company_name: "경산아동센터",
    contact: "010-1111-2222",
    address: "경산시 중산로 15",
    program_ids: [1, 3],
  },
  {
    company_id: 2,
    company_name: "푸른도시연구회",
    contact: "02-345-6789",
    address: "서울시 서초구 서초대로 123",
    program_ids: [2],
  },
  {
    company_id: 3,
    company_name: "함께하는 PAWS",
    contact: "010-5555-9876",
    address: "서울시 마포구 월드컵북로 45",
    program_ids: [4],
  },
  {
    company_id: 4,
    company_name: "희망혈액원",
    contact: "051-800-7777",
    address: "부산시 해운대구 센텀중앙로 99",
    program_ids: [5],
  },
];

function normalizeCompany(company = {}, programLookup = new Map()) {
  const rawId = company.company_id ?? company.id ?? null;
  const companyId = rawId !== null && rawId !== undefined ? Number(rawId) : null;
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

  const programList = sortPrograms(Array.from(uniquePrograms.values()), "deadline_asc").map((program) => ({
    ...program,
    organization: program.organization || company.company_name || company.name || "",
    contact: program.contact || company.contact || company.phone || "",
  }));

  return {
    company_id: companyId,
    company_name: company.company_name ?? company.name ?? "",
    contact: company.contact ?? company.phone ?? company.tel ?? "",
    address: company.address ?? company.location ?? "",
    program_count: programList.length,
    programs: programList,
  };
}

function buildSampleCompanies() {
  const programMap = sampleProgramState.reduce((acc, program) => {
    const key = program.host_company_id ?? program.company_id ?? "UNASSIGNED";
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
        SET status = 'RUNNING'
        WHERE status = 'PLANNED'
          AND start_date IS NOT NULL
          AND start_date <= CURDATE()
      `
      );

      const [toCompleted] = await connection.execute(
        `
        UPDATE program
        SET status = 'FINISHED'
        WHERE status = 'RUNNING'
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
          `[program-maintenance] running:${toInProgress?.affectedRows ?? 0}, finished:${
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
          "SELECT program_id, title, status, category_id, host_company_id, start_date, end_date, goal_amount, description, place FROM program WHERE host_company_id IN (?)",
          [ids]
        );
        const normalizedPrograms = mapPrograms(programRows);
        programMap = normalizedPrograms.reduce((acc, program) => {
          const key = program.host_company_id ?? program.company_id ?? "UNASSIGNED";
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
        clauses.push("CAST(category_id AS CHAR) LIKE ?");
        params.push(likeValue);
      } else if (searchField === "category_name") {
        clauses.push("name LIKE ?");
        params.push(likeValue);
      } else {
        clauses.push("(CAST(category_id AS CHAR) LIKE ? OR name LIKE ? OR description LIKE ?)");
        params.push(likeValue, likeValue, likeValue);
      }
    }

    const orderBy = sortField === "category_name" ? "name" : "category_id";
    const sql = `SELECT category_id, name, description FROM category ${
      clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    } ORDER BY ${orderBy} ASC`;

    const [rows] = await pool.query(sql, params);
    const normalized = rows.map((row) =>
      normalizeCategoryRow({ category_id: row.category_id, name: row.name, description: row.description })
    );

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
  const { category_id: rawId, category_name: rawName, description: rawDescription } = req.body ?? {};
  const category_id = rawId?.toString().trim();
  const category_name = rawName?.toString().trim();
  const description = rawDescription?.toString().trim() ?? "";

  if (!category_name) {
    return res.status(400).json({ error: "category_name 필수" });
  }

  try {
    if (category_id) {
      await pool.execute("INSERT INTO category (category_id, name, description) VALUES (?, ?, ?)", [
        Number(category_id),
        category_name,
        description,
      ]);
    } else {
      const [result] = await pool.execute("INSERT INTO category (name, description) VALUES (?, ?)", [
        category_name,
        description,
      ]);
      const insertId = result?.insertId;
      const category = normalizeCategoryRow({ category_id: insertId, name: category_name, description });
      sampleCategoryState = sortCategories(
        [...sampleCategoryState.filter((c) => c.category_id !== category.category_id), category],
        "category_id"
      );
      res.status(201).json(category);
      return;
    }

    const category = normalizeCategoryRow({ category_id, name: category_name, description });
    sampleCategoryState = sortCategories(
      [...sampleCategoryState.filter((c) => c.category_id !== category.category_id), category],
      "category_id"
    );
    res.status(201).json(category);
    return;
  } catch (error) {
    console.error("카테고리 추가 실패", error);
  }

  if (sampleCategoryState.some((category) => String(category.category_id) === String(category_id))) {
    return res.status(409).json({ error: "이미 존재하는 카테고리입니다." });
  }

  const nextId = category_id
    ? Number(category_id)
    : Math.max(0, ...sampleCategoryState.map((category) => Number(category.category_id) || 0)) + 1;
  const category = normalizeCategoryRow({ category_id: nextId, name: category_name, description });
  sampleCategoryState = sortCategories([...sampleCategoryState, category], "category_id");
  res.status(201).json(category);
});

app.delete("/api/categories/:categoryId", async (req, res) => {
  const { categoryId } = req.params ?? {};
  if (!categoryId) return res.status(400).json({ error: "categoryId 필수" });

  try {
    const [result] = await pool.execute("DELETE FROM category WHERE category_id = ?", [Number(categoryId)]);
    if (result?.affectedRows) {
      sampleCategoryState = sampleCategoryState.filter(
        (category) => String(category.category_id) !== String(categoryId)
      );
      res.status(204).end();
      return;
    }
  } catch (error) {
    console.error("카테고리 삭제 실패", error);
  }

  const index = sampleCategoryState.findIndex(
    (category) => String(category.category_id) === String(categoryId)
  );
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
  const category =
    rawCategory !== undefined && rawCategory !== null && rawCategory !== ""
      ? String(rawCategory).trim()
      : null;

  const allowedStatuses = new Set(["all", "planned", "running", "finished"]);
  const status =
    typeof rawStatus === "string" && allowedStatuses.has(rawStatus) && rawStatus !== "all"
      ? rawStatus.toLowerCase()
      : null;

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
    const [rows] = await pool.query("CALL search_programs(?, ?, ?, ?)", [
      keyword,
      category,
      status ? status.toUpperCase() : null,
      sort,
    ]);
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
      const matchCategory = category
        ? String(program.category_id ?? program.category) === String(category)
        : true;
      const matchStatus = status ? String(program.status) === String(status) : true;
      const matchKeyword = keyword
        ? [program.program_id, program.program_name, program.title]
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

  const allowedStatuses = new Set(["planned", "running", "finished"]);
  if (!programId || !nextStatus || !allowedStatuses.has(nextStatus)) {
    return res.status(400).json({ error: "programId, status(planned|running|finished) 필수" });
  }

  try {
    const statusInfo = PROGRAM_STATUS[nextStatus] ?? normalizeStatus(nextStatus);
    const dbStatus = statusInfo.db ?? nextStatus.toUpperCase();

    const [result] = await pool.execute(
      "UPDATE program SET status = ?, updated_at = NOW() WHERE program_id = ?",
      [dbStatus, Number(programId)]
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

  if (sampleProgramState[index].status !== "planned") {
    return res.status(409).json({ error: "계획 상태의 프로그램만 삭제할 수 있습니다." });
  }

  sampleProgramState.splice(index, 1);
  res.status(204).end();
});

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
