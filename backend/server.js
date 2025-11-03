import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

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

app.get("/api/health", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ ok: rows[0]?.ok === 1 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/donors", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT donor_id, name, email, phone, created_at FROM donor ORDER BY donor_id DESC"
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
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
  if (!email || !password) return res.status(400).json({ error: "email, password 필수" });

  try {
    const sql =
      "SELECT donor_id, name, email, phone, password AS stored_password, created_at FROM donor WHERE email = ? LIMIT 1";
    const [rows] = await pool.query(sql, [email]);
    const donor = Array.isArray(rows) ? rows[0] : undefined;

    if (!donor || donor.stored_password !== password) {
      return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
    }

    const { stored_password, ...safeDonor } = donor;
    res.json(safeDonor);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
