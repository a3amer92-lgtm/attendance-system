'use strict';
/* ===== أدوات مساعدة — توقيت القاهرة + تنسيق ===== */
const Utils = {
  TZ: 'Africa/Cairo',
  DEFAULT_DAYS: [0, 1, 2, 3, 4],
  DAYS: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  MONTHS: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  WEEK_ORDER: [6, 0, 1, 2, 3, 4, 5],
  MIN_PASS: 6,

  pad(n) { return String(n).padStart(2, '0'); },

  /* مفتاح التاريخ YYYY-MM-DD من كائن Date */
  dkey(d) { return d.getFullYear() + '-' + Utils.pad(d.getMonth() + 1) + '-' + Utils.pad(d.getDate()); },

  /* تحويل نص وقت "HH:MM" إلى دقائق */
  tm(s) { var a = s.split(':'); return +a[0] * 60 + +a[1]; },

  /* تنسيق الدقائق → 12 ساعة */
  t12(m) {
    if (m == null) return '—';
    var h = Math.floor(m / 60), s = h >= 12 ? 'م' : 'ص';
    h = h % 12 || 12;
    return Utils.pad(h) + ':' + Utils.pad(m % 60) + ' ' + s;
  },

  /* تنسيق الدقائق → 24 ساعة */
  t24(m) { return m == null ? '—' : Utils.pad(Math.floor(m / 60)) + ':' + Utils.pad(m % 60); },

  /* ساعات:دقائق بدون AM/PM */
  hm(m) { return m == null ? '—' : Math.floor(m / 60) + ':' + Utils.pad(m % 60); },

  /* مدة مقروءة */
  dur(m) {
    var h = Math.floor(m / 60), r = m % 60;
    return h + ' ساعة' + (r ? ' و' + r + ' دقيقة' : '');
  },

  /* الوقت الحالي بتوقيت القاهرة — نفس منطق server.js سطر 58-67 */
  nowCairo() {
    var p = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: Utils.TZ, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      }).formatToParts(new Date()).map(function (x) { return [x.type, x.value]; })
    );
    return {
      date: p.year + '-' + p.month + '-' + p.day,
      min: +p.hour * 60 + +p.minute,
      dow: new Date(Date.UTC(+p.year, +p.month - 1, +p.day)).getUTCDay()
    };
  },

  /* كائن Date يمثل تاريخ اليوم بتوقيت القاهرة (للاستخدام مع dkey و getDay) */
  cairoDate() {
    var c = Utils.nowCairo();
    var parts = c.date.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  },

  /* الساعة الحالية بتوقيت القاهرة (للساعة الحية) */
  cairoTimeStr() {
    return new Date().toLocaleTimeString('en-GB', { timeZone: Utils.TZ });
  },

  /* تطبيع الرقم الوظيفي */
  normId(v) {
    v = String(v || '').trim().toUpperCase();
    return /^\d+$/.test(v) ? 'EMP-' + v.padStart(3, '0') : v;
  },

  /* حماية HTML */
  esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  },

  /* دالة hash بسيطة لتوليد ألوان الأفاتار */
  rnd(s) {
    var x = 0;
    for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0;
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  }
};
