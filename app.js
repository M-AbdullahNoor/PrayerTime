/* ===== CONFIG =====
 * Replace with your Supabase project URL and anon (public) key.
 * Find them in: Supabase Dashboard → Project Settings → API
 */
const CONFIG = {
  supabaseUrl: 'https://mkyzuuztgqyxttkufpbk.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1reXp1dXp0Z3F5eHR0a3VmcGJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2OTQ4MDQsImV4cCI6MjA4NzI3MDgwNH0.6INRNIhnWTG9HRwl40kidE_5RP0FmZPrFsvjA7ecwlk'
};

/* ===== PRAYER COLUMNS (order for display) ===== */
const PRAYER_COLUMNS = [
  'fajr', 'sunrise', 'zahwa_kubra', 'zuhr', 'asr', 'maghrib', 'isha'
];

const PRAYER_LABELS = {
  fajr: 'Fajr',
  sunrise: 'Sunrise',
  zahwa_kubra: 'Zahwa Kubra',
  zuhr: 'Zuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha'
};

/* ===== DOM REFERENCES ===== */
const el = {
  currentDate: document.getElementById('currentDate'),
  loading: document.getElementById('loading'),
  error: document.getElementById('error'),
  todayView: document.getElementById('todayView'),
  countdownSection: document.getElementById('countdownSection'),
  countdownPrayerName: document.getElementById('countdownPrayerName'),
  countdownTime: document.getElementById('countdownTime'),
  noDataToday: document.getElementById('noDataToday'),
  todayCard: document.getElementById('todayCard'),
  todayTableBody: document.getElementById('todayTableBody'),
  monthlyView: document.getElementById('monthlyView'),
  monthTitle: document.getElementById('monthTitle'),
  prevMonth: document.getElementById('prevMonth'),
  nextMonth: document.getElementById('nextMonth'),
  noDataMonth: document.getElementById('noDataMonth'),
  monthTableWrapper: document.getElementById('monthTableWrapper'),
  monthTableBody: document.getElementById('monthTableBody'),
  viewMonthlyBtn: document.getElementById('viewMonthlyBtn'),
  viewTodayBtn: document.getElementById('viewTodayBtn'),
  headerTitle: document.getElementById('headerTitle')
};

/* ===== NOTIFICATIONS ===== */
const NOTIFICATION_MINUTES_BEFORE = 30;
let notificationTimeouts = [];

function isNotificationSupported() {
  return typeof Notification !== 'undefined';
}

function requestNotificationPermission() {
  if (!isNotificationSupported()) return Promise.resolve('unsupported');
  return Notification.requestPermission();
}

function clearScheduledNotifications() {
  notificationTimeouts.forEach(id => clearTimeout(id));
  notificationTimeouts = [];
}

function showPrayerNotification(label, timeStr) {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return;
  try {
    const n = new Notification('Prayer Reminder', {
      body: `${label} is at ${timeStr}`
    });
    n.onclick = () => { n.close(); window.focus(); };
  } catch (e) { /* ignore */ }
}

function scheduleAllPrayerNotifications(record) {
  if (!record || !isNotificationSupported() || Notification.permission !== 'granted') return;
  clearScheduledNotifications();
  const now = Date.now();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const notifyAtMs = NOTIFICATION_MINUTES_BEFORE * 60 * 1000;

  PRAYER_COLUMNS.forEach(key => {
    const timeStr = record[key];
    if (timeStr == null || timeStr === '') return;
    const at = parseTimeToDateToday(timeStr, today);
    if (!at || isNaN(at.getTime())) return;
    const notifyAt = at.getTime() - notifyAtMs;
    if (notifyAt <= now) return;
    const delay = notifyAt - now;
    const label = PRAYER_LABELS[key];
    const displayTime = formatTime(timeStr);
    const id = setTimeout(() => {
      showPrayerNotification(label, displayTime);
      notificationTimeouts = notificationTimeouts.filter(i => i !== id);
    }, delay);
    notificationTimeouts.push(id);
  });
}

const NOTIFICATION_ASKED_KEY = 'prayer_notification_asked';

function askNotificationPermissionOnce(record) {
  if (!isNotificationSupported() || !record) return;
  if (Notification.permission !== 'default') return;
  try {
    if (localStorage.getItem(NOTIFICATION_ASKED_KEY)) return;
    localStorage.setItem(NOTIFICATION_ASKED_KEY, '1');
    requestNotificationPermission().then(() => {
      if (Notification.permission === 'granted') scheduleAllPrayerNotifications(record);
    });
  } catch (e) { /* ignore */ }
}

/* ===== STATE ===== */
let supabaseClient = null;
let currentView = 'today';
let displayedMonth = null;
let todayRecord = null;
let countdownIntervalId = null;

/* ===== INIT ===== */
function init() {
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey ||
      CONFIG.supabaseUrl === 'YOUR_SUPABASE_URL' ||
      CONFIG.supabaseAnonKey === 'YOUR_SUPABASE_ANON_KEY') {
    showError('Please set your Supabase URL and anon key in app.js (CONFIG object).');
    hideLoading();
    return;
  }
  supabaseClient = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  const now = new Date();
  el.currentDate.textContent = formatDisplayDate(now);
  displayedMonth = { year: now.getFullYear(), month: now.getMonth() };
  fetchToday();
  bindEvents();
}

/* ===== FETCH TODAY ===== */
async function fetchToday() {
  showLoading();
  hideError();
  const now = new Date();
  const monthDay = formatMonthDay(now);
  try {
    const { data, error } = await supabaseClient.rpc('get_prayer_time_by_month_day', {
      month_day: monthDay
    });
    if (error) throw error;
    hideLoading();
    renderTodayView(data);
  } catch (err) {
    hideLoading();
    showError(err.message || 'Failed to load today\'s prayer times.');
    renderTodayView(null);
  }
}

/* ===== FETCH MONTH ===== */
async function fetchMonth(year, monthZeroBased) {
  showLoading();
  hideError();
  const monthNum = String(monthZeroBased + 1).padStart(2, '0');
  try {
    const { data, error } = await supabaseClient.rpc('get_prayer_times_by_month', {
      month_num: monthNum
    });
    if (error) throw error;
    hideLoading();
    renderMonthlyView(data || [], year, monthZeroBased);
  } catch (err) {
    hideLoading();
    showError(err.message || 'Failed to load monthly prayer times.');
    renderMonthlyView([], year, monthZeroBased);
  }
}

/* ===== RENDER TODAY VIEW ===== */
function renderTodayView(row) {
  stopCountdown();
  el.countdownSection.classList.add('hidden');
  el.noDataToday.classList.add('hidden');
  el.todayCard.classList.add('hidden');
  const record = Array.isArray(row) ? row[0] : row;
  if (!record || (!record.date && record.fajr == null && record.zuhr == null)) {
    clearScheduledNotifications();
    el.noDataToday.classList.remove('hidden');
    return;
  }
  todayRecord = record;
  startCountdown(record);
  if (Notification.permission === 'granted') scheduleAllPrayerNotifications(record);
  askNotificationPermissionOnce(record);
  el.countdownSection.classList.remove('hidden');
  el.todayTableBody.innerHTML = '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const next = getNextPrayer(record);

  PRAYER_COLUMNS.forEach(key => {
    const tr = document.createElement('tr');
    const timeAt = parseTimeToDateToday(record[key], today);
    let rowClass = '';
    if (next && next.key === key) {
      rowClass = 'row-next';
    } else if (timeAt && timeAt < now) {
      rowClass = 'row-past';
    }
    if (rowClass) tr.classList.add(rowClass);
    tr.innerHTML = `<th scope="row">${PRAYER_LABELS[key]}</th><td>${formatTime(record[key])}</td>`;
    el.todayTableBody.appendChild(tr);
  });
  el.todayCard.classList.remove('hidden');
}

/* ===== RENDER MONTHLY VIEW ===== */
function renderMonthlyView(rows, year, monthZeroBased) {
  el.monthTitle.textContent = formatMonthYear(year, monthZeroBased);
  el.noDataMonth.classList.add('hidden');
  el.monthTableWrapper.classList.add('hidden');
  el.monthTableBody.innerHTML = '';
  if (!rows || rows.length === 0) {
    el.noDataMonth.classList.remove('hidden');
    return;
  }
  el.monthTableWrapper.classList.remove('hidden');
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  rows.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.style.animationDelay = `${i * 0.02}s`;
    tr.style.animation = 'cardReveal 0.4s ease-out both';
    const d = parseDate(row.date);
    const dateLabel = d ? `${String(d.getDate()).padStart(2,'0')} ${monthNames[d.getMonth()]}` : row.date || '—';
    const cells = [dateLabel, ...PRAYER_COLUMNS.map(k => formatTime(row[k]))];
    tr.innerHTML = cells.map(c => `<td>${c}</td>`).join('');
    el.monthTableBody.appendChild(tr);
  });
}

/* ===== VIEW SWITCHING with animation ===== */
function showTodayView() {
  currentView = 'today';
  // slide out monthly, slide in today
  el.monthlyView.style.animation = 'cardReveal 0.3s ease-out reverse both';
  setTimeout(() => {
    el.todayView.classList.remove('hidden');
    el.monthlyView.classList.add('hidden');
    el.todayView.style.animation = 'cardReveal 0.4s ease-out both';
    el.viewMonthlyBtn.classList.remove('hidden');
    el.viewTodayBtn.classList.add('hidden');
    if (el.headerTitle) el.headerTitle.textContent = "Today's Namaz Timings";
    const now = new Date();
    el.currentDate.textContent = formatDisplayDate(now);
    fetchToday();
  }, 200);
}

function showMonthlyView() {
  currentView = 'monthly';
  stopCountdown();
  clearScheduledNotifications();
  el.todayView.style.animation = 'cardReveal 0.3s ease-out reverse both';
  setTimeout(() => {
    el.todayView.classList.add('hidden');
    el.monthlyView.classList.remove('hidden');
    el.monthlyView.style.animation = 'cardReveal 0.4s ease-out both';
    el.viewMonthlyBtn.classList.add('hidden');
    el.viewTodayBtn.classList.remove('hidden');
    if (el.headerTitle) el.headerTitle.textContent = 'Namaz Timetable';
    el.currentDate.textContent = '';
    fetchMonth(displayedMonth.year, displayedMonth.month);
  }, 200);
}

/* ===== HELPERS ===== */
function formatMonthDay(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${m}-${d}`;
}

function formatDisplayDate(date) {
  return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatMonthYear(year, monthZeroBased) {
  const d = new Date(year, monthZeroBased, 1);
  return d.toLocaleDateString(undefined, { month: 'long' });
}

function to12Hour(value) {
  if (value == null || value === '') return '—';
  let h, m, alreadyAmPm;
  if (value instanceof Date && !isNaN(value.getTime())) {
    h = value.getHours();
    m = String(value.getMinutes()).padStart(2, '0');
    alreadyAmPm = null;
  } else {
    const s = String(value).trim();
    let match = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
    if (!match) {
      match = s.match(/T(\d{1,2}):(\d{2})/);
      if (!match) return s;
      h = parseInt(match[1], 10);
      m = match[2];
      alreadyAmPm = null;
    } else {
      h = parseInt(match[1], 10);
      m = match[2];
      alreadyAmPm = match[3] || null;
    }
  }
  if (alreadyAmPm) return `${h}:${m} ${alreadyAmPm.toUpperCase()}`;
  const period = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${period}`;
}

function formatTime(value) {
  if (value == null || value === '') return '—';
  return to12Hour(value);
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function parseTimeToDateToday(timeStr, today) {
  if (!timeStr || !today) return null;
  const s = String(timeStr).trim();
  const match = s.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  return new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m, 0, 0);
}

function getNextPrayer(record) {
  if (!record) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (const key of PRAYER_COLUMNS) {
    const t = record[key];
    if (t == null || t === '') continue;
    const at = parseTimeToDateToday(t, today);
    if (!at || isNaN(at.getTime())) continue;
    if (at > now) return { key, label: PRAYER_LABELS[key], at };
  }
  return null;
}

function formatCountdown(ms) {
  if (ms <= 0) return '0h 0m 0s';
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000);
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${String(m).padStart(2,'0')}m`);
  parts.push(`${String(s).padStart(2,'0')}s`);
  return parts.join(' ');
}

function updateCountdownDisplay() {
  if (!el.countdownSection || el.countdownSection.classList.contains('hidden')) return;
  const next = getNextPrayer(todayRecord);
  if (!next) {
    el.countdownPrayerName.textContent = 'All Prayers Complete';
    el.countdownTime.textContent = 'Fajr Tomorrow';
    stopCountdown();
    return;
  }
  el.countdownPrayerName.textContent = next.label;
  const ms = next.at.getTime() - Date.now();
  el.countdownTime.textContent = formatCountdown(ms);
}

function startCountdown(record) {
  stopCountdown();
  todayRecord = record;
  updateCountdownDisplay();
  countdownIntervalId = setInterval(updateCountdownDisplay, 1000);
}

function stopCountdown() {
  if (countdownIntervalId) {
    clearInterval(countdownIntervalId);
    countdownIntervalId = null;
  }
  todayRecord = null;
}

function showLoading() { el.loading.classList.remove('hidden'); }
function hideLoading() { el.loading.classList.add('hidden'); }

function showError(msg) {
  el.error.textContent = msg;
  el.error.classList.remove('hidden');
}

function hideError() { el.error.classList.add('hidden'); }

/* ===== EVENT LISTENERS ===== */
function bindEvents() {
  el.viewMonthlyBtn.addEventListener('click', showMonthlyView);
  el.viewTodayBtn.addEventListener('click', showTodayView);
  el.prevMonth.addEventListener('click', () => {
    if (displayedMonth.month === 0) {
      displayedMonth.month = 11;
      displayedMonth.year--;
    } else {
      displayedMonth.month--;
    }
    fetchMonth(displayedMonth.year, displayedMonth.month);
  });
  el.nextMonth.addEventListener('click', () => {
    if (displayedMonth.month === 11) {
      displayedMonth.month = 0;
      displayedMonth.year++;
    } else {
      displayedMonth.month++;
    }
    fetchMonth(displayedMonth.year, displayedMonth.month);
  });
}

/* ===== RUN ===== */
document.addEventListener('DOMContentLoaded', init);
