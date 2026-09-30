'use strict';
/* ===== طبقة التخزين — localStorage ===== */
var DB = {
  STORAGE_KEY: 'attendance_db',
  _data: null,

  /* تهيئة قاعدة البيانات: تحميل من localStorage أو من seed.json */
  init: async function () {
    var stored = localStorage.getItem(DB.STORAGE_KEY);
    if (stored) {
      try { DB._data = JSON.parse(stored); return; } catch (e) { /* تالف — نعيد التحميل */ }
    }
    try {
      var res = await fetch('data/seed.json');
      DB._data = await res.json();
    } catch (e) {
      DB._data = { employees: [], shifts: {}, holidays: [], attendance: {} };
    }
    DB.save();
  },

  /* حفظ البيانات إلى localStorage */
  save: function () {
    localStorage.setItem(DB.STORAGE_KEY, JSON.stringify(DB._data));
  },

  /* ==================== الموظفون ==================== */
  getEmployees: function () { return DB._data.employees || []; },

  getEmployee: function (id) { return DB._data.employees.find(function (e) { return e.id === id; }); },

  addEmployee: function (opts) {
    var str = function (v, max) { return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : ''; };
    var name = str(opts.name, 80);
    if (name.length < 2) throw new Error('اكتب اسم الموظف (حرفين على الأقل)');

    var last = Math.max(0, ...DB._data.employees.map(function (e) {
      return +((/^EMP-(\d+)$/.exec(e.id) || [])[1]) || 0;
    }));
    var emp = {
      id: 'EMP-' + String(last + 1).padStart(3, '0'),
      name: name,
      dept: str(opts.dept, 80) || '—',
      job: str(opts.job, 80) || '—',
      role: 'employee',
      pass: opts.password   /* hash جاهز من auth.js */
    };
    DB._data.employees.push(emp);
    DB.save();
    return { id: emp.id, name: emp.name, dept: emp.dept, job: emp.job, role: emp.role };
  },

  deleteAllEmployees: function () {
    var removed = DB._data.employees.length;
    DB._data.employees = [];
    DB._data.shifts = {};
    DB._data.attendance = {};
    DB.save();
    return removed;
  },

  /* ==================== الشيفتات ==================== */
  getShifts: function () { return DB._data.shifts || {}; },

  getShift: function (id) { return DB._data.shifts[id] || null; },

  normShift: function (s) {
    return s && Object.assign({}, s, { days: Array.isArray(s.days) && s.days.length ? s.days : Utils.DEFAULT_DAYS });
  },

  workDaysOf: function (id) {
    var s = DB.normShift(DB._data.shifts[id]);
    return s ? s.days : Utils.DEFAULT_DAYS;
  },

  setShift: function (id, opts) {
    var start = opts.start, end = opts.end, grace = opts.grace, days = opts.days;
    var ok = function (v) { return Number.isInteger(v); };
    if (![start, end, grace].every(ok) || start < 0 || end > 1439) throw new Error('قيم الشيفت غير صالحة');
    if (!(end > start)) throw new Error('وقت النهاية يجب أن يكون بعد البداية');
    if (grace < 0 || grace > 120) throw new Error('فترة السماح غير منطقية (0–120)');

    if (days === undefined) days = DB.workDaysOf(id);
    else if (!Array.isArray(days) || !days.length || !days.every(function (d) { return Number.isInteger(d) && d >= 0 && d <= 6; }) || new Set(days).size !== days.length)
      throw new Error('أيام العمل غير صالحة');

    DB._data.shifts[id] = { start: start, end: end, grace: grace, days: [].concat(days).sort(function (a, b) { return a - b; }) };
    DB.save();
    return DB.normShift(DB._data.shifts[id]);
  },

  deleteShift: function (id) {
    if (!DB._data.employees.some(function (e) { return e.id === id; })) throw new Error('الموظف غير موجود');
    delete DB._data.shifts[id];
    DB.save();
  },

  deleteAllShifts: function () {
    var removed = Object.keys(DB._data.shifts).length;
    DB._data.shifts = {};
    DB.save();
    return removed;
  },

  /* هل اليوم عطلة (خارج أيام العمل أو إجازة رسمية)؟ */
  isOffDay: function (n, id) {
    return !DB.workDaysOf(id).includes(n.dow) || DB._data.holidays.includes(n.date);
  },

  /* ==================== الإجازات ==================== */
  getHolidays: function () { return DB._data.holidays || []; },

  /* ==================== الحضور والانصراف ==================== */
  getAttendance: function (id, months) {
    var out = [];
    var entries = Object.entries(DB._data.attendance);
    for (var i = 0; i < entries.length; i++) {
      var k = entries[i][0], v = entries[i][1];
      var parts = k.split('|');
      var empId = parts[0], date = parts[1];
      if (empId === id && months.some(function (m) { return date.startsWith(m); })) {
        out.push(v.leave ? { date: date, leave: true } : { date: date, in: v.in, out: v.out });
      }
    }
    return out;
  },

  getAttendanceRecord: function (id, date) {
    return DB._data.attendance[id + '|' + date] || null;
  },

  checkIn: function (id) {
    var n = Utils.nowCairo();
    var k = id + '|' + n.date;
    var r = DB._data.attendance[k];

    if (DB.isOffDay(n, id)) throw new Error('اليوم عطلة');
    if (r && r.leave) throw new Error('اليوم مسجل كإجازة');
    if (r && r.in != null) throw new Error('تم تسجيل الحضور مسبقًا اليوم');

    DB._data.attendance[k] = { in: n.min, out: null };
    DB.save();
    return { date: n.date, in: n.min, out: null };
  },

  checkOut: function (id) {
    var n = Utils.nowCairo();
    var k = id + '|' + n.date;
    var r = DB._data.attendance[k];

    if (!r || r.in == null) throw new Error('لا يمكن تسجيل الانصراف قبل الحضور');
    if (r.out != null) throw new Error('تم تسجيل الانصراف مسبقًا');
    if (n.min <= r.in) throw new Error('وقت الانصراف غير منطقي (قبل/يساوي وقت الحضور)');

    r.out = n.min;
    DB.save();
    return { date: n.date, in: r.in, out: r.out };
  },

  deleteAllAttendance: function () {
    var removed = Object.keys(DB._data.attendance).length;
    DB._data.attendance = {};
    DB.save();
    return removed;
  },

  /* ==================== كلمة السر ==================== */
  setPassword: function (id, hash) {
    var emp = DB._data.employees.find(function (e) { return e.id === id; });
    if (!emp) throw new Error('الموظف غير موجود');
    emp.pass = hash;
    emp.pwv = (emp.pwv || 0) + 1;
    DB.save();
  }
};
