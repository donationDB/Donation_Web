import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import cron from "node-cron";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const RECOMMEND_API_URL = process.env.RECOMMEND_API_URL || "http://127.0.0.1:8000/recommend";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || "mydb",
  waitForConnections: true,
  connectionLimit: 10,
});

function hashPassword(rawPassword = "") {
  return crypto.createHash("sha256").update(String(rawPassword)).digest("hex");
}

function parseBooleanFlag(value, defaultValue = false) {
  if (value === null || value === undefined || value === "") return defaultValue;
  const normalized = value.toString().trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

// 지역 값 정규화 (ENUM/길이 제약 회피용)
const ALLOWED_REGIONS = new Set([
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
]);

const REGION_ALIAS = {
  충청: ["충북", "충남"],
  전라: ["전북", "전남"],
  경상: ["경북", "경남"],
};

function normalizeRegions(regions = []) {
  const result = [];
  const seen = new Set();
  for (const raw of regions) {
    const r = (raw || "").toString().trim();
    if (!r) continue;
    if (REGION_ALIAS[r]) {
      for (const alias of REGION_ALIAS[r]) {
        if (ALLOWED_REGIONS.has(alias) && !seen.has(alias)) {
          seen.add(alias);
          result.push(alias);
        }
      }
      continue;
    }
    if (ALLOWED_REGIONS.has(r) && !seen.has(r)) {
      seen.add(r);
      result.push(r);
    }
  }
  return result;
}

const PROGRAM_STATUS = {
  pending: { code: "pending", label: "신청대기", db: "PENDING" },
  planned: { code: "planned", label: "계획", db: "PLANNED" },
  running: { code: "running", label: "진행 중", db: "RUNNING" },
  finished: { code: "finished", label: "종료", db: "FINISHED" },
  rejected: { code: "rejected", label: "반려", db: "REJECTED" },
};

const STATUS_LABEL_TO_CODE = Object.values(PROGRAM_STATUS).reduce((acc, item) => {
  acc[item.label] = item.code;
  return acc;
}, {});

const STATUS_DB_TO_CODE = {
  PENDING: "pending",
  PLANNED: "planned",
  RUNNING: "running",
  FINISHED: "finished",
  REJECTED: "rejected",
};

const STATUS_ALIAS_TO_CODE = {
  신청대기: "pending",
  대기: "pending",
  pending: "pending",
  approved: "running",
  completed: "finished",
  in_progress: "running",
  rejected: "rejected",
};

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

function normalizeProgram(program = {}) {
  const statusInfo = normalizeStatus(program.status ?? program.status_name ?? program.status_label);

  const rawCategoryId = program.category_id ?? program.category ?? null;
  let categoryName = program.category_name ?? program.category_label ?? program.category ?? "";

  const hostCompanyId = program.host_company_id ?? program.company_id ?? program.provider_company_id ?? null;

  const companyName =
    program.company_name ?? program.companyName ?? program.organization ?? program.host_company_name ?? "";
  const contactNumber =
    program.contact ?? program.company_phone ?? program.companyPhone ?? program.phone ?? program.host_company_phone ?? "";
  const startDateValue = program.start_date ?? program.start_at ?? program.startDate ?? null;
  const endDateValue = program.end_date ?? program.end_at ?? program.endDate ?? null;
  const durationMonths = diffInMonths(startDateValue, endDateValue);
  const donorCount = Number(program.donor_count ?? program.donorCount ?? program.supporter_count ?? 0);
  const explicitMonthly =
    parseBooleanFlag(
      program.monthly ??
        program.monthly_flag ??
        program.is_recurring ??
        program.allow_monthly_donation ??
        program.recurring ??
        program.monthlyDonation
    );
  const fundingTypeRaw = (program.funding_type ?? "").toString().toUpperCase();
  const isSubscription = fundingTypeRaw === "SUBSCRIPTION" || fundingTypeRaw === "BOTH";
  const monthlyFlag = isSubscription || explicitMonthly;

  return {
    program_id: program.program_id ?? program.id ?? null,
    program_name: program.program_name ?? program.name ?? program.title ?? "",
    title: program.title ?? program.program_name ?? "",
    category_id: rawCategoryId !== undefined ? Number(rawCategoryId) : null,
    category_name: categoryName,
    status: statusInfo.code,
    status_label: statusInfo.label,
    monthly: monthlyFlag,
    monthly_flag: monthlyFlag ? 1 : 0,
    funding_type: fundingTypeRaw || (monthlyFlag ? "SUBSCRIPTION" : "ONE_TIME"),
    duration_months: durationMonths,
    start_date: startDateValue,
    end_date: endDateValue,
    total_amount: program.total_amount ?? program.totalAmount ?? 0,
    donor_count: donorCount,
    donorCount,
    goal_amount: program.goal_amount ?? program.goalAmount ?? null,
    description: program.description ?? "",
    goal_description: program.goal_description ?? program.goal_text ?? program.purpose ?? program.description ?? "",
    location: program.location ?? program.place ?? program.address ?? "",
    organization: companyName,
    contact: contactNumber,
    host_company_id: hostCompanyId !== undefined ? Number(hostCompanyId) : null,
    created_at: program.created_at ?? null,
    updated_at: program.updated_at ?? null,
  };
}

function mapPrograms(programs) {
  if (!Array.isArray(programs)) return [];
  return programs.map((program) => normalizeProgram(program)).filter(Boolean);
}

// 추천 서비스 프록시 (Node -> FastAPI RAG)
function getFallbackRecommendations(payload = {}) {
  const cats = payload.preferred_categories || ["추천 카테고리 없음"];
  const regions = payload.preferred_regions || ["전국"];
  const items = cats.map((cat, idx) => ({
    program_id: idx + 1,
    title: `${cat} 추천 프로그램`,
    category: cat,
    place: regions[Math.min(regions.length - 1, idx)] || "전국",
    emergency: !!payload.prefer_emergency,
    funding_type:
      (payload.subscription_type || "").toUpperCase() === "RECURRING" ? "SUBSCRIPTION" : "ONE_TIME",
    score: 0.5,
    snippet: `임시 추천 · 지역: ${regions[0] || "전국"}`,
  }));
  return { items: items.slice(0, payload.limit || 10) };
}

async function saveSurveyPreferences({ donorId, categories = [], regions = [], subscriptionType, preferEmergency, focusKeyword }) {
  if (!donorId) return;
  const normalizedRegions = normalizeRegions(regions);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 카테고리 ID 매핑 (이름 기준)
    let categoryIds = [];
    if (categories.length) {
      const placeholders = categories.map(() => "?").join(",");
      const [rows] = await conn.query(
        `SELECT category_id FROM category WHERE name IN (${placeholders})`,
        categories
      );
      categoryIds = rows.map((r) => r.category_id);
    }

    // 기존 선호 삭제/정리
    if (categoryIds.length) {
      await conn.query("DELETE FROM donor_preference WHERE donor_id = ? AND preferred_category_id NOT IN (?)", [
        donorId,
        categoryIds,
      ]);
    } else {
      await conn.query("DELETE FROM donor_preference WHERE donor_id = ?", [donorId]);
    }

    // 선호 카테고리 upsert
    const sub = String(subscriptionType || "ANY").toUpperCase();
    const prefEmergency = preferEmergency ? 1 : 0;
    for (const catId of categoryIds) {
      await conn.query(
        `INSERT INTO donor_preference (donor_id, preferred_category_id, preferred_subscription_type, pref_is_emergency, current_focus_keyword, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE preferred_subscription_type=VALUES(preferred_subscription_type),
                                 pref_is_emergency=VALUES(pref_is_emergency),
                                 current_focus_keyword=VALUES(current_focus_keyword),
                                 updated_at=VALUES(updated_at)`,
        [donorId, catId, sub, prefEmergency, focusKeyword || null]
      );
    }

    // 지역 선호 재저장
    await conn.query("DELETE FROM donor_preferred_region WHERE donor_id = ?", [donorId]);
    if (normalizedRegions.length) {
      const values = normalizedRegions.map((r) => [donorId, r]);
      await conn.query("INSERT INTO donor_preferred_region (donor_id, region) VALUES ?", [values]);
    }

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    console.error("설문 저장 실패", error);
  } finally {
    conn.release();
  }
}

app.post("/api/recommendations", async (req, res) => {
  const payload = req.body || {};
  const donorId = payload.donor_id;

  // 설문 DB 저장 (카테고리/지역/정기 여부 등)
  try {
    await saveSurveyPreferences({
      donorId,
      categories: payload.preferred_categories || [],
      regions: payload.preferred_regions || [],
      subscriptionType: payload.subscription_type,
      preferEmergency: payload.prefer_emergency,
      focusKeyword: payload.focus_keyword,
    });
  } catch (error) {
    console.error("설문 DB 저장 중 오류:", error);
  }

  try {
    const response = await fetch(RECOMMEND_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("추천 서비스 호출 실패:", errorText);
      return res.status(200).json(getFallbackRecommendations(payload));
    }

    const data = await response.json().catch(() => null);
    if (!data) {
      console.error("추천 서비스 응답 파싱 실패");
      return res.status(200).json(getFallbackRecommendations(payload));
    }

    return res.json(data);
  } catch (error) {
    console.error("추천 서비스 연동 오류:", error);
    return res.status(200).json(getFallbackRecommendations(payload));
  }
});

async function ensureSampleFinishedDonation() {
  const donorId = 301;
  const donorName = "신은수";
  const donorEmail = "shin.eunsu301@example.com";
  const donorPhone = "010-7301-0301";

  const sampleCompanyName = "푸른나무재단";
  const sampleProgramTitle = "도심 숲 복원 프로젝트";
  const sampleCategoryName = "환경";

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // donor
    const [donorRows] = await connection.query("SELECT donor_id FROM donor WHERE donor_id = ? LIMIT 1", [donorId]);
    if (!donorRows.length) {
      await connection.query(
        "INSERT INTO donor (donor_id, name, email, phone, password, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
        [donorId, donorName, donorEmail, donorPhone, "donor301!"]
      );
    }

    // category
    let categoryId = null;
    const [categoryRows] = await connection.query("SELECT category_id FROM category WHERE name = ? LIMIT 1", [
      sampleCategoryName,
    ]);
    if (categoryRows.length) {
      categoryId = categoryRows[0].category_id;
    } else {
      const [insertCategory] = await connection.query(
        "INSERT INTO category (name, description) VALUES (?, ?)",
        [sampleCategoryName, "환경 보호 및 기후 대응"]
      );
      categoryId = insertCategory.insertId;
    }

    // host company
    let hostCompanyId = null;
    const [companyRows] = await connection.query(
      "SELECT host_company_id FROM program_host_company WHERE company_name = ? LIMIT 1",
      [sampleCompanyName]
    );
    if (companyRows.length) {
      hostCompanyId = companyRows[0].host_company_id;
    } else {
      const [insertCompany] = await connection.query(
        "INSERT INTO program_host_company (company_name, address, company_phone, business_no, email, password_hash) VALUES (?, ?, ?, ?, ?, ?)",
        [
          sampleCompanyName,
          "서울시 강남구 테헤란로 10",
          "02-0000-0000",
          "123-45-67890",
          "forest@demo.com",
          hashPassword("forest123!"),
        ]
      );
      hostCompanyId = insertCompany.insertId;
    }

    // program
    let programId = null;
    const [programRows] = await connection.query("SELECT program_id, status FROM program WHERE title = ? LIMIT 1", [
      sampleProgramTitle,
    ]);
    if (programRows.length) {
      programId = programRows[0].program_id;
      if (programRows[0].status !== "FINISHED") {
        await connection.query("UPDATE program SET status = 'FINISHED' WHERE program_id = ?", [programId]);
      }
    } else {
      const [insertProgram] = await connection.query(
        `INSERT INTO program
          (title, place, start_date, end_date, description, status, account_number, goal_amount, category_id, host_company_id)
        VALUES (?, ?, ?, ?, ?, 'FINISHED', ?, ?, ?, ?)`,
        [
          sampleProgramTitle,
          "서울 서초구 우면산 일대",
          "2024-03-01",
          "2024-05-31",
          "시민 참여형으로 도심 숲을 되살리는 활동",
          "110-398-123456",
          800000,
          categoryId,
          hostCompanyId,
        ]
      );
      programId = insertProgram.insertId;
    }

    // donation
    const [donationRows] = await connection.query(
      "SELECT donation_id FROM donation WHERE donor_id = ? AND program_id = ? AND status = 'PAID' LIMIT 1",
      [donorId, programId]
    );
    if (!donationRows.length) {
      await connection.query(
        `INSERT INTO donation (donor_id, program_id, subscription_id, amount, paid_at, payment_method, status, memo)
         VALUES (?, ?, NULL, ?, DATE_SUB(NOW(), INTERVAL 25 DAY), 'CARD', 'PAID', ?)`,
        [donorId, programId, 350000, "종료된 프로그램 영수증 샘플"]
      );
    }

    // expenses
    const expenseSeed = [
      ["2024-03-10", "산림조합중앙회", "묘목 구매", 180000],
      ["2024-03-18", "에코물류", "현장 운송비", 82000],
      ["2024-04-05", "서초구 협력 농협", "봉사자 식비 및 다과", 64000],
    ];
    for (const [expense_date, vendor, description, amount] of expenseSeed) {
      const [exists] = await connection.query(
        "SELECT expense_id FROM expense WHERE program_id = ? AND expense_date = ? AND vendor = ? LIMIT 1",
        [programId, expense_date, vendor]
      );
      if (exists.length) continue;
      await connection.query(
        "INSERT INTO expense (program_id, expense_date, vendor, description, amount) VALUES (?, ?, ?, ?, ?)",
        [programId, expense_date, vendor, description, amount]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    console.error("샘플 종료 프로그램 보장 실패", error);
  } finally {
    connection.release();
  }
}

function normalizeCategoryRow(row = {}) {
  const rawId = row.category_id ?? row.id;
  const category_id = Number.isFinite(Number(rawId)) ? Number(rawId) : rawId;
  return {
    category_id,
    category_name: row.category_name ?? row.name ?? "",
    description: row.description ?? "",
  };
}

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

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function diffInMonths(start, end) {
  if (!start || !end) return 0;
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate || !endDate) return 0;
  return (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
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
    // 실제 운영에서는 bcrypt 해시 사용
    const sql =
      "INSERT INTO donor (name, email, phone, password, created_at) VALUES (?, ?, ?, ?, NOW())";
    const [r] = await pool.execute(sql, [name, email, phone, password]);
    const created_at = new Date();
    res.status(201).json({ donor_id: r.insertId, name, email, phone, created_at });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/companies", async (req, res) => {
  const {
    companyName,
    company_name,
    companyPhone,
    company_phone,
    companyAddress,
    address,
    businessNo,
    business_no,
    companyRegistration,
    email,
    password,
  } = req.body ?? {};

  const name = (companyName ?? company_name ?? "").trim();
  const phone = (companyPhone ?? company_phone ?? "").trim();
  const normalizedPhone = phone || null;
  const normalizedAddress = (companyAddress ?? address ?? "").trim() || null;
  const normalizedBizNo = (businessNo ?? business_no ?? companyRegistration ?? "").trim() || null;
  const loginEmail = (email ?? "").trim();
  const loginPassword = password ?? "";

  if (!name || !loginEmail || !loginPassword) {
    return res.status(400).json({ error: "companyName, email, password 필수" });
  }

  const passwordHash = hashPassword(loginPassword);

  try {
    const sql = `
      INSERT INTO program_host_company (company_name, address, company_phone, business_no, email, password_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const [r] = await pool.execute(sql, [
      name,
      normalizedAddress,
      normalizedPhone,
      normalizedBizNo,
      loginEmail,
      passwordHash,
    ]);

    res.status(201).json({
      host_company_id: r.insertId,
      company_name: name,
      address: normalizedAddress,
      company_phone: normalizedPhone,
      business_no: normalizedBizNo,
      email: loginEmail,
      role: "company",
    });
  } catch (e) {
    if (e?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "이미 등록된 이메일입니다." });
    }
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

    if (donor && donor.stored_password === loginPw) {
      const { stored_password, ...safeDonor } = donor;
      return res.json({ ...safeDonor, role: "donor" });
    }

    const companySql =
      "SELECT host_company_id, company_name, email, password_hash FROM program_host_company WHERE email = ? LIMIT 1";
    const [companyRows] = await pool.query(companySql, [loginId]);
    const company = Array.isArray(companyRows) ? companyRows[0] : undefined;

    const hashedInput = hashPassword(loginPw);

    if (company && company.password_hash === hashedInput) {
      return res.json({
        role: "company",
        company_id: company.host_company_id,
        company_name: company.company_name,
        email: company.email,
      });
    }

    return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
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
        UPDATE Program
        SET status = 'RUNNING'
        WHERE status = 'PLANNED'
          AND start_date IS NOT NULL
          AND start_date <= CURDATE()
      `
      );

      const [toCompleted] = await connection.execute(
        `
        UPDATE Program
        SET status = 'FINISHED'
        WHERE status = 'RUNNING'
          AND end_date IS NOT NULL
          AND end_date < CURDATE()
      `
      );

      const [deleted] = await connection.execute(
        `
        DELETE FROM Program
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
      "SELECT host_company_id AS company_id, company_name, company_phone AS contact, company_phone AS phone, address FROM program_host_company"
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
  res.json([]);
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

  res.json([]);
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
      res.status(201).json(category);
      return;
    }

    const category = normalizeCategoryRow({ category_id, name: category_name, description });
    res.status(201).json(category);
    return;
  } catch (error) {
    console.error("카테고리 추가 실패", error);
    return res.status(500).json({ error: "카테고리를 추가하지 못했습니다." });
  }
});

app.delete("/api/categories/:categoryId", async (req, res) => {
  const { categoryId } = req.params ?? {};
  if (!categoryId) return res.status(400).json({ error: "categoryId 필수" });

  try {
    const [result] = await pool.execute("DELETE FROM category WHERE category_id = ?", [Number(categoryId)]);
    if (result?.affectedRows) {
      res.status(204).end();
      return;
    }
  } catch (error) {
    console.error("카테고리 삭제 실패", error);
    return res.status(500).json({ error: "카테고리를 삭제하지 못했습니다." });
  }
});

app.get("/api/donor/programs", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
        SELECT
          p.program_id,
          p.title,
          p.status,
          p.funding_type,
          p.category_id,
          c.name AS category_name,
          p.host_company_id,
          hc.company_name,
          hc.company_phone,
          hc.address,
          p.start_date,
          p.end_date,
          p.goal_amount,
          COALESCE(SUM(CASE WHEN d.status = 'PAID' THEN d.amount ELSE 0 END), 0) AS total_amount,
          COUNT(DISTINCT CASE WHEN d.status = 'PAID' THEN d.donor_id END) AS donor_count,
          p.description,
          p.place,
          p.funding_type,
          CASE
            WHEN p.funding_type IN ('SUBSCRIPTION','BOTH') THEN 1
            ELSE 0
          END AS monthly_flag
        FROM program p
        LEFT JOIN category c ON c.category_id = p.category_id
        LEFT JOIN program_host_company hc ON hc.host_company_id = p.host_company_id
        LEFT JOIN donation d ON d.program_id = p.program_id
        WHERE p.status = 'RUNNING'
        GROUP BY
          p.program_id,
          p.title,
          p.status,
          p.category_id,
          c.name,
          p.host_company_id,
          hc.company_name,
          hc.company_phone,
          hc.address,
          p.start_date,
          p.end_date,
          p.goal_amount,
          p.description,
          p.place
        HAVING COALESCE(SUM(CASE WHEN d.status = 'PAID' THEN d.amount ELSE 0 END), 0) >= 0
        ORDER BY p.end_date ASC, p.program_id ASC
      `
    );

    const normalized = sortPrograms(mapPrograms(rows), "deadline_asc");
    res.json(normalized);
    return;
  } catch (error) {
    console.error("진행 중 프로그램 조회 실패", error);
  }

  res.json([]);
});

app.get("/api/programs", async (req, res) => {
  const {
    keyword: rawKeyword,
    category: rawCategory,
    status: rawStatus,
    sort: rawSort,
    host_company_id: rawHostCompanyId,
    hostCompanyId: rawHostCompanyIdAlt,
    monthly: rawMonthly,
  } = req.query ?? {};

  const keyword = typeof rawKeyword === "string" && rawKeyword.trim().length ? rawKeyword.trim() : null;
  const category =
    rawCategory !== undefined && rawCategory !== null && rawCategory !== ""
      ? String(rawCategory).trim()
      : null;

  const hostCompanyId =
    rawHostCompanyId ?? rawHostCompanyIdAlt ?? null;

  const allowedStatuses = new Set(["all", "pending", "planned", "running", "finished", "rejected"]);
  const statusList =
    typeof rawStatus === "string"
      ? rawStatus
          .split(",")
          .map((value) => value.trim().toLowerCase())
          .filter((value) => allowedStatuses.has(value) && value !== "all")
      : [];
  const status = statusList.length === 1 ? statusList[0] : null;
  const monthlyOnly = parseBooleanFlag(rawMonthly, false);

  const allowedSorts = new Set([
    "deadline_asc",
    "deadline_desc",
    "start_asc",
    "start_desc",
    "amount_asc",
    "amount_desc",
  ]);
  const sort = typeof rawSort === "string" && allowedSorts.has(rawSort) ? rawSort : "deadline_asc";

  // 회사별 필터가 있을 때는 별도 쿼리로 조회
  if (hostCompanyId !== null && hostCompanyId !== undefined && hostCompanyId !== "") {
    try {
      const clauses = ["host_company_id = ?"];
      const params = [hostCompanyId];

      if (category) {
        clauses.push("category_id = ?");
        params.push(category);
      }

      if (statusList.length === 1) {
        clauses.push("status = ?");
        params.push(statusList[0].toUpperCase());
      } else if (statusList.length > 1) {
        clauses.push(`status IN (${statusList.map(() => "?").join(", ")})`);
        params.push(...statusList.map((value) => value.toUpperCase()));
      }

      if (monthlyOnly) {
        clauses.push("funding_type IN ('SUBSCRIPTION','BOTH')");
      }

      const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

      const [rows] = await pool.query(
        `SELECT
            p.program_id,
            p.title,
            p.status,
            p.category_id,
            p.host_company_id,
            p.start_date,
            p.end_date,
            p.goal_amount,
            p.description,
            p.place,
            p.account_number,
            p.funding_type,
            COALESCE(SUM(CASE WHEN d.status = 'PAID' THEN d.amount ELSE 0 END), 0) AS total_amount,
            COUNT(DISTINCT CASE WHEN d.status = 'PAID' THEN d.donor_id END) AS donor_count,
            CASE
              WHEN p.funding_type IN ('SUBSCRIPTION','BOTH') THEN 1
              ELSE 0
            END AS monthly_flag
         FROM program p
         LEFT JOIN donation d ON d.program_id = p.program_id
         ${whereSql}
         GROUP BY
            p.program_id,
            p.title,
            p.status,
            p.category_id,
            p.host_company_id,
            p.start_date,
            p.end_date,
            p.goal_amount,
            p.description,
            p.place,
            p.account_number,
            p.funding_type
         HAVING COALESCE(SUM(CASE WHEN d.status = 'PAID' THEN d.amount ELSE 0 END), 0) >= 0
         ORDER BY p.program_id DESC`,
        params
      );

      const normalized = sortPrograms(mapPrograms(rows), sort);
      return res.json(normalized);
    } catch (error) {
      console.error("회사별 프로그램 조회 실패", error);
      return res.json([]);
    }
  }

  try {
    const clauses = [];
    const params = [];

    if (keyword) {
      clauses.push(
        "(p.title LIKE ? OR p.description LIKE ? OR p.place LIKE ? OR CAST(p.program_id AS CHAR) LIKE ?)"
      );
      const like = `%${keyword}%`;
      params.push(like, like, like, like);
    }

    if (category) {
      clauses.push("p.category_id = ?");
      params.push(category);
    }

    if (statusList.length === 1) {
      clauses.push("p.status = ?");
      params.push(statusList[0].toUpperCase());
    } else if (statusList.length > 1) {
      clauses.push(`p.status IN (${statusList.map(() => "?").join(", ")})`);
      params.push(...statusList.map((value) => value.toUpperCase()));
    }

    if (monthlyOnly) {
      clauses.push("p.funding_type IN ('SUBSCRIPTION','BOTH')");
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    let orderSql = "ORDER BY p.end_date ASC, p.program_id ASC";
    if (sort === "deadline_desc") orderSql = "ORDER BY p.end_date DESC, p.program_id DESC";
    else if (sort === "deadline_asc") orderSql = "ORDER BY p.end_date ASC, p.program_id ASC";
    else if (sort === "start_desc") orderSql = "ORDER BY p.start_date DESC, p.program_id DESC";
    else if (sort === "start_asc") orderSql = "ORDER BY p.start_date ASC, p.program_id ASC";
    else if (sort === "amount_desc")
      orderSql = "ORDER BY COALESCE(p.goal_amount, 0) DESC, p.program_id DESC";
    else if (sort === "amount_asc")
      orderSql = "ORDER BY COALESCE(p.goal_amount, 0) ASC, p.program_id ASC";

    const [rows] = await pool.query(
      `
        SELECT
          p.program_id,
          p.title,
          p.status,
          p.funding_type,
          p.category_id,
          c.name AS category_name,
          p.host_company_id,
          hc.company_name,
          hc.company_phone,
          hc.address,
          p.start_date,
          p.end_date,
          p.goal_amount,
          COALESCE(SUM(CASE WHEN d.status = 'PAID' THEN d.amount ELSE 0 END), 0) AS total_amount,
          COUNT(DISTINCT CASE WHEN d.status = 'PAID' THEN d.donor_id END) AS donor_count,
          p.description,
          p.place,
          CASE
            WHEN p.funding_type IN ('SUBSCRIPTION','BOTH') THEN 1
            ELSE 0
          END AS monthly_flag
        FROM program p
        LEFT JOIN category c ON c.category_id = p.category_id
        LEFT JOIN program_host_company hc ON hc.host_company_id = p.host_company_id
        LEFT JOIN donation d ON d.program_id = p.program_id
        ${whereSql}
        GROUP BY
          p.program_id,
          p.title,
          p.status,
          p.category_id,
          c.name,
          p.host_company_id,
          hc.company_name,
          hc.company_phone,
          hc.address,
          p.start_date,
          p.end_date,
          p.goal_amount,
          p.description,
          p.place
        HAVING COALESCE(SUM(CASE WHEN d.status = 'PAID' THEN d.amount ELSE 0 END), 0) >= 0
        ${orderSql}
      `,
      params
    );

    const normalized = sortPrograms(mapPrograms(rows), sort);
    res.json(normalized);
  } catch (e) {
    console.error("프로그램 조회 실패", e);
    res.json([]);
  }
});

app.post("/api/programs", async (req, res) => {
  const {
    title,
    program_title,
    start_date,
    startDate,
    end_date,
    endDate,
    description,
    account_number,
    accountNumber,
    goal_amount,
    goalAmount,
    category_id,
    categoryId,
    host_company_id,
    hostCompanyId,
    place,
    location,
    monthly,
    is_recurring,
    allow_monthly_donation,
    monthly_donation,
    monthlyDonation,
    funding_type,
  } = req.body ?? {};

  const normalizedTitle = (title ?? program_title ?? "").trim();
  const normalizedDescription = (description ?? "").trim();
  const normalizedStatus = "PENDING"; // 신청 시에는 모두 신청대기 상태로 고정

  const normalizedStart = start_date ?? startDate ?? null;
  const normalizedEnd = end_date ?? endDate ?? null;
  const normalizedAccount = (account_number ?? accountNumber ?? "").trim() || null;
  const normalizedGoal = goal_amount ?? goalAmount ?? null;
  const normalizedCategory = category_id ?? categoryId ?? null;
  const normalizedHost = host_company_id ?? hostCompanyId ?? null;
  const normalizedPlace = (place ?? location ?? "").trim() || null;

  if (!normalizedTitle || !normalizedCategory || !normalizedHost || !normalizedStart || !normalizedEnd) {
    return res.status(400).json({ error: "title, category_id, host_company_id, start_date, end_date 필수" });
  }

  const startDateObj = parseDate(normalizedStart);
  const endDateObj = parseDate(normalizedEnd);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!startDateObj || !endDateObj) {
    return res.status(400).json({ error: "유효한 날짜를 입력해주세요." });
  }

  if (startDateObj.getTime() <= today.getTime()) {
    return res.status(400).json({ error: "시작일이 이미 도래한 프로그램은 신청할 수 없습니다. 오늘 이후 날짜로 설정해 주세요." });
  }

  if (endDateObj.getTime() <= startDateObj.getTime()) {
    return res.status(400).json({ error: "종료일은 시작일 이후여야 합니다." });
  }

  try {
    const sql = `
      INSERT INTO program
        (title, start_date, end_date, description, status, account_number, goal_amount, category_id, host_company_id, place, funding_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const normalizedFunding =
      (funding_type ?? monthly ?? monthly_donation ?? monthlyDonation ?? is_recurring ?? allow_monthly_donation)
        ? "SUBSCRIPTION"
        : "ONE_TIME";

    const [r] = await pool.execute(sql, [
      normalizedTitle,
      normalizedStart,
      normalizedEnd,
      normalizedDescription,
      normalizedStatus,
      normalizedAccount,
      normalizedGoal,
      normalizedCategory,
      normalizedHost,
      normalizedPlace,
      normalizedFunding,
    ]);

    const createdProgram = {
      program_id: r.insertId,
      title: normalizedTitle,
      start_date: normalizedStart,
      end_date: normalizedEnd,
      description: normalizedDescription,
      status: normalizedStatus,
      account_number: normalizedAccount,
      goal_amount: normalizedGoal,
      category_id: normalizedCategory,
      host_company_id: normalizedHost,
      place: normalizedPlace,
      funding_type: normalizedFunding,
    };

    res.status(201).json(createdProgram);
  } catch (e) {
    console.error("프로그램 생성 실패", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/programs/:programId", async (req, res) => {
  const { programId } = req.params ?? {};
  if (!programId) return res.status(400).json({ error: "programId 필수" });

  try {
    const [rows] = await pool.query(
      `
        SELECT
          p.program_id,
          p.title,
          p.status,
          p.category_id,
          c.name AS category_name,
          p.host_company_id,
          hc.company_name,
          hc.company_phone,
          hc.address,
          p.start_date,
          p.end_date,
          p.goal_amount,
          COALESCE(SUM(CASE WHEN d.status = 'PAID' THEN d.amount ELSE 0 END), 0) AS total_amount,
          COUNT(DISTINCT CASE WHEN d.status = 'PAID' THEN d.donor_id END) AS donor_count,
          p.description,
          p.place,
          CASE
            WHEN p.funding_type IN ('SUBSCRIPTION','BOTH') THEN 1
            ELSE 0
          END AS monthly_flag
        FROM program p
        LEFT JOIN category c ON c.category_id = p.category_id
        LEFT JOIN program_host_company hc ON hc.host_company_id = p.host_company_id
        LEFT JOIN donation d ON d.program_id = p.program_id
        WHERE p.program_id = ?
        GROUP BY
          p.program_id,
          p.title,
          p.status,
          p.category_id,
          c.name,
          p.host_company_id,
          hc.company_name,
          hc.company_phone,
          hc.address,
          p.start_date,
          p.end_date,
          p.goal_amount,
          p.description,
          p.place
      `,
      [programId]
    );
    if (Array.isArray(rows) && rows[0]) {
      res.json(normalizeProgram(rows[0]));
      return;
    }
  } catch (error) {
    console.error("프로그램 상세 조회 실패", error);
  }

  res.status(404).json({ error: "프로그램을 찾을 수 없습니다." });
});

app.post("/api/subscriptions", async (req, res) => {
  const {
    donor_id: rawDonorId,
    program_id: rawProgramId,
    amount: rawAmount,
    cycle: rawCycle,
    start_date: rawStartDate,
    status: rawStatus,
  } = req.body ?? {};

  const donor_id = Number(rawDonorId);
  const program_id = Number(rawProgramId);
  const amount = Number(rawAmount);
  const cycle = typeof rawCycle === "string" ? rawCycle.toUpperCase() : "MONTHLY";
  const start_date = rawStartDate ?? null;
  const status = typeof rawStatus === "string" ? rawStatus.toUpperCase() : "ACTIVE";

  if (!donor_id || !program_id || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "donor_id, program_id, amount(양수) 필수" });
  }

  if (!["MONTHLY", "YEARLY"].includes(cycle)) {
    return res.status(400).json({ error: "cycle은 MONTHLY 또는 YEARLY만 가능합니다." });
  }

  const startDateObj = parseDate(start_date);
  if (!startDateObj) {
    return res.status(400).json({ error: "start_date가 올바르지 않습니다." });
  }

  try {
    const [programRows] = await pool.query("SELECT program_id FROM program WHERE program_id = ? LIMIT 1", [program_id]);
    const programRow = Array.isArray(programRows) ? programRows[0] : null;
    if (!programRow) {
      return res.status(404).json({ error: "프로그램을 찾을 수 없습니다." });
    }
  } catch (error) {
    console.error("프로그램 확인 실패", error);
  }

  try {
    const sql = `
      INSERT INTO Subscription (donor_id, program_id, amount, cycle, start_date, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const [result] = await pool.execute(sql, [donor_id, program_id, amount, cycle, start_date, status]);

    res.status(201).json({
      subscription_id: result?.insertId ?? null,
      donor_id,
      program_id,
      amount,
      cycle,
      start_date,
      status,
    });
    return;
  } catch (error) {
    console.error("정기기부 등록 실패", error);
  }

  res.status(500).json({ error: "정기기부를 처리하지 못했습니다." });
});

app.post("/api/donations", async (req, res) => {
  const { donor_id: rawDonorId, program_id: rawProgramId, amount: rawAmount, message: rawMessage } = req.body ?? {};

  const donor_id = Number(rawDonorId);
  const program_id = Number(rawProgramId);
  const amount = Number(rawAmount);
  const message = typeof rawMessage === "string" ? rawMessage.trim() : null;

  if (!donor_id || !program_id || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "donor_id, program_id, amount(양수) 필수" });
  }

  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [insertResult] = await connection.execute(
        "INSERT INTO Donation (donor_id, program_id, subscription_id, amount, paid_at, payment_method, status, memo) VALUES (?, ?, NULL, ?, NOW(), 'CARD', 'PAID', ?)",
        [donor_id, program_id, amount, message]
      );

      await connection.commit();

      res.status(201).json({
        donation_id: insertResult?.insertId ?? null,
        donor_id,
        program_id,
        amount,
        message,
        paid_at: new Date().toISOString(),
      });
      return;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("기부 등록 실패", error);
  }
  res.status(500).json({ error: "기부를 처리하지 못했습니다." });
});

app.patch("/api/programs/:programId/status", async (req, res) => {
  const { programId } = req.params ?? {};
  const { status: nextStatus } = req.body ?? {};

  if (!programId || !nextStatus) {
    return res.status(400).json({ error: "programId, status 필수" });
  }

  const allowedStatuses = new Set(["pending", "planned", "running", "finished", "rejected"]);
  const normalizedKey = nextStatus.toString().toLowerCase();
  if (!allowedStatuses.has(normalizedKey)) {
    return res.status(400).json({ error: "programId, status(pending|planned|running|finished|rejected) 필수" });
  }

  try {
    const statusInfo = PROGRAM_STATUS[normalizedKey] ?? normalizeStatus(normalizedKey);
    const dbStatus = statusInfo.db ?? normalizedKey.toUpperCase();

    const [result] = await pool.execute("UPDATE Program SET status = ? WHERE program_id = ?", [
      dbStatus,
      Number(programId),
    ]);

    if (result?.affectedRows) {
    const [rows] = await pool.query("SELECT * FROM program WHERE program_id = ? LIMIT 1", [programId]);
      res.json(normalizeProgram(rows?.[0]));
      return;
    }
  } catch (error) {
    console.error("프로그램 상태 변경 실패", error);
  }
  res.status(500).json({ error: "프로그램 상태를 변경하지 못했습니다." });
});

app.delete("/api/programs/:programId", async (req, res) => {
  const { programId } = req.params ?? {};
  if (!programId) {
    return res.status(400).json({ error: "programId 필수" });
  }

  try {
      const [result] = await pool.execute(
        "DELETE FROM program WHERE program_id = ? AND status = 'PLANNED'",
        [programId]
      );
    if (result?.affectedRows) {
      res.status(204).end();
      return;
    }
  } catch (error) {
    console.error("프로그램 삭제 실패", error);
  }
  res.status(500).json({ error: "프로그램을 삭제하지 못했습니다." });
});

app.get("/api/donors/:donorId/summary", async (req, res) => {
  const { donorId } = req.params ?? {};
  const donor_id = Number(donorId);
  if (!donor_id) return res.status(400).json({ error: "donorId 필수" });

  try {
    const [donorRows] = await pool.query("SELECT donor_id, name, email, phone FROM donor WHERE donor_id = ? LIMIT 1", [
      donor_id,
    ]);
    const donor = Array.isArray(donorRows) ? donorRows[0] : null;

    const [rows] = await pool.query(
      `
        SELECT
          d.donation_id,
          d.amount,
          d.paid_at AS donated_at,
          d.memo AS message,
          p.program_id,
          p.title AS program_title,
          p.status AS program_status,
          p.category_id,
          p.start_date,
          p.end_date
        FROM Donation d
        LEFT JOIN Program p ON p.program_id = d.program_id
        WHERE d.donor_id = ?
        ORDER BY d.paid_at DESC, d.donation_id DESC
      `,
      [donor_id]
    );

    const [subscriptionRows] = await pool.query(
      `
        SELECT
          s.subscription_id,
          s.amount,
          s.cycle,
          s.start_date,
          s.status AS subscription_status,
          p.program_id,
          p.title AS program_title,
          p.status AS program_status,
          p.category_id,
          p.start_date AS program_start_date,
          p.end_date AS program_end_date
        FROM Subscription s
        LEFT JOIN Program p ON p.program_id = s.program_id
        WHERE s.donor_id = ?
        ORDER BY s.start_date DESC, s.subscription_id DESC
      `,
      [donor_id]
    );

    if (donor) {
      const donations = Array.isArray(rows) ? rows : [];
      const subscriptions = Array.isArray(subscriptionRows) ? subscriptionRows : [];
      const total_amount = donations.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
      const subscription_total_amount = subscriptions.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
      return res.json({
        donor,
        summary: {
          total_amount,
          donation_count: donations.length,
          subscription_total_amount,
          subscription_count: subscriptions.length,
        },
        donations: donations.map((item) => ({
          donation_id: item.donation_id,
          amount: Number(item.amount ?? 0),
          donated_at: item.donated_at,
          message: item.message ?? "",
          program: normalizeProgram({
            program_id: item.program_id,
            title: item.program_title,
            status: item.program_status,
            category_id: item.category_id,
            start_date: item.start_date,
            end_date: item.end_date,
          }),
        })),
        subscriptions: subscriptions.map((item) => ({
          subscription_id: item.subscription_id,
          amount: Number(item.amount ?? 0),
          cycle: item.cycle,
          start_date: item.start_date,
          status: item.subscription_status,
          program: normalizeProgram({
            program_id: item.program_id,
            title: item.program_title,
            status: item.program_status,
            category_id: item.category_id,
            start_date: item.program_start_date,
            end_date: item.program_end_date,
          }),
        })),
      });
    }
  } catch (error) {
    console.error("후원자 요약 조회 실패", error);
  }

  res.status(500).json({ error: "후원자 요약 정보를 불러오지 못했습니다." });
});

app.get("/api/donors/:donorId/programs/:programId/receipt", async (req, res) => {
  const { donorId, programId } = req.params ?? {};
  const donor_id = Number(donorId);
  const program_id = Number(programId);

  if (!donor_id || !program_id) {
    return res.status(400).json({ error: "donorId, programId 필수" });
  }

  try {
    const [donationRows] = await pool.query(
      `
        SELECT
          d.donation_id,
          d.amount,
          d.paid_at,
          d.payment_method,
          d.status AS donation_status,
          p.program_id,
          p.title,
          p.status AS program_status,
          p.category_id,
          c.name AS category_name,
          p.start_date,
          p.end_date,
          p.place,
          p.goal_amount,
          hc.company_name
        FROM donation d
        INNER JOIN program p ON p.program_id = d.program_id
        LEFT JOIN category c ON c.category_id = p.category_id
        LEFT JOIN program_host_company hc ON hc.host_company_id = p.host_company_id
        WHERE d.donor_id = ? AND p.program_id = ?
        ORDER BY d.paid_at DESC, d.donation_id DESC
      `,
      [donor_id, program_id]
    );

    if (!donationRows.length) {
      return res.status(404).json({ error: "해당 후원 내역을 찾을 수 없습니다." });
    }

    const programInfo = donationRows[0];
    const statusInfo = normalizeStatus(programInfo.program_status);
    if (statusInfo.code !== "finished") {
      return res.status(400).json({ error: "종료된 프로그램의 영수증만 확인할 수 있습니다." });
    }

    const totalDonated = donationRows
      .filter((item) => item.donation_status === "PAID")
      .reduce((sum, item) => sum + Number(item.amount ?? 0), 0);

    const [expenseRows] = await pool.query(
      `
        SELECT expense_id, expense_date, vendor, description, amount
        FROM expense
        WHERE program_id = ?
        ORDER BY expense_date DESC, expense_id DESC
      `,
      [program_id]
    );

    const totalSpent = expenseRows.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);

    res.json({
      program: normalizeProgram({
        program_id: programInfo.program_id,
        title: programInfo.title,
        status: programInfo.program_status,
        category_id: programInfo.category_id,
        category_name: programInfo.category_name,
        start_date: programInfo.start_date,
        end_date: programInfo.end_date,
        place: programInfo.place,
        goal_amount: programInfo.goal_amount,
        organization: programInfo.company_name,
      }),
      donation: {
        total_amount: totalDonated,
        payments: donationRows.map((item) => ({
          donation_id: item.donation_id,
          amount: Number(item.amount ?? 0),
          paid_at: item.paid_at,
          payment_method: item.payment_method,
          status: item.donation_status,
        })),
      },
      expenses: expenseRows.map((item) => ({
        expense_id: item.expense_id,
        expense_date: item.expense_date,
        vendor: item.vendor,
        description: item.description ?? "",
        amount: Number(item.amount ?? 0),
      })),
      totals: {
        donated: totalDonated,
        spent: totalSpent,
        remaining: totalDonated - totalSpent,
      },
    });
  } catch (error) {
    console.error("영수증 조회 실패", error);
    res.status(500).json({ error: "영수증 정보를 불러오지 못했습니다." });
  }
});

app.patch("/api/donors/:donorId", async (req, res) => {
  const { donorId } = req.params ?? {};
  const donor_id = Number(donorId);
  if (!donor_id) return res.status(400).json({ error: "donorId 필수" });

  const { name, phone, password, new_password, newPassword, current_password, currentPassword } = req.body ?? {};
  const providedCurrent = current_password ?? currentPassword ?? null;
  const updates = [];
  const params = [];

  try {
    const [rows] = await pool.query(
      "SELECT donor_id, name, email, phone, password AS stored_password FROM donor WHERE donor_id = ? LIMIT 1",
      [donor_id]
    );
    const donor = Array.isArray(rows) ? rows[0] : null;

    if (donor && donor.stored_password !== undefined) {
      if (!providedCurrent || donor.stored_password !== providedCurrent) {
        return res.status(401).json({ error: "현재 비밀번호가 일치하지 않습니다." });
      }
    }
  } catch (error) {
    console.error("후원자 비밀번호 확인 실패", error);
  }

  if (typeof name === "string" && name.trim()) {
    updates.push("name = ?");
    params.push(name.trim());
  }

  if (typeof phone === "string" && phone.trim()) {
    updates.push("phone = ?");
    params.push(phone.trim());
  }

  const nextPassword = new_password ?? newPassword ?? password;
  if (typeof nextPassword === "string" && nextPassword.trim()) {
    updates.push("password = ?");
    params.push(nextPassword.trim());
  }

  if (!updates.length) {
    return res.status(400).json({ error: "수정할 항목이 없습니다." });
  }

  try {
    const sql = `UPDATE donor SET ${updates.join(", ")} WHERE donor_id = ?`;
    params.push(donor_id);
    const [result] = await pool.execute(sql, params);

    if (result?.affectedRows) {
      const [rows] = await pool.query("SELECT donor_id, name, email, phone FROM donor WHERE donor_id = ? LIMIT 1", [
        donor_id,
      ]);
      const donor = Array.isArray(rows) ? rows[0] : null;
      if (donor) {
        return res.json(donor);
      }
    }
  } catch (error) {
    console.error("후원자 정보 수정 실패", error);
  }

  res.status(500).json({ error: "후원자 정보를 수정하지 못했습니다." });
});

app.post("/api/donors/:donorId/verify", async (req, res) => {
  const { donorId } = req.params ?? {};
  const donor_id = Number(donorId);
  const { password } = req.body ?? {};

  if (!donor_id || !password) {
    return res.status(400).json({ error: "donorId, password 필수" });
  }

  try {
    const [rows] = await pool.query("SELECT donor_id, password AS stored_password FROM donor WHERE donor_id = ? LIMIT 1", [
      donor_id,
    ]);
    const donor = Array.isArray(rows) ? rows[0] : null;

    if (donor && donor.stored_password === password) {
      return res.json({ ok: true });
    }
  } catch (error) {
    console.error("비밀번호 확인 실패", error);
  }

  res.status(401).json({ error: "비밀번호가 올바르지 않습니다." });
});

const PORT = Number(process.env.PORT || 8080);
(async () => {
  try {
    await ensureSampleFinishedDonation();
  } catch (error) {
    console.error("샘플 종료 프로그램 보장 실패", error);
  }
})();

app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
