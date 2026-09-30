'use strict';
/* خادم شاشة الحضور والانصراف — بدون مكتبات خارجية (Node 18+) */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';      // محلي فقط افتراضيًا (مفيش تسجيل دخول)
const TZ = process.env.TZ_NAME || 'Africa/Cairo';  // التوقيت المعتمد لتسجيل الحضور
const PASSWORD = process.env.ACCESS_PASSWORD || '';  // اختياري: لو موجود، الموقع كله يطلب كلمة سر (Basic Auth)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');   // مكان البيانات (على الاستضافة اربطه بقرص دائم)
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SEED_FILE = path.join(__dirname, 'data', 'db.seed.json');
const INDEX_FILE = path.join(__dirname, 'public', 'index.html');

/* أول تشغيل (مثلًا بعد النشر من جيت هاب): لو ملف البيانات مش موجود ننسخه من النسخة الأولية الفاضية */
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.copyFileSync(SEED_FILE, DB_FILE);

const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const save = () => { const t = DB_FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(db)); fs.renameSync(t, DB_FILE); };

/* الوقت الحالي بتوقيت الشركة (وقت الخادم هو المرجع، مش وقت جهاز الموظف) */
function nowLocal() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    min: +p.hour * 60 + +p.minute,
    dow: new Date(Date.UTC(+p.year, +p.month - 1, +p.day)).getUTCDay()
  };
}
/* أيام العمل لكل موظف تُحفظ داخل شيفته (0=الأحد … 6=السبت). الافتراضي: الأحد–الخميس (الجمعة والسبت عطلة) */
const DEFAULT_DAYS = [0, 1, 2, 3, 4];
const normShift = s => s && { ...s, days: Array.isArray(s.days) && s.days.length ? s.days : DEFAULT_DAYS };
const workDaysOf = id => (normShift(db.shifts[id]) || { days: DEFAULT_DAYS }).days;
const isOffDay = (n, id) => !workDaysOf(id).includes(n.dow) || db.holidays.includes(n.date); // خارج أيام عمل الموظف + العطلات

class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const send = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
};
const readBody = req => new Promise((ok, no) => {
  let s = ''; req.on('data', c => { s += c; if (s.length > 10000) { no(new HttpError(413, 'الطلب كبير')); req.destroy(); } });
  req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch { no(new HttpError(400, 'بيانات غير صالحة')); } });
});

function route(req, url, me, body) {
  const { pathname: p, searchParams: q } = url;

  if (req.method === 'GET' && p === '/api/bootstrap')
    return { employees: [me], shifts: { [me.id]: normShift(db.shifts[me.id]) }, holidays: db.holidays };

  /* الإعدادات: عرض شيفتات كل الموظفين (متاح لكل المستخدمين) */
  if (req.method === 'GET' && p === '/api/settings/shifts') {
    return {
      employees: db.employees.map(({ id, name, dept, job }) => ({ id, name, dept, job })),
      shifts: Object.fromEntries(db.employees.filter(e => db.shifts[e.id]).map(e => [e.id, normShift(db.shifts[e.id])]))
    };
  }

  if (req.method === 'GET' && p === '/api/attendance') {
    const target = q.get('employee_id') || me.id;
    if (!db.employees.some(e => e.id === target)) throw new HttpError(404, 'الموظف غير موجود');
    const months = (q.get('months') || '').split(',').filter(Boolean).slice(0, 12);
    if (!months.length || !months.every(m => /^\d{4}-\d{2}$/.test(m))) throw new HttpError(400, 'الشهر غير صالح');
    const out = [];
    for (const [k, v] of Object.entries(db.attendance)) {
      const [id, date] = k.split('|');
      if (id === target && months.some(m => date.startsWith(m))) out.push(v.leave ? { date, leave: true } : { date, in: v.in, out: v.out });
    }
    return out;
  }

  if (req.method === 'POST' && p === '/api/attendance/check-in') {
    const n = nowLocal(), k = `${me.id}|${n.date}`, r = db.attendance[k];
    if (isOffDay(n, me.id)) throw new HttpError(400, 'اليوم عطلة');
    if (r && r.leave) throw new HttpError(400, 'اليوم مسجل كإجازة');
    if (r && r.in != null) throw new HttpError(400, 'تم تسجيل الحضور مسبقًا اليوم');
    db.attendance[k] = { in: n.min, out: null }; save();
    return { date: n.date, in: n.min, out: null };
  }

  if (req.method === 'POST' && p === '/api/attendance/check-out') {
    const n = nowLocal(), k = `${me.id}|${n.date}`, r = db.attendance[k];
    if (!r || r.in == null) throw new HttpError(400, 'لا يمكن تسجيل الانصراف قبل الحضور');
    if (r.out != null) throw new HttpError(400, 'تم تسجيل الانصراف مسبقًا');
    if (n.min <= r.in) throw new HttpError(400, 'وقت الانصراف غير منطقي (قبل/يساوي وقت الحضور)');
    r.out = n.min; save();
    return { date: n.date, in: r.in, out: r.out };
  }

  /* مسح سجلات الحضور والانصراف لكل الموظفين المسجلين (قائمة الموظفين نفسها تفضل زي ما هي) */
  if (req.method === 'DELETE' && p === '/api/settings/attendance') {
    const removed = Object.keys(db.attendance).length;
    fs.copyFileSync(DB_FILE, DB_FILE + '.bak');   // نسخة احتياطية قبل المسح
    db.attendance = {}; save();
    return { removed };
  }

  /* إضافة موظف جديد (الاسم إجباري، القسم والوظيفة اختياريين) */
  if (req.method === 'POST' && p === '/api/settings/employees') {
    const str = (v, max) => typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '';
    const name = str(body.name, 80);
    if (name.length < 2) throw new HttpError(400, 'اكتب اسم الموظف (حرفين على الأقل)');
    const last = Math.max(0, ...db.employees.map(e => +((/^EMP-(\d+)$/.exec(e.id) || [])[1]) || 0));
    const emp = { id: 'EMP-' + String(last + 1).padStart(3, '0'), name, dept: str(body.dept, 80) || '—', job: str(body.job, 80) || '—', role: 'employee' };
    db.employees.push(emp); save();
    return emp;
  }

  /* مسح كل الموظفين المسجلين (مع شيفتاتهم وسجلات حضورهم). نسخة احتياطية مستقلة بتاريخ ووقت
     عشان مانكتبش فوق db.json.bak اللي ممكن يكون فيه نسخة بيانات تانية */
  if (req.method === 'DELETE' && p === '/api/settings/employees') {
    const removed = db.employees.length;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = `db.employees-backup-${stamp}.json`;
    fs.copyFileSync(DB_FILE, path.join(path.dirname(DB_FILE), backup));
    db.employees = []; db.shifts = {}; db.attendance = {}; save();
    return { removed, backup: 'data/' + backup };
  }

  /* مسح الشيفت المطبق على كل الموظفين */
  if (req.method === 'DELETE' && p === '/api/settings/shifts') {
    const removed = Object.keys(db.shifts).length;
    fs.copyFileSync(DB_FILE, DB_FILE + '.bak');
    db.shifts = {}; save();
    return { removed };
  }

  const m = p.match(/^\/api\/shifts\/([^/]+)$/);

  /* مسح الشيفت المطبق على موظف واحد */
  if (req.method === 'DELETE' && m) {
    const id = decodeURIComponent(m[1]);
    if (!db.employees.some(e => e.id === id)) throw new HttpError(404, 'الموظف غير موجود');
    delete db.shifts[id]; save();
    return { id, removed: true };
  }

  if (req.method === 'PUT' && m) {
    const id = decodeURIComponent(m[1]);
    if (!db.employees.some(e => e.id === id)) throw new HttpError(404, 'الموظف غير موجود');
    const { start, end, grace } = body, ok = v => Number.isInteger(v);
    if (![start, end, grace].every(ok) || start < 0 || end > 1439) throw new HttpError(400, 'قيم الشيفت غير صالحة');
    if (!(end > start)) throw new HttpError(400, 'وقت النهاية يجب أن يكون بعد البداية');
    if (grace < 0 || grace > 120) throw new HttpError(400, 'فترة السماح غير منطقية (0–120)');
    let days = body.days;   // اختياري: لو مش مبعوت نحتفظ بأيام العمل الحالية
    if (days === undefined) days = workDaysOf(id);
    else if (!Array.isArray(days) || !days.length || !days.every(d => Number.isInteger(d) && d >= 0 && d <= 6) || new Set(days).size !== days.length)
      throw new HttpError(400, 'أيام العمل غير صالحة');
    db.shifts[id] = { start, end, grace, days: [...days].sort((a, b) => a - b) }; save();
    return normShift(db.shifts[id]);
  }
  throw new HttpError(404, 'غير موجود');
}

const crypto = require('crypto');
const sha = v => crypto.createHash('sha256').update(String(v)).digest();
function authorized(req) {
  if (!PASSWORD) return true;
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const given = Buffer.from(h.slice(6), 'base64').toString('utf8');
  const pass = given.slice(given.indexOf(':') + 1);        // اسم المستخدم يتجاهل، كلمة السر فقط
  return crypto.timingSafeEqual(sha(pass), sha(PASSWORD));
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
    if (!authorized(req)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Attendance", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('مطلوب تسجيل الدخول');
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'"
      });
      return res.end(fs.readFileSync(INDEX_FILE));
    }
    if (!url.pathname.startsWith('/api/')) throw new HttpError(404, 'غير موجود');
    if (req.method === 'GET' && url.pathname === '/api/setup') return send(res, 200, { count: db.employees.length });
    const me = db.employees.find(e => e.id === req.headers['x-user-id']);
    // لو مفيش أي موظف مسجل، نسمح بإضافة أول موظف من غير هوية (وإلا التطبيق يفضل مقفول)
    const firstSetup = !db.employees.length && req.method === 'POST' && url.pathname === '/api/settings/employees';
    if (!me && !firstSetup) throw new HttpError(401, 'المستخدم غير معروف');
    const body = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req) : {};
    send(res, 200, route(req, url, me, body));
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.code, { error: e.message });
    console.error(e); send(res, 500, { error: 'خطأ داخلي في الخادم' });
  }
}).listen(PORT, HOST, () => {
  console.log(`الحضور والانصراف يعمل على http://${HOST}:${PORT}  (التوقيت: ${TZ})  البيانات: ${DB_FILE}`);
  if (!PASSWORD && !['127.0.0.1', 'localhost', '::1'].includes(HOST))
    console.warn('⚠️ تحذير: الخادم متاح على الشبكة بدون ACCESS_PASSWORD — أي شخص معاه الرابط يقدر يعدّل ويمسح كل البيانات.');
});
