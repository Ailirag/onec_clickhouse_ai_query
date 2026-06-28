import express from "express";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import crypto from "crypto";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { ClickHouseConfig, QueryResult, QueryAnalysis } from "./src/types";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Local Session & Password Storage
const PASSWORDS_FILE = path.join(process.cwd(), "passwords.json");
const ACTIVE_SESSIONS = new Map<string, { role: string; expires: number }>();
const AUTH_ROLES = new Set(["admin", "user"]);
const PASSWORD_HASH_PREFIX = "pbkdf2_sha256";

type PasswordStore = Record<"admin" | "user", string>;

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 120000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  return `${PASSWORD_HASH_PREFIX}$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password: string, stored: string) {
  if (!stored.startsWith(`${PASSWORD_HASH_PREFIX}$`)) {
    return stored === password;
  }

  const [, iterationsRaw, salt, expectedHash] = stored.split("$");
  const iterations = Number(iterationsRaw);
  if (!iterations || !salt || !expectedHash) return false;

  const actual = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function getPasswords(): PasswordStore {
  try {
    if (fs.existsSync(PASSWORDS_FILE)) {
      const data = fs.readFileSync(PASSWORDS_FILE, "utf-8");
      const parsed = JSON.parse(data);
      return {
        admin: typeof parsed.admin === "string" ? parsed.admin : hashPassword("admin"),
        user: typeof parsed.user === "string" ? parsed.user : hashPassword("user")
      };
    }
  } catch (err) {
    console.error("Error reading passwords.json, resetting to default:", err);
  }
  
  const defaults = { admin: hashPassword("admin"), user: hashPassword("user") };
  try {
    fs.writeFileSync(PASSWORDS_FILE, JSON.stringify(defaults, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing default passwords.json:", err);
  }
  return defaults;
}

function savePasswords(passwords: PasswordStore) {
  try {
    fs.writeFileSync(PASSWORDS_FILE, JSON.stringify(passwords, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing passwords.json:", err);
  }
}

function escapeClickHouseString(value: string) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function quoteClickHouseIdentifier(value: string) {
  const name = String(value || "").trim();
  if (!name) {
    throw new Error("Пустое имя объекта ClickHouse");
  }
  return `\`${name.replace(/`/g, "``")}\``;
}

function quoteClickHouseTable(database: string, table: string) {
  return `${quoteClickHouseIdentifier(database)}.${quoteClickHouseIdentifier(table)}`;
}

function schemaTableName(database: string, table: string, selectedDatabase: string) {
  return database === selectedDatabase ? table : `${database}.${table}`;
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function findMentionedDatabase(question: string, databases: string[]) {
  const normalizedQuestion = String(question || "").toLowerCase();
  return databases.find((database) => normalizedQuestion.includes(database.toLowerCase()));
}

function isDatabaseSwitchRequest(question: string) {
  return /\b(switch|change|select|use)\b/i.test(question || "") || /переключ|смени|выбери|используй|поменяй/i.test(question || "");
}

function stripSqlComments(query: string) {
  return query
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
}

function isReadOnlySql(query: string) {
  const cleaned = stripSqlComments(query);
  if (!cleaned) return false;

  const withoutTrailingSemicolon = cleaned.replace(/;\s*$/, "").trim();
  if (withoutTrailingSemicolon.includes(";")) return false;

  const firstKeyword = withoutTrailingSemicolon.match(/^[a-z]+/i)?.[0]?.toUpperCase();
  if (!firstKeyword || !["SELECT", "WITH", "SHOW", "DESCRIBE", "DESC", "EXPLAIN"].includes(firstKeyword)) {
    return false;
  }

  return !/\b(INSERT|ALTER|CREATE|DROP|TRUNCATE|OPTIMIZE|KILL|SYSTEM|ATTACH|DETACH|RENAME|EXCHANGE|REPLACE|GRANT|REVOKE|SET|INTO\s+OUTFILE)\b/i.test(withoutTrailingSemicolon);
}

// Safety cap: rows returned to the browser for a single ad-hoc query.
const MAX_RESULT_ROWS = Number(process.env.MAX_RESULT_ROWS || 5000);

// Append a protective LIMIT to row-returning SELECT/WITH queries that don't
// already constrain their output, so an accidental scan of a billions-row
// table can't stream an enormous payload back to the UI.
function applyRowLimit(query: string, cap: number = MAX_RESULT_ROWS): { sql: string; applied: boolean } {
  const cleaned = stripSqlComments(query);
  const withoutSemicolon = cleaned.replace(/;\s*$/, "");
  const firstKeyword = withoutSemicolon.match(/^[a-z]+/i)?.[0]?.toUpperCase();

  // Only row-returning statements need a cap; SHOW/DESCRIBE/EXPLAIN are bounded.
  if (firstKeyword !== "SELECT" && firstKeyword !== "WITH") {
    return { sql: query, applied: false };
  }
  // Respect an existing LIMIT, and don't disturb a trailing FORMAT/INTO clause.
  if (/\blimit\b/i.test(withoutSemicolon) || /\bformat\b/i.test(withoutSemicolon) || /\binto\s+outfile\b/i.test(withoutSemicolon)) {
    return { sql: query, applied: false };
  }

  return { sql: `${withoutSemicolon}\nLIMIT ${cap}`, applied: true };
}

function buildClickHouseUrl(config: ClickHouseConfig) {
  const rawHost = (config.host || "").trim();
  if (!rawHost) {
    throw new Error("Не указан адрес ClickHouse");
  }

  const isGrandtradeJournalsHost = (host: string) => host.toLowerCase() === "ones-journals.corp.grandtrade.world";

  const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawHost);
  if (hasProtocol) {
    const url = new URL(rawHost);
    if (isGrandtradeJournalsHost(url.hostname) && (url.pathname === "" || url.pathname === "/")) {
      url.pathname = "/data";
    }
    if (isGrandtradeJournalsHost(url.hostname) && url.protocol === "https:" && url.port === "8123") {
      url.port = "";
    }
    if (url.pathname === "") {
      url.pathname = "/";
    }
    url.searchParams.set("database", config.database || "default");
    url.searchParams.set("default_format", "JSON");
    return url.toString();
  }

  let hostClean = rawHost;
  let path = "/";
  let portClean = config.port;
  let hasPath = false;

  if (hostClean.includes("/")) {
    hasPath = true;
    const slashIndex = hostClean.indexOf("/");
    path = hostClean.slice(slashIndex) || "/";
    const parts = hostClean.split("/");
    hostClean = parts[0];
  }

  if (hostClean.includes(":")) {
    const parts = hostClean.split(":");
    hostClean = parts[0];
    const parsedPort = parseInt(parts[1], 10);
    if (!isNaN(parsedPort)) {
      portClean = parsedPort;
    }
  }

  if (!hasPath && isGrandtradeJournalsHost(hostClean)) {
    path = "/data";
    hasPath = true;
  }

  const shouldInferHttpsProxy = hasPath && !config.useHttps && (!portClean || portClean === 8123);
  const shouldUseGrandtradeProxyPort = isGrandtradeJournalsHost(hostClean) && (config.useHttps || shouldInferHttpsProxy) && (!portClean || portClean === 8123);
  const protocol = config.useHttps || shouldInferHttpsProxy ? "https" : "http";
  const port = shouldUseGrandtradeProxyPort || shouldInferHttpsProxy ? 443 : (portClean || (config.useHttps ? 443 : 8123));
  const url = new URL(`${protocol}://${hostClean}:${port}${path}`);
  url.searchParams.set("database", config.database || "default");
  url.searchParams.set("default_format", "JSON");
  return url.toString();
}

function redactClickHouseUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.searchParams.has("password")) {
    url.searchParams.set("password", "***");
  }
  return url.toString();
}

// Global Auth Middleware
app.use((req: any, res: any, next: any) => {
  if (req.path === "/api/auth/login" || req.path === "/api/health") {
    return next();
  }
  if (req.path.startsWith("/api/")) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    
    if (!token) {
      return res.status(401).json({ success: false, error: "Требуется авторизация" });
    }
    
    const session = ACTIVE_SESSIONS.get(token);
    if (!session || session.expires < Date.now()) {
      if (session) ACTIVE_SESSIONS.delete(token); // cleanup expired
      return res.status(401).json({ success: false, error: "Сессия истекла или недействительна" });
    }
    
    req.user = session;
  }
  next();
});

// Auth Routes
app.post("/api/auth/login", (req, res) => {
  const { role, password } = req.body;
  if (!role || !password) {
    return res.status(400).json({ success: false, error: "Укажите роль и пароль" });
  }
  if (!AUTH_ROLES.has(role)) {
    return res.status(400).json({ success: false, error: "Неверная роль" });
  }
  
  const passwords = getPasswords();
  if (verifyPassword(password, passwords[role as "admin" | "user"])) {
    if (!passwords[role as "admin" | "user"].startsWith(`${PASSWORD_HASH_PREFIX}$`)) {
      passwords[role as "admin" | "user"] = hashPassword(password);
      savePasswords(passwords);
    }
    const token = `token_${role}_${crypto.randomBytes(32).toString("hex")}`;
    ACTIVE_SESSIONS.set(token, { role, expires: Date.now() + 24 * 60 * 60 * 1000 });
    return res.json({ success: true, token, role });
  } else {
    return res.status(401).json({ success: false, error: "Неверный пароль" });
  }
});

app.post("/api/auth/change-password", (req: any, res: any) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ success: false, error: "Доступ разрешен только администраторам" });
  }

  const { targetRole, newPassword } = req.body;
  if (!targetRole || !newPassword) {
    return res.status(400).json({ success: false, error: "Укажите роль для смены пароля и новый пароль" });
  }
  if (targetRole !== "admin" && targetRole !== "user") {
    return res.status(400).json({ success: false, error: "Неверная роль" });
  }
  if (newPassword.length < 3) {
    return res.status(400).json({ success: false, error: "Пароль должен быть не менее 3 символов" });
  }
  
  const passwords = getPasswords();
  passwords[targetRole as "admin" | "user"] = hashPassword(newPassword);
  savePasswords(passwords);
  
  // Revoke active sessions for that role so they have to re-authenticate
  for (const [token, session] of ACTIVE_SESSIONS.entries()) {
    if (session.role === targetRole) {
      ACTIVE_SESSIONS.delete(token);
    }
  }
  
  res.json({ success: true, message: `Пароль для роли "${targetRole}" успешно изменен!` });
});

app.get("/api/auth/verify", (req: any, res: any) => {
  res.json({ success: true, role: req.user.role });
});

// Lightweight health probe for monitoring / load balancers (no auth).
app.get("/api/health", (_req: any, res: any) => {
  res.json({
    status: "ok",
    uptime: Math.round(process.uptime()),
    activeSessions: ACTIVE_SESSIONS.size,
    time: new Date().toISOString()
  });
});

const PORT = Number(process.env.PORT || 3000);

// Gemini is an optional provider. The client is created lazily on first use so
// the server doesn't warn about a missing key when YandexGPT is the provider.
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY не задан на сервере. Выберите провайдера YandexGPT или укажите ключ Gemini в окружении.");
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return geminiClient;
}

// Default Gemini model used when none is supplied
const GEMINI_MODEL = "gemini-2.5-flash";

// Generative mock data representing 1C Event Log exporter (akpaevj/OneSTools.EventLog)
const generateMockEventLog = () => {
  const users = [
    { uuid: "a8b9c0d1-e2f3-4a5b-6c7d-8e9f0a1b2c3d", name: "Администратор (Главный)" },
    { uuid: "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e", name: "Иванов Иван Иванович (Главный бухгалтер)" },
    { uuid: "c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f", name: "Петрова Анна Сергеевна (Старший менеджер)" },
    { uuid: "d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a", name: "Сидоров Алексей Петрович (Кассир)" },
    { uuid: "e5f6a7b8-c9d0-1e2f-3a4b-5c6d7e8f9a0b", name: "Фоновое задание (Регламентное проведение)" },
    { uuid: "f6a7b8c9-d0e1-2f3a-4b5c-6d7e8f9a0b1c", name: "Фоновое задание (Закрытие месяца)" },
    { uuid: "0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d", name: "Web: Личный кабинет клиента (Бот)" }
  ];

  const computers = ["SRV-1C-APP01", "SRV-1C-DB", "BUH-PC-01", "SALE-PC-03", "CASH-PC-01", "CASH-PC-02"];

  const appPresentations = [
    "1С:Предприятие - тонкий клиент",
    "Фоновое задание",
    "Web-сервер",
    "COM-соединение",
    "1С:Предприятие - толстый клиент"
  ];

  const metadata = [
    { presentation: "Документ.РеализацияТоваровУслуг", rus: "Реализация товаров и услуг" },
    { presentation: "Документ.ПоступлениеТоваровУслуг", rus: "Поступление товаров и услуг" },
    { presentation: "Документ.ПлатежноеПоручение", rus: "Платежное поручение" },
    { presentation: "Справочник.Контрагенты", rus: "Контрагенты" },
    { presentation: "Справочник.Номенклатура", rus: "Номенклатура" },
    { presentation: "Справочник.Пользователи", rus: "Пользователи" },
    { presentation: "РегистрНакопления.Продажи", rus: "Регистр накопления Продажи" },
    { presentation: "РегистрНакопления.ТоварыНаСкладах", rus: "Регистр накопления Товары на складах" }
  ];

  const mockData: any[] = [];
  const now = new Date();

  // Create ~150 logs spread across past 5 days
  for (let i = 0; i < 150; i++) {
    const logDate = new Date(now.getTime() - Math.random() * 5 * 24 * 60 * 60 * 1000);
    const user = users[Math.floor(Math.random() * users.length)];
    const computer = computers[Math.floor(Math.random() * computers.length)];
    
    // Pick app presentation matching user type
    let appPres = appPresentations[0];
    if (user.name.includes("Фоновое задание")) {
      appPres = "Фоновое задание";
    } else if (user.name.includes("Web")) {
      appPres = "Web-сервер";
    } else {
      appPres = appPresentations[Math.floor(Math.random() * appPresentations.length)];
    }

    // Pick severity and event
    const rand = Math.random();
    let severity = "Информация";
    let event = "_$Session$_.Start";
    let comment = "Сеанс начат";
    let metaPres = "";
    let dataPres = "";
    let transStatus = "NoTransaction";

    if (rand < 0.15) {
      severity = "Ошибка";
      transStatus = Math.random() > 0.5 ? "RolledBack" : "NoTransaction";
      const errorType = Math.random();
      if (errorType < 0.3) {
        event = "Ошибка выполнения";
        comment = "Ошибка: Индекс находится вне границ диапазона при расчете скидок!";
        metaPres = "Документ.РеализацияТоваровУслуг";
        dataPres = `Реализация товаров и услуг №РТУ-${Math.floor(100 + Math.random() * 900)}`;
      } else if (errorType < 0.6) {
        event = "Ошибка выполнения";
        comment = "Ошибка транзакции: Превышено максимальное время ожидания блокировки данных! Не удалось записать документ.";
        metaPres = "Документ.ПоступлениеТоваровУслуг";
        dataPres = `Поступление товаров и услуг №ПТУ-${Math.floor(100 + Math.random() * 900)}`;
      } else {
        event = "Ошибка авторизации";
        comment = "Неверный пароль или имя пользователя при входе в систему.";
        metaPres = "Справочник.Пользователи";
        dataPres = `Пользователь: ${user.name}`;
      }
    } else if (rand < 0.30) {
      severity = "Предупреждение";
      event = "_$Data$_.Update";
      const warnType = Math.random();
      if (warnType < 0.5) {
        comment = "Предупреждение: Обнаружены отрицательные остатки по складу Основной!";
        metaPres = "РегистрНакопления.ТоварыНаСкладах";
        dataPres = "Товары на складах (Основной склад)";
      } else {
        comment = "Изменение критических настроек прав доступа пользователя.";
        metaPres = "Справочник.Пользователи";
        dataPres = `Пользователь: ${users[Math.floor(Math.random() * users.length)].name}`;
      }
    } else {
      severity = "Информация";
      transStatus = Math.random() > 0.4 ? "Committed" : "NoTransaction";
      const infoType = Math.random();
      if (infoType < 0.2) {
        event = "_$Session$_.Start";
        comment = "Успешная аутентификация в системе.";
      } else if (infoType < 0.4) {
        event = "_$Session$_.Finish";
        comment = "Завершение сеанса работы.";
      } else if (infoType < 0.7) {
        event = "_$Data$_.Post";
        const m = metadata[Math.floor(Math.random() * 3)]; // documents only
        comment = `Проведение документа: ${m.rus}`;
        metaPres = m.presentation;
        dataPres = `${m.rus} №РТУ-${Math.floor(1000 + Math.random() * 9000)} от ${logDate.toLocaleDateString()}`;
      } else {
        event = "_$Data$_.Update";
        const m = metadata[4 + Math.floor(Math.random() * 3)]; // catalogs
        comment = `Изменение элемента справочника: ${m.rus}`;
        metaPres = m.presentation;
        dataPres = `Элемент: ${m.rus} (ID: ${Math.floor(10000 + Math.random() * 90000)})`;
      }
    }

    mockData.push({
      DateTime: logDate.toISOString().replace('T', ' ').substring(0, 19),
      TransactionStatus: transStatus,
      TransactionPresentation: transStatus === "Committed" ? "Зафиксирована" : (transStatus === "RolledBack" ? "Отменена" : "Нет транзакции"),
      UserUUID: user.uuid,
      UserName: user.name,
      Computer: computer,
      ApplicationPresentation: appPres,
      Connection: Math.floor(1000 + Math.random() * 90000),
      EventPresentation: event,
      SeverityPresentation: severity,
      Comment: comment,
      MetadataPresentation: metaPres,
      DataPresentation: dataPres,
      Session: Math.floor(100000 + Math.random() * 900000),
      Port: Math.floor(1500 + Math.random() * 100),
      SyncPort: Math.floor(1600 + Math.random() * 100)
    });
  }

  // Sort by date desc
  return mockData.sort((a, b) => b.DateTime.localeCompare(a.DateTime));
};

const MOCK_DATASET = generateMockEventLog();

// Mock database schema
const MOCK_SCHEMA = {
  tables: [
    {
      name: "EventLogItems",
      rowCount: MOCK_DATASET.length,
      isEventLog: true,
      columns: [
        { name: "DateTime", type: "DateTime", comment: "Дата и время события" },
        { name: "TransactionStatus", type: "Enum8('NoTransaction'=0, 'Uncommitted'=1, 'Committed'=2, 'RolledBack'=3)", comment: "Статус транзакции" },
        { name: "TransactionPresentation", type: "String", comment: "Представление транзакции в 1С" },
        { name: "UserUUID", type: "String", comment: "Уникальный идентификатор пользователя 1С" },
        { name: "UserName", type: "String", comment: "Имя (логин) пользователя 1С" },
        { name: "Computer", type: "String", comment: "Имя компьютера клиента" },
        { name: "ApplicationPresentation", type: "String", comment: "Имя приложения (Тонкий клиент, фоновое задание и т.д.)" },
        { name: "Connection", type: "Int64", comment: "Номер сетевого соединения" },
        { name: "EventPresentation", type: "String", comment: "Представление события (Сеанс.Начало, Данные.Проведение и т.д.)" },
        { name: "SeverityPresentation", type: "String", comment: "Важность события (Информация, Ошибка, Предупреждение, Примечание)" },
        { name: "Comment", type: "String", comment: "Комментарий к событию" },
        { name: "MetadataPresentation", type: "String", comment: "Имя объекта метаданных 1С (Документ, Справочник и т.д.)" },
        { name: "DataPresentation", type: "String", comment: "Представление измененных данных" },
        { name: "Session", type: "Int64", comment: "Номер сеанса связи" },
        { name: "Port", type: "Int32", comment: "Сетевой порт" },
        { name: "SyncPort", type: "Int32", comment: "Синхронный порт" }
      ],
      sampleRows: MOCK_DATASET.slice(0, 3)
    }
  ]
};

// Max time (ms) to wait for a single ClickHouse HTTP request before aborting.
const CLICKHOUSE_TIMEOUT_MS = Number(process.env.CLICKHOUSE_TIMEOUT_MS || 60000);

// Real ClickHouse Executer
const executeClickHouseQuery = async (
  config: ClickHouseConfig,
  query: string,
  timeoutMs: number = CLICKHOUSE_TIMEOUT_MS
): Promise<QueryResult> => {
  const start = Date.now();
  let diagnostics: Record<string, any> | null = null;
  try {
    const url = buildClickHouseUrl(config);
    diagnostics = {
      endpoint: redactClickHouseUrl(url),
      username: config.username || "(empty)",
      hasPassword: Boolean(config.password),
      database: config.database || "default",
      useHttps: Boolean(config.useHttps)
    };

    const headers: Record<string, string> = {
      "Content-Type": "text/plain"
    };

    if (config.username) {
      headers["X-ClickHouse-User"] = config.username;
    }
    if (config.password) {
      headers["X-ClickHouse-Key"] = config.password;
    }
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: query,
      signal: AbortSignal.timeout(timeoutMs)
    });

    const elapsedMs = Date.now() - start;

    if (!response.ok) {
      const errText = await response.text();
      return {
        success: false,
        sql: query,
        error: `ClickHouse Error (${response.status}): ${errText}\n\nДиагностика подключения: ${JSON.stringify(diagnostics)}`,
        elapsedMs
      };
    }

    const text = await response.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      return {
        success: false,
        sql: query,
        error: `ClickHouse вернул не JSON (${response.status}): ${text.slice(0, 500)}\n\nДиагностика подключения: ${JSON.stringify(diagnostics)}`,
        elapsedMs
      };
    }
    const columns = json.meta?.map((m: any) => m.name) || [];
    const columnTypes: Record<string, string> = {};
    json.meta?.forEach((m: any) => {
      columnTypes[m.name] = m.type;
    });

    return {
      success: true,
      sql: query,
      rows: json.data || [],
      columns,
      columnTypes,
      rowCount: json.rows || json.data?.length || 0,
      elapsedMs
    };
  } catch (err: any) {
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    const details = [
      isTimeout ? `Превышено время ожидания ответа ClickHouse (${timeoutMs} мс)` : (err.message || String(err)),
      err.cause?.code ? `code=${err.cause.code}` : "",
      err.cause?.address ? `address=${err.cause.address}` : "",
      err.cause?.port ? `port=${err.cause.port}` : ""
    ].filter(Boolean).join("; ");

    return {
      success: false,
      sql: query,
      error: `${isTimeout ? "TIMEOUT" : "Network Connection Error"}: ${details}${diagnostics ? `\n\nДиагностика подключения: ${JSON.stringify(diagnostics)}` : ""}`,
      elapsedMs: Date.now() - start
    };
  }
};

// 1. Connection check
app.post("/api/clickhouse/test", async (req, res) => {
  const { config, isDemo } = req.body;
  if (isDemo) {
    return res.json({ success: true, message: "Демо-режим успешно запущен. Доступно 150 логов." });
  }

  const result = await executeClickHouseQuery(config, "SELECT 1");
  if (result.success) {
    res.json({ success: true, message: "Успешное подключение к ClickHouse!" });
  } else {
    res.json({ success: false, error: result.error });
  }
});

// Run async tasks with a bounded concurrency (keeps schema sampling fast
// without flooding ClickHouse with hundreds of simultaneous requests).
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

// How many tables to fetch preview rows for (selected DB first).
const SCHEMA_SAMPLE_TABLE_LIMIT = 40;
const SCHEMA_SAMPLE_CONCURRENCY = 8;

// 2. Fetch DB Schema (Tables and Columns)
app.post("/api/clickhouse/schema", async (req, res) => {
  const { config, isDemo } = req.body;

  if (isDemo) {
    return res.json({ success: true, schema: MOCK_SCHEMA });
  }

  // Fetch real tables and columns
  try {
    const selectedDatabase = config.database || "default";
    const selectedDatabaseLiteral = escapeClickHouseString(selectedDatabase);
    // total_rows comes straight from MergeTree metadata — instant, unlike count().
    const tablesQuery = `
      SELECT database, name, total_rows
      FROM system.tables
      WHERE is_temporary = 0
        AND database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
      ORDER BY if(database = '${selectedDatabaseLiteral}', 0, 1), database, name
      LIMIT 200
    `;
    const tablesRes = await executeClickHouseQuery(config, tablesQuery);

    if (!tablesRes.success) {
      return res.status(500).json({ success: false, error: tablesRes.error });
    }

    const tableRefs = (tablesRes.rows || [])
      .map((r: any) => ({
        database: r.database || selectedDatabase,
        name: r.name,
        rowCount: r.total_rows != null ? Number(r.total_rows) : 0
      }))
      .filter((r: any) => r.name);

    if (!tableRefs.length) {
      return res.json({ success: true, schema: { tables: [], databases: [], selectedDatabase } });
    }

    // Single batched query for the columns of every discovered table.
    const tableKey = (db: string, table: string) => `${db}::${table}`;
    const tupleList = tableRefs
      .map((r: any) => `('${escapeClickHouseString(r.database)}','${escapeClickHouseString(r.name)}')`)
      .join(",");
    const columnsQuery = `
      SELECT database, table, name, type, comment
      FROM system.columns
      WHERE (database, table) IN (${tupleList})
      ORDER BY database, table, position
    `;
    const columnsRes = await executeClickHouseQuery(config, columnsQuery);
    const columnsByTable = new Map<string, Array<{ name: string; type: string; comment?: string }>>();
    for (const row of columnsRes.rows || []) {
      const key = tableKey(row.database, row.table);
      if (!columnsByTable.has(key)) columnsByTable.set(key, []);
      columnsByTable.get(key)!.push({
        name: row.name,
        type: row.type,
        comment: row.comment || undefined
      });
    }

    // Preview rows: only for the most relevant tables (selected DB first),
    // fetched in parallel with bounded concurrency.
    const sampleTargets = tableRefs.slice(0, SCHEMA_SAMPLE_TABLE_LIMIT);
    const samplesByTable = new Map<string, any[]>();
    await mapWithConcurrency(sampleTargets, SCHEMA_SAMPLE_CONCURRENCY, async (ref: any) => {
      const identifier = quoteClickHouseTable(ref.database, ref.name);
      const sampleRes = await executeClickHouseQuery(config, `SELECT * FROM ${identifier} LIMIT 3`, 20000);
      samplesByTable.set(tableKey(ref.database, ref.name), sampleRes.success ? (sampleRes.rows || []) : []);
    });

    const tables = tableRefs.map((ref: any) => {
      const key = tableKey(ref.database, ref.name);
      const columns = columnsByTable.get(key) || [];
      // Recognise both the demo schema (EventPresentation/SeverityPresentation)
      // and the real OneSTools.EventLog exporter schema (Event/Severity).
      const colNames = new Set(columns.map((c) => c.name));
      const hasEvent = colNames.has("Event") || colNames.has("EventPresentation");
      const hasSeverity = colNames.has("Severity") || colNames.has("SeverityPresentation");
      return {
        name: schemaTableName(ref.database, ref.name, selectedDatabase),
        database: ref.database,
        columns,
        rowCount: ref.rowCount,
        sampleRows: samplesByTable.get(key) || [],
        isEventLog: hasEvent && hasSeverity
      };
    });

    const databases = uniqueSorted(tableRefs.map((tableRef: any) => tableRef.database));
    res.json({ success: true, schema: { tables, databases, selectedDatabase } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || err });
  }
});

// 3. Execute query
app.post("/api/clickhouse/query", async (req, res) => {
  const { config, query, isDemo, question, schema, aiConfig } = req.body;
  if (!isReadOnlySql(query || "")) {
    return res.status(400).json({
      success: false,
      sql: query || "",
      error: "Разрешены только read-only SQL-запросы: SELECT, WITH, SHOW, DESCRIBE или EXPLAIN."
    });
  }

  if (isDemo) {
    // Simulate query execution over MOCK_DATASET using the configured AI provider.
    try {
      const demoSystemPrompt = withCustomSystemPrompt(
        "Вы являетесь симулятором базы данных ClickHouse. Вам передан массив записей журнала регистрации 1С (EventLogItems) и ClickHouse SQL-запрос. Выполните запрос над данными и верните результат строго в формате JSON.",
        aiConfig
      );
      const demoUserPrompt = `Запрос: ${query}

Вы должны вернуть JSON объект, содержащий три поля:
1. "meta": массив объектов { "name": string, "type": string } с описанием возвращаемых полей и их типов.
2. "data": массив объектов с результатами выполнения запроса.
3. "rows": число строк в результате.

Вот данные EventLogItems:
${JSON.stringify(MOCK_DATASET.slice(0, 100))}

Внимание: возвращайте ТОЛЬКО валидный JSON объект. Никаких markdown блоков, комментариев или лишнего текста вокруг JSON.`;

      const resultObj = await requestAiJson(demoSystemPrompt, demoUserPrompt, aiConfig);

      const columns = resultObj.meta?.map((m: any) => m.name) || [];
      const columnTypes: Record<string, string> = {};
      resultObj.meta?.forEach((m: any) => {
        columnTypes[m.name] = m.type;
      });

      return res.json({
        success: true,
        sql: query,
        rows: resultObj.data || [],
        columns,
        columnTypes,
        rowCount: resultObj.rows || resultObj.data?.length || 0,
        elapsedMs: 45 // Simulated latency
      });
    } catch (err: any) {
      // Fallback simple engine if the AI simulator fails or times out
      console.error("AI query simulation failed, falling back to basic mock simulation", err);
      // Basic filtering: if query mentions SeverityPresentation, do basic mock grouping
      const isErrorQuery = query.toLowerCase().includes("ошибка") || query.toLowerCase().includes("error") || query.toLowerCase().includes("severitypresentation = 'ошибка'");
      const rows = isErrorQuery 
        ? MOCK_DATASET.filter(r => r.SeverityPresentation === "Ошибка").slice(0, 10)
        : MOCK_DATASET.slice(0, 15);

      return res.json({
        success: true,
        sql: query,
        rows,
        columns: Object.keys(MOCK_DATASET[0]),
        rowCount: rows.length,
        elapsedMs: 5
      });
    }
  }

  // Real ClickHouse execution (with a protective row cap).
  const capped = applyRowLimit(query);
  const result = await executeClickHouseQuery(config, capped.sql);
  if (result.success && capped.applied) {
    result.limitApplied = MAX_RESULT_ROWS;
  }
  if (!result.success && question && schema && aiConfig) {
    try {
      const repair = await repairSqlWithAi({
        question,
        failedSql: query,
        error: result.error || "",
        schema,
        aiConfig
      });

      if (repair.sql && repair.sql.trim() !== query.trim()) {
        if (!isReadOnlySql(repair.sql)) {
          throw new Error("Модель предложила не read-only SQL — автоисправление отклонено.");
        }

        const cappedRepair = applyRowLimit(repair.sql);
        const repairedResult = await executeClickHouseQuery(config, cappedRepair.sql);
        return res.json({
          ...repairedResult,
          sql: repair.sql,
          limitApplied: repairedResult.success && cappedRepair.applied ? MAX_RESULT_ROWS : undefined,
          repair: {
            originalSql: query,
            originalError: result.error,
            explanation: repair.explanation
          }
        });
      }
    } catch (repairErr: any) {
      return res.json({
        ...result,
        error: `${result.error}\n\nАвтоисправление SQL не удалось: ${repairErr.message || repairErr}`
      });
    }
  }

  res.json(result);
});

// Helper to execute completion requests on YandexGPT
function normalizeYandexModelUri(yandexModel: string, yandexFolderId: string) {
  const model = String(yandexModel || "").trim();
  const folderId = String(yandexFolderId || "").trim();

  if (!model) {
    throw new Error("Модель YandexGPT не заполнена. Выберите модель или укажите Model URI.");
  }

  if (model.startsWith("ds://")) {
    return model;
  }

  if (model.startsWith("gpt://")) {
    const uriBody = model.slice("gpt://".length).replace(/^\/+/, "");
    const parts = uriBody.split("/").filter(Boolean);

    if (parts.length < 3 && folderId) {
      return `gpt://${folderId}/${uriBody}`;
    }

    return model;
  }

  return `gpt://${folderId}/${model.replace(/^\/+/, "")}`;
}

function shouldUseYandexResponsesApi(modelUri: string) {
  if (!modelUri.startsWith("gpt://")) return false;

  const parts = modelUri.slice("gpt://".length).split("/").filter(Boolean);
  const modelName = parts.length >= 2 ? parts[1] : parts[0];
  return !modelName.startsWith("yandexgpt");
}

function extractYandexResponsesText(json: any) {
  if (typeof json.output_text === "string" && json.output_text.trim()) {
    return json.output_text;
  }

  const chunks: string[] = [];
  for (const item of json.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string" && content.text.trim()) {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

const callYandexGpt = async (systemPrompt: string, userPrompt: string, aiConfig: any): Promise<string> => {
  const { yandexApiKey, yandexFolderId, yandexModel } = aiConfig || {};
  
  if (!yandexApiKey) {
    throw new Error("Yandex Cloud API-ключ не заполнен. Заполните его в панели настроек AI.");
  }
  if (!yandexFolderId) {
    throw new Error("Folder ID не заполнен. Заполните его в панели настроек AI.");
  }

  const modelUri = normalizeYandexModelUri(yandexModel, yandexFolderId);
  const useResponsesApi = shouldUseYandexResponsesApi(modelUri);

  if (useResponsesApi) {
    const url = "https://ai.api.cloud.yandex.net/v1/responses";
    const body = {
      model: modelUri,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2,
      max_output_tokens: 4000
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Api-Key ${yandexApiKey}`,
        "x-folder-id": yandexFolderId
      },
      body: JSON.stringify(body)
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Yandex Responses API Error (${response.status}): ${text}\n\nДиагностика YandexGPT: ${JSON.stringify({ endpoint: url, modelUri })}`);
    }

    const json: any = JSON.parse(text);
    const textResult = extractYandexResponsesText(json);
    if (!textResult) {
      throw new Error(`Не удалось получить текст от Yandex Responses API. Тело ответа: ${JSON.stringify(json)}`);
    }

    return textResult;
  }

  const url = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion";
  
  const body = {
    modelUri,
    completionOptions: {
      stream: false,
      temperature: 0.2,
      maxTokens: "4000"
    },
    messages: [
      { role: "system", text: systemPrompt },
      { role: "user", text: userPrompt }
    ]
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Api-Key ${yandexApiKey}`,
      "x-folder-id": yandexFolderId
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`YandexGPT API Error (${response.status}): ${text}\n\nДиагностика YandexGPT: ${JSON.stringify({ modelUri })}`);
  }

  const json: any = JSON.parse(text);
  const textResult = json.result?.alternatives?.[0]?.message?.text;
  if (!textResult) {
    throw new Error(`Не удалось получить ответ от YandexGPT. Тело ответа: ${JSON.stringify(json)}`);
  }

  return textResult;
};

// Helper to extract JSON from any text block robustly
function extractAndParseJson(text: string): any {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonCandidate = trimmed.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(jsonCandidate);
      } catch (innerError: any) {
        throw new Error(`Ошибка парсинга выделенного JSON: ${innerError.message}. Текст: ${jsonCandidate}`);
      }
    }
    throw new Error(`JSON не найден в ответе нейросети. Текст: ${trimmed}`);
  }
}

async function requestAiJson(systemPrompt: string, userPrompt: string, aiConfig: any) {
  if (aiConfig && aiConfig.provider === "yandexgpt") {
    const responseText = await callYandexGpt(systemPrompt, userPrompt, aiConfig);
    return extractAndParseJson(responseText);
  }

  const selectedModel = aiConfig?.geminiModel || GEMINI_MODEL;
  const response = await getGeminiClient().models.generateContent({
    model: selectedModel,
    contents: `${systemPrompt}\n\n${userPrompt}`,
    config: {
      responseMimeType: "application/json"
    }
  });

  return JSON.parse(response.text?.trim() || "{}");
}

function withCustomSystemPrompt(basePrompt: string, aiConfig: any) {
  const customPrompt = String(aiConfig?.systemPrompt || "").trim();
  if (!customPrompt) return basePrompt;

  return `${basePrompt}

Additional operator instructions:
${customPrompt}`;
}

async function repairSqlWithAi({
  question,
  failedSql,
  error,
  schema,
  aiConfig
}: {
  question: string;
  failedSql: string;
  error: string;
  schema: any;
  aiConfig: any;
}) {
  const tableNames = (schema?.tables || []).map((table: any) => table.name).filter(Boolean);
  if (!tableNames.length) {
    throw new Error("Схема ClickHouse пуста. Обновите список таблиц перед автоисправлением SQL.");
  }

  const systemPrompt = withCustomSystemPrompt(
    `You are a ClickHouse SQL reviewer. Repair a failed read-only SELECT/WITH/SHOW/DESCRIBE/EXPLAIN query using only the real schema. Return JSON only.`,
    aiConfig
  );
  const userPrompt = `User question:
"${question}"

Available tables. Use table names exactly as listed:
${JSON.stringify(tableNames)}

Full schema:
${JSON.stringify(schema)}

Failed SQL:
\`\`\`sql
${failedSql}
\`\`\`

ClickHouse error:
${error}

Rules:
1. Do not use any table that is not in the available table list.
2. If the error is UNKNOWN_TABLE, choose the best matching table by columns and sampleRows.
3. Do not use EventLogItems unless EventLogItems appears in the available table list.
4. Before answering, verify every table reference in SQL exists in the available table list.
5. Return JSON with "sql" and "explanation".

Format:
{"sql":"SELECT ...","explanation":"..."}`;

  const parsed = await requestAiJson(systemPrompt, userPrompt, aiConfig);
  return {
    sql: String(parsed.sql || "").trim(),
    explanation: parsed.explanation ? String(parsed.explanation) : undefined
  };
}

// 4. Generate SQL from natural language
app.post("/api/gemini/generate-sql", async (req, res) => {
  const { question, schema, isDemo, aiConfig, session, dialog } = req.body;

  try {
    const allTables = schema?.tables || [];
    const availableDatabases = uniqueSorted([
      ...(schema?.databases || []),
      ...allTables.map((table: any) => table.database)
    ]);
    const requestedDatabase = findMentionedDatabase(question, availableDatabases);
    const sessionDatabase = String(session?.selectedDatabase || "").trim();
    const validSessionDatabase = sessionDatabase && availableDatabases.includes(sessionDatabase) ? sessionDatabase : "";

    if (isDatabaseSwitchRequest(question) && requestedDatabase) {
      return res.json({
        success: true,
        action: "switch_database",
        database: requestedDatabase,
        message: `Контекст диалога переключён на базу «${requestedDatabase}». Задайте вопрос ещё раз или продолжайте работу с этой базой.`,
        session: { ...session, selectedDatabase: requestedDatabase }
      });
    }

    let selectedDatabase = validSessionDatabase || (availableDatabases.length === 1 ? availableDatabases[0] : "");
    if (!selectedDatabase && availableDatabases.length > 1 && !isDemo) {
      return res.json({
        success: true,
        action: "select_database",
        message: "Выберите базу данных ClickHouse для этого диалога перед генерацией SQL.",
        options: availableDatabases,
        session
      });
    }

    const scopedTables = selectedDatabase
      ? allTables.filter((table: any) => !table.database || table.database === selectedDatabase)
      : allTables;
    const effectiveSchema = {
      ...schema,
      selectedDatabase,
      tables: scopedTables
    };
    const tableNames = scopedTables.map((table: any) => table.name).filter(Boolean);
    if (!tableNames.length) {
      return res.status(400).json({
        success: false,
        error: "Схема ClickHouse пуста. Проверьте подключение и обновите список таблиц перед генерацией SQL."
      });
    }

    const systemPrompt = withCustomSystemPrompt(
      `Вы — опытный аналитик баз данных и специалист по ClickHouse и 1С:Предприятие.
Ваша задача — перевести вопрос пользователя на естественном языке в валидный ClickHouse SQL-запрос.`,
      aiConfig
    );

    const userPrompt = `Описание таблиц в базе данных:
Available ClickHouse table names. Use table names exactly as listed here:
${JSON.stringify(tableNames)}

Full ClickHouse schema:
${JSON.stringify(effectiveSchema)}

Dialog context:
${JSON.stringify((dialog || []).slice(-8))}

Session memory:
${JSON.stringify(session || {})}

Strict table rules:
1. Use only tables from the available table list.
2. Use table names exactly as listed, including database-qualified names like database.table.
3. Do not use EventLogItems unless EventLogItems appears in the available table list.
4. Before returning JSON, verify every table reference in SQL exists in the available table list.

Инструкции по генерации SQL для ClickHouse:
1. Используйте ТОЛЬКО те таблицы и колонки, которые описаны в схеме.
2. Пишите корректный ClickHouse SQL. Используйте встроенные функции ClickHouse, например:
   - toDate(DateTime) для группировки по датам
   - toHour(DateTime) или toStartOfHour(DateTime) для группировки по часам
   - count() для подсчета строк
   - bar() или другие специальные функции при необходимости
3. Журнал регистрации 1С содержит поле важности события (значения: 'Ошибка', 'Предупреждение', 'Информация', 'Примечание') и поле события. В зависимости от экспортёра имена колонок различаются:
   - реальный экспортёр OneSTools.EventLog: Severity (важность), Event (событие), User (пользователь), Application (приложение), Metadata (метаданные), DateTime (дата/время);
   - демо-схема: SeverityPresentation, EventPresentation, UserName, ApplicationPresentation, MetadataPresentation.
   ВСЕГДА используйте имена колонок строго из переданной схемы, не выдумывайте их.
4. Если в схеме есть таблица EventLogItems (или иная таблица журнала), пишите запрос к ней, используя её реальные колонки.
5. Не используйте неподдерживаемый синтаксис (например, ClickHouse не поддерживает стандартный OUTER JOIN в некоторых старых версиях, но простые запросы агрегации полностью поддерживаются).
6. Возвращайте результат СТРОГО в формате JSON с полями:
   - "sql": строка с чистым, готовым к выполнению SQL-запросом.
   - "explanation": короткое пояснение (на русском языке) о том, как работает этот запрос и какие фильтры применены.

Вопрос пользователя: "${question}"

Формат ответа JSON:
{
  "sql": "SELECT ...",
  "explanation": "..."
}`;

    const result = await requestAiJson(systemPrompt, userPrompt, aiConfig);
    res.json({
      success: true,
      sql: result.sql,
      explanation: result.explanation,
      session: {
        ...session,
        selectedDatabase,
        lastQuestion: question,
        lastSql: result.sql
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || err });
  }
});

// 5. Explain Results and recommend visual charts
app.post("/api/gemini/explain-results", async (req, res) => {
  const { question, sql, resultRows, columns, aiConfig } = req.body;

  try {
    const systemPrompt = withCustomSystemPrompt(
      `Вы — опытный бизнес-аналитик и специалист по мониторингу 1С.`,
      aiConfig
    );
    const userPrompt = `Пользователь задал вопрос: "${question}"
Для ответа был выполнен SQL-запрос к ClickHouse:
\`\`\`sql
${sql}
\`\`\`

В результате выполнения запроса получены следующие строки (максимум 50):
${JSON.stringify(resultRows?.slice(0, 50))}

Доступные колонки: ${JSON.stringify(columns)}

Вам необходимо проанализировать эти результаты и составить структурированный аналитический отчет на русском языке.
Ответ должен быть СТРОГО в формате JSON со следующими полями:
1. "summary": краткое текстовое заключение на русском языке (2-3 предложения), отвечающее на вопрос пользователя на основе данных.
2. "insights": массив строк (пунктов списка) с ключевыми инсайтами или аномалиями, обнаруженными в данных (например: "Пользователь Иванов совершил 45% всех ошибок", "Наибольшая нагрузка зафиксирована в 14:00").
3. "suggestedChart": объект, описывающий наилучший способ визуализации этих данных в React (с использованием Recharts):
   - "type": строка ("bar" | "line" | "pie" | "area" | "none"). Выберите "none" только если данные не подходят для графиков (например, если это одна цифра или просто текстовые сообщения).
   - "xAxis": название колонки для оси X (например, "DateTime", "UserName", "hour").
   - "yAxis": название числовой колонки для оси Y (например, "cnt", "errors_count", "total").
   - "title": понятный заголовок для графика.

Пример формата ответа:
{
  "summary": "Наибольшее число ошибок зарегистрировано в модулях проведения накладных...",
  "insights": [
    "Обнаружена критическая ошибка блокировок в 10:15 на сервере SRV-APP.",
    "Пользователь Петрова А.С. совершила больше всего транзакций."
  ],
  "suggestedChart": {
    "type": "bar",
    "xAxis": "UserName",
    "yAxis": "count",
    "title": "Количество событий по пользователям"
  }
}`;

    if (aiConfig && aiConfig.provider === "yandexgpt") {
      const responseText = await callYandexGpt(systemPrompt, userPrompt, aiConfig);
      const parsed = extractAndParseJson(responseText);
      res.json({ success: true, analysis: parsed });
    } else {
      const selectedModel = aiConfig?.geminiModel || GEMINI_MODEL;
      const response = await getGeminiClient().models.generateContent({
        model: selectedModel,
        contents: `${systemPrompt}\n\n${userPrompt}`,
        config: {
          responseMimeType: "application/json"
        }
      });

      const parsed = JSON.parse(response.text?.trim() || "{}");
      res.json({ success: true, analysis: parsed });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || err });
  }
});

// Setup Vite & static serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
