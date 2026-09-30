'use strict';
/* ===== التطبيق الرئيسي — الحضور والانصراف (نسخة GitHub Pages) ===== */

/* ===== Globals ===== */
var EmployeeData = [], ShiftData = {}, Holidays = [];
var SettingsData = { employees: [], shifts: {} };
var Store = {
  rec: {},
  get: function (id, k) { return this.rec[id + '|' + k]; },
  set: function (id, k, v) { this.rec[id + '|' + k] = v; }
};
var state = { userId: null, viewId: null, month: '', f: { from: '', to: '', status: '', dept: '' } };

/* ===== DOM ===== */
var $ = function (id) { return document.getElementById(id); };
var CLS = { 'حاضر': 's-ok', 'متأخر': 's-wa', 'غائب': 's-er', 'إجازة': 's-in', 'عطلة': 's-gr', 'حضور بدون انصراف': 's-or', 'لم يسجل بعد': 's-gr' };
var badge = function (s) { return '<span class="b ' + CLS[s] + '">' + s + '</span>'; };
var lateBadge = function (l) { return '<span class="b ' + (l == 0 ? 's-ok' : l <= 15 ? 's-wa' : 's-er') + '">' + l + ' دقيقة</span>'; };
var emp = function (id) { return EmployeeData.find(function (e) { return e.id === id; }); };
var canAct = function () { return state.viewId === state.userId; };
var daysOf = function (s) { return Array.isArray(s && s.days) && s.days.length ? s.days : Utils.DEFAULT_DAYS; };
var isOffDate = function (d, shift) { return !daysOf(shift).includes(d.getDay()); };
var dayNames = function (s) { return Utils.WEEK_ORDER.filter(function (d) { return daysOf(s).includes(d); }).map(function (d) { return Utils.DAYS[d]; }).join('، '); };

/* ===== Toast ===== */
function toast(t, type) {
  var el = $('toast');
  el.textContent = t;
  el.style.background = type === 'er' ? '#c22b3a' : '#12805c';
  el.style.display = 'block';
  clearTimeout(toast.t);
  toast.t = setTimeout(function () { el.style.display = 'none'; }, 2800);
}

/* ===== نوافذ التأكيد ===== */
function ask(msg) {
  return new Promise(function (ok) {
    var d = document.createElement('div'); d.id = 'cf';
    d.innerHTML = '<div role="dialog" aria-modal="true"><p>' + Utils.esc(msg) + '</p><div class="act"><button class="dan" id="cfY">🗑️ نعم، امسح</button><button class="sec" id="cfN">إلغاء</button></div></div>';
    var done = function (v) { d.remove(); document.removeEventListener('keydown', kd); ok(v); };
    var kd = function (e) { if (e.key === 'Escape') done(false); };
    d.onclick = function (e) { if (e.target === d) done(false); };
    document.addEventListener('keydown', kd);
    document.body.appendChild(d);
    d.querySelector('#cfY').onclick = function () { done(true); };
    d.querySelector('#cfN').onclick = function () { done(false); };
    d.querySelector('#cfN').focus();
  });
}

function askTyped(msg, word) {
  return new Promise(function (ok) {
    var d = document.createElement('div'); d.id = 'cf';
    d.innerHTML = '<div role="dialog" aria-modal="true"><p>' + Utils.esc(msg) + '</p><p style="margin-bottom:8px">اكتب <b>' + Utils.esc(word) + '</b> للتأكيد:</p><input id="cfT" type="text" autocomplete="off" style="width:100%;margin-bottom:14px"><div class="act"><button class="dan" id="cfY" disabled>🗑️ نعم، امسح</button><button class="sec" id="cfN">إلغاء</button></div></div>';
    var done = function (v) { d.remove(); document.removeEventListener('keydown', kd); ok(v); };
    var kd = function (e) { if (e.key === 'Escape') done(false); };
    d.onclick = function (e) { if (e.target === d) done(false); };
    document.addEventListener('keydown', kd);
    document.body.appendChild(d);
    var inp = d.querySelector('#cfT'), y = d.querySelector('#cfY');
    inp.oninput = function () { y.disabled = inp.value.trim() !== word; };
    y.onclick = function () { done(true); };
    d.querySelector('#cfN').onclick = function () { done(false); };
    inp.focus();
  });
}

/* ===== منطق الحضور ===== */
function calculateLateMinutes(inM, shift) { return (inM == null || !shift) ? 0 : Math.max(0, inM - (shift.start + shift.grace)); }
function calculateWorkingHours(inM, outM) { return (inM == null || outM == null || outM <= inM) ? null : outM - inM; }

function getDayStatus(date, rec, shift, today) {
  var k = Utils.dkey(date);
  if (isOffDate(date, shift) || Holidays.includes(k)) return 'عطلة';
  if (rec && rec.leave) return 'إجازة';
  if (rec && rec.in != null) {
    if (rec.out == null && k < Utils.dkey(today)) return 'حضور بدون انصراف';
    return calculateLateMinutes(rec.in, shift) > 0 ? 'متأخر' : 'حاضر';
  }
  return k < Utils.dkey(today) ? 'غائب' : 'لم يسجل بعد';
}

function buildRows(id, y, m, today) {
  if (!today) today = Utils.cairoDate();
  var sh = ShiftData[id], rows = [], n = new Date(y, m + 1, 0).getDate();
  for (var d = 1; d <= n; d++) {
    var date = new Date(y, m, d);
    if (Utils.dkey(date) > Utils.dkey(today)) break;
    var r = Store.get(id, Utils.dkey(date)), status = getDayStatus(date, r, sh, today), has = r && r.in != null;
    rows.push({ date: date, k: Utils.dkey(date), day: Utils.DAYS[date.getDay()], start: sh ? sh.start : null, in: has ? r.in : null, out: has ? r.out : null, hours: has ? calculateWorkingHours(r.in, r.out) : null, late: has ? calculateLateMinutes(r.in, sh) : null, status: status });
  }
  return rows;
}

function calculateMonthlySummary(id, y, m, today) {
  if (!today) today = Utils.cairoDate();
  var rows = buildRows(id, y, m, today), n = new Date(y, m + 1, 0).getDate(), sh = ShiftData[id], work = 0;
  for (var d = 1; d <= n; d++) { var dt = new Date(y, m, d); if (!isOffDate(dt, sh) && !Holidays.includes(Utils.dkey(dt))) work++; }
  var c = function (s) { return rows.filter(function (r) { return r.status === s; }).length; };
  var lateRows = rows.filter(function (r) { return r.late > 0; }), tl = lateRows.reduce(function (a, r) { return a + r.late; }, 0);
  return { workDays: work, present: rows.filter(function (r) { return r.in != null; }).length, absent: c('غائب'), leave: c('إجازة'), lateDays: lateRows.length, lateTotal: tl, lateAvg: lateRows.length ? Math.round(tl / lateRows.length) : 0, hours: rows.reduce(function (a, r) { return a + (r.hours || 0); }, 0), rows: rows };
}

/* ===== تحميل البيانات ===== */
function loadBootstrap() {
  var user = Auth.currentUser();
  if (!user) return;
  EmployeeData = [user];
  state.userId = state.viewId = user.id;
  ShiftData = {};
  var shift = DB.getShift(user.id);
  if (shift) ShiftData[user.id] = DB.normShift(shift);
  Holidays = DB.getHolidays();
  var c = Utils.nowCairo();
  state.month = c.date.substring(0, 7);
}

function loadRecords() {
  var id = state.viewId;
  var c = Utils.nowCairo();
  var cur = c.date.substring(0, 7);
  var months = [cur];
  if (state.month && months.indexOf(state.month) < 0) months.push(state.month);
  var recs = DB.getAttendance(id, months);
  Object.keys(Store.rec).forEach(function (k) { if (k.startsWith(id + '|')) delete Store.rec[k]; });
  recs.forEach(function (r) { Store.set(id, r.date, r.leave ? { leave: true } : { in: r.in, out: r.out }); });
}

function loadSettings() {
  var emps = DB.getEmployees();
  var allShifts = DB.getShifts();
  SettingsData = {
    employees: emps.map(function (e) { return { id: e.id, name: e.name, dept: e.dept, job: e.job }; }),
    shifts: {}
  };
  emps.forEach(function (e) {
    if (allShifts[e.id]) SettingsData.shifts[e.id] = DB.normShift(allShifts[e.id]);
  });
}

function refresh() {
  loadRecords();
  render();
}

/* ===== تسجيل الحضور والانصراف ===== */
function checkIn() {
  if (!canAct()) return toast('لا يمكنك تسجيل حضور موظف آخر', 'er');
  try {
    DB.checkIn(state.userId);
    toast('تم تسجيل الحضور بنجاح');
    refresh();
  } catch (e) { toast(e.message, 'er'); }
}

function checkOut() {
  if (!canAct()) return toast('لا يمكنك تسجيل انصراف موظف آخر', 'er');
  try {
    DB.checkOut(state.userId);
    toast('تم تسجيل الانصراف بنجاح');
    refresh();
  } catch (e) { toast(e.message, 'er'); }
}

/* ===== تعديل الشيفت ===== */
function updateShift(id, v) {
  try {
    ShiftData[id] = DB.setShift(id, v);
    return { ok: true };
  } catch (e) { return { ok: false, msg: e.message }; }
}

/* ===== تقرير PDF ===== */
function generateAttendanceReport(id, y, m) {
  var e = emp(id), sh = ShiftData[id], s = calculateMonthlySummary(id, y, m), lbl = Utils.MONTHS[m] + ' ' + y;
  var rows = s.rows.map(function (r) { return '<tr><td>' + Utils.pad(r.date.getDate()) + '/' + Utils.pad(m + 1) + '/' + y + '</td><td>' + r.day + '</td><td>' + Utils.t24(r.start) + '</td><td>' + Utils.t24(r.in) + '</td><td>' + Utils.t24(r.out) + '</td><td>' + Utils.hm(r.hours) + '</td><td>' + (r.late == null ? '—' : r.late + ' دقيقة') + '</td><td>' + r.status + '</td></tr>'; }).join('');
  var cell = function (a, b) { return '<div><small>' + a + '</small><b>' + b + '</b></div>'; };
  return '<div class="rp"><div class="rh"><div><h1>تقرير الحضور والانصراف الشهري</h1><div>' + lbl + '</div></div><div style="text-align:left"><b>نظام ERP</b><br>وحدة الحضور وتتبع الوقت</div></div>' +
    '<div class="ec">' + cell('اسم الموظف', e.name) + cell('الرقم الوظيفي', e.id) + cell('القسم', e.dept) + cell('الوظيفة', e.job) + cell('الشهر', lbl) + cell('الشيفت', sh ? Utils.t12(sh.start) + ' - ' + Utils.t12(sh.end) + ' (سماح ' + sh.grace + ' د)' : 'غير محدد') + '</div>' +
    '<div class="sc">' + cell('إجمالي أيام العمل', s.workDays) + cell('أيام الحضور', s.present) + cell('أيام الغياب', s.absent) + cell('أيام الإجازة', s.leave) + cell('أيام التأخير', s.lateDays) + cell('إجمالي دقائق التأخير', s.lateTotal) + cell('متوسط التأخير', s.lateAvg + ' دقيقة') + cell('إجمالي ساعات العمل', Utils.dur(s.hours)) + '</div>' +
    '<table><thead><tr><th>التاريخ</th><th>اليوم</th><th>بداية الشيفت</th><th>الحضور</th><th>الانصراف</th><th>ساعات العمل</th><th>التأخير</th><th>الحالة</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<div class="tot">إجمالي التأخير خلال الشهر: ' + s.lateTotal + ' دقيقة<br>إجمالي ساعات العمل: ' + Utils.dur(s.hours) + '</div>' +
    '<div class="ft"><span>تاريخ إنشاء التقرير: ' + new Date().toLocaleString('ar-EG') + '</span><span>سري — للاستخدام الداخلي مع الموارد البشرية</span></div></div>';
}

function exportPDF() {
  var parts = state.month.split('-').map(Number);
  $('printArea').innerHTML = generateAttendanceReport(state.viewId, parts[0], parts[1] - 1);
  try { window.print(); } catch (e) { toast('تعذّر فتح نافذة الطباعة', 'er'); }
}

/* ===== عرض اليوم (الحضور) ===== */
function renderToday() {
  var now = Utils.cairoDate(), id = state.viewId, sh = ShiftData[id], k = Utils.dkey(now), r = Store.get(id, k), has = r && r.in != null;
  var st = getDayStatus(now, r, sh, now), late = has ? calculateLateMinutes(r.in, sh) : 0, own = canAct();
  var off = st === 'عطلة' || st === 'إجازة';
  $('today').innerHTML = '<h2>✅ تسجيل حضور اليوم</h2><p class="clock" id="clk">--:--:--</p>' +
    '<div class="kv"><div><small>📅 التاريخ</small><b>' + now.getDate() + ' ' + Utils.MONTHS[now.getMonth()] + ' ' + now.getFullYear() + '</b></div><div><small>اليوم</small><b>' + Utils.DAYS[now.getDay()] + '</b></div><div><small>وقت بداية الشيفت</small><b>' + (sh ? Utils.t12(sh.start) : '—') + '</b></div><div><small>وقت الحضور الفعلي</small><b>' + (has ? Utils.t12(r.in) : '—') + '</b></div><div><small>حالة الحضور</small>' + badge(st) + '</div><div><small>التأخير</small>' + (has ? lateBadge(late) : '<b>—</b>') + '</div></div>' +
    '<div class="act"><button class="pri" id="bIn" ' + ((has || !own || off) ? 'disabled' : '') + '>🟢 تسجيل الحضور</button>' + (has ? '<span>وقت الحضور: <b>' + Utils.t12(r.in) + '</b></span>' : '') + (own ? '' : '<span class="mut">👁️ عرض فقط — التسجيل لحسابك الشخصي</span>') + '</div>' +
    (has ? '<div class="sub"><h2>🚪 تسجيل الانصراف</h2><div class="kv"><div><small>وقت الحضور</small><b>' + Utils.t12(r.in) + '</b></div><div><small>وقت الانصراف</small><b>' + (r.out != null ? Utils.t12(r.out) : '—') + '</b></div><div><small>إجمالي ساعات العمل</small><b>' + (r.out != null ? Utils.dur(calculateWorkingHours(r.in, r.out)) : 'لم يتم تسجيل الانصراف') + '</b></div></div><div class="act"><button class="dan" id="bOut" ' + ((r.out != null || !own) ? 'disabled' : '') + '>🔴 تسجيل الانصراف</button></div></div>' : '');
  $('bIn').onclick = checkIn;
  if ($('bOut')) $('bOut').onclick = checkOut;
  tick();
}

/* الساعة الحية بتوقيت القاهرة */
function tick() { var c = $('clk'); if (c) c.textContent = Utils.cairoTimeStr(); }
setInterval(tick, 1000);

/* ===== عرض الشيفت ===== */
function renderShift() {
  var id = state.viewId, s = ShiftData[id], b = s || { start: 480, end: 960, grace: 15 };
  $('shift').innerHTML = '<h2>⏱️ شيفت الموظف</h2>' + (s ? '<div class="kv"><div><small>بداية الشيفت</small><b>' + Utils.t12(s.start) + '</b></div><div><small>نهاية الشيفت</small><b>' + Utils.t12(s.end) + '</b></div><div><small>مدة العمل</small><b>' + Utils.dur(s.end - s.start) + '</b></div><div><small>فترة السماح</small><b>' + s.grace + ' دقائق</b></div></div><p class="mut" style="margin-top:8px;font-size:12px">آخر وقت بدون تأخير: ' + Utils.t12(s.start + s.grace) + '</p>' : '<p class="mut" style="margin:8px 0">لا يوجد شيفت مطبق على هذا الموظف — لن يُحسب تأخير. يمكنك تحديد شيفت من هنا أو من الإعدادات.</p>') +
    '<div class="act"><button class="sec" id="bEdit">' + (s ? '✏️ تعديل الشيفت' : '➕ تحديد شيفت') + '</button></div><div class="edit" id="editBox"><div><label class="mut">البداية</label><input type="time" id="eS" value="' + Utils.t24(b.start) + '"></div><div><label class="mut">النهاية</label><input type="time" id="eE" value="' + Utils.t24(b.end) + '"></div><div><label class="mut">السماح (د)</label><input type="number" id="eG" value="' + b.grace + '"></div><button class="pri" id="bSave" style="grid-column:1/-1">حفظ</button></div>';
  $('bEdit').onclick = function () { $('editBox').classList.toggle('on'); };
  $('bSave').onclick = function () {
    var res = updateShift(id, { start: Utils.tm($('eS').value || '0:0'), end: Utils.tm($('eE').value || '0:0'), grace: +$('eG').value });
    if (!res.ok) return toast(res.msg, 'er');
    toast('تم حفظ الشيفت');
    loadSettings(); render(); renderSettings();
  };
}

/* ===== ملخص الشهر ===== */
function renderSummary() {
  var parts = state.month.split('-').map(Number), s = calculateMonthlySummary(state.viewId, parts[0], parts[1] - 1);
  $('mLabel').textContent = Utils.MONTHS[parts[1] - 1] + ' ' + parts[0];
  $('mSum').value = state.month;
  var it = [['📆', 'إجمالي أيام العمل', s.workDays + ' يوم'], ['✅', 'أيام الحضور', s.present + ' يوم'], ['❌', 'أيام الغياب', s.absent + ' يوم'], ['🌴', 'أيام الإجازة', s.leave + ' يوم'], ['⏰', 'أيام التأخير', s.lateDays + ' أيام'], ['⌛', 'إجمالي دقائق التأخير', s.lateTotal + ' دقيقة'], ['📉', 'متوسط التأخير', s.lateAvg + ' دقيقة'], ['🕓', 'إجمالي ساعات العمل', Utils.dur(s.hours)]];
  $('stats').innerHTML = it.map(function (a) { return '<div class="stat"><small>' + a[0] + ' ' + a[1] + '</small><b>' + a[2] + '</b></div>'; }).join('');
}

/* ===== جدول الحضور ===== */
function renderTable() {
  var parts = state.month.split('-').map(Number), f = state.f, m = parts[1];
  var rows = buildRows(state.viewId, parts[0], parts[1] - 1).filter(function (r) { return (!f.from || r.k >= f.from) && (!f.to || r.k <= f.to) && (!f.status || r.status === f.status); }).reverse();
  $('tbody').innerHTML = rows.length ? rows.map(function (r) { return '<tr><td>' + r.day + '</td><td>' + Utils.pad(r.date.getDate()) + '/' + Utils.pad(m) + '/' + parts[0] + '</td><td>' + Utils.t12(r.in) + '</td><td>' + (r.in != null && r.out == null ? '<span class="mut">لم يُسجل</span>' : Utils.t12(r.out)) + '</td><td>' + Utils.hm(r.hours) + '</td><td>' + (r.late == null ? '—' : lateBadge(r.late)) + '</td></tr>'; }).join('') : '<tr><td colspan="6" class="mut" style="text-align:center">لا توجد سجلات مطابقة</td></tr>';
}

/* ===== عرض الكل ===== */
function render() { renderToday(); renderShift(); renderSummary(); renderTable(); }

/* ===== الإعدادات ===== */
function empForm() {
  return '<div class="fl"><div><label class="l" for="nName">اسم الموظف</label><input id="nName" type="text" maxlength="80" autocomplete="off"></div>' +
    '<div><label class="l" for="nDept">القسم (اختياري)</label><input id="nDept" type="text" maxlength="80" autocomplete="off"></div>' +
    '<div><label class="l" for="nJob">الوظيفة (اختياري)</label><input id="nJob" type="text" maxlength="80" autocomplete="off"></div>' +
    '<div><label class="l" for="nPass">كلمة السر (6 أحرف على الأقل)</label><input id="nPass" type="password" minlength="6" autocomplete="new-password"></div></div>' +
    '<div class="act" style="margin:10px 0 0"><button class="pri" id="nAdd">➕ إضافة موظف</button></div>';
}

function renderSettings() {
  var box = $('settings');
  box.hidden = false;
  var E = SettingsData.employees, S = SettingsData.shifts;
  var me = Auth.currentUser();
  if (!me) return;

  box.innerHTML = '<h2>⚙️ الإعدادات</h2>' +
    '<div class="sub"><h3>👤 حسابي — ' + Utils.esc(me.name) + ' (' + Utils.esc(me.id) + ')</h3><div class="fl">' +
    '<div><label class="l" for="pCur">كلمة السر الحالية</label><input id="pCur" type="password" autocomplete="current-password"></div>' +
    '<div><label class="l" for="pNew">كلمة السر الجديدة (6 أحرف على الأقل)</label><input id="pNew" type="password" autocomplete="new-password"></div>' +
    '<div><label class="l" for="pNew2">تأكيد كلمة السر الجديدة</label><input id="pNew2" type="password" autocomplete="new-password"></div></div>' +
    '<div class="act" style="margin:10px 0 0"><button class="pri" id="pSave">🔑 تغيير كلمة السر</button><button id="logout">🚪 تسجيل الخروج</button></div></div>' +
    '<div class="sub"><h3>➕ إضافة موظف</h3>' + empForm() + '</div>' +
    '<div class="sub"><h3>الشيفت المطبق على كل موظف</h3><div class="tw"><table><thead><tr><th>الموظف</th><th>الرقم الوظيفي</th><th>القسم</th><th>البداية</th><th>النهاية</th><th>أيام العمل</th><th>السماح</th><th>كلمة السر</th><th></th></tr></thead>' +
    '<tbody>' + E.map(function (e) {
      var s = S[e.id];
      return '<tr><td>' + Utils.esc(e.name) + '</td><td>' + Utils.esc(e.id) + '</td><td>' + Utils.esc(e.dept) + '</td>' + (s ? '<td>' + Utils.t12(s.start) + '</td><td>' + Utils.t12(s.end) + '</td><td>' + dayNames(s) + '</td><td>' + s.grace + ' د</td>' : '<td colspan="4" class="mut">لا يوجد شيفت</td>') + '<td style="white-space:nowrap"><input type="password" data-pw="' + Utils.esc(e.id) + '" placeholder="جديدة" autocomplete="new-password" style="width:90px"> <button data-setpw="' + Utils.esc(e.id) + '">تعيين</button></td><td style="white-space:nowrap">' + (s ? '<button class="dan" data-clr="' + Utils.esc(e.id) + '">🗑️ مسح الشيفت</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div></div>' +
    '<div class="sub"><h3>🗑️ مسح البيانات</h3><p class="mut" style="font-size:13px;margin:0 0 10px">إجراءات نهائية على كل الموظفين المسجلين (' + E.length + ' موظف). البيانات مخزنة في المتصفح (localStorage).</p>' +
    '<div class="act" style="margin:0"><button class="dan" id="wAtt">🗑️ مسح سجلات الحضور والانصراف لكل الموظفين</button><button class="dan" id="wShift">🗑️ مسح الشيفت المطبق على كل الموظفين</button><button class="dan" id="wEmp">🗑️ مسح كل الموظفين المسجلين</button></div></div>';

  $('pSave').onclick = changeMyPassword;
  $('logout').onclick = doLogout;
  box.querySelectorAll('[data-setpw]').forEach(function (b) { b.onclick = function () { setEmpPassword(b.dataset.setpw); }; });
  $('nAdd').onclick = function () { addEmployee(false); };
  $('wAtt').onclick = wipeAttendance;
  $('wShift').onclick = wipeAllShifts;
  $('wEmp').onclick = wipeEmployees;
  box.querySelectorAll('[data-clr]').forEach(function (b) { b.onclick = function () { clearShift(b.dataset.clr); }; });
}

/* ===== إجراءات الإعدادات ===== */
async function addEmployee(setup) {
  var name = $('nName').value.trim();
  if (name.length < 2) { $('nName').focus(); return toast('اكتب اسم الموظف (حرفين على الأقل)', 'er'); }
  if ($('nPass').value.length < 6) { $('nPass').focus(); return toast('كلمة السر لازم تكون 6 أحرف على الأقل', 'er'); }
  var btn = $('nAdd'); btn.disabled = true;
  try {
    var hash = await Auth.hashPassword($('nPass').value);
    var r = DB.addEmployee({ name: name, dept: $('nDept').value, job: $('nJob').value, password: hash });
    if (setup) { location.hash = '#/'; location.reload(); return; }
    toast('تمت إضافة ' + r.name + ' (' + r.id + ')');
    loadSettings(); renderSettings();
  } catch (e) { toast(e.message, 'er'); btn.disabled = false; }
}

async function changeMyPassword() {
  var cur = $('pCur').value, n = $('pNew').value;
  if (!cur) return toast('اكتب كلمة السر الحالية', 'er');
  if (n.length < 6) return toast('كلمة السر الجديدة لازم تكون 6 أحرف على الأقل', 'er');
  if (n !== $('pNew2').value) return toast('كلمتا السر غير متطابقتين', 'er');
  try {
    await Auth.changePassword(cur, n);
    ['pCur', 'pNew', 'pNew2'].forEach(function (i) { $(i).value = ''; });
    toast('تم تغيير كلمة السر');
  } catch (e) { toast(e.message, 'er'); }
}

async function setEmpPassword(id) {
  var inp = document.querySelector('[data-pw="' + CSS.escape(id) + '"]');
  if (inp.value.length < 6) { inp.focus(); return toast('كلمة السر لازم تكون 6 أحرف على الأقل', 'er'); }
  try {
    await Auth.resetPassword(id, inp.value);
    inp.value = '';
    toast('تم تعيين كلمة السر للموظف');
  } catch (e) { toast(e.message, 'er'); }
}

async function wipeAttendance() {
  if (!await ask('هتمسح كل سجلات الحضور والانصراف لكل الموظفين. الإجراء ده نهائي. متأكد؟')) return;
  try {
    var removed = DB.deleteAllAttendance();
    Store.rec = {};
    toast('تم مسح ' + removed + ' سجل حضور');
    refresh();
  } catch (e) { toast(e.message, 'er'); }
}

async function wipeAllShifts() {
  if (!await ask('هتمسح الشيفت المطبق على كل الموظفين. متأكد؟')) return;
  try {
    DB.deleteAllShifts();
    ShiftData = {};
    toast('تم مسح الشيفت لكل الموظفين');
    loadSettings(); render(); renderSettings();
  } catch (e) { toast(e.message, 'er'); }
}

async function clearShift(id) {
  var e = emp(id) || SettingsData.employees.find(function (x) { return x.id === id; });
  if (!await ask('هتمسح الشيفت المطبق على ' + (e ? e.name : id) + '. متأكد؟')) return;
  try {
    DB.deleteShift(id);
    delete ShiftData[id];
    toast('تم مسح الشيفت');
    loadSettings(); render(); renderSettings();
  } catch (e2) { toast(e2.message, 'er'); }
}

async function wipeEmployees() {
  var n = SettingsData.employees.length;
  if (!await askTyped('هتمسح كل الموظفين المسجلين (' + n + ' موظف) مع الشيفتات وسجلات الحضور بتاعتهم.', 'مسح الكل')) return;
  try {
    var removed = DB.deleteAllEmployees();
    Auth.logout();
    location.hash = '#/login';
    route();
  } catch (e) { toast(e.message, 'er'); }
}

function doLogout() {
  Auth.logout();
  location.hash = '#/login';
  route();
}

/* ===== عرض صفحة الدخول ===== */
function showLogin() {
  document.body.classList.add('login-mode');
  var app = $('appView');
  if (app) app.style.display = 'none';
  var loginEl = $('loginView');
  loginEl.style.display = '';

  var first = DB.getEmployees().length === 0;

  loginEl.innerHTML = '<form class="card" id="f" autocomplete="on" style="width:100%;max-width:380px">' +
    '<h1 id="ttl">' + (first ? '👥 إنشاء أول حساب' : '🕘 الحضور والانصراف') + '</h1>' +
    '<p id="sub" style="color:var(--mut);margin:0 0 16px;font-size:13px">' + (first ? 'مفيش موظفين مسجلين. أنشئ أول حساب لتبدأ.' : 'سجّل الدخول للمتابعة') + '</p>' +
    (first ? '<div><label for="lName" style="display:block;margin:12px 0 4px;font-size:13px;font-weight:600">اسم الموظف</label><input id="lName" maxlength="80" autocomplete="name"></div>' : '') +
    (first ? '' : '<div><label for="lId" style="display:block;margin:12px 0 4px;font-size:13px;font-weight:600">الرقم الوظيفي أو اسم الموظف</label><input id="lId" placeholder="EMP-001 أو الاسم" autocomplete="username" dir="rtl"></div>') +
    '<label for="lPw" style="display:block;margin:12px 0 4px;font-size:13px;font-weight:600">كلمة السر</label><input id="lPw" type="password" autocomplete="' + (first ? 'new-password' : 'current-password') + '" dir="ltr" style="text-align:right">' +
    (first ? '<div><label for="lPw2" style="display:block;margin:12px 0 4px;font-size:13px;font-weight:600">تأكيد كلمة السر</label><input id="lPw2" type="password" autocomplete="new-password" dir="ltr" style="text-align:right"></div>' : '') +
    '<button id="lGo" type="submit" style="width:100%;margin-top:18px;padding:11px;border:0;border-radius:10px;background:var(--pr);color:#fff;font:inherit;font-weight:700;cursor:pointer">' + (first ? 'إنشاء الحساب والدخول' : 'دخول') + '</button>' +
    '<div id="lErr" role="alert" style="display:none;margin-top:14px;padding:9px 12px;border-radius:10px;background:var(--ers);color:var(--er);font-size:13px"></div>' +
    (first ? '' : '<div style="margin-top:14px;font-size:12px;color:var(--mut)">حساب قديم ولسه معملتش كلمة سر؟ كلمة السر المبدئية هي رقمك الوظيفي — غيّرها بعد الدخول من الإعدادات.</div>') +
    '</form>';

  var form = $('f');
  form.onsubmit = async function (ev) {
    ev.preventDefault();
    var errEl = $('lErr');
    errEl.style.display = 'none';
    var pw = $('lPw').value;

    if (first && pw !== $('lPw2').value) {
      errEl.textContent = 'كلمتا السر غير متطابقتين';
      errEl.style.display = 'block';
      return;
    }
    $('lGo').disabled = true;
    try {
      if (first) {
        await Auth.firstSetup($('lName').value, pw);
      } else {
        await Auth.login($('lId').value, pw);
      }
      location.hash = '#/';
      route();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
      $('lGo').disabled = false;
    }
  };
}

/* ===== عرض التطبيق الرئيسي ===== */
function showApp() {
  document.body.classList.remove('login-mode');
  var loginEl = $('loginView');
  if (loginEl) loginEl.style.display = 'none';
  var appEl = $('appView');
  appEl.style.display = '';

  loadBootstrap();
  loadRecords();
  render();
  loadSettings();
  renderSettings();

  /* ربط أحداث الملخص الشهري */
  $('mSum').onchange = function (e) { if (e.target.value) { state.month = e.target.value; refresh(); } };
  $('btnPdf').onclick = exportPDF;
}

/* ===== شاشة الإعداد الأولي (من داخل التطبيق) ===== */
function showSetup(title) {
  document.body.classList.remove('login-mode');
  var loginEl = $('loginView');
  if (loginEl) loginEl.style.display = 'none';
  var appEl = $('appView');
  appEl.style.display = '';
  $('app').innerHTML = '<div class="card"><h2>' + title + '</h2><p class="mut">مفيش موظفين مسجلين. أضف أول موظف عشان تبدأ:</p>' + empForm() + '</div>';
  $('nAdd').onclick = function () { addEmployee(true); };
}

/* ===== Router ===== */
function route() {
  var hash = location.hash || '';
  var user = Auth.currentUser();

  if (!user) {
    if (hash !== '#/login') { location.hash = '#/login'; return; }
    showLogin();
    return;
  }

  if (hash === '#/login') {
    location.hash = '#/';
    return;
  }

  showApp();
}

/* ===== Init ===== */
async function init() {
  await DB.init();
  window.addEventListener('hashchange', route);
  route();
}

init();
