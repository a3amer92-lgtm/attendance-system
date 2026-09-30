'use strict';
/* ===== المصادقة — Web Crypto API + جلسة محلية ===== */
/*
 * ⚠️ تنبيه: هذه مصادقة Client-Side في تطبيق Static.
 * كلمات السر مشفرة بـ SHA-256 مع salt، لكنها ليست آمنة
 * بنفس مستوى Backend حقيقي لأن البيانات مخزنة في localStorage
 * ويمكن للمستخدم رؤيتها من DevTools.
 */
var Auth = {
  SESSION_KEY: 'attendance_session',

  /* تشفير كلمة السر: salt عشوائي + SHA-256 عبر Web Crypto API */
  hashPassword: async function (pw) {
    var salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    var saltHex = Array.from(salt).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    var encoder = new TextEncoder();
    var data = encoder.encode(saltHex + pw);
    var hashBuffer = await crypto.subtle.digest('SHA-256', data);
    var hashHex = Array.from(new Uint8Array(hashBuffer)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    return saltHex + ':' + hashHex;
  },

  /* التحقق من كلمة السر */
  checkPassword: async function (pw, stored) {
    if (!stored) return false;
    var parts = stored.split(':');
    var salt = parts[0], hash = parts[1];
    var encoder = new TextEncoder();
    var data = encoder.encode(salt + pw);
    var hashBuffer = await crypto.subtle.digest('SHA-256', data);
    var hashHex = Array.from(new Uint8Array(hashBuffer)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    return hashHex === hash;
  },

  /* تسجيل الدخول */
  login: async function (id, pw) {
    var normId = Utils.normId(id);
    var emp = DB.getEmployee(normId);
    /* لو ما لقيناش بالرقم الوظيفي، نجرّب بالاسم */
    if (!emp) {
      var input = String(id || '').trim().replace(/\s+/g, ' ').toLowerCase();
      var all = DB.getEmployees();
      var byName = all.filter(function (e) { return e.name.replace(/\s+/g, ' ').toLowerCase() === input; });
      if (byName.length > 1) throw new Error('يوجد أكثر من موظف بنفس الاسم — استخدم الرقم الوظيفي');
      emp = byName[0];
    }
    if (!emp) throw new Error('الرقم الوظيفي أو الاسم أو كلمة السر غير صحيحة');

    /* حسابات قديمة بدون كلمة سر: المبدئية = الرقم الوظيفي */
    if (!emp.pass) {
      if (pw !== emp.id) throw new Error('الرقم الوظيفي أو الاسم أو كلمة السر غير صحيحة');
    } else {
      var valid = await Auth.checkPassword(pw, emp.pass);
      if (!valid) throw new Error('الرقم الوظيفي أو الاسم أو كلمة السر غير صحيحة');
    }

    sessionStorage.setItem(Auth.SESSION_KEY, JSON.stringify({ userId: emp.id }));
    return { id: emp.id, name: emp.name, dept: emp.dept, job: emp.job, role: emp.role };
  },

  /* تسجيل الخروج */
  logout: function () {
    sessionStorage.removeItem(Auth.SESSION_KEY);
  },

  /* المستخدم الحالي من الجلسة */
  currentUser: function () {
    var s = sessionStorage.getItem(Auth.SESSION_KEY);
    if (!s) return null;
    try {
      var data = JSON.parse(s);
      var emp = DB.getEmployee(data.userId);
      if (!emp) return null;
      return { id: emp.id, name: emp.name, dept: emp.dept, job: emp.job, role: emp.role };
    } catch (e) { return null; }
  },

  /* إنشاء أول حساب — متاح فقط لما مفيش أي موظف */
  firstSetup: async function (name, pw) {
    if (DB.getEmployees().length > 0) throw new Error('تم الإعداد مسبقًا');
    var cleanName = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
    if (cleanName.length < 2) throw new Error('اكتب اسم الموظف (حرفين على الأقل)');
    if (typeof pw !== 'string' || pw.length < Utils.MIN_PASS) throw new Error('كلمة السر لازم تكون ' + Utils.MIN_PASS + ' أحرف على الأقل');
    if (pw.length > 100) throw new Error('كلمة السر طويلة جدًا');

    var hash = await Auth.hashPassword(pw);
    var emp = DB.addEmployee({ name: cleanName, dept: '—', job: '—', password: hash });
    sessionStorage.setItem(Auth.SESSION_KEY, JSON.stringify({ userId: emp.id }));
    return emp;
  },

  /* تغيير كلمة سر المستخدم الحالي */
  changePassword: async function (current, next) {
    var user = Auth.currentUser();
    if (!user) throw new Error('انتهت الجلسة — سجّل الدخول من جديد');
    var emp = DB.getEmployee(user.id);

    /* تحقق من كلمة السر الحالية */
    if (!emp.pass) {
      if (current !== emp.id) throw new Error('كلمة السر الحالية غير صحيحة');
    } else {
      var valid = await Auth.checkPassword(current, emp.pass);
      if (!valid) throw new Error('كلمة السر الحالية غير صحيحة');
    }

    if (typeof next !== 'string' || next.length < Utils.MIN_PASS) throw new Error('كلمة السر لازم تكون ' + Utils.MIN_PASS + ' أحرف على الأقل');
    if (next.length > 100) throw new Error('كلمة السر طويلة جدًا');

    var hash = await Auth.hashPassword(next);
    DB.setPassword(user.id, hash);
  },

  /* إعادة تعيين كلمة سر موظف (من الإعدادات) */
  resetPassword: async function (id, pw) {
    var emp = DB.getEmployee(id);
    if (!emp) throw new Error('الموظف غير موجود');
    if (typeof pw !== 'string' || pw.length < Utils.MIN_PASS) throw new Error('كلمة السر لازم تكون ' + Utils.MIN_PASS + ' أحرف على الأقل');
    if (pw.length > 100) throw new Error('كلمة السر طويلة جدًا');

    var hash = await Auth.hashPassword(pw);
    DB.setPassword(id, hash);
  }
};
