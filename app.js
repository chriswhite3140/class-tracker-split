/*
 * ============================================================
 * ClassTracker — Australian Curriculum Progress Tracker
 * ============================================================
 * THIS FILE IS VERSION: v1.2.3
 * Last updated: 2026-03-15
 * ============================================================
 *
 * Author: Chris White
 * Repo:   https://github.com/chriswhite3140/class-tracker-split
 * Live:   https://chriswhite3140.github.io/class-tracker-split
 *
 * v1.2.3 - Coverage gaps view, student detail taught filter, dashboard taught stats
 * v1.1.0 - Mark-all buttons with full labels and icons
 * v1.0.x - Daily log wizard with AI suggestions
 * v0.9.x - Multi-subject student detail, print reports
 * ============================================================
 */

const APP_VERSION = 'v1.2.3';

// ── CONFIG ──
const API_URL = 'https://script.google.com/macros/s/AKfycbzbS0mCTPLmcTDECGSmGbdK6Wd75lpinKDLs7wtvlKg-xo00IpZqNiQGF6RoR9Xpy2I/exec';
const GITHUB_RAW = 'https://raw.githubusercontent.com/chriswhite3140/class-tracker-split/main/';

const CSV_FILES = {
  curriculumCodes: { file: 'MASTER_Content_Descriptors_UPDATED_MATCHED.csv',  iconId: 'icon-cd', navId: 'nav-load-cd' },
  standards:       { file: 'MASTER_Achievement_Standards_ALLCODES.csv',        iconId: 'icon-st', navId: 'nav-load-st' },
  progressions:    { file: 'literacy progressions.csv',                         iconId: 'icon-pr', navId: 'nav-load-pr' },
  numeracyProgressions: { file: 'Numeracy_Progressions_v9_MASTER_Level_Aligned.csv', iconId: 'icon-np', navId: 'nav-load-np' },
  aspectLinks:     { file: 'english_aspect_to_cd_links.csv',                   iconId: 'icon-lk', navId: 'nav-load-lk' },
};

// ── STATE ──
let state = {
  students: [],
  progress: [],
  taughtLog: [],           // { id, date, student_id, code, notes }
  curriculumCodes: [],
  standards: [],
  progressions: [],
  numeracyProgressions: [],
  aspectLinks: [],
  currentView: 'dashboard',
  selectedStudent: null,
  loading: true,
  syncing: false,
  detailSubjectFilter: null,
};

// ── GOOGLE SHEETS API ──
async function apiCall(action, data = null) {
  setSyncing(true);
  try {
    const resp = await fetch(API_URL + '?action=' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action, ...(data || {}) })
    });
    const result = await resp.json();
    setSyncing(false);
    return result;
  } catch (err) {
    setSyncing(false);
    setError();
    throw err;
  }
}

async function loadStudents() {
  try {
    const rows = await apiCall('getStudents');
    if (Array.isArray(rows) && rows.length > 1) {
      state.students = rows.slice(1).map(r => ({
        id: r[0], first_name: r[1], last_name: r[2],
        year_level: r[3], date_added: r[4]
      })).filter(s => s.id);
    }
  } catch(e) { console.error('Load students error:', e); }
}

async function loadProgress() {
  try {
    const rows = await apiCall('getProgress');
    if (Array.isArray(rows) && rows.length > 1) {
      state.progress = rows.slice(1).map(r => ({
        id: r[0], student_id: r[1], code: r[2],
        mastery: r[3], date: r[4], notes: r[5], evidence: r[6]
      })).filter(p => p.id);
    }
  } catch(e) { console.error('Load progress error:', e); }
}

async function loadTaughtLog() {
  try {
    const rows = await apiCall('getTaughtLog');
    if (Array.isArray(rows) && rows.length > 1) {
      state.taughtLog = rows.slice(1).map(r => ({
        id: r[0], date: r[1], student_id: r[2], code: r[3], notes: r[4] || ''
      })).filter(t => t.id);
    }
  } catch(e) {
    // TaughtLog sheet may not exist yet — that's fine
    console.warn('TaughtLog not loaded (sheet may not exist yet):', e);
  }
}

async function addStudent(data) {
  const result = await apiCall('addStudent', data);
  if (result.success) {
    state.students.push({
      id: result.student_id,
      first_name: data.first_name,
      last_name: data.last_name,
      year_level: data.year_level,
      date_added: new Date().toISOString()
    });
    toast('Student added successfully', 'success');
    renderView();
  }
  return result;
}

async function saveProgress(data) {
  const existing = state.progress.find(
    p => p.student_id === data.student_id && p.code === data.content_descriptor_code
  );
  if (existing) {
    const result = await apiCall('updateProgress', {
      progress_id: existing.id,
      mastery_level: data.mastery_level,
      date_assessed: data.date_assessed,
      teacher_notes: data.teacher_notes
    });
    if (result.success) {
      existing.mastery = data.mastery_level;
      existing.date = data.date_assessed;
      existing.notes = data.teacher_notes;
      toast('Progress updated', 'success');
    }
  } else {
    const result = await apiCall('saveProgress', data);
    if (result.success) {
      state.progress.push({
        id: result.progress_id,
        student_id: data.student_id,
        code: data.content_descriptor_code,
        mastery: data.mastery_level,
        date: data.date_assessed,
        notes: data.teacher_notes
      });
      toast('Progress saved', 'success');
    }
  }
  renderView();
}

// ── SYNC STATE UI ──
function setSyncing(v) {
  state.syncing = v;
  const dot = document.getElementById('sync-dot');
  const label = document.getElementById('sync-label');
  if (v) { dot.className = 'sync-dot syncing'; label.textContent = 'Syncing…'; }
  else   { dot.className = 'sync-dot'; label.textContent = 'Connected'; }
}

function setError() {
  document.getElementById('sync-dot').className = 'sync-dot error';
  document.getElementById('sync-label').textContent = 'Sync error';
}

// ── TOAST ──
function toast(msg, type = 'success') {
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type === 'success' ? '✓' : '✗'}</span> ${msg}`;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── HELPERS ──
function getInitials(s) { return ((s.first_name||'')[0]+(s.last_name||'')[0]).toUpperCase(); }
function getAvClass(i) { return 'av-' + (i % 6); }
function getStudentProgress(sid) { return state.progress.filter(p => p.student_id === sid); }
function getMasteryForCode(sid, code) {
  const p = state.progress.find(x => x.student_id === sid && x.code === code);
  return p ? p.mastery : 'Not taught';
}
function masteryClass(m) {
  if (!m || m === 'Not taught') return 'mb-nottaught';
  return 'mb-' + m.toLowerCase().replace(' ', '');
}
function masteryDot(m) {
  if (m === 'Achieved')   return '●';
  if (m === 'Developing') return '◐';
  if (m === 'Emerging')   return '○';
  return '·';
}
function getProgressStats(sid) {
  const prog = getStudentProgress(sid);
  const achieved   = prog.filter(p => p.mastery === 'Achieved').length;
  const developing = prog.filter(p => p.mastery === 'Developing').length;
  const emerging   = prog.filter(p => p.mastery === 'Emerging').length;
  const total = state.curriculumCodes.length || 1;
  return { achieved, developing, emerging, total, pct: Math.round((achieved/total)*100) };
}

// ── PARSE CSV ──
function normaliseYear(val) {
  if (!val) return '';
  const v = val.toString().trim();
  if (v === 'Foundation' || v === 'Prep' || v === 'F') return 'F';
  const m = v.match(/^(?:Year\s*)?(\d+)$/);
  return m ? m[1] : v;
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => obj[h.trim()] = (vals[i] || '').trim());
    return obj;
  });
}

function parseCSVLine(line) {
  const result = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += c; }
  }
  result.push(cur);
  return result;
}

// ── VIEWS ──
function showView(v) {
  state.currentView = v;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const nb = document.getElementById('nav-' + v);
  if (nb) nb.classList.add('active');
  renderView();
}

function renderView() {
  const main = document.getElementById('main-content');
  switch(state.currentView) {
    case 'dashboard':      renderDashboard(main); break;
    case 'students':       renderStudents(main); break;
    case 'student-detail': renderStudentDetail(main); break;
    case 'overview':       renderClassOverview(main); break;
    case 'bulk-assess':    renderBulkAssess(main); break;
    case 'daily-log':      renderDailyLog(main); break;
    case 'coverage':       renderCoverage(main); break;
    case 'curriculum':     renderCurriculum(main); break;
    case 'standards':      renderStandards(main); break;
    case 'progressions':   renderProgressions(main); break;
    default:               renderDashboard(main);
  }
}

// ── DASHBOARD ──
function renderDashboard(main) {
  const totalStudents = state.students.length;
  const totalProgress = state.progress.length;
  const achieved = state.progress.filter(p => p.mastery === 'Achieved').length;
  const gaps = state.progress.filter(p => p.mastery === 'Emerging').length;

  const recent = [...state.progress]
    .sort((a,b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  const subjectOrder = ['English','Mathematics','Science','HASS','Health and Physical Education','Design and Technologies','Digital Technologies'];
  const subjectColours = {
    'English':                    ['var(--blue)',   'var(--blue-dim)'],
    'Mathematics':                ['var(--green)',  'var(--green-dim)'],
    'Science':                    ['var(--teal)',   'var(--teal-dim)'],
    'HASS':                       ['var(--gold)',   'var(--gold-dim)'],
    'Health and Physical Education': ['var(--rust)', 'var(--rust-dim)'],
    'Design and Technologies':    ['var(--purple)', 'var(--purple-dim)'],
    'Digital Technologies':       ['var(--purple)', 'var(--purple-dim)'],
  };
  const subjectIcons = {
    'English':'✦','Mathematics':'∑','Science':'⚗','HASS':'◎',
    'Health and Physical Education':'◉','Design and Technologies':'⬡','Digital Technologies':'⬡'
  };

  const subjects = subjectOrder.filter(subj => state.curriculumCodes.some(c => c.Subject === subj));

  // Taught stats across all codes for top stat row
  const totalCodes = state.curriculumCodes.length;
  const taughtCodeCount = new Set(state.taughtLog.map(t => t.student_id + '|' + t.code)).size;
  const coveragePct = totalCodes ? Math.round((new Set(state.taughtLog.map(t => t.code)).size / totalCodes) * 100) : 0;

  function subjectCard(subj) {
    const [col, bg] = subjectColours[subj] || ['var(--text2)', 'var(--surface2)'];
    const icon = subjectIcons[subj] || '◈';
    const codes = state.curriculumCodes.filter(c => c.Subject === subj);
    const strands = [...new Set(codes.map(c => c.Strand).filter(Boolean))].sort();
    const assessed = state.progress.filter(p => codes.some(c => c.Code === p.code));
    const subjAchieved = assessed.filter(p => p.mastery === 'Achieved').length;
    const assessedPct = assessed.length ? Math.round(subjAchieved/assessed.length*100) : 0;

    // Taught: unique codes from this subject that appear in taughtLog
    const taughtCodes = new Set(
      state.taughtLog.filter(t => codes.some(c => c.Code === t.code)).map(t => t.code)
    );
    const taughtPct = codes.length ? Math.round((taughtCodes.size / codes.length) * 100) : 0;
    const notTaughtCount = codes.length - taughtCodes.size;

    return `<div class="card" style="cursor:pointer" onclick="cdFilters.subject='${subj}';cdFilters.year='all';cdFilters.strand='all';showView('curriculum')">
      <div style="padding:14px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border)">
        <div style="width:34px;height:34px;border-radius:8px;background:${bg};display:flex;align-items:center;justify-content:center;font-size:16px;color:${col};flex-shrink:0">${icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${subj}</div>
          <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);margin-top:1px">${codes.length} codes · ${strands.length} strands</div>
        </div>
        <div style="text-align:right">
          ${taughtPct > 0 ? `<div style="font-family:'DM Mono',monospace;font-size:11px;color:${col};font-weight:700">${taughtPct}%</div>
          <div style="font-size:9px;color:var(--text3)">taught</div>` : `<div style="font-size:10px;color:var(--text3)">No data</div>`}
        </div>
      </div>
      <div style="padding:10px 16px">
        <!-- Taught progress bar -->
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <div style="font-size:10px;color:var(--text3);width:52px;flex-shrink:0">Taught</div>
          <div style="flex:1;height:6px;background:var(--surface2);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${taughtPct}%;background:${col};border-radius:3px;transition:width 0.3s"></div>
          </div>
          <div style="font-family:'DM Mono',monospace;font-size:9px;color:${col};width:36px;text-align:right">${taughtCodes.size}/${codes.length}</div>
        </div>
        ${notTaughtCount > 0 ? `<div style="font-size:10px;color:var(--rust);margin-bottom:8px;cursor:pointer" onclick="event.stopPropagation();state.coverageFilter={subject:'${subj}',year:'all',strand:'all',mode:'not-taught'};showView('coverage')">
          ⚠ ${notTaughtCount} code${notTaughtCount>1?'s':''} not yet taught → <span style="text-decoration:underline">View gaps</span>
        </div>` : `<div style="font-size:10px;color:var(--green);margin-bottom:8px">✓ All codes taught</div>`}
        ${strands.map(strand => {
          const sc = codes.filter(c => c.Strand === strand);
          const sa = state.progress.filter(p => sc.some(c => c.Code === p.code));
          const sp = sa.length ? Math.round(sa.filter(p=>p.mastery==='Achieved').length/sa.length*100) : 0;
          return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
            <div style="font-size:10px;color:var(--text3);width:110px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0">${strand}</div>
            <div style="flex:1;height:4px;background:var(--surface2);border-radius:2px;overflow:hidden"><div style="height:100%;width:${sp}%;background:${col};border-radius:2px;transition:width 0.3s"></div></div>
            <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);width:28px;text-align:right">${sa.length ? sp+'%' : '—'}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  main.innerHTML = `
    <div class="topbar">
      <div class="topbar-title">Dashboard</div>
      <div class="topbar-actions">
        <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);letter-spacing:0.1em">${APP_VERSION}</span>
        <button class="btn" onclick="openDailyLogWizard()" style="border-color:var(--gold);color:var(--gold)">✦ Log Today</button>
        <button class="btn btn-primary" onclick="openAddStudentModal()">+ Add Student</button>
      </div>
    </div>
    <div class="content">
      <div class="stats-row" style="grid-template-columns:repeat(5,1fr)">
        <div class="stat-card c-blue"><div class="stat-label">Students</div><div class="stat-value">${totalStudents}</div><div class="stat-sub">enrolled</div></div>
        <div class="stat-card c-teal"><div class="stat-label">Assessments</div><div class="stat-value">${totalProgress}</div><div class="stat-sub">recorded</div></div>
        <div class="stat-card c-green"><div class="stat-label">Achieved</div><div class="stat-value">${achieved}</div><div class="stat-sub">outcomes met</div></div>
        <div class="stat-card c-gold" style="cursor:pointer" onclick="showView('coverage')">
          <div class="stat-label">Coverage</div>
          <div class="stat-value" style="font-size:24px">${coveragePct}%</div>
          <div class="stat-sub">codes taught this year</div>
        </div>
        <div class="stat-card" style="cursor:pointer;border-top:2px solid var(--rust)" onclick="state.coverageFilter={subject:'all',year:'all',strand:'all',mode:'not-taught'};showView('coverage')">
          <div class="stat-label" style="color:var(--rust)">Gaps</div>
          <div class="stat-value" style="color:var(--rust);font-size:24px">${gaps}</div>
          <div class="stat-sub">emerging / at risk</div>
        </div>
      </div>
      ${subjects.length > 0 ? `
        <div style="margin-bottom:6px;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:var(--text3)">Learning Areas · click to browse codes</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-bottom:20px">${subjects.map(subjectCard).join('')}</div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div class="card">
          <div class="card-head"><div class="card-title">Students</div><button class="btn" onclick="showView('students')">View all →</button></div>
          <div style="padding:8px 0;">
            ${totalStudents === 0
              ? `<div class="empty-state" style="padding:30px"><div class="empty-icon">◎</div><div class="empty-title">No students yet</div><button class="btn btn-primary" style="margin-top:8px" onclick="openAddStudentModal()">+ Add Student</button></div>`
              : state.students.slice(0,5).map((s,i) => {
                  const stats = getProgressStats(s.id);
                  return `<div style="display:flex;align-items:center;gap:12px;padding:10px 18px;border-bottom:1px solid var(--border);cursor:pointer" onclick="openStudentDetail('${s.id}')">
                    <div class="sc-avatar ${getAvClass(i)}" style="width:32px;height:32px;font-size:13px">${getInitials(s)}</div>
                    <div style="flex:1"><div style="font-size:13px;font-weight:600">${s.first_name} ${s.last_name}</div><div style="font-size:10px;color:var(--text3)">Year ${s.year_level}</div></div>
                    <div style="font-family:'DM Mono',monospace;font-size:11px;color:var(--green)">${stats.pct}%</div>
                  </div>`;
                }).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div class="card-title">Recent Assessments</div></div>
          <div style="padding:8px 0;">
            ${recent.length === 0
              ? `<div class="empty-state" style="padding:30px"><div class="empty-icon">◈</div><div class="empty-title">No assessments yet</div></div>`
              : recent.map(p => {
                  const student = state.students.find(s => s.id === p.student_id);
                  const name = student ? `${student.first_name} ${student.last_name}` : 'Unknown';
                  const cd = state.curriculumCodes.find(c => c.Code === p.code);
                  return `<div style="display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid var(--border)">
                    <div style="flex:1"><div style="font-size:12px;font-weight:600">${name}</div><div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--text3)">${p.code}${cd ? ' · '+cd.Subject : ''}</div></div>
                    <div class="mastery-badge ${masteryClass(p.mastery)}">${masteryDot(p.mastery)} ${p.mastery}</div>
                  </div>`;
                }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── CLASS OVERVIEW ──
function renderClassOverview(main) {
  const students = state.students;
  const yearLevelMap = { 'F':'Foundation','1':'Year 1','2':'Year 2','3':'Year 3','4':'Year 4','5':'Year 5','6':'Year 6' };

  if (!state.overviewFilter) state.overviewFilter = { year: 'all', subject: 'English', strand: 'all' };
  const ovf = state.overviewFilter;

  const availableSubjects = [...new Set(state.curriculumCodes.map(c => c.Subject).filter(Boolean))].sort();

  function getCodesForStudent(student) {
    const csvYear = yearLevelMap[normaliseYear(student.year_level)] || student.year_level;
    return state.curriculumCodes.filter(c => {
      if (c.Subject !== ovf.subject) return false;
      if ((c['Year Level']||'').trim() !== csvYear) return false;
      if (ovf.strand !== 'all' && c.Strand !== ovf.strand) return false;
      return true;
    });
  }

  function getStrandsForStudent(student) {
    const csvYear = yearLevelMap[normaliseYear(student.year_level)] || student.year_level;
    return [...new Set(state.curriculumCodes.filter(c => c.Subject === ovf.subject && (c['Year Level']||'').trim() === csvYear).map(c => c.Strand).filter(Boolean))].sort();
  }

  function masteryColour(pct) {
    if (pct >= 80) return 'var(--green)';
    if (pct >= 50) return 'var(--gold)';
    if (pct > 0)   return 'var(--rust)';
    return 'var(--border2)';
  }

  function masteryBg(pct) {
    if (pct >= 80) return 'var(--green-dim)';
    if (pct >= 50) return 'var(--gold-dim)';
    if (pct > 0)   return 'var(--rust-dim)';
    return 'var(--surface2)';
  }

  const visibleStudents = students.filter(s => ovf.year === 'all' || normaliseYear(s.year_level) === ovf.year)
    .sort((a,b) => `${a.last_name}${a.first_name}`.localeCompare(`${b.last_name}${b.first_name}`));

  function buildStrandGrid() {
    if (!visibleStudents.length) return `<div class="empty-state" style="padding:60px"><div class="empty-icon">▦</div><div class="empty-title">No students match this filter</div></div>`;
    const allStrands = ovf.strand !== 'all' ? [ovf.strand]
      : [...new Set(visibleStudents.flatMap(s => getStrandsForStudent(s)))].sort();

    return `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:600px">
      <thead><tr style="background:var(--surface2)">
        <th style="padding:10px 16px;text-align:left;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.12em;color:var(--text3);text-transform:uppercase;width:180px;position:sticky;left:0;background:var(--surface2);z-index:2">Student</th>
        <th style="padding:10px 12px;text-align:center;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.12em;color:var(--text3);text-transform:uppercase;width:80px">Overall</th>
        ${allStrands.map(strand => `<th style="padding:10px 12px;text-align:center;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.12em;color:var(--text3);text-transform:uppercase;cursor:pointer" onclick="state.overviewFilter.strand='${strand}';renderClassOverview(document.getElementById('main-content'))">${strand}<br><span style="font-size:8px;opacity:0.6;font-weight:400">click to filter</span></th>`).join('')}
        <th style="padding:10px 12px;text-align:center;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.12em;color:var(--text3);text-transform:uppercase;width:60px">Gaps</th>
      </tr></thead>
      <tbody>
        ${visibleStudents.map((s, si) => {
          const allCodes = getCodesForStudent(s);
          const achieved = allCodes.filter(c => getMasteryForCode(s.id, c.Code) === 'Achieved').length;
          const emerging = allCodes.filter(c => getMasteryForCode(s.id, c.Code) === 'Emerging').length;
          const overallPct = allCodes.length ? Math.round(achieved/allCodes.length*100) : 0;
          const strandCells = allStrands.map(strand => {
            const sc = allCodes.filter(c => c.Strand === strand);
            const sa = sc.filter(c => getMasteryForCode(s.id, c.Code) === 'Achieved').length;
            const pct = sc.length ? Math.round(sa/sc.length*100) : 0;
            return `<td style="padding:8px 12px;text-align:center;border-bottom:1px solid var(--border);cursor:pointer" onclick="openStudentDetail('${s.id}')">
              <div style="display:inline-flex;flex-direction:column;align-items:center;gap:3px">
                <div style="width:44px;height:44px;border-radius:50%;background:${masteryBg(pct)};border:2px solid ${masteryColour(pct)};display:flex;align-items:center;justify-content:center;font-family:'DM Mono',monospace;font-size:11px;font-weight:600;color:${masteryColour(pct)}">${sc.length ? pct+'%' : '—'}</div>
                <div style="font-family:'DM Mono',monospace;font-size:8px;color:var(--text3)">${sa}/${sc.length}</div>
              </div>
            </td>`;
          }).join('');
          return `<tr style="border-bottom:1px solid var(--border);${si%2===1?'background:rgba(255,255,255,0.02)':''}">
            <td style="padding:10px 16px;position:sticky;left:0;background:${si%2===1?'#1c2030':'var(--surface)'};z-index:1;cursor:pointer" onclick="openStudentDetail('${s.id}')">
              <div style="display:flex;align-items:center;gap:10px">
                <div class="sc-avatar ${getAvClass(si)}" style="width:30px;height:30px;font-size:12px;flex-shrink:0">${getInitials(s)}</div>
                <div>
                  <div style="font-size:13px;font-weight:600;color:var(--text)">${s.last_name}, ${s.first_name}</div>
                  <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3)">Yr ${normaliseYear(s.year_level)} · ${allCodes.length} codes</div>
                </div>
              </div>
            </td>
            <td style="padding:8px 12px;text-align:center;border-bottom:1px solid var(--border)">
              <div style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700;color:${masteryColour(overallPct)}">${overallPct}%</div>
              <div style="margin-top:4px;height:4px;background:var(--surface2);border-radius:2px;width:52px;margin-inline:auto;overflow:hidden"><div style="height:100%;width:${overallPct}%;background:${masteryColour(overallPct)};border-radius:2px"></div></div>
            </td>
            ${strandCells}
            <td style="padding:8px 12px;text-align:center;border-bottom:1px solid var(--border)">
              ${emerging > 0 ? `<span style="font-family:'DM Mono',monospace;font-size:12px;font-weight:700;color:var(--rust)">${emerging}</span>` : `<span style="color:var(--text3);font-size:11px">—</span>`}
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
    <div style="display:flex;gap:16px;padding:12px 16px;border-top:1px solid var(--border);flex-wrap:wrap">
      <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;color:var(--text3);margin-right:4px;align-self:center">Legend</div>
      ${[['≥80%','var(--green)','var(--green-dim)'],['50–79%','var(--gold)','var(--gold-dim)'],['1–49%','var(--rust)','var(--rust-dim)'],['Not assessed','var(--border2)','var(--surface2)']].map(([label,col,bg]) => `
        <div style="display:flex;align-items:center;gap:6px"><div style="width:14px;height:14px;border-radius:50%;background:${bg};border:2px solid ${col}"></div><span style="font-size:11px;color:var(--text3)">${label}</span></div>
      `).join('')}
      <div style="margin-left:auto;font-size:11px;color:var(--text3)">Click any cell or name to open student profile · Click strand header to filter</div>
    </div>`;
  }

  const subjectShort = s => s==='Health and Physical Education'?'HPE':s==='Design and Technologies'?'D&T':s==='Digital Technologies'?'DigiTech':s;

  main.innerHTML = `
    <div class="topbar" style="flex-wrap:wrap;gap:8px">
      <div class="topbar-title">Class Overview <span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--text3);font-weight:400">· ${ovf.subject}</span></div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-left:auto">
        <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3)">SUBJECT</span>
        ${availableSubjects.map(subj => {
          const active = ovf.subject === subj;
          return `<button onclick="state.overviewFilter.subject='${subj}';state.overviewFilter.strand='all';renderClassOverview(document.getElementById('main-content'))"
            style="padding:4px 10px;border-radius:4px;border:1px solid ${active?'var(--gold)':'var(--border2)'};background:${active?'var(--gold-dim)':'none'};color:${active?'var(--gold)':'var(--text3)'};font-family:'DM Mono',monospace;font-size:10px;cursor:pointer;white-space:nowrap">
            ${subjectShort(subj)}
          </button>`;
        }).join('')}
        <div style="width:1px;height:18px;background:var(--border2);margin:0 2px"></div>
        <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3)">YEAR</span>
        ${['all','F','1','2','3','4','5','6'].map(yr => `
          <button onclick="state.overviewFilter.year='${yr}';renderClassOverview(document.getElementById('main-content'))"
            style="padding:4px 10px;border-radius:4px;border:1px solid ${ovf.year===yr?'var(--blue)':'var(--border2)'};background:${ovf.year===yr?'var(--blue-dim)':'none'};color:${ovf.year===yr?'var(--blue)':'var(--text3)'};font-family:'DM Mono',monospace;font-size:10px;cursor:pointer">
            ${yr === 'all' ? 'All' : 'Yr '+yr}
          </button>`).join('')}
        ${ovf.strand !== 'all' ? `<button onclick="state.overviewFilter.strand='all';renderClassOverview(document.getElementById('main-content'))" style="padding:4px 10px;border-radius:4px;border:1px solid var(--teal);background:var(--teal-dim);color:var(--teal);font-family:'DM Mono',monospace;font-size:10px;cursor:pointer">✕ ${ovf.strand}</button>` : ''}
        <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3)">${APP_VERSION}</span>
      </div>
    </div>
    <div class="content" style="padding:0">
      <div class="card" style="border-radius:0;border-left:none;border-right:none;border-top:none">
        ${state.curriculumCodes.length === 0
          ? `<div class="empty-state" style="padding:60px"><div class="empty-icon">▦</div><div class="empty-title">Curriculum data not loaded yet</div><div class="empty-sub">The overview will appear once your CSV files have loaded</div></div>`
          : buildStrandGrid()}
      </div>
    </div>
  `;
}

// ── STUDENTS LIST ──
function renderStudents(main) {
  main.innerHTML = `
    <div class="topbar">
      <div class="topbar-title">Students</div>
      <div class="topbar-actions">
        <div class="search-wrap">
          <span class="search-icon">⌕</span>
          <input class="search-input" placeholder="Search students…" oninput="filterStudents(this.value)" id="student-search">
        </div>
        <button class="btn" onclick="openBulkPrintModal()">⎙ Bulk Print Reports</button>
        <button class="btn btn-primary" onclick="openAddStudentModal()">+ Add Student</button>
      </div>
    </div>
    <div class="content">
      ${state.students.length === 0
        ? `<div class="empty-state" style="padding:80px"><div class="empty-icon">◎</div><div class="empty-title">No students yet</div><div class="empty-sub">Add your first student to start tracking progress.</div><button class="btn btn-primary" style="margin-top:12px" onclick="openAddStudentModal()">+ Add Student</button></div>`
        : `<div class="student-grid" id="student-grid">${renderStudentCards(state.students)}</div>`}
    </div>
  `;
}

function renderStudentCards(students) {
  return students.map((s, i) => {
    const stats = getProgressStats(s.id);
    return `<div class="student-card" onclick="openStudentDetail('${s.id}')">
      <div class="sc-top">
        <div class="sc-avatar ${getAvClass(i)}">${getInitials(s)}</div>
        <div><div class="sc-name">${s.first_name} ${s.last_name}</div><div class="sc-year">Year ${s.year_level}</div></div>
      </div>
      <div class="sc-bars">
        <div class="sc-bar-row"><div class="sc-bar-label">Achieved</div><div class="sc-bar-track"><div class="sc-bar-fill bar-green" style="width:${stats.total ? Math.round(stats.achieved/stats.total*100) : 0}%"></div></div><div class="sc-bar-pct">${stats.achieved}</div></div>
        <div class="sc-bar-row"><div class="sc-bar-label">Developing</div><div class="sc-bar-track"><div class="sc-bar-fill bar-gold" style="width:${stats.total ? Math.round(stats.developing/stats.total*100) : 0}%"></div></div><div class="sc-bar-pct">${stats.developing}</div></div>
        <div class="sc-bar-row"><div class="sc-bar-label">Emerging</div><div class="sc-bar-track"><div class="sc-bar-fill" style="width:${stats.total ? Math.round(stats.emerging/stats.total*100) : 0}%;background:var(--rust)"></div></div><div class="sc-bar-pct">${stats.emerging}</div></div>
      </div>
    </div>`;
  }).join('');
}

function filterStudents(q) {
  const grid = document.getElementById('student-grid');
  if (!grid) return;
  const filtered = state.students.filter(s => `${s.first_name} ${s.last_name}`.toLowerCase().includes(q.toLowerCase()));
  grid.innerHTML = renderStudentCards(filtered);
}

// ── STUDENT DETAIL ──
function openStudentDetail(studentId) {
  state.selectedStudent = studentId;
  state.currentView = 'student-detail';
  state.detailFilter = 'all';
  const student = state.students.find(x => x.id === studentId);
  state.detailYearFilter = student ? student.year_level : 'all';
  // Auto-select first available subject if not yet set
  if (!state.detailSubjectFilter) {
    const subjects = [...new Set(state.curriculumCodes.map(c => c.Subject).filter(Boolean))].sort();
    state.detailSubjectFilter = subjects[0] || 'English';
  }
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  renderView();
}

function setDetailYearFilter(year) { state.detailYearFilter = year; renderView(); }
function setDetailSubject(subj)    { state.detailSubjectFilter = subj; state.detailFilter = 'all'; renderView(); }

function renderStudentDetail(main) {
  const s = state.students.find(x => x.id === state.selectedStudent);
  if (!s) { showView('students'); return; }

  const si = state.students.indexOf(s);
  const filter = state.detailFilter || 'all';

  const yearLevelMap = { 'F':'Foundation','1':'Year 1','2':'Year 2','3':'Year 3','4':'Year 4','5':'Year 5','6':'Year 6' };
  const yearFilter = state.detailYearFilter !== undefined ? state.detailYearFilter : s.year_level;

  // All subjects available in the curriculum data
  const availableSubjects = [...new Set(state.curriculumCodes.map(c => c.Subject).filter(Boolean))].sort();
  const subjectFilter = state.detailSubjectFilter || (availableSubjects[0] || 'English');

  // Subject colour map for the tab pills
  const subjectColours = {
    'English':                    'var(--blue)',
    'Mathematics':                'var(--green)',
    'Science':                    'var(--teal)',
    'HASS':                       'var(--gold)',
    'Health and Physical Education': 'var(--rust)',
    'Design and Technologies':    'var(--purple)',
    'Digital Technologies':       'var(--purple)',
  };
  const subjectShort = subj => subj === 'Health and Physical Education' ? 'HPE'
    : subj === 'Design and Technologies' ? 'D&T'
    : subj === 'Digital Technologies' ? 'DigiTech' : subj;

  // Filter codes by selected subject + year
  let codes = state.curriculumCodes.filter(c => {
    if (c.Subject !== subjectFilter) return false;
    if (!yearFilter || yearFilter === 'all') return true;
    const csvYear = yearLevelMap[yearFilter] || yearFilter;
    return (c['Year Level'] || '').trim() === csvYear;
  });

  const filteredCodes = codes.filter(c => {
    const mastery = getMasteryForCode(s.id, c.Code);
    const taught  = wasCodeTaughtToStudent(s.id, c.Code);
    if (filter === 'all')        return true;
    if (filter === 'achieved')   return mastery === 'Achieved';
    if (filter === 'developing') return mastery === 'Developing';
    if (filter === 'emerging')   return mastery === 'Emerging';
    if (filter === 'nottaught')  return mastery === 'Not taught';
    if (filter === 'taught')     return taught;
    if (filter === 'nottaughtyet') return !taught;
    return true;
  });

  const taughtCount    = codes.filter(c => wasCodeTaughtToStudent(s.id, c.Code)).length;
  const notTaughtCount = codes.length - taughtCount;

  const stats = {
    achieved:   codes.filter(c => getMasteryForCode(s.id, c.Code) === 'Achieved').length,
    developing: codes.filter(c => getMasteryForCode(s.id, c.Code) === 'Developing').length,
    emerging:   codes.filter(c => getMasteryForCode(s.id, c.Code) === 'Emerging').length,
    nottaught:  codes.filter(c => getMasteryForCode(s.id, c.Code) === 'Not taught').length,
  };

  const activeCol = subjectColours[subjectFilter] || 'var(--blue)';

  main.innerHTML = `
    <div class="detail-header" style="flex-wrap:wrap;gap:12px">
      <button class="btn" onclick="showView('students')" style="margin-right:4px">← Back</button>
      <div class="detail-avatar ${getAvClass(si)}">${getInitials(s)}</div>
      <div>
        <div class="detail-name">${s.first_name} ${s.last_name}</div>
        <div class="detail-meta">Year ${s.year_level} · ${subjectFilter} · ${codes.length} codes</div>
      </div>

      <!-- Subject tabs -->
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:var(--text3)">Subject</span>
        ${availableSubjects.map(subj => {
          const col = subjectColours[subj] || 'var(--blue)';
          const active = subjectFilter === subj;
          return `<button onclick="setDetailSubject('${subj}')"
            style="padding:4px 10px;border-radius:4px;border:1px solid ${active?col:'var(--border2)'};background:${active?col+'22':'none'};color:${active?col:'var(--text3)'};font-family:'DM Mono',monospace;font-size:10px;cursor:pointer;transition:all 0.15s;font-weight:${active?'700':'400'}">
            ${subjectShort(subj)}
          </button>`;
        }).join('')}
      </div>

      <!-- Year level toggle -->
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:var(--text3)">Year</span>
        ${['all','F','1','2','3','4','5','6'].map(yr => `
          <button onclick="setDetailYearFilter('${yr}')"
            style="padding:4px 10px;border-radius:4px;border:1px solid ${yearFilter===yr||(!yearFilter&&yr==='all')?'var(--blue)':'var(--border2)'};
            background:${yearFilter===yr||(!yearFilter&&yr==='all')?'var(--blue-dim)':'none'};
            color:${yearFilter===yr||(!yearFilter&&yr==='all')?'var(--blue)':'var(--text3)'};
            font-family:'DM Mono',monospace;font-size:10px;cursor:pointer;transition:all 0.15s;
            font-weight:${yr===s.year_level?'700':'400'}">
            ${yr === 'all' ? 'All' : yr}${yr === s.year_level ? ' ★' : ''}
          </button>`).join('')}
      </div>

      <div style="display:flex;gap:8px;flex-shrink:0">
        <button class="btn" onclick="openBulkPrintModal()">⎙ Bulk Print</button>
        <button class="btn" onclick="openPrintOptionsModal('${s.id}')">⎙ Print Report</button>
        <button class="btn btn-primary" onclick="openBulkAssess('${s.id}')">+ Record Assessment</button>
      </div>
    </div>

    <div class="content">
      <div class="mastery-tabs" style="flex-wrap:wrap">
        <button class="mastery-tab t-all ${filter==='all'?'active':''}" onclick="setDetailFilter('all')">All <span class="tab-count">${codes.length}</span></button>
        <button class="mastery-tab t-achieved ${filter==='achieved'?'active':''}" onclick="setDetailFilter('achieved')">● Achieved <span class="tab-count">${stats.achieved}</span></button>
        <button class="mastery-tab t-developing ${filter==='developing'?'active':''}" onclick="setDetailFilter('developing')">◐ Developing <span class="tab-count">${stats.developing}</span></button>
        <button class="mastery-tab t-emerging ${filter==='emerging'?'active':''}" onclick="setDetailFilter('emerging')">○ Emerging <span class="tab-count">${stats.emerging}</span></button>
        <button class="mastery-tab t-nottaught ${filter==='nottaught'?'active':''}" onclick="setDetailFilter('nottaught')">· Not assessed <span class="tab-count">${stats.nottaught}</span></button>
        <div style="width:1px;background:var(--border2);margin:0 4px;align-self:stretch"></div>
        <button class="mastery-tab ${filter==='taught'?'active t-all':''}" onclick="setDetailFilter('taught')"
          style="${filter==='taught'?'color:var(--green);border-color:var(--green);background:var(--green-dim)':''}">
          ✓ Taught <span class="tab-count">${taughtCount}</span>
        </button>
        <button class="mastery-tab ${filter==='nottaughtyet'?'active':''}" onclick="setDetailFilter('nottaughtyet')"
          style="${filter==='nottaughtyet'?'color:var(--rust);border-color:var(--rust);background:var(--rust-dim)':''}">
          ✗ Not taught yet <span class="tab-count">${notTaughtCount}</span>
        </button>
      </div>

      <div class="card">
        ${filteredCodes.length === 0
          ? `<div class="empty-state" style="padding:40px"><div class="empty-icon">◈</div><div class="empty-title">No codes in this filter</div>${codes.length === 0 ? '<div class="empty-sub">No '+subjectFilter+' codes loaded for this year level</div>' : ''}</div>`
          : `<table class="codes-table">
              <thead><tr><th>Code</th><th>Learning Outcome</th><th>Strand</th><th>Taught</th><th>Mastery</th><th>Date</th></tr></thead>
              <tbody>
                ${filteredCodes.map(c => {
                  const mastery = getMasteryForCode(s.id, c.Code);
                  const prog = state.progress.find(p => p.student_id === s.id && p.code === c.Code);
                  const date = prog ? prog.date.split('T')[0] : '—';
                  const taught = wasCodeTaughtToStudent(s.id, c.Code);
                  const taughtDates = getTaughtDatesForCode(s.id, c.Code);
                  return `<tr style="cursor:pointer" onclick="openCodeDetail('${c.Code}','${s.id}')">
                    <td><span class="code-pill" style="background:var(--surface2);color:${activeCol}">${c.Code}</span></td>
                    <td style="max-width:300px;color:var(--text2)">${c.Descriptor || c.Aspect || '—'}</td>
                    <td><span class="aspect-tag">${c.Strand || '—'}</span></td>
                    <td onclick="event.stopPropagation()" style="white-space:nowrap">
                      ${taught
                        ? `<span title="Last taught: ${taughtDates[0]}" style="font-size:11px;color:var(--green);background:var(--green-dim);padding:2px 8px;border-radius:10px;cursor:default">✓ Taught</span>`
                        : `<span style="font-size:11px;color:var(--text3)">— Not yet</span>`}
                    </td>
                    <td onclick="event.stopPropagation()">
                      <div class="mastery-badge ${masteryClass(mastery)}" onclick="openMasteryPicker('${s.id}','${c.Code}','${mastery}')">
                        ${masteryDot(mastery)} ${mastery}
                      </div>
                    </td>
                    <td style="font-family:'DM Mono',monospace;font-size:10px;color:var(--text3)">${date}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>`}
      </div>
    </div>
  `;
}

function setDetailFilter(f) { state.detailFilter = f; renderView(); }

// ── CURRICULUM CODES VIEW ──
let cdFilters = { subject: 'English', year: 'all', strand: 'all', sort: 'code', search: '' };

function getFilteredCurriculumCodes() {
  const yearOrder = ['Foundation','Year 1','Year 2','Year 3','Year 4','Year 5','Year 6'];
  let codes = state.curriculumCodes.filter(c => {
    if (cdFilters.subject !== 'all' && (c.Subject||'').trim() !== cdFilters.subject) return false;
    if (cdFilters.year    !== 'all' && (c['Year Level']||'').trim() !== cdFilters.year) return false;
    if (cdFilters.strand  !== 'all' && (c.Strand||'').trim() !== cdFilters.strand) return false;
    const q = cdFilters.search.toLowerCase();
    if (q && !((c.Code||'').toLowerCase().includes(q)||(c.Descriptor||'').toLowerCase().includes(q)||(c.Strand||'').toLowerCase().includes(q))) return false;
    return true;
  });
  codes.sort((a,b) => {
    if (cdFilters.sort === 'year')   { const ai=yearOrder.indexOf(a['Year Level']),bi=yearOrder.indexOf(b['Year Level']); return ai!==bi?ai-bi:(a.Code||'').localeCompare(b.Code||''); }
    if (cdFilters.sort === 'strand') return (a.Strand||'').localeCompare(b.Strand||'')||(a.Code||'').localeCompare(b.Code||'');
    return (a.Code||'').localeCompare(b.Code||'');
  });
  return codes;
}

function renderCurriculum(main) {
  const allCodes = state.curriculumCodes;
  const codes    = getFilteredCurriculumCodes();
  const subjects = ['all', ...new Set(allCodes.map(c => c.Subject).filter(Boolean))].sort();
  const years    = ['all','Foundation','Year 1','Year 2','Year 3','Year 4','Year 5','Year 6'];
  const strands  = ['all', ...new Set(allCodes.filter(c => cdFilters.subject === 'all' || c.Subject === cdFilters.subject).map(c => c.Strand).filter(Boolean))].sort();

  function sel(opts, val, onchange) {
    return `<select onchange="${onchange}" style="background:var(--surface2);border:1px solid var(--border2);border-radius:5px;padding:5px 8px;color:var(--text2);font-size:12px;cursor:pointer;outline:none">
      ${opts.map(o => `<option value="${o}" ${val===o?'selected':''}>${o==='all'?'All':o}</option>`).join('')}
    </select>`;
  }

  main.innerHTML = `
    <div class="topbar" style="flex-wrap:wrap;gap:8px">
      <div class="topbar-title">Curriculum Codes</div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-left:auto">
        <div class="search-wrap"><span class="search-icon">⌕</span><input class="search-input" placeholder="Search…" value="${cdFilters.search}" oninput="cdFilters.search=this.value;renderCurriculum(document.getElementById('main-content'))"></div>
        <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3)">SUBJECT</span>
        ${sel(subjects, cdFilters.subject, "cdFilters.subject=this.value;cdFilters.strand='all';renderCurriculum(document.getElementById('main-content'))")}
        <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3)">YEAR</span>
        ${sel(years, cdFilters.year, "cdFilters.year=this.value;renderCurriculum(document.getElementById('main-content'))")}
        <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3)">STRAND</span>
        ${sel(strands, cdFilters.strand, "cdFilters.strand=this.value;renderCurriculum(document.getElementById('main-content'))")}
        <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3)">SORT</span>
        ${sel(['code','year','strand'], cdFilters.sort, "cdFilters.sort=this.value;renderCurriculum(document.getElementById('main-content'))")}
      </div>
    </div>
    <div class="content">
      ${allCodes.length === 0
        ? `<div class="empty-state"><div class="empty-icon">≡</div><div class="empty-title">No curriculum data loaded</div><div class="empty-sub">Use the sidebar to load your CSV</div></div>`
        : `<div class="card">
            <div class="card-head" style="padding:10px 18px">
              <div style="font-size:13px;color:var(--text2)">Showing <strong style="color:var(--text)">${codes.length}</strong> of ${allCodes.length} codes</div>
              ${codes.length !== allCodes.length ? `<button class="btn" onclick="cdFilters={subject:'English',year:'all',strand:'all',sort:'code',search:''};renderCurriculum(document.getElementById('main-content'))">✕ Clear filters</button>` : ''}
            </div>
            <div style="overflow-x:auto">
              <table class="codes-table" style="table-layout:fixed;width:100%">
                <colgroup><col style="width:130px"><col style="width:auto"><col style="width:140px"><col style="width:110px"></colgroup>
                <thead><tr>
                  <th style="cursor:pointer" onclick="cdFilters.sort='code';renderCurriculum(document.getElementById('main-content'))">Code ${cdFilters.sort==='code'?'↑':''}</th>
                  <th>Descriptor</th>
                  <th style="cursor:pointer" onclick="cdFilters.sort='strand';renderCurriculum(document.getElementById('main-content'))">Strand ${cdFilters.sort==='strand'?'↑':''}</th>
                  <th style="cursor:pointer" onclick="cdFilters.sort='year';renderCurriculum(document.getElementById('main-content'))">Year ${cdFilters.sort==='year'?'↑':''}</th>
                </tr></thead>
                <tbody>
                  ${codes.length === 0
                    ? `<tr><td colspan="4" style="text-align:center;padding:40px;color:var(--text3)">No codes match your filters</td></tr>`
                    : codes.map(c => `<tr style="cursor:pointer" onclick="openCodeDetail('${c.Code}',null)">
                        <td><span class="code-pill" style="background:var(--blue-dim);color:var(--blue);font-size:11px">${c.Code}</span></td>
                        <td style="color:var(--text2);font-size:12px;line-height:1.4;padding-right:12px">${c.Descriptor||c.Aspect||'—'}</td>
                        <td><span style="font-family:'DM Mono',monospace;font-size:9px;padding:2px 6px;border-radius:3px;background:var(--surface2);color:var(--text3);white-space:nowrap">${c.Strand||'—'}</span></td>
                        <td style="font-family:'DM Mono',monospace;font-size:10px;color:var(--text3)">${c['Year Level']||'—'}</td>
                      </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>`}
    </div>
  `;
}

// ── STANDARDS VIEW ──
function renderStandards(main) {
  const stds = state.standards;
  const allYearOrder = ['Foundation','Year 1','Year 2','Year 3','Year 4','Year 5','Year 6'];
  if (!state.standardsFilter) state.standardsFilter = { subject: 'English', year: 'all' };
  const sf = state.standardsFilter;
  const availableSubjects = [...new Set(stds.map(s => s.Subject).filter(Boolean))].sort();
  const subjectShort = s => s==='Health and Physical Education'?'HPE':s==='Design and Technologies'?'D&T':s==='Digital Technologies'?'DigiTech':s;
  const filteredBySubject = stds.filter(s => s.Subject === sf.subject);
  const years = allYearOrder.filter(y => filteredBySubject.some(s => s['Year Level'] === y));
  const visibleStds = filteredBySubject.filter(s => sf.year === 'all' || s['Year Level'] === sf.year);

  main.innerHTML = `
    <div class="topbar" style="flex-wrap:wrap;gap:8px">
      <div class="topbar-title">Achievement Standards <span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--text3);font-weight:400">· ${sf.subject}</span></div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-left:auto">
        <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3)">SUBJECT</span>
        ${availableSubjects.map(subj => `<button onclick="state.standardsFilter.subject='${subj}';state.standardsFilter.year='all';renderStandards(document.getElementById('main-content'))" style="padding:4px 10px;border-radius:4px;border:1px solid ${sf.subject===subj?'var(--gold)':'var(--border2)'};background:${sf.subject===subj?'var(--gold-dim)':'none'};color:${sf.subject===subj?'var(--gold)':'var(--text3)'};font-family:'DM Mono',monospace;font-size:10px;cursor:pointer;white-space:nowrap">${subjectShort(subj)}</button>`).join('')}
        <div style="width:1px;height:18px;background:var(--border2);margin:0 2px"></div>
        <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3)">YEAR</span>
        ${['all',...years].map(y => `<button onclick="state.standardsFilter.year='${y}';renderStandards(document.getElementById('main-content'))" style="padding:4px 10px;border-radius:4px;border:1px solid ${sf.year===y?'var(--blue)':'var(--border2)'};background:${sf.year===y?'var(--blue-dim)':'none'};color:${sf.year===y?'var(--blue)':'var(--text3)'};font-family:'DM Mono',monospace;font-size:10px;cursor:pointer">${y==='all'?'All':y}</button>`).join('')}
      </div>
    </div>
    <div class="content">
      ${stds.length === 0
        ? `<div class="empty-state"><div class="empty-icon">◇</div><div class="empty-title">No standards data loaded</div><div class="empty-sub">Use the sidebar to load your CSV</div></div>`
        : `<div class="card">
            <div class="card-head" style="padding:10px 18px"><div style="font-size:13px;color:var(--text2)">Showing <strong style="color:var(--text)">${visibleStds.length}</strong> of ${filteredBySubject.length} ${sf.subject} standards</div></div>
            <table class="codes-table" style="table-layout:fixed;width:100%">
              <colgroup><col style="width:150px"><col style="width:auto"><col style="width:110px"></colgroup>
              <thead><tr><th>Standard ID</th><th>Standard Text</th><th>Year</th></tr></thead>
              <tbody>
                ${visibleStds.length === 0
                  ? `<tr><td colspan="3" style="text-align:center;padding:30px;color:var(--text3)">No standards for this filter</td></tr>`
                  : visibleStds.map(s => `<tr>
                      <td><span class="code-pill" style="background:var(--gold-dim);color:var(--gold);font-size:10px">${s['Achievement Standard ID']||'—'}</span></td>
                      <td style="color:var(--text2);font-size:12px;line-height:1.4;padding-right:12px">${s['Standard Text']||'—'}</td>
                      <td style="font-family:'DM Mono',monospace;font-size:10px;color:var(--text3)">${s['Year Level']||'—'}</td>
                    </tr>`).join('')}
              </tbody>
            </table>
          </div>`}
    </div>
  `;
}

// ── PROGRESSIONS VIEW ──
function renderProgressions(main) {
  if (!state.progressionType) state.progressionType = 'literacy';
  const progType = state.progressionType;
  const progs = progType === 'numeracy' ? state.numeracyProgressions : state.progressions;
  const elements = [...new Set(progs.map(p => p.Element))].filter(Boolean);
  const activeElem = state.progressionFilter || (elements[0] || '');
  const typeLabel = progType === 'numeracy' ? 'Numeracy · Mathematics' : 'Literacy · English';

  const elemButtons = elements.map(elem => {
    const active = activeElem === elem ? 'active t-all' : '';
    const safeElem = elem.replace(/'/g, "\\'");
    return `<button class="mastery-tab ${active}" onclick="setProgressionFilter('${safeElem}')">${elem}</button>`;
  }).join('');

  main.innerHTML = `
    <div class="topbar" style="flex-wrap:wrap;gap:8px">
      <div class="topbar-title">Progressions <span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--text3);font-weight:400">· ${typeLabel}</span></div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-left:auto">
        <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3)">TYPE</span>
        <button onclick="state.progressionType='literacy';state.progressionFilter='';renderProgressions(document.getElementById('main-content'))" style="padding:4px 12px;border-radius:4px;border:1px solid ${progType==='literacy'?'var(--blue)':'var(--border2)'};background:${progType==='literacy'?'var(--blue-dim)':'none'};color:${progType==='literacy'?'var(--blue)':'var(--text3)'};font-family:'DM Mono',monospace;font-size:10px;cursor:pointer">✦ Literacy</button>
        <button onclick="state.progressionType='numeracy';state.progressionFilter='';renderProgressions(document.getElementById('main-content'))" style="padding:4px 12px;border-radius:4px;border:1px solid ${progType==='numeracy'?'var(--green)':'var(--border2)'};background:${progType==='numeracy'?'var(--green-dim)':'none'};color:${progType==='numeracy'?'var(--green)':'var(--text3)'};font-family:'DM Mono',monospace;font-size:10px;cursor:pointer">∑ Numeracy</button>
        <div style="width:1px;height:18px;background:var(--border2);margin:0 2px"></div>
        <div class="search-wrap"><span class="search-icon">⌕</span><input class="search-input" placeholder="Search indicators…" oninput="filterProgressions(this.value)" style="width:180px"></div>
      </div>
    </div>
    <div class="content">
      ${progs.length === 0
        ? `<div class="empty-state"><div class="empty-icon">⟡</div><div class="empty-title">No ${progType} progressions loaded</div><div class="empty-sub">Load your ${progType === 'numeracy' ? 'Numeracy' : 'Literacy'} Progressions CSV using the sidebar button</div></div>`
        : `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">${elemButtons}</div>
           <div id="prog-content">${renderProgressionContent(progs, activeElem)}</div>`}
    </div>
  `;
}

function renderProgressionContent(progs, activeElem) {
  const filtered = activeElem ? progs.filter(p => p.Element === activeElem) : progs;
  const subElements = [...new Set(filtered.map(p => p['Sub-element']))].filter(Boolean);
  return subElements.map(sub => {
    const items = filtered.filter(p => p['Sub-element'] === sub);
    const levels = [...new Set(items.map(p => p['Progression level']))].filter(Boolean).sort();
    return `<div class="card" style="margin-bottom:16px">
      <div class="card-head"><div class="card-title">${sub}</div><span style="font-family:'DM Mono',monospace;font-size:10px;color:var(--text3)">${items.length} indicators · ${levels.length} levels</span></div>
      <div style="padding:8px 0">
        ${items.map(item => `<div style="display:flex;gap:10px;padding:8px 18px;border-bottom:1px solid var(--border);align-items:flex-start">
          <span class="pp-level">L${item['Progression level']||'?'}</span>
          <div style="flex:1">
            <div style="font-size:12px;color:var(--text2);line-height:1.5">${item['Indicator text (no examples)']||item['Indicator text (verbatim)']||'—'}</div>
            ${item['Example / elaboration'] ? `<div style="font-size:11px;color:var(--text3);margin-top:3px;font-style:italic">${item['Example / elaboration']}</div>` : ''}
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:5px">
              ${['Foundation','Year 1','Year 2','Year 3','Year 4','Year 5','Year 6'].map(yr => {
                const val = item['Relevant – '+yr];
                return val && val.trim() ? `<span style="font-family:'DM Mono',monospace;font-size:8px;padding:1px 5px;border-radius:3px;background:var(--surface2);color:var(--text3)">${yr}</span>` : '';
              }).join('')}
            </div>
          </div>
          <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);flex-shrink:0">${item['Indicator ID']||''}</span>
        </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

function setProgressionFilter(elem) { state.progressionFilter = elem; renderView(); }

function filterProgressions(q) {
  const content = document.getElementById('prog-content');
  if (!content) return;
  const activeProgs = state.progressionType === 'numeracy' ? state.numeracyProgressions : state.progressions;
  if (!q) { content.innerHTML = renderProgressionContent(activeProgs, state.progressionFilter || ''); return; }
  const filtered = activeProgs.filter(p =>
    (p['Indicator text (no examples)']||'').toLowerCase().includes(q.toLowerCase()) ||
    (p['Indicator text (verbatim)']||'').toLowerCase().includes(q.toLowerCase()) ||
    (p['Sub-element']||'').toLowerCase().includes(q.toLowerCase())
  );
  content.innerHTML = renderProgressionContent(filtered, '');
}

// ── CODE DETAIL LOOKUP ──
function getCodeDetails(code) {
  const cd = state.curriculumCodes.find(c => c.Code === code) || {};
  const linkedIds = (cd['Linked Achievement IDs']||cd['Linked Aspect IDs']||'').split(',').map(s=>s.trim()).filter(Boolean);
  const linkedStandards = linkedIds.map(id => state.standards.find(s => (s['Achievement Standard ID']||s['Aspect ID']||'').trim() === id)).filter(Boolean);
  const strand = (cd.Strand||'').toLowerCase();
  const subStrand = (cd['Sub-strand']||'').toLowerCase();
  const relatedProgressions = [];
  state.progressions.forEach(p => {
    const elem = (p['Element']||'').toLowerCase();
    const subEl = (p['Sub-element']||'').toLowerCase();
    const match = (strand && elem.includes(strand.substring(0,5))) || (subStrand && subEl.includes(subStrand.substring(0,5))) || (strand.includes('literacy')&&elem.includes('literacy')) || (strand.includes('language')&&elem.includes('language'));
    if (match && !relatedProgressions.find(x => x['Indicator ID'] === p['Indicator ID'])) relatedProgressions.push(p);
  });
  return { cd, linkedStandards, relatedProgressions: relatedProgressions.slice(0,8), linkedIds };
}

function openCodeDetail(code, studentId) {
  const { cd, linkedStandards, relatedProgressions, linkedIds } = getCodeDetails(code);
  const mastery = studentId ? getMasteryForCode(studentId, code) : null;
  const prog = studentId ? state.progress.find(p => p.student_id === studentId && p.code === code) : null;

  const existing = document.getElementById('code-detail-panel');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.id = 'code-detail-panel';
  panel.style.cssText = 'position:fixed;top:0;right:0;bottom:0;width:440px;max-width:95vw;background:var(--surface);border-left:1px solid var(--border2);box-shadow:-8px 0 40px rgba(0,0,0,0.4);z-index:90;display:flex;flex-direction:column;animation:slideInRight 0.2s ease;';
  panel.innerHTML = `
    <style>@keyframes slideInRight { from { transform: translateX(30px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }</style>
    <div style="padding:18px 20px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:12px;flex-shrink:0">
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
          <span style="font-family:'DM Mono',monospace;font-size:13px;color:var(--blue)">${code}</span>
          ${cd['Year Level'] ? `<span style="font-family:'DM Mono',monospace;font-size:9px;padding:2px 7px;border-radius:3px;background:var(--surface2);color:var(--text3)">${cd['Year Level']}</span>` : ''}
          ${cd.Strand ? `<span style="font-family:'DM Mono',monospace;font-size:9px;padding:2px 7px;border-radius:3px;background:var(--blue-dim);color:var(--blue)">${cd.Strand}</span>` : ''}
          ${cd['Sub-strand'] ? `<span style="font-family:'DM Mono',monospace;font-size:9px;padding:2px 7px;border-radius:3px;background:var(--surface2);color:var(--text3)">${cd['Sub-strand']}</span>` : ''}
        </div>
        <div style="font-size:13px;color:var(--text2);line-height:1.5">${cd.Descriptor||cd.Aspect||'—'}</div>
      </div>
      <button onclick="document.getElementById('code-detail-panel').remove()" style="background:none;border:none;color:var(--text3);font-size:18px;cursor:pointer;padding:2px;line-height:1;flex-shrink:0">✕</button>
    </div>
    ${studentId ? `
    <div style="padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;background:var(--surface2)">
      <div>
        <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:var(--text3);margin-bottom:5px">Current Mastery</div>
        <div class="mastery-badge ${masteryClass(mastery)}" style="cursor:pointer" onclick="document.getElementById('code-detail-panel').remove();openMasteryPicker('${studentId}','${code}','${mastery}')">
          ${masteryDot(mastery)} ${mastery}
        </div>
      </div>
      <div>
        <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:var(--text3);margin-bottom:5px">Last Assessed</div>
        <div style="font-family:'DM Mono',monospace;font-size:11px;color:var(--text2)">${prog ? prog.date.split('T')[0] : 'Not yet assessed'}</div>
      </div>
      ${prog && prog.notes ? `<div style="max-width:140px"><div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:var(--text3);margin-bottom:5px">Notes</div><div style="font-size:11px;color:var(--text2);line-height:1.4">${prog.notes}</div></div>` : ''}
    </div>` : ''}
    <div style="flex:1;overflow-y:auto;padding:0">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border)">
        <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:var(--text3);margin-bottom:10px">Linked Achievement Standards</div>
        ${linkedIds.length === 0
          ? `<div style="font-size:12px;color:var(--text3)">No linked standards found</div>`
          : linkedIds.map(id => {
              const std = linkedStandards.find(s => (s['Achievement Standard ID']||s['Aspect ID']||'').trim() === id);
              return `<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);align-items:flex-start">
                <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--gold);background:var(--gold-dim);padding:2px 7px;border-radius:3px;flex-shrink:0;margin-top:2px">${id}</span>
                <div>
                  <div style="font-size:12px;color:var(--text2);line-height:1.4">${std ? (std['Standard Text']||std.Aspect||'No text') : 'Standard not found'}</div>
                  ${std ? `<div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);margin-top:3px">${std['Year Level']||''}</div>` : ''}
                </div>
              </div>`;
            }).join('')}
      </div>
      <div style="padding:16px 20px">
        <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:var(--text3);margin-bottom:10px">Related Literacy Progressions</div>
        ${relatedProgressions.length === 0
          ? `<div style="font-size:12px;color:var(--text3)">No related progressions found</div>`
          : relatedProgressions.map(p => `<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);align-items:flex-start">
              <div style="flex-shrink:0"><span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--purple);background:var(--purple-dim);padding:2px 6px;border-radius:3px;display:block;margin-bottom:3px">L${p['Progression level']||'?'}</span><span style="font-family:'DM Mono',monospace;font-size:8px;color:var(--text3)">${p['Indicator ID']||''}</span></div>
              <div style="flex:1"><div style="font-size:11px;color:var(--text2);line-height:1.5">${p['Indicator text (no examples)']||p['Indicator text (verbatim)']||'—'}</div><div style="font-size:10px;color:var(--text3);margin-top:2px">${p['Sub-element']||''}</div></div>
            </div>`).join('')}
      </div>
    </div>
    ${studentId ? `
    <div style="padding:14px 20px;border-top:1px solid var(--border);flex-shrink:0">
      <button class="btn btn-primary" style="width:100%" onclick="document.getElementById('code-detail-panel').remove();openMasteryPicker('${studentId}','${code}','${mastery||'Not taught'}')">✏ Update Mastery</button>
    </div>` : ''}
  `;
  document.body.appendChild(panel);
}

// ── CSV LOADERS ──
function markLoaded(iconId, navId) {
  const icon = document.getElementById(iconId);
  const nav  = document.getElementById(navId);
  if (icon) { icon.textContent = '●'; icon.style.color = 'var(--green)'; }
  if (nav)  nav.style.color = 'var(--green)';
}

function loadCurriculumCSV(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    state.curriculumCodes = parseCSV(e.target.result);
    toast(`✓ Loaded ${state.curriculumCodes.length} curriculum codes`, 'success');
    markLoaded('icon-cd', 'nav-load-cd');
    if (state.currentView === 'curriculum') renderView();
  };
  reader.readAsText(file);
}

function loadStandardsCSV(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    state.standards = parseCSV(e.target.result);
    toast(`✓ Loaded ${state.standards.length} achievement standards`, 'success');
    markLoaded('icon-st', 'nav-load-st');
    if (state.currentView === 'standards') renderView();
  };
  reader.readAsText(file);
}

function loadProgressionsCSV(input, type) {
  const progType = type || 'literacy';
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const parsed = parseCSV(e.target.result);
    if (progType === 'numeracy') {
      state.numeracyProgressions = parsed;
      markLoaded('icon-np', 'nav-load-np');
      toast(`✓ Loaded ${parsed.length} numeracy progression indicators`, 'success');
    } else {
      state.progressions = parsed;
      markLoaded('icon-pr', 'nav-load-pr');
      toast(`✓ Loaded ${parsed.length} literacy progression indicators`, 'success');
    }
    if (state.currentView === 'progressions') renderView();
  };
  reader.readAsText(file);
}

function loadLinksCSV(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    state.aspectLinks = parseCSV(e.target.result);
    toast(`✓ Loaded ${state.aspectLinks.length} aspect links`, 'success');
    markLoaded('icon-lk', 'nav-load-lk');
  };
  reader.readAsText(file);
}

// ── MODALS ──
function openAddStudentModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="width:580px;max-width:95vw">
      <div class="modal-head"><div class="modal-title">Add Students</div><button class="modal-close" onclick="closeModal()">✕</button></div>
      <div class="modal-body" style="padding:0">
        <div style="display:flex;border-bottom:1px solid var(--border)">
          <button class="modal-tab active" id="tab-csv" onclick="switchModalTab('csv')" style="flex:1;padding:12px;background:none;border:none;color:var(--blue);font-family:'Instrument Sans',sans-serif;font-size:13px;cursor:pointer;border-bottom:2px solid var(--blue);font-weight:600">📂 Upload CSV</button>
          <button class="modal-tab" id="tab-manual" onclick="switchModalTab('manual')" style="flex:1;padding:12px;background:none;border:none;color:var(--text3);font-family:'Instrument Sans',sans-serif;font-size:13px;cursor:pointer;border-bottom:2px solid transparent">✏️ Add One Student</button>
        </div>
        <div id="modal-tab-csv" style="padding:20px 22px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <div><div style="font-size:13px;color:var(--text2);margin-bottom:4px">Upload a CSV file with your class list.</div><div style="font-size:11px;color:var(--text3)">Columns needed: <span style="font-family:'DM Mono',monospace;color:var(--blue)">first_name, last_name, year_level</span></div></div>
            <button class="btn" onclick="downloadStudentTemplate()" style="flex-shrink:0;margin-left:16px">⬇ Download Template</button>
          </div>
          <div id="csv-dropzone" style="border:2px dashed var(--border2);border-radius:8px;padding:32px;text-align:center;cursor:pointer;transition:all 0.15s;margin-bottom:14px" onclick="document.getElementById('student-csv-input').click()" ondragover="event.preventDefault();this.style.borderColor='var(--blue)';this.style.background='var(--blue-dim)'" ondragleave="this.style.borderColor='var(--border2)';this.style.background='none'" ondrop="handleStudentCSVDrop(event)">
            <div style="font-size:28px;margin-bottom:8px;opacity:0.4">📋</div>
            <div style="font-size:13px;color:var(--text2);margin-bottom:4px">Drop your CSV here or click to browse</div>
            <div style="font-size:11px;color:var(--text3)">Accepts .csv files</div>
            <input type="file" id="student-csv-input" accept=".csv" style="display:none" onchange="handleStudentCSVFile(this)">
          </div>
          <div id="csv-preview" style="display:none">
            <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:var(--text3);margin-bottom:8px" id="csv-preview-label"></div>
            <div style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:6px"><table style="width:100%;border-collapse:collapse" id="csv-preview-table"></table></div>
            <div id="csv-errors" style="margin-top:8px;font-size:11px;color:var(--rust)"></div>
          </div>
        </div>
        <div id="modal-tab-manual" style="padding:20px 22px;display:none">
          <div class="form-row">
            <div class="form-group"><label class="form-label">First Name</label><input class="form-input" id="f-firstname" placeholder="e.g. Alex"></div>
            <div class="form-group"><label class="form-label">Last Name</label><input class="form-input" id="f-lastname" placeholder="e.g. Chen"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Year Level</label>
            <select class="form-select" id="f-year">
              <option value="">Select year level…</option>
              <option value="F">Foundation</option>
              <option value="1">Year 1</option><option value="2">Year 2</option><option value="3">Year 3</option><option value="4">Year 4</option><option value="5">Year 5</option><option value="6">Year 6</option>
            </select>
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="modal-submit-btn" onclick="submitAddStudent()">Add Student</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  state._csvPreviewStudents = [];
}

function switchModalTab(tab) {
  const csvTab = document.getElementById('modal-tab-csv');
  const manualTab = document.getElementById('modal-tab-manual');
  const csvBtn = document.getElementById('tab-csv');
  const manualBtn = document.getElementById('tab-manual');
  const submitBtn = document.getElementById('modal-submit-btn');
  if (tab === 'csv') {
    csvTab.style.display = 'block'; manualTab.style.display = 'none';
    csvBtn.style.color = 'var(--blue)'; csvBtn.style.borderBottom = '2px solid var(--blue)';
    manualBtn.style.color = 'var(--text3)'; manualBtn.style.borderBottom = '2px solid transparent';
    submitBtn.textContent = 'Import Students'; submitBtn.onclick = submitCSVImport;
  } else {
    csvTab.style.display = 'none'; manualTab.style.display = 'block';
    csvBtn.style.color = 'var(--text3)'; csvBtn.style.borderBottom = '2px solid transparent';
    manualBtn.style.color = 'var(--blue)'; manualBtn.style.borderBottom = '2px solid var(--blue)';
    submitBtn.textContent = 'Add Student'; submitBtn.onclick = submitAddStudent;
    document.getElementById('f-firstname').focus();
  }
}

function downloadStudentTemplate() {
  const csv = ['first_name,last_name,year_level','Alex,Chen,3','Jamie,Smith,3','Riley,Johnson,4','Morgan,Williams,2'].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'students_template.csv'; a.click();
  URL.revokeObjectURL(url);
  toast('Template downloaded', 'success');
}

function handleStudentCSVDrop(event) {
  event.preventDefault();
  const dz = document.getElementById('csv-dropzone');
  dz.style.borderColor = 'var(--border2)'; dz.style.background = 'none';
  const file = event.dataTransfer.files[0];
  if (file && file.name.endsWith('.csv')) processStudentCSV(file);
  else toast('Please drop a .csv file', 'error');
}

function handleStudentCSVFile(input) { if (input.files[0]) processStudentCSV(input.files[0]); }

function processStudentCSV(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const rows = parseCSV(e.target.result);
    const errors = [], valid = [], yearOptions = ['F','1','2','3','4','5','6'];
    rows.forEach((row, i) => {
      const first = (row['first_name']||row['First Name']||row['firstname']||'').trim();
      const last  = (row['last_name']||row['Last Name']||row['lastname']||row['surname']||'').trim();
      const year  = (row['year_level']||row['Year Level']||row['year']||row['Year']||'').trim();
      if (!first) { errors.push(`Row ${i+2}: missing first_name`); return; }
      if (!last)  { errors.push(`Row ${i+2}: missing last_name`); return; }
      if (!year)  { errors.push(`Row ${i+2}: missing year_level`); return; }
      if (!yearOptions.includes(year)) { errors.push(`Row ${i+2}: year_level "${year}" must be F, 1–6`); return; }
      const exists = state.students.find(s => s.first_name.toLowerCase()===first.toLowerCase() && s.last_name.toLowerCase()===last.toLowerCase());
      if (exists) { errors.push(`Row ${i+2}: ${first} ${last} already exists — skipping`); return; }
      valid.push({ first_name: first, last_name: last, year_level: year });
    });
    state._csvPreviewStudents = valid;
    const preview = document.getElementById('csv-preview');
    const label = document.getElementById('csv-preview-label');
    const table = document.getElementById('csv-preview-table');
    const errDiv = document.getElementById('csv-errors');
    const submitBtn = document.getElementById('modal-submit-btn');
    preview.style.display = 'block';
    label.textContent = `${valid.length} student${valid.length!==1?'s':''} ready to import${errors.length?' · '+errors.length+' skipped':''}`;
    table.innerHTML = `<thead><tr style="background:var(--surface2)"><th style="padding:7px 12px;text-align:left;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.1em;color:var(--text3);text-transform:uppercase">First Name</th><th style="padding:7px 12px;text-align:left;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.1em;color:var(--text3);text-transform:uppercase">Last Name</th><th style="padding:7px 12px;text-align:left;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.1em;color:var(--text3);text-transform:uppercase">Year</th><th style="padding:7px 12px;text-align:left;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.1em;color:var(--text3);text-transform:uppercase">Status</th></tr></thead><tbody>${valid.map(s=>`<tr style="border-top:1px solid var(--border)"><td style="padding:7px 12px;font-size:12px">${s.first_name}</td><td style="padding:7px 12px;font-size:12px">${s.last_name}</td><td style="padding:7px 12px;font-family:'DM Mono',monospace;font-size:11px;color:var(--blue)">${s.year_level}</td><td style="padding:7px 12px"><span style="font-size:10px;color:var(--green)">✓ Ready</span></td></tr>`).join('')}</tbody>`;
    errDiv.innerHTML = errors.length ? errors.map(e=>`<div>⚠ ${e}</div>`).join('') : '';
    submitBtn.textContent = `Import ${valid.length} Student${valid.length!==1?'s':''}`;
    submitBtn.onclick = submitCSVImport;
    const dz = document.getElementById('csv-dropzone');
    dz.innerHTML = `<div style="font-size:13px;color:var(--green)">✓ ${file.name} loaded</div><div style="font-size:11px;color:var(--text3);margin-top:4px">Click to choose a different file</div><input type="file" id="student-csv-input" accept=".csv" style="display:none" onchange="handleStudentCSVFile(this)">`;
  };
  reader.readAsText(file);
}

async function submitCSVImport() {
  const students = state._csvPreviewStudents || [];
  if (!students.length) { toast('No students to import', 'error'); return; }
  closeModal();
  let added = 0;
  for (const s of students) {
    const result = await apiCall('addStudent', s);
    if (result.success) { state.students.push({ id:result.student_id, first_name:s.first_name, last_name:s.last_name, year_level:s.year_level, date_added:new Date().toISOString() }); added++; }
  }
  toast(`✓ Imported ${added} student${added!==1?'s':''}`, 'success');
  renderView();
}

async function submitAddStudent() {
  const first = document.getElementById('f-firstname').value.trim();
  const last  = document.getElementById('f-lastname').value.trim();
  const year  = document.getElementById('f-year').value;
  if (!first || !last || !year) { toast('Please fill in all fields', 'error'); return; }
  closeModal();
  await addStudent({ first_name: first, last_name: last, year_level: year });
}

function openMasteryPicker(studentId, code, currentMastery) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-head"><div class="modal-title">Record Mastery</div><button class="modal-close" onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        <div style="font-family:'DM Mono',monospace;font-size:11px;color:var(--blue);margin-bottom:16px">${code}</div>
        <div class="form-group">
          <label class="form-label">Mastery Level</label>
          <div class="mastery-picker">
            ${['Achieved','Developing','Emerging','Not taught'].map(m => `<button class="mp-option ${currentMastery===m?'selected-'+m.toLowerCase().replace(' ',''):''}" onclick="selectMastery(this,'${m}')" data-mastery="${m}">${masteryDot(m)}<br>${m}</button>`).join('')}
          </div>
        </div>
        <div class="form-group"><label class="form-label">Date Assessed</label><input class="form-input" type="date" id="f-date" value="${new Date().toISOString().split('T')[0]}"></div>
        <div class="form-group"><label class="form-label">Notes (optional)</label><textarea class="form-textarea" id="f-notes" placeholder="Teacher observations…"></textarea></div>
      </div>
      <div class="modal-foot">
        <button class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitMastery('${studentId}','${code}')">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function selectMastery(btn, mastery) {
  document.querySelectorAll('.mp-option').forEach(b => b.className = 'mp-option');
  btn.className = 'mp-option selected-' + mastery.toLowerCase().replace(' ','');
}

async function submitMastery(studentId, code) {
  const selected = document.querySelector('.mp-option[class*="selected-"]');
  if (!selected) { toast('Please select a mastery level', 'error'); return; }
  const mastery = selected.dataset.mastery;
  const date = document.getElementById('f-date').value;
  const notes = document.getElementById('f-notes').value;
  closeModal();
  await saveProgress({ student_id:studentId, content_descriptor_code:code, mastery_level:mastery, date_assessed:date, teacher_notes:notes });
}

function openBulkAssess(studentId) {
  const student = state.students.find(s => s.id === studentId);
  if (!state.bulkAssess) state.bulkAssess = { mode:'by-code', yearFilter:'all', subjectFilter:'English', strandFilter:'all', selectedCode:null, selectedStudent:null, date:new Date().toISOString().split('T')[0], pendingChanges:{} };
  if (student) {
    state.bulkAssess.yearFilter = normaliseYear(student.year_level);
    state.bulkAssess.selectedStudent = studentId;
  }
  showView('bulk-assess');
}

// ── BULK ASSESS HELPERS ──
function setBulkMode(m)    { state.bulkAssess.mode=m; renderBulkAssess(document.getElementById('main-content')); }
function setBulkSubject(s) { state.bulkAssess.subjectFilter=s; state.bulkAssess.strandFilter='all'; renderBulkAssess(document.getElementById('main-content')); }
function setBulkYear(y)    { state.bulkAssess.yearFilter=y; renderBulkAssess(document.getElementById('main-content')); }
function setBulkStrand(s)  { state.bulkAssess.strandFilter=s; renderBulkAssess(document.getElementById('main-content')); }
function setBulkCode(c)    { state.bulkAssess.selectedCode=c; renderBulkAssess(document.getElementById('main-content')); }
function setBulkStudent(s) { state.bulkAssess.selectedStudent=s; renderBulkAssess(document.getElementById('main-content')); }
function setBulkMastery(key, mastery) { state.bulkAssess.pendingChanges[key]=mastery; renderBulkAssess(document.getElementById('main-content')); }
function applyMasteryToAll(code, mastery) {
  const ba = state.bulkAssess;
  state.students.filter(s => ba.yearFilter==='all'||normaliseYear(s.year_level)===ba.yearFilter).forEach(s => { ba.pendingChanges[s.id+'|'+code]=mastery; });
  renderBulkAssess(document.getElementById('main-content'));
}
function discardBulkChanges() { state.bulkAssess.pendingChanges={}; renderBulkAssess(document.getElementById('main-content')); }

document.addEventListener('click', function(e) {
  // ── Coverage filter buttons ──
  const cvEl = e.target.closest('[data-cv-action]');
  if (cvEl) {
    if (!state.coverageFilter) state.coverageFilter = { subject:'English', year:'all', strand:'all', mode:'all' };
    const action = cvEl.dataset.cvAction;
    const value  = cvEl.dataset.cvValue;
    if (action === 'subject') {
      state.coverageFilter.subject = value;
      state.coverageFilter.strand  = 'all'; // reset strand when subject changes
    } else if (action === 'year')   { state.coverageFilter.year   = value; }
    else if (action === 'strand')   { state.coverageFilter.strand = value; }
    else if (action === 'mode')     { state.coverageFilter.mode   = value; }
    showView('coverage');
    return;
  }

  // ── Bulk assess data-ba-fn buttons ──
  const fnEl = e.target.closest('[data-ba-fn]');
  if (fnEl && state.bulkAssess) {
    try { new Function(fnEl.dataset.baFn)(); } catch(err) { console.warn('ba-fn error:', fnEl.dataset.baFn, err); }
    return;
  }
  // ── Bulk assess data-ba-action buttons ──
  const el = e.target.closest('[data-ba-action]');
  if (!el || !state.bulkAssess) return;
  const action = el.dataset.baAction, val = el.dataset.baVal, key = el.dataset.baKey;
  if (action === 'setBulkCode')          setBulkCode(val);
  else if (action === 'setBulkStudent')  setBulkStudent(val);
  else if (action === 'setBulkMastery')  setBulkMastery(key, val);
  else if (action === 'applyMasteryToAll') applyMasteryToAll(key, val);
});

function filterBulkCodeList(q) {
  const list = document.getElementById('ba-code-list');
  if (!list) return;
  const ba = state.bulkAssess;
  const YLM = {'F':'Foundation','1':'Year 1','2':'Year 2','3':'Year 3','4':'Year 4','5':'Year 5','6':'Year 6'};
  const filtered = state.curriculumCodes.filter(c => {
    if (c.Subject !== ba.subjectFilter) return false;
    if (ba.strandFilter !== 'all' && c.Strand !== ba.strandFilter) return false;
    if (ba.yearFilter !== 'all' && (c['Year Level']||'').trim() !== (YLM[ba.yearFilter]||ba.yearFilter)) return false;
    if (q && !(c.Code.toLowerCase().includes(q.toLowerCase())||(c.Descriptor||'').toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });
  list.innerHTML = filtered.map(c => buildCodeListItem(c, ba.selectedCode)).join('');
}

function buildCodeListItem(c, selectedCode) {
  const active = c.Code === selectedCode;
  return `<div data-ba-action="setBulkCode" data-ba-val="${c.Code}" style="padding:8px 14px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;gap:10px;align-items:center;${active?'background:var(--blue-dim);':''}">
    <span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--blue);flex-shrink:0;min-width:110px">${c.Code}</span>
    <span style="font-size:11px;color:var(--text2);line-height:1.3">${c.Descriptor||c.Aspect||''}</span>
  </div>`;
}

// ── BULK ASSESS VIEW ──
function renderBulkAssess(main) {
  if (!state.bulkAssess) state.bulkAssess = { mode:'by-code', yearFilter:'all', subjectFilter:'English', strandFilter:'all', selectedCode:null, selectedStudent:null, date:new Date().toISOString().split('T')[0], pendingChanges:{} };
  const ba = state.bulkAssess;
  const YLM = {'F':'Foundation','1':'Year 1','2':'Year 2','3':'Year 3','4':'Year 4','5':'Year 5','6':'Year 6'};
  const pendingCount = Object.keys(ba.pendingChanges).length;
  const availSubjects = [...new Set(state.curriculumCodes.map(c => c.Subject).filter(Boolean))].sort();
  const availStrands = ['all', ...new Set(state.curriculumCodes.filter(c => c.Subject===ba.subjectFilter).map(c => c.Strand).filter(Boolean))].sort();

  const filteredCodes = state.curriculumCodes.filter(c => {
    if (c.Subject !== ba.subjectFilter) return false;
    if (ba.strandFilter !== 'all' && c.Strand !== ba.strandFilter) return false;
    if (ba.yearFilter !== 'all' && (c['Year Level']||'').trim() !== (YLM[ba.yearFilter]||ba.yearFilter)) return false;
    return true;
  });

  const filteredStudents = state.students
    .filter(s => ba.yearFilter==='all'||normaliseYear(s.year_level)===ba.yearFilter)
    .sort((a,b) => a.last_name.localeCompare(b.last_name));

  function fBtn(label, active, fn) {
    const safeFn = fn.replace(/"/g, '&quot;');
    return `<button data-ba-fn="${safeFn}" style="padding:4px 10px;border-radius:4px;border:1px solid ${active?'var(--blue)':'var(--border2)'};background:${active?'var(--blue-dim)':'none'};color:${active?'var(--blue)':'var(--text3)'};font-family:'DM Mono',monospace;font-size:10px;cursor:pointer;white-space:nowrap">${label}</button>`;
  }

  const masteryColours = { 'Achieved':['var(--green)','var(--green-dim)'], 'Developing':['var(--gold)','var(--gold-dim)'], 'Emerging':['var(--rust)','var(--rust-dim)'], 'Not taught':['var(--border2)','var(--surface2)'] };

  function masteryBtns(key, current) {
    return ['Achieved','Developing','Emerging','Not taught'].map(m => {
      const [col, bg] = masteryColours[m];
      const active = current === m;
      return `<button data-ba-action="setBulkMastery" data-ba-key="${key}" data-ba-val="${m}" style="padding:3px 9px;border-radius:4px;border:1px solid ${active?col:'var(--border2)'};background:${active?bg:'none'};color:${active?col:'var(--text3)'};font-family:'DM Mono',monospace;font-size:10px;cursor:pointer">${m}</button>`;
    }).join('');
  }

  function buildByCode() {
    const code = ba.selectedCode;
    const cd = code ? state.curriculumCodes.find(c => c.Code===code) : null;
    const codeListHtml = filteredCodes.map(c => buildCodeListItem(c, code)).join('');
    const rosterHtml = !code
      ? `<div class="empty-state" style="padding:60px"><div class="empty-icon">⊞</div><div class="empty-title">Select a code on the left</div><div class="empty-sub">Then set mastery for each student</div></div>`
      : `<div style="display:flex;flex-direction:column;overflow:hidden;height:100%">
          <div style="padding:10px 16px;border-bottom:1px solid var(--border);background:var(--surface2);display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex-shrink:0">
            <span style="font-family:'DM Mono',monospace;font-size:12px;color:var(--blue)">${code}</span>
            <span style="font-size:12px;color:var(--text2);flex:1;line-height:1.3">${cd ? (cd.Descriptor||cd.Aspect||'') : ''}</span>
            <button data-ba-action="applyMasteryToAll" data-ba-key="${code}" data-ba-val="Achieved" style="padding:4px 10px;border-radius:4px;border:1px solid var(--green);background:var(--green-dim);color:var(--green);font-family:'DM Mono',monospace;font-size:10px;cursor:pointer">✓ All Achieved</button>
            <button data-ba-action="applyMasteryToAll" data-ba-key="${code}" data-ba-val="Developing" style="padding:4px 10px;border-radius:4px;border:1px solid var(--gold);background:var(--gold-dim);color:var(--gold);font-family:'DM Mono',monospace;font-size:10px;cursor:pointer">◐ All Developing</button>
          </div>
          <div style="overflow-y:auto;flex:1"><table style="width:100%;border-collapse:collapse"><tbody>
            ${filteredStudents.map((s,si) => {
              const key = s.id+'|'+code;
              const pending = ba.pendingChanges[key];
              const saved = getMasteryForCode(s.id, code);
              const current = pending !== undefined ? pending : (saved || 'Not taught');
              const changed = pending !== undefined && pending !== saved;
              return `<tr style="${si%2===1?'background:rgba(255,255,255,0.02)':''}${changed?';box-shadow:inset 3px 0 0 var(--gold)':''}">
                <td style="padding:10px 16px;width:200px">
                  <div style="display:flex;align-items:center;gap:10px">
                    <div class="sc-avatar ${getAvClass(si)}" style="width:28px;height:28px;font-size:11px;flex-shrink:0">${getInitials(s)}</div>
                    <div><div style="font-size:13px;font-weight:600">${s.last_name}, ${s.first_name}</div><div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3)">Yr ${s.year_level}${changed?' · <span style="color:var(--gold)">changed</span>':''}</div></div>
                  </div>
                </td>
                <td style="padding:8px 16px"><div style="display:flex;gap:6px;flex-wrap:wrap">${masteryBtns(key, current)}</div></td>
              </tr>`;
            }).join('')}
          </tbody></table></div>
        </div>`;
    return `<div style="display:grid;grid-template-columns:340px 1fr;height:calc(100vh - 118px);overflow:hidden">
      <div style="border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden">
        <div style="padding:10px 14px;border-bottom:1px solid var(--border);background:var(--surface2);flex-shrink:0">
          <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.1em">Select Code · ${filteredCodes.length} available</div>
          <input id="ba-code-search" placeholder="Search codes…" oninput="filterBulkCodeList(this.value)" style="width:100%;box-sizing:border-box;background:var(--surface);border:1px solid var(--border2);border-radius:5px;padding:5px 10px;color:var(--text2);font-size:12px;outline:none">
        </div>
        <div id="ba-code-list" style="overflow-y:auto;flex:1">${codeListHtml}</div>
      </div>
      <div style="overflow:hidden">${rosterHtml}</div>
    </div>`;
  }

  function buildByStudent() {
    const sid = ba.selectedStudent;
    const student = sid ? state.students.find(s => s.id===sid) : null;
    const studentListHtml = filteredStudents.map((s,si) => {
      const active = s.id === sid;
      const pct = getProgressStats(s.id).pct;
      return `<div data-ba-action="setBulkStudent" data-ba-val="${s.id}" style="padding:10px 14px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;gap:10px;align-items:center;${active?'background:var(--blue-dim);':''}">
        <div class="sc-avatar ${getAvClass(si)}" style="width:28px;height:28px;font-size:11px;flex-shrink:0">${getInitials(s)}</div>
        <div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--text)">${s.last_name}, ${s.first_name}</div><div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3)">Yr ${s.year_level}</div></div>
        <span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--green)">${pct}%</span>
      </div>`;
    }).join('');

    const codesHtml = !student ? '' : (() => {
      const normYr = normaliseYear(student.year_level);
      const csvYear = YLM[normYr]||normYr;
      const sCodes = state.curriculumCodes.filter(c => c.Subject===ba.subjectFilter && (c['Year Level']||'').trim()===csvYear && (ba.strandFilter==='all'||c.Strand===ba.strandFilter));
      return sCodes.map((c,ci) => {
        const key = student.id+'|'+c.Code;
        const pending = ba.pendingChanges[key];
        const saved = getMasteryForCode(student.id, c.Code);
        const current = pending !== undefined ? pending : (saved||'Not taught');
        const changed = pending !== undefined && pending !== saved;
        return `<tr style="${ci%2===1?'background:rgba(255,255,255,0.02)':''}${changed?';box-shadow:inset 3px 0 0 var(--gold)':''}">
          <td style="padding:8px 16px;width:130px;vertical-align:top;padding-top:12px"><span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--blue)">${c.Code}</span></td>
          <td style="padding:8px 8px;font-size:11px;color:var(--text2);line-height:1.4;max-width:300px;vertical-align:top;padding-top:12px">${c.Descriptor||c.Aspect||'—'}</td>
          <td style="padding:8px 16px;vertical-align:top;padding-top:8px"><div style="display:flex;gap:4px;flex-wrap:wrap">${masteryBtns(key, current)}</div></td>
        </tr>`;
      }).join('');
    })();

    return `<div style="display:grid;grid-template-columns:260px 1fr;height:calc(100vh - 118px);overflow:hidden">
      <div style="border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden">
        <div style="padding:10px 14px;border-bottom:1px solid var(--border);background:var(--surface2);font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:0.1em;flex-shrink:0">Select Student · ${filteredStudents.length} shown</div>
        <div style="overflow-y:auto;flex:1">${studentListHtml}</div>
      </div>
      <div style="overflow:hidden;display:flex;flex-direction:column">
        ${!student
          ? `<div class="empty-state" style="padding:60px"><div class="empty-icon">◎</div><div class="empty-title">Select a student on the left</div></div>`
          : `<div style="padding:10px 16px;border-bottom:1px solid var(--border);background:var(--surface2);display:flex;align-items:center;gap:10px;flex-shrink:0">
              <div class="sc-avatar ${getAvClass(0)}" style="width:28px;height:28px;font-size:11px">${getInitials(student)}</div>
              <div><div style="font-size:13px;font-weight:600">${student.first_name} ${student.last_name}</div><div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3)">Year ${student.year_level} · ${ba.subjectFilter}</div></div>
            </div>
            <div style="overflow-y:auto;flex:1"><table style="width:100%;border-collapse:collapse"><tbody>${codesHtml}</tbody></table></div>`}
      </div>
    </div>`;
  }

  const modeContent = ba.mode === 'by-student' ? buildByStudent() : buildByCode();
  const subjectShort = s => s==='Health and Physical Education'?'HPE':s==='Design and Technologies'?'D&T':s==='Digital Technologies'?'DigiTech':s;

  main.innerHTML = `
    <div class="topbar" style="flex-wrap:wrap;gap:6px;padding:10px 20px">
      <div class="topbar-title" style="margin-right:4px">Bulk Assess</div>
      ${fBtn('By Code', ba.mode==='by-code', "setBulkMode('by-code')")}
      ${fBtn('By Student', ba.mode==='by-student', "setBulkMode('by-student')")}
      <div style="width:1px;height:18px;background:var(--border2);margin:0 3px"></div>
      ${availSubjects.map(s => fBtn(subjectShort(s), ba.subjectFilter===s, `setBulkSubject('${s}')`)).join('')}
      <div style="width:1px;height:18px;background:var(--border2);margin:0 3px"></div>
      ${['all','F','1','2','3','4','5','6'].map(yr => fBtn(yr==='all'?'All':'Yr '+yr, ba.yearFilter===yr, `setBulkYear('${yr}')`)).join('')}
      <div style="width:1px;height:18px;background:var(--border2);margin:0 3px"></div>
      ${availStrands.map(st => fBtn(st==='all'?'All strands':st, ba.strandFilter===st, `setBulkStrand('${st}')`)).join('')}
      <div style="width:1px;height:18px;background:var(--border2);margin:0 3px;margin-left:auto"></div>
      <input type="date" value="${ba.date}" onchange="state.bulkAssess.date=this.value" style="background:var(--surface2);border:1px solid var(--border2);border-radius:5px;padding:4px 8px;color:var(--text2);font-family:'DM Mono',monospace;font-size:11px;cursor:pointer;outline:none">
      ${pendingCount > 0 ? `
        <button onclick="saveBulkAssess()" style="padding:5px 16px;border-radius:6px;border:none;background:var(--green);color:#0f1117;font-family:'DM Mono',monospace;font-size:11px;font-weight:700;cursor:pointer">↑ Save ${pendingCount} change${pendingCount>1?'s':''}</button>
        <button onclick="discardBulkChanges()" style="padding:5px 10px;border-radius:6px;border:1px solid var(--border2);background:none;color:var(--text3);font-family:'DM Mono',monospace;font-size:11px;cursor:pointer">✕ Discard</button>` : ''}
    </div>
    <div style="overflow:hidden">${modeContent}</div>
  `;
}

async function saveBulkAssess() {
  const ba = state.bulkAssess;
  const changes = Object.entries(ba.pendingChanges);
  if (!changes.length) return;
  setSyncing(true);
  toast(`Saving ${changes.length} change${changes.length>1?'s':''}…`, 'info');
  let saved = 0;
  for (const [key, mastery] of changes) {
    const [studentId, code] = key.split('|');
    const existing = state.progress.find(p => p.student_id===studentId && p.code===code);
    try {
      if (existing) {
        const r = await apiCall('updateProgress', { progress_id:existing.id, mastery_level:mastery, date_assessed:ba.date, teacher_notes:existing.notes||'' });
        if (r.success) { existing.mastery=mastery; existing.date=ba.date; saved++; }
      } else {
        const r = await apiCall('saveProgress', { student_id:studentId, content_descriptor_code:code, mastery_level:mastery, date_assessed:ba.date, teacher_notes:'' });
        if (r.success) { state.progress.push({ id:r.progress_id, student_id:studentId, code, mastery, date:ba.date, notes:'' }); saved++; }
      }
    } catch(e) { console.error('Failed to save', key, e); }
  }
  ba.pendingChanges = {};
  setSyncing(false);
  toast(`✓ Saved ${saved} assessment${saved>1?'s':''}`, 'success');
  renderBulkAssess(document.getElementById('main-content'));
}

// ── REPORT HELPERS ──

// Shared badge + section builders used by both single and bulk print
function reportBadge(m) {
  const styles = {
    'Achieved':   'background:#d4edda;color:#155724;border:1px solid #c3e6cb',
    'Developing': 'background:#fff3cd;color:#856404;border:1px solid #ffeeba',
    'Emerging':   'background:#f8d7da;color:#721c24;border:1px solid #f5c6cb',
    'Not taught': 'background:#f1f3f4;color:#666;border:1px solid #ddd'
  };
  return `<span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:600;${styles[m]||styles['Not taught']}">${m}</span>`;
}

/**
 * Build the full HTML body content for one student's report.
 * opts: { subjectFilter: string|null, strandFilter: string|null }
 * If subjectFilter is null → include all subjects.
 * If strandFilter is set → only include that strand within the subject.
 */
function buildStudentReportBody(s, opts) {
  opts = opts || {};
  const YLM = {'F':'Foundation','1':'Year 1','2':'Year 2','3':'Year 3','4':'Year 4','5':'Year 5','6':'Year 6'};
  const normYr = normaliseYear(s.year_level);
  const csvYear = YLM[normYr] || normYr;
  const today = new Date().toLocaleDateString('en-AU', {day:'numeric',month:'long',year:'numeric'});

  // Scope to subject/strand filters
  const scopeLabel = opts.subjectFilter
    ? (opts.strandFilter ? `${opts.subjectFilter} · ${opts.strandFilter}` : opts.subjectFilter)
    : 'All Subjects';

  // Codes in scope for summary stats
  const scopeCodes = state.curriculumCodes.filter(c => {
    if ((c['Year Level']||'').trim() !== csvYear) return false;
    if (opts.subjectFilter && c.Subject !== opts.subjectFilter) return false;
    if (opts.strandFilter  && c.Strand  !== opts.strandFilter)  return false;
    return true;
  });
  const achieved   = scopeCodes.filter(c => getMasteryForCode(s.id, c.Code) === 'Achieved').length;
  const developing = scopeCodes.filter(c => getMasteryForCode(s.id, c.Code) === 'Developing').length;
  const emerging   = scopeCodes.filter(c => getMasteryForCode(s.id, c.Code) === 'Emerging').length;
  const assessed   = achieved + developing + emerging;
  const total      = scopeCodes.length;
  const pct        = total ? Math.round((achieved/total)*100) : 0;

  function buildSubjectSection(subject) {
    let sCodes = state.curriculumCodes.filter(c =>
      c.Subject === subject && (c['Year Level']||'').trim() === csvYear
    );
    if (opts.strandFilter) sCodes = sCodes.filter(c => c.Strand === opts.strandFilter);
    if (!sCodes.length) return '';

    const strands = [...new Set(sCodes.map(c => c.Strand).filter(Boolean))];
    const strandSections = strands.map(strand => {
      const strandCodes = sCodes.filter(c => c.Strand === strand);
      const rows = strandCodes.map(c => {
        const mastery = getMasteryForCode(s.id, c.Code);
        const linkedIds = (c['Linked Achievement IDs']||'').split(',').map(x=>x.trim()).filter(Boolean);
        const standards = linkedIds.map(id => {
          const st = state.standards.find(x => x['Achievement Standard ID'] === id);
          return st ? `<div style="font-size:9px;color:#555;margin-top:3px;padding-left:8px;border-left:2px solid #ddd">${st['Standard Text']||''}</div>` : '';
        }).join('');
        return `<tr style="border-bottom:1px solid #eee">
          <td style="padding:6px 8px;width:120px;vertical-align:top"><span style="font-family:monospace;font-size:10px;color:#1a6db5;font-weight:600">${c.Code}</span></td>
          <td style="padding:6px 8px;vertical-align:top"><div style="font-size:11px;color:#222;line-height:1.4">${c.Descriptor||c.Aspect||'—'}</div>${standards}</td>
          <td style="padding:6px 8px;width:100px;vertical-align:top;text-align:right">${reportBadge(mastery)}</td>
        </tr>`;
      }).join('');
      const sa = strandCodes.filter(c => getMasteryForCode(s.id,c.Code)==='Achieved').length;
      return `<div style="margin-bottom:14px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#555;margin-bottom:4px;padding-bottom:3px;border-bottom:1px solid #ccc">
          ${strand} &nbsp;·&nbsp; ${sa}/${strandCodes.length} achieved
        </div>
        <table style="width:100%;border-collapse:collapse">${rows}</table>
      </div>`;
    }).join('');

    const sA = sCodes.filter(c=>getMasteryForCode(s.id,c.Code)==='Achieved').length;
    const sD = sCodes.filter(c=>getMasteryForCode(s.id,c.Code)==='Developing').length;
    const sE = sCodes.filter(c=>getMasteryForCode(s.id,c.Code)==='Emerging').length;
    const sN = sCodes.filter(c=>getMasteryForCode(s.id,c.Code)==='Not taught').length;
    return `<div style="margin-bottom:24px;page-break-inside:avoid">
      <div style="display:flex;align-items:baseline;justify-content:space-between;border-bottom:2px solid #333;padding-bottom:4px;margin-bottom:10px">
        <div style="font-size:14px;font-weight:700;color:#111">${subject}</div>
        <div style="font-size:10px;color:#555;font-family:monospace">Achieved: ${sA} &nbsp;·&nbsp; Developing: ${sD} &nbsp;·&nbsp; Emerging: ${sE} &nbsp;·&nbsp; Not taught: ${sN}</div>
      </div>
      ${strandSections}
    </div>`;
  }

  const subjects = opts.subjectFilter
    ? [opts.subjectFilter]
    : [...new Set(state.curriculumCodes.map(c => c.Subject).filter(Boolean))].sort();

  const subjectSections = subjects.map(buildSubjectSection).join('');

  return `
  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:12px;border-bottom:3px solid #111">
    <div>
      <div style="font-size:22px;font-weight:700;color:#111">${s.first_name} ${s.last_name}</div>
      <div style="font-size:12px;color:#555;margin-top:3px">Year ${s.year_level} &nbsp;·&nbsp; ${csvYear} Curriculum &nbsp;·&nbsp; ${scopeLabel}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:11px;font-weight:700;color:#111">ClassTracker</div>
      <div style="font-size:10px;color:#777;margin-top:2px">Generated ${today}</div>
    </div>
  </div>
  <!-- Summary stats -->
  <div style="display:flex;gap:12px;margin-bottom:24px">
    <div style="flex:1;background:#d4edda;border:1px solid #c3e6cb;border-radius:6px;padding:10px 14px"><div style="font-size:22px;font-weight:700;color:#155724">${achieved}</div><div style="font-size:10px;color:#155724;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Achieved</div></div>
    <div style="flex:1;background:#fff3cd;border:1px solid #ffeeba;border-radius:6px;padding:10px 14px"><div style="font-size:22px;font-weight:700;color:#856404">${developing}</div><div style="font-size:10px;color:#856404;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Developing</div></div>
    <div style="flex:1;background:#f8d7da;border:1px solid #f5c6cb;border-radius:6px;padding:10px 14px"><div style="font-size:22px;font-weight:700;color:#721c24">${emerging}</div><div style="font-size:10px;color:#721c24;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Emerging</div></div>
    <div style="flex:1;background:#f1f3f4;border:1px solid #ddd;border-radius:6px;padding:10px 14px"><div style="font-size:22px;font-weight:700;color:#333">${assessed}/${total}</div><div style="font-size:10px;color:#555;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Assessed · ${pct}%</div></div>
  </div>
  ${subjectSections || '<p style="color:#888;font-style:italic">No curriculum data loaded for this scope.</p>'}
  <div style="margin-top:30px;padding-top:10px;border-top:1px solid #ddd;font-size:9px;color:#aaa;display:flex;justify-content:space-between">
    <span>ClassTracker · chriswhite3140.github.io/class-tracker-split</span>
    <span>Printed ${today}</span>
  </div>`;
}

// ── PRINT OPTIONS MODAL (single student) ──
function openPrintOptionsModal(studentId) {
  const s = state.students.find(x => x.id === studentId);
  if (!s) return;

  const YLM = {'F':'Foundation','1':'Year 1','2':'Year 2','3':'Year 3','4':'Year 4','5':'Year 5','6':'Year 6'};
  const normYr = normaliseYear(s.year_level);
  const csvYear = YLM[normYr] || normYr;

  // Current view state
  const currentSubject = state.detailSubjectFilter || null;
  const currentStrand = null; // strand filter not yet tracked in detail view — future feature

  const availableSubjects = [...new Set(
    state.curriculumCodes.filter(c => (c['Year Level']||'').trim() === csvYear).map(c => c.Subject).filter(Boolean)
  )].sort();

  const availableStrands = currentSubject
    ? [...new Set(
        state.curriculumCodes.filter(c => c.Subject === currentSubject && (c['Year Level']||'').trim() === csvYear).map(c => c.Strand).filter(Boolean)
      )].sort()
    : [];

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="width:500px;max-width:95vw">
      <div class="modal-head">
        <div class="modal-title">Print Report — ${s.first_name} ${s.last_name}</div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div style="font-size:12px;color:var(--text3);margin-bottom:16px">Choose what to include in this student's report.</div>

        <!-- Subject scope -->
        <div class="form-group">
          <label class="form-label">Subject scope</label>
          <div style="display:flex;flex-direction:column;gap:8px" id="print-subject-opts">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--text2)">
              <input type="radio" name="print-subject" value="all" ${!currentSubject?'checked':''} onchange="updatePrintStrandOpts()" style="accent-color:var(--blue)">
              All subjects (full report)
            </label>
            ${availableSubjects.map(subj => `
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--text2)">
                <input type="radio" name="print-subject" value="${subj}" ${currentSubject===subj?'checked':''} onchange="updatePrintStrandOpts()" style="accent-color:var(--blue)">
                ${subj} only
              </label>`).join('')}
          </div>
        </div>

        <!-- Strand scope (shown only when a single subject is selected) -->
        <div class="form-group" id="print-strand-group" style="${currentSubject?'':'display:none'}">
          <label class="form-label">Strand scope</label>
          <div style="display:flex;flex-direction:column;gap:8px" id="print-strand-opts">
            ${buildPrintStrandOpts(availableStrands, null)}
          </div>
        </div>

        <div style="padding:10px 14px;background:var(--surface2);border-radius:6px;border:1px solid var(--border);font-size:11px;color:var(--text3)">
          <span id="print-scope-preview">Calculating…</span>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitPrintReport('${studentId}')">⎙ Open &amp; Print</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  updatePrintStrandOpts();
  updatePrintScopePreview(studentId);
}

function buildPrintStrandOpts(strands, selectedStrand) {
  return `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--text2)">
    <input type="radio" name="print-strand" value="all" ${!selectedStrand?'checked':''} onchange="updatePrintScopePreview()" style="accent-color:var(--blue)">
    All strands
  </label>
  ${strands.map(st => `
    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--text2)">
      <input type="radio" name="print-strand" value="${st}" ${selectedStrand===st?'checked':''} onchange="updatePrintScopePreview()" style="accent-color:var(--blue)">
      ${st} only
    </label>`).join('')}`;
}

function updatePrintStrandOpts() {
  const subjVal = document.querySelector('input[name="print-subject"]:checked')?.value;
  const strandGroup = document.getElementById('print-strand-group');
  const strandOpts  = document.getElementById('print-strand-opts');
  if (!strandGroup || !strandOpts) return;

  if (!subjVal || subjVal === 'all') {
    strandGroup.style.display = 'none';
  } else {
    strandGroup.style.display = 'block';
    const sid = state.selectedStudent;
    const s = state.students.find(x => x.id === sid);
    if (!s) return;
    const YLM = {'F':'Foundation','1':'Year 1','2':'Year 2','3':'Year 3','4':'Year 4','5':'Year 5','6':'Year 6'};
    const csvYear = YLM[normaliseYear(s.year_level)] || s.year_level;
    const strands = [...new Set(
      state.curriculumCodes.filter(c => c.Subject === subjVal && (c['Year Level']||'').trim() === csvYear).map(c => c.Strand).filter(Boolean)
    )].sort();
    strandOpts.innerHTML = buildPrintStrandOpts(strands, null);
  }
  updatePrintScopePreview(state.selectedStudent);
}

function updatePrintScopePreview(studentId) {
  const preview = document.getElementById('print-scope-preview');
  if (!preview) return;
  const sid = studentId || state.selectedStudent;
  const s = state.students.find(x => x.id === sid);
  if (!s) return;
  const subjVal   = document.querySelector('input[name="print-subject"]:checked')?.value || 'all';
  const strandVal = document.querySelector('input[name="print-strand"]:checked')?.value   || 'all';
  const YLM = {'F':'Foundation','1':'Year 1','2':'Year 2','3':'Year 3','4':'Year 4','5':'Year 5','6':'Year 6'};
  const csvYear = YLM[normaliseYear(s.year_level)] || s.year_level;

  const codes = state.curriculumCodes.filter(c => {
    if ((c['Year Level']||'').trim() !== csvYear) return false;
    if (subjVal !== 'all' && c.Subject !== subjVal) return false;
    if (strandVal !== 'all' && c.Strand !== strandVal) return false;
    return true;
  });
  const achieved = codes.filter(c => getMasteryForCode(s.id, c.Code) === 'Achieved').length;
  const scope = subjVal === 'all' ? 'All subjects' : (strandVal !== 'all' ? `${subjVal} · ${strandVal}` : subjVal);
  preview.textContent = `Report scope: ${scope} · ${codes.length} codes · ${achieved} achieved`;
}

function submitPrintReport(studentId) {
  const s = state.students.find(x => x.id === studentId);
  if (!s) return;
  const subjVal   = document.querySelector('input[name="print-subject"]:checked')?.value || 'all';
  const strandVal = document.querySelector('input[name="print-strand"]:checked')?.value   || 'all';
  closeModal();
  const opts = {
    subjectFilter: subjVal === 'all'    ? null : subjVal,
    strandFilter:  strandVal === 'all'  ? null : strandVal,
  };
  openReportWindow([s], opts);
}

// ── BULK PRINT MODAL (from Students list) ──
function openBulkPrintModal() {
  const allSubjects = [...new Set(state.curriculumCodes.map(c => c.Subject).filter(Boolean))].sort();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="width:560px;max-width:95vw">
      <div class="modal-head">
        <div class="modal-title">Bulk Print Reports</div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body" style="max-height:70vh;overflow-y:auto">

        <!-- Subject + strand scope -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Subject</label>
            <select class="form-select" id="bulk-print-subject" onchange="updateBulkPrintStrands()">
              <option value="all">All subjects</option>
              ${allSubjects.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" id="bulk-strand-group" style="margin-bottom:0;display:none">
            <label class="form-label">Strand</label>
            <select class="form-select" id="bulk-print-strand">
              <option value="all">All strands</option>
            </select>
          </div>
        </div>

        <div style="border-top:1px solid var(--border);padding-top:14px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
          <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:var(--text3)">Select students</div>
          <div style="display:flex;gap:8px">
            <button class="btn" style="padding:4px 10px;font-size:11px" onclick="bulkPrintSelectAll(true)">Select all</button>
            <button class="btn" style="padding:4px 10px;font-size:11px" onclick="bulkPrintSelectAll(false)">Deselect all</button>
          </div>
        </div>

        <!-- Year group headers with students -->
        ${buildBulkStudentList()}

        <div style="margin-top:14px;padding:10px 14px;background:var(--surface2);border-radius:6px;border:1px solid var(--border);font-size:11px;color:var(--text3)" id="bulk-print-summary">
          Select students above to continue
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitBulkPrint()">⎙ Print Selected Reports</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Wire up checkbox change to update summary
  setTimeout(() => {
    document.querySelectorAll('.bulk-student-cb').forEach(cb => {
      cb.addEventListener('change', updateBulkPrintSummary);
    });
    updateBulkPrintSummary();
  }, 0);
}

function buildBulkStudentList() {
  const yearOrder = ['F','1','2','3','4','5','6'];
  const yearLabel = {'F':'Foundation','1':'Year 1','2':'Year 2','3':'Year 3','4':'Year 4','5':'Year 5','6':'Year 6'};
  let html = '';
  yearOrder.forEach(yr => {
    const group = state.students.filter(s => normaliseYear(s.year_level) === yr)
      .sort((a,b) => a.last_name.localeCompare(b.last_name));
    if (!group.length) return;
    html += `<div style="margin-bottom:12px">
      <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:var(--text3);padding:6px 0 4px;border-bottom:1px solid var(--border);margin-bottom:4px">${yearLabel[yr] || 'Year '+yr}</div>
      ${group.map((s,si) => `
        <label style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:5px;cursor:pointer;transition:background 0.1s" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='none'">
          <input type="checkbox" class="bulk-student-cb" value="${s.id}" checked style="accent-color:var(--blue);width:15px;height:15px;flex-shrink:0">
          <div class="sc-avatar ${getAvClass(si)}" style="width:26px;height:26px;font-size:11px;flex-shrink:0">${getInitials(s)}</div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;color:var(--text)">${s.first_name} ${s.last_name}</div>
          </div>
          <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3)">${getProgressStats(s.id).achieved} achieved</div>
        </label>`).join('')}
    </div>`;
  });
  return html || '<div style="color:var(--text3);font-size:13px;text-align:center;padding:20px">No students added yet</div>';
}

function bulkPrintSelectAll(checked) {
  document.querySelectorAll('.bulk-student-cb').forEach(cb => { cb.checked = checked; });
  updateBulkPrintSummary();
}

function updateBulkPrintStrands() {
  const subj = document.getElementById('bulk-print-subject')?.value;
  const strandGroup = document.getElementById('bulk-strand-group');
  const strandSel = document.getElementById('bulk-print-strand');
  if (!strandGroup || !strandSel) return;
  if (!subj || subj === 'all') {
    strandGroup.style.display = 'none';
  } else {
    strandGroup.style.display = 'block';
    const strands = [...new Set(state.curriculumCodes.filter(c => c.Subject === subj).map(c => c.Strand).filter(Boolean))].sort();
    strandSel.innerHTML = `<option value="all">All strands</option>${strands.map(st => `<option value="${st}">${st}</option>`).join('')}`;
  }
  updateBulkPrintSummary();
}

function updateBulkPrintSummary() {
  const summary = document.getElementById('bulk-print-summary');
  if (!summary) return;
  const selected = [...document.querySelectorAll('.bulk-student-cb:checked')].map(cb => cb.value);
  const subj = document.getElementById('bulk-print-subject')?.value || 'all';
  const strand = document.getElementById('bulk-print-strand')?.value || 'all';
  const scope = subj === 'all' ? 'All subjects' : (strand !== 'all' ? `${subj} · ${strand}` : subj);
  summary.textContent = selected.length === 0
    ? 'No students selected'
    : `${selected.length} report${selected.length>1?'s':''} will be printed · Scope: ${scope}`;
}

function submitBulkPrint() {
  const selectedIds = [...document.querySelectorAll('.bulk-student-cb:checked')].map(cb => cb.value);
  if (!selectedIds.length) { toast('No students selected', 'error'); return; }
  const subj   = document.getElementById('bulk-print-subject')?.value  || 'all';
  const strand = document.getElementById('bulk-print-strand')?.value   || 'all';
  closeModal();
  const students = selectedIds.map(id => state.students.find(s => s.id === id)).filter(Boolean);
  const opts = {
    subjectFilter: subj   === 'all' ? null : subj,
    strandFilter:  strand === 'all' ? null : strand,
  };
  openReportWindow(students, opts);
}

// ── CORE REPORT WINDOW OPENER ──
// Opens a new tab with one or more student reports, one per page, then triggers print
function openReportWindow(students, opts) {
  const today = new Date().toLocaleDateString('en-AU', {day:'numeric',month:'long',year:'numeric'});
  const pages = students.map((s, i) => {
    const body = buildStudentReportBody(s, opts);
    return `<div class="report-page"${i > 0 ? ' style="page-break-before:always"' : ''}>${body}</div>`;
  }).join('\n');

  const reportHTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${students.length === 1 ? 'Student Report — '+students[0].first_name+' '+students[0].last_name : 'Class Reports · '+today}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; background: #fff; }
  .report-page { padding: 0; }
  @page { margin: 15mm; size: A4; }
  @media print { .report-page { page-break-inside: avoid; } }
</style>
</head>
<body>${pages}</body>
</html>`;

  const win = window.open('', '_blank');
  win.document.write(reportHTML);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
}

// ── STUDENT REPORT (kept for legacy compatibility) ──
function printStudentReport() {
  openPrintOptionsModal(state.selectedStudent);
}

function closeModal() {
  const m = document.getElementById('modal-overlay');
  if (m) m.remove();
}

document.addEventListener('click', e => {
  if (e.target.id === 'modal-overlay') closeModal();
});

// ── AUTO-FETCH CSVs FROM GITHUB ──
async function fetchCSVFromGitHub(key) {
  const { file, iconId, navId } = CSV_FILES[key];
  try {
    const url = GITHUB_RAW + file.split(' ').join('%20');
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const text = await resp.text();
    const parsed = parseCSV(text);
    state[key] = parsed;
    markLoaded(iconId, navId);
    return parsed.length;
  } catch(e) {
    console.warn('Could not auto-load ' + file + ':', e);
    return 0;
  }
}

async function fetchAllCSVs() {
  const results = await Promise.all([
    fetchCSVFromGitHub('curriculumCodes'),
    fetchCSVFromGitHub('standards'),
    fetchCSVFromGitHub('progressions'),
    fetchCSVFromGitHub('numeracyProgressions'),
    fetchCSVFromGitHub('aspectLinks'),
  ]);
  const total = results.reduce((a,b) => a+b, 0);
  if (total > 0) toast('Curriculum data loaded automatically', 'success');
}


// ── COVERAGE TOOLTIP ──
function showCoverageTooltip(event, code, descriptor, subject, strand) {
  hideCoverageTooltip();
  const tip = document.createElement('div');
  tip.id = 'cv-tooltip';
  const subjectColours = {'English':'var(--blue)','Mathematics':'var(--green)','Science':'var(--teal)','HASS':'var(--gold)','Health and Physical Education':'var(--rust)','Design and Technologies':'var(--purple)','Digital Technologies':'var(--purple)'};
  const col = subjectColours[subject] || 'var(--blue)';
  tip.style.cssText = `position:fixed;z-index:999;max-width:320px;background:var(--surface);border:1px solid var(--border2);border-radius:8px;padding:12px 14px;box-shadow:0 8px 30px rgba(0,0,0,0.4);pointer-events:none;animation:fadeIn 0.1s ease`;
  tip.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
      <span style="font-family:'DM Mono',monospace;font-size:11px;font-weight:700;color:${col}">${code}</span>
      ${strand ? `<span style="font-size:9px;background:${col}22;color:${col};padding:1px 6px;border-radius:3px;font-family:'DM Mono',monospace">${strand}</span>` : ''}
    </div>
    <div style="font-size:12px;color:var(--text2);line-height:1.5">${descriptor}</div>
  `;
  document.body.appendChild(tip);

  // Position near cursor but keep on screen
  const x = Math.min(event.clientX + 12, window.innerWidth  - 340);
  const y = Math.min(event.clientY + 12, window.innerHeight - 120);
  tip.style.left = x + 'px';
  tip.style.top  = y + 'px';
}

function hideCoverageTooltip() {
  const tip = document.getElementById('cv-tooltip');
  if (tip) tip.remove();
}

// ════════════════════════════════════════════════════
// ── COVERAGE GAPS VIEW ──
// Heatmap: codes as rows, students as columns
// Shows taught / assessed / gap at a glance
// ════════════════════════════════════════════════════

function renderCoverage(main) {
  if (!state.coverageFilter) {
    state.coverageFilter = { subject: 'English', year: 'all', strand: 'all', mode: 'all' };
  }
  const cf = state.coverageFilter;

  const YLM = {'F':'Foundation','1':'Year 1','2':'Year 2','3':'Year 3','4':'Year 4','5':'Year 5','6':'Year 6'};
  const subjectColours = {
    'English':'var(--blue)','Mathematics':'var(--green)','Science':'var(--teal)',
    'HASS':'var(--gold)','Health and Physical Education':'var(--rust)',
    'Design and Technologies':'var(--purple)','Digital Technologies':'var(--purple)'
  };
  const subjectShort = s => s==='Health and Physical Education'?'HPE':s==='Design and Technologies'?'D&T':s==='Digital Technologies'?'DigiTech':s;
  const availSubjects = [...new Set(state.curriculumCodes.map(c => c.Subject).filter(Boolean))].sort();
  const col = subjectColours[cf.subject] || 'var(--blue)';

  // Filter codes
  let codes = state.curriculumCodes.filter(c => {
    if (cf.subject !== 'all' && c.Subject !== cf.subject) return false;
    if (cf.strand  !== 'all' && c.Strand  !== cf.strand)  return false;
    if (cf.year    !== 'all' && (c['Year Level']||'').trim() !== (YLM[cf.year]||cf.year)) return false;
    return true;
  });

  // Filter students by year
  const students = state.students
    .filter(s => cf.year === 'all' || normaliseYear(s.year_level) === cf.year)
    .sort((a,b) => a.last_name.localeCompare(b.last_name));

  // Mode filter — not-taught-yet only shows codes not taught to ANY student
  if (cf.mode === 'not-taught') {
    codes = codes.filter(c => !students.some(s => wasCodeTaughtToStudent(s.id, c.Code)));
  }

  // Summary stats
  const totalCells     = codes.length * students.length;
  const taughtCells    = codes.reduce((n,c) => n + students.filter(s => wasCodeTaughtToStudent(s.id,c.Code)).length, 0);
  const assessedCells  = codes.reduce((n,c) => n + students.filter(s => getMasteryForCode(s.id,c.Code) !== 'Not taught').length, 0);
  const achievedCells  = codes.reduce((n,c) => n + students.filter(s => getMasteryForCode(s.id,c.Code) === 'Achieved').length, 0);
  const gapCodes       = codes.filter(c => !students.some(s => wasCodeTaughtToStudent(s.id,c.Code)));

  function fBtn(label, active, action, value, extra) {
    // Use data attributes + dedicated handler instead of data-ba-fn eval
    const extraAttr = extra ? ` data-cv-extra="${extra}"` : '';
    return `<button data-cv-action="${action}" data-cv-value="${value}"${extraAttr}
      style="padding:4px 10px;border-radius:4px;border:1px solid ${active?col:'var(--border2)'};background:${active?col+'22':'none'};color:${active?col:'var(--text3)'};font-family:'DM Mono',monospace;font-size:10px;cursor:pointer;white-space:nowrap">${label}</button>`;
  }

  // Build the grid
  function buildGrid() {
    if (!codes.length) return `<div class="empty-state" style="padding:60px">
      <div class="empty-icon">◈</div>
      <div class="empty-title">No codes match this filter</div>
      <div class="empty-sub">Try changing the subject, year or strand filter</div>
    </div>`;
    if (!students.length) return `<div class="empty-state" style="padding:60px">
      <div class="empty-icon">◎</div>
      <div class="empty-title">No students in this year level</div>
    </div>`;

    // Cell colour logic
    function cellStyle(s, c) {
      const taught   = wasCodeTaughtToStudent(s.id, c.Code);
      const mastery  = getMasteryForCode(s.id, c.Code);
      if (mastery === 'Achieved')   return 'background:var(--green);title=Achieved';
      if (mastery === 'Developing') return 'background:var(--gold);title=Developing';
      if (mastery === 'Emerging')   return 'background:var(--rust);title=Emerging';
      if (taught)                   return 'background:var(--blue-dim);border:1px solid var(--blue);title=Taught · not assessed';
      return 'background:var(--surface2);title=Not taught yet';
    }

    const studentHeaders = students.map(s =>
      `<th style="padding:4px 6px;text-align:center;border-bottom:1px solid var(--border);writing-mode:vertical-rl;transform:rotate(180deg);height:80px;vertical-align:bottom;font-size:10px;color:var(--text2);font-weight:600;cursor:pointer;white-space:nowrap" onclick="openStudentDetail('${s.id}')" title="${s.first_name} ${s.last_name}">
        ${s.first_name} ${s.last_name[0]}.
      </th>`
    ).join('');

    // Group by strand
    const strands = [...new Set(codes.map(c => c.Strand).filter(Boolean))].sort();
    const codesByStrand = strands.map(strand => ({
      strand,
      codes: codes.filter(c => c.Strand === strand)
    }));
    // Codes with no strand
    const noStrandCodes = codes.filter(c => !c.Strand);
    if (noStrandCodes.length) codesByStrand.push({ strand: 'Other', codes: noStrandCodes });

    const bodyRows = codesByStrand.map(({strand, codes: sCodes}) => {
      const strandRow = `<tr>
        <td colspan="${students.length + 2}" style="padding:6px 10px;background:var(--surface2);font-family:'DM Mono',monospace;font-size:9px;color:${col};text-transform:uppercase;letter-spacing:0.1em;border-bottom:1px solid var(--border)">
          ${strand} · ${sCodes.length} codes
        </td>
      </tr>`;
      const codeRows = sCodes.map((c, ci) => {
        const taughtCount = students.filter(s => wasCodeTaughtToStudent(s.id, c.Code)).length;
        const gapCount    = students.length - taughtCount;
        const fullDesc    = (c.Descriptor || c.Aspect || '').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
        const cells = students.map(s => {
          const taught   = wasCodeTaughtToStudent(s.id, c.Code);
          const mastery  = getMasteryForCode(s.id, c.Code);
          const dates    = getTaughtDatesForCode(s.id, c.Code);
          const lastDate = dates[0] || '';
          let bg, cellTitle, dot;
          if      (mastery === 'Achieved')   { bg='var(--green)';    cellTitle=`Achieved${lastDate?' · '+lastDate:''}`;        dot='●'; }
          else if (mastery === 'Developing') { bg='var(--gold)';     cellTitle=`Developing${lastDate?' · '+lastDate:''}`;      dot='◐'; }
          else if (mastery === 'Emerging')   { bg='var(--rust)';     cellTitle=`Emerging${lastDate?' · '+lastDate:''}`;        dot='○'; }
          else if (taught)                   { bg='var(--blue-dim)'; cellTitle=`Taught ${lastDate} · not assessed`;            dot='·'; }
          else                               { bg='transparent';     cellTitle='Not taught yet';                               dot=' '; }
          return `<td style="padding:2px;text-align:center;border-bottom:1px solid var(--border);border-right:1px solid var(--border)" title="${s.first_name} ${s.last_name} · ${cellTitle}">
            <div style="width:20px;height:20px;border-radius:3px;background:${bg};margin:auto;display:flex;align-items:center;justify-content:center;font-size:10px;color:${mastery!=='Not taught'?'#0f1117':'var(--text3)'}">${dot}</div>
          </td>`;
        }).join('');

        return `<tr style="${ci%2===1?'background:rgba(255,255,255,0.01)':''}"
          onmouseenter="showCoverageTooltip(event,'${c.Code}','${fullDesc}','${c.Subject||''}','${c.Strand||''}')"
          onmouseleave="hideCoverageTooltip()">
          <td style="padding:5px 8px;border-bottom:1px solid var(--border);position:sticky;left:0;background:${ci%2===1?'#1c2030':'var(--surface)'}">
            <div style="font-family:'DM Mono',monospace;font-size:10px;color:${col}">${c.Code}</div>
            <div style="font-size:10px;color:var(--text3);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(c.Descriptor||c.Aspect||'').slice(0,42)}…</div>
          </td>
          ${cells}
          <td style="padding:4px 8px;border-bottom:1px solid var(--border);text-align:right;white-space:nowrap">
            <span style="font-family:'DM Mono',monospace;font-size:9px;color:${gapCount>0?'var(--rust)':'var(--green)'}">${taughtCount}/${students.length}</span>
          </td>
        </tr>`;
      }).join('');
      return strandRow + codeRows;
    }).join('');

    return `<div style="overflow:auto;max-height:calc(100vh - 200px)">
      <table style="border-collapse:collapse;min-width:${250+students.length*26}px">
        <thead style="position:sticky;top:0;z-index:5;background:var(--surface)">
          <tr>
            <th style="padding:4px 8px;text-align:left;border-bottom:1px solid var(--border);position:sticky;left:0;background:var(--surface);z-index:6;min-width:220px;font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);text-transform:uppercase">Code</th>
            ${studentHeaders}
            <th style="padding:4px 8px;border-bottom:1px solid var(--border);font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);text-transform:uppercase;text-align:right">Taught</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
    <!-- Legend -->
    <div style="display:flex;gap:16px;padding:10px 16px;border-top:1px solid var(--border);flex-wrap:wrap;align-items:center">
      <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:0.1em">Legend</span>
      ${[
        ['●','var(--green)','Achieved'],
        ['◐','var(--gold)','Developing'],
        ['○','var(--rust)','Emerging'],
        ['·','var(--blue)','Taught · not assessed'],
        [' ','var(--surface2)','Not taught yet'],
      ].map(([dot,bg,label]) => `<div style="display:flex;align-items:center;gap:6px">
        <div style="width:18px;height:18px;border-radius:3px;background:${bg};display:flex;align-items:center;justify-content:center;font-size:10px;color:${bg==='var(--surface2)'?'var(--text3)':'#0f1117'}">${dot}</div>
        <span style="font-size:11px;color:var(--text3)">${label}</span>
      </div>`).join('')}
    </div>`;
  }

  // Strands for the selected subject
  const availStrands = cf.subject !== 'all'
    ? [...new Set(state.curriculumCodes.filter(c => c.Subject === cf.subject).map(c => c.Strand).filter(Boolean))].sort()
    : [];

  main.innerHTML = `
    <div class="topbar" style="flex-wrap:wrap;gap:6px;padding:12px 20px">
      <div class="topbar-title">Coverage Gaps</div>
      <!-- Summary stats -->
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span style="font-size:12px;color:var(--text3)">
          <span style="color:${col};font-weight:700">${taughtCells}</span>/${totalCells} taught
          &nbsp;·&nbsp;
          <span style="color:var(--green);font-weight:700">${achievedCells}</span> achieved
          &nbsp;·&nbsp;
          <span style="color:var(--rust);font-weight:700">${gapCodes.length}</span> codes never taught
        </span>
      </div>
      <div style="width:100%;display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:2px">
        <!-- Subject -->
        <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3)">SUBJECT</span>
        ${availSubjects.map(s => fBtn(subjectShort(s), cf.subject===s, 'subject', s)).join('')}
        <div style="width:1px;height:18px;background:var(--border2)"></div>
        <!-- Year -->
        <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3)">YEAR</span>
        ${['all','F','1','2','3','4','5','6'].map(y => fBtn(y==='all'?'All':'Yr '+y, cf.year===y, 'year', y)).join('')}
        <div style="width:1px;height:18px;background:var(--border2)"></div>
        <!-- Mode -->
        ${fBtn('All codes',    cf.mode==='all',        'mode', 'all')}
        ${fBtn('⚠ Gaps only', cf.mode==='not-taught', 'mode', 'not-taught')}
      </div>
      <!-- Strand filter row — only shown when a subject is selected -->
      ${availStrands.length > 0 ? `
      <div style="width:100%;display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding-top:6px;border-top:1px solid var(--border)">
        <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3)">STRAND</span>
        ${fBtn('All strands', cf.strand==='all', 'strand', 'all')}
        ${availStrands.map(st => fBtn(st, cf.strand===st, 'strand', st)).join('')}
      </div>` : ''}
    </div>
    <div style="padding:0">
      <div class="card" style="border-radius:0;border-left:none;border-right:none;border-top:none">
        ${state.curriculumCodes.length === 0
          ? `<div class="empty-state" style="padding:60px"><div class="empty-icon">◈</div><div class="empty-title">Curriculum data not loaded</div></div>`
          : buildGrid()}
      </div>
    </div>
  `;
}


// ════════════════════════════════════════════════════
// ── DAILY LOG WIZARD ──
// 3-step popup: Attendance → Codes Taught → Quick Mastery
// ════════════════════════════════════════════════════

let dlState = {
  step: 1,           // 1=attendance, 2=codes, 3=mastery
  date: '',
  absentIds: new Set(),
  selectedCodes: [],  // array of code strings
  masteryMap: {},     // key: studentId+'|'+code → 'Achieved'|'Developing'|'Emerging'|null
  aiLoading: false,
};

function openDailyLogWizard() {
  dlState = {
    step: 1,
    date: new Date().toISOString().split('T')[0],
    absentIds: new Set(),
    selectedCodes: [],
    masteryMap: {},
    aiLoading: false,
  };
  renderDlModal();
}

function renderDlModal() {
  const existing = document.getElementById('dl-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'dl-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:150;animation:fadeIn 0.15s ease';

  const steps = ['Attendance','Codes Taught','Quick Mastery'];
  const stepBar = steps.map((s, i) => {
    const n = i + 1;
    const active  = dlState.step === n;
    const done    = dlState.step > n;
    const col     = done ? 'var(--green)' : active ? 'var(--blue)' : 'var(--text3)';
    const bg      = done ? 'var(--green-dim)' : active ? 'var(--blue-dim)' : 'var(--surface2)';
    return `<div style="display:flex;align-items:center;gap:6px;flex:1;${n < 3 ? 'margin-right:8px' : ''}">
      <div style="width:22px;height:22px;border-radius:50%;background:${bg};border:1.5px solid ${col};display:flex;align-items:center;justify-content:center;font-family:'DM Mono',monospace;font-size:9px;color:${col};flex-shrink:0">${done ? '✓' : n}</div>
      <span style="font-family:'DM Mono',monospace;font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:${col}">${s}</span>
      ${n < 3 ? `<div style="flex:1;height:1px;background:${done?'var(--green)':'var(--border2)'}"></div>` : ''}
    </div>`;
  }).join('');

  let bodyHtml = '';
  if (dlState.step === 1) bodyHtml = buildDlStep1();
  else if (dlState.step === 2) bodyHtml = buildDlStep2();
  else bodyHtml = buildDlStep3();

  const isLastStep = dlState.step === 3;
  const nextLabel  = dlState.step === 1 ? `Next → Codes (${state.students.length - dlState.absentIds.size} present)`
    : dlState.step === 2 ? `Next → Quick Mastery (${dlState.selectedCodes.length} codes)`
    : `✓ Save Session`;

  // Modal width: step 3 gets much wider to fit the mastery grid
  const modalWidth = dlState.step === 3
    ? 'width:min(95vw,1100px)'
    : 'width:min(96vw,680px)';

  overlay.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border2);border-radius:12px;${modalWidth};max-height:92vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,0.5);animation:slideUp 0.2s ease">
      <!-- Header -->
      <div style="padding:18px 22px 14px;border-bottom:1px solid var(--border);flex-shrink:0">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div style="font-family:'Fraunces',serif;font-size:17px">Log Teaching Session</div>
          <div style="display:flex;align-items:center;gap:10px">
            <input type="date" value="${dlState.date}" onchange="dlState.date=this.value"
              style="background:var(--surface2);border:1px solid var(--border2);border-radius:5px;padding:4px 8px;color:var(--text2);font-family:'DM Mono',monospace;font-size:11px;outline:none">
            <button onclick="closeDlModal()" style="background:none;border:none;color:var(--text3);font-size:18px;cursor:pointer;line-height:1">✕</button>
          </div>
        </div>
        <!-- Step bar -->
        <div style="display:flex;align-items:center">${stepBar}</div>
      </div>
      <!-- Body -->
      <div style="flex:1;overflow-y:auto;padding:18px 22px" id="dl-body">
        ${bodyHtml}
      </div>
      <!-- Footer -->
      <div style="padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:space-between;flex-shrink:0">
        <button onclick="${dlState.step === 1 ? 'closeDlModal()' : 'dlBack()'}" style="padding:8px 18px;border-radius:6px;border:1px solid var(--border2);background:none;color:var(--text3);font-family:'Instrument Sans',sans-serif;font-size:13px;cursor:pointer">
          ${dlState.step === 1 ? 'Dismiss' : '← Back'}
        </button>
        <div style="display:flex;gap:8px">
          ${dlState.step === 3 ? `<button onclick="dlSkipMastery()" style="padding:8px 18px;border-radius:6px;border:1px solid var(--border2);background:none;color:var(--text3);font-family:'Instrument Sans',sans-serif;font-size:13px;cursor:pointer">Skip mastery</button>` : ''}
          <button onclick="dlNext()" style="padding:8px 20px;border-radius:6px;border:none;background:var(--blue);color:#0f1117;font-family:'Instrument Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer">
            ${nextLabel}
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  // Wire up step-specific events after render
  if (dlState.step === 2) wireDlStep2Events();
}

function closeDlModal() {
  const el = document.getElementById('dl-overlay');
  if (el) el.remove();
}

// ── STEP 1: ATTENDANCE ──
function buildDlStep1() {
  const sorted = [...state.students].sort((a,b) => a.last_name.localeCompare(b.last_name));
  const presentCount = sorted.length - dlState.absentIds.size;
  return `
    <div style="font-size:12px;color:var(--text3);margin-bottom:12px">Tap any student to mark them <strong style="color:var(--rust)">absent</strong>. Everyone else is present.</div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--text3)">${presentCount} present · ${dlState.absentIds.size} absent</div>
      <div style="display:flex;gap:6px">
        <button onclick="dlMarkAll(false)" style="padding:3px 10px;border-radius:4px;border:1px solid var(--border2);background:none;color:var(--text3);font-size:11px;cursor:pointer">All present</button>
        <button onclick="dlMarkAll(true)" style="padding:3px 10px;border-radius:4px;border:1px solid var(--border2);background:none;color:var(--text3);font-size:11px;cursor:pointer">All absent</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px" id="dl-attendance-grid">
      ${sorted.map((s,i) => {
        const absent = dlState.absentIds.has(s.id);
        return `<div onclick="dlToggleAbsent('${s.id}')" id="dl-att-${s.id}"
          style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;border:1.5px solid ${absent?'var(--rust)':'var(--border)'};background:${absent?'var(--rust-dim)':'none'};cursor:pointer;transition:all 0.12s;user-select:none">
          <div class="sc-avatar ${getAvClass(i)}" style="width:26px;height:26px;font-size:11px;flex-shrink:0;${absent?'opacity:0.4':''}">${getInitials(s)}</div>
          <div style="font-size:12px;font-weight:600;color:${absent?'var(--rust)':'var(--text)'};line-height:1.2">${s.first_name}<br><span style="font-weight:400;font-size:10px;color:var(--text3)">${s.last_name}</span></div>
          ${absent ? `<div style="margin-left:auto;font-size:10px;color:var(--rust)">✗</div>` : ''}
        </div>`;
      }).join('')}
    </div>
  `;
}

function dlToggleAbsent(id) {
  if (dlState.absentIds.has(id)) dlState.absentIds.delete(id);
  else dlState.absentIds.add(id);
  // Re-render just the card
  const el = document.getElementById('dl-att-' + id);
  if (!el) return;
  const s = state.students.find(x => x.id === id);
  if (!s) return;
  const i = state.students.indexOf(s);
  const absent = dlState.absentIds.has(id);
  el.style.border = `1.5px solid ${absent ? 'var(--rust)' : 'var(--border)'}`;
  el.style.background = absent ? 'var(--rust-dim)' : 'none';
  el.innerHTML = `
    <div class="sc-avatar ${getAvClass(i)}" style="width:26px;height:26px;font-size:11px;flex-shrink:0;${absent?'opacity:0.4':''}">${getInitials(s)}</div>
    <div style="font-size:12px;font-weight:600;color:${absent?'var(--rust)':'var(--text)'};line-height:1.2">${s.first_name}<br><span style="font-weight:400;font-size:10px;color:var(--text3)">${s.last_name}</span></div>
    ${absent ? `<div style="margin-left:auto;font-size:10px;color:var(--rust)">✗</div>` : ''}
  `;
  // Update footer count
  const footer = document.querySelector('#dl-overlay button[onclick="dlNext()"]');
  const presentCount = state.students.length - dlState.absentIds.size;
  if (footer) footer.textContent = `Next → Codes (${presentCount} present)`;
  // Update header count
  const countEl = document.querySelector('#dl-body div[style*="DM Mono"]');
  if (countEl) countEl.textContent = `${presentCount} present · ${dlState.absentIds.size} absent`;
}

function dlMarkAll(absent) {
  if (absent) state.students.forEach(s => dlState.absentIds.add(s.id));
  else dlState.absentIds.clear();
  document.getElementById('dl-body').innerHTML = buildDlStep1();
  const presentCount = state.students.length - dlState.absentIds.size;
  const footer = document.querySelector('#dl-overlay button[onclick="dlNext()"]');
  if (footer) footer.textContent = `Next → Codes (${presentCount} present)`;
}

// ── STEP 2: CODES TAUGHT ──
function buildDlStep2() {
  const availSubjects = [...new Set(state.curriculumCodes.map(c => c.Subject).filter(Boolean))].sort();
  const presenterCount = state.students.length - dlState.absentIds.size;

  return `
    <div style="font-size:12px;color:var(--text3);margin-bottom:14px">
      Select the curriculum codes taught today to <strong style="color:var(--text)">${presenterCount} present students</strong>.
      Search, browse by subject/strand, or describe the lesson and let AI suggest codes.
    </div>

    <!-- AI describe box -->
    <div style="background:var(--surface2);border:1px solid var(--border2);border-radius:8px;padding:12px 14px;margin-bottom:14px">
      <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:var(--purple);margin-bottom:8px">✦ AI Code Suggester</div>
      <div style="display:flex;gap:8px">
        <input id="dl-ai-input" placeholder="Describe everything taught today across all subjects… e.g. '2 times tables and doubling, phonics blending, narrative writing openers, living vs non-living things'"
          style="flex:1;background:var(--surface);border:1px solid var(--border2);border-radius:6px;padding:8px 12px;color:var(--text);font-size:12px;outline:none;font-family:'Instrument Sans',sans-serif"
          onkeydown="if(event.key==='Enter')dlAISuggest()">
        <button onclick="dlAISuggest()" id="dl-ai-btn"
          style="padding:8px 14px;border-radius:6px;border:1px solid var(--purple);background:var(--purple-dim);color:var(--purple);font-size:12px;cursor:pointer;white-space:nowrap;font-family:'Instrument Sans',sans-serif">
          Suggest
        </button>
      </div>
      <div id="dl-ai-results" style="margin-top:10px"></div>
    </div>

    <!-- Filters -->
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
      <div style="position:relative;flex:1;min-width:160px">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text3);font-size:13px">⌕</span>
        <input id="dl-code-search" placeholder="Search codes…"
          style="width:100%;padding:6px 10px 6px 30px;background:var(--surface2);border:1px solid var(--border2);border-radius:6px;color:var(--text);font-size:12px;outline:none;box-sizing:border-box"
          oninput="dlFilterCodes()">
      </div>
      <select id="dl-subj-filter" onchange="dlFilterCodes()"
        style="background:var(--surface2);border:1px solid var(--border2);border-radius:5px;padding:6px 8px;color:var(--text2);font-size:12px;cursor:pointer;outline:none">
        <option value="all">All subjects</option>
        ${availSubjects.map(s => `<option value="${s}">${s}</option>`).join('')}
      </select>
      <select id="dl-strand-filter" onchange="dlFilterCodes()"
        style="background:var(--surface2);border:1px solid var(--border2);border-radius:5px;padding:6px 8px;color:var(--text2);font-size:12px;cursor:pointer;outline:none">
        <option value="all">All strands</option>
      </select>
      <select id="dl-year-filter" onchange="dlFilterCodes()"
        style="background:var(--surface2);border:1px solid var(--border2);border-radius:5px;padding:6px 8px;color:var(--text2);font-size:12px;cursor:pointer;outline:none">
        <option value="all">All years</option>
        ${['Foundation','Year 1','Year 2','Year 3','Year 4','Year 5','Year 6'].map(y => `<option value="${y}">${y}</option>`).join('')}
      </select>
    </div>

    <!-- Selected chips -->
    <div id="dl-selected-chips" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;min-height:26px">
      ${buildDlSelectedChips()}
    </div>

    <!-- Code list -->
    <div id="dl-code-list" style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:6px">
      ${buildDlCodeListHtml(state.curriculumCodes.slice(0,80))}
    </div>
    <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);margin-top:6px" id="dl-code-count">
      Showing ${Math.min(80, state.curriculumCodes.length)} of ${state.curriculumCodes.length} codes — use filters or search to narrow
    </div>
  `;
}

function wireDlStep2Events() {
  // Work out the year levels of present students
  const YLM = {'F':'Foundation','1':'Year 1','2':'Year 2','3':'Year 3','4':'Year 4','5':'Year 5','6':'Year 6'};
  const presentYears = [...new Set(
    state.students
      .filter(s => !dlState.absentIds.has(s.id))
      .map(s => YLM[normaliseYear(s.year_level)] || s.year_level)
  )];

  // Pre-select year if all present students are in the same year
  if (presentYears.length === 1) {
    const yr = document.getElementById('dl-year-filter');
    if (yr) yr.value = presentYears[0];
  }

  // Pre-select first subject that has codes for this year
  const subjSel = document.getElementById('dl-subj-filter');
  if (subjSel && subjSel.value === 'all' && presentYears.length === 1) {
    const firstSubj = [...new Set(
      state.curriculumCodes
        .filter(c => (c['Year Level']||'').trim() === presentYears[0])
        .map(c => c.Subject).filter(Boolean)
    )].sort()[0];
    if (firstSubj) subjSel.value = firstSubj;
  }

  // Now run the filter with the pre-set values
  dlFilterCodes();
}

function buildDlSelectedChips() {
  if (!dlState.selectedCodes.length) return '<span style="font-size:11px;color:var(--text3)">No codes selected yet</span>';
  return dlState.selectedCodes.map(code => {
    const cd = state.curriculumCodes.find(c => c.Code === code);
    // Colour chip by subject
    const subjColours = { 'English':'var(--blue)','Mathematics':'var(--green)','Science':'var(--teal)','HASS':'var(--gold)' };
    const col = subjColours[cd?.Subject] || 'var(--blue)';
    return `<div style="display:inline-flex;align-items:center;gap:5px;background:${col}22;border:1px solid ${col};border-radius:4px;padding:3px 8px;font-size:11px;color:${col}">
      <span style="font-family:'DM Mono',monospace">${code}</span>
      ${cd ? `<span style="color:var(--text3);font-size:10px">${cd.Subject ? cd.Subject.slice(0,4).toUpperCase() : ''}</span>` : ''}
      <button onclick="dlToggleCode('${code}')" style="background:none;border:none;color:${col};cursor:pointer;font-size:12px;padding:0;line-height:1;opacity:0.7">✕</button>
    </div>`;
  }).join('');
}

function buildDlCodeListHtml(codes) {
  if (!codes.length) return '<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">No codes match your filters</div>';
  return codes.map(c => {
    const selected = dlState.selectedCodes.includes(c.Code);
    return `<div onclick="dlToggleCode('${c.Code}')" data-dl-code="${c.Code}"
      style="display:flex;align-items:flex-start;gap:10px;padding:8px 12px;border-bottom:1px solid var(--border);cursor:pointer;transition:background 0.1s;${selected?'background:var(--blue-dim);':''}"
      onmouseover="if(!${selected})this.style.background='var(--surface2)'" onmouseout="if(!${selected})this.style.background='transparent'">
      <div style="width:16px;height:16px;border-radius:3px;border:1.5px solid ${selected?'var(--blue)':'var(--border2)'};background:${selected?'var(--blue)':'none'};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px">
        ${selected ? '<span style="color:#0f1117;font-size:10px;font-weight:700">✓</span>' : ''}
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-family:'DM Mono',monospace;font-size:10px;color:${selected?'var(--blue)':'var(--text3)'}">${c.Code}</span>
          <span style="font-size:9px;background:var(--surface2);padding:1px 5px;border-radius:3px;color:var(--text3)">${c.Subject||''}</span>
          <span style="font-size:9px;color:var(--text3)">${c.Strand||''}</span>
        </div>
        <div style="font-size:11px;color:var(--text2);line-height:1.4;margin-top:2px">${c.Descriptor||c.Aspect||'—'}</div>
      </div>
    </div>`;
  }).join('');
}

function dlToggleCode(code) {
  const idx = dlState.selectedCodes.indexOf(code);
  if (idx >= 0) dlState.selectedCodes.splice(idx, 1);
  else dlState.selectedCodes.push(code);
  // Update chips
  const chips = document.getElementById('dl-selected-chips');
  if (chips) chips.innerHTML = buildDlSelectedChips();
  // Update row highlight
  const row = document.querySelector(`[data-dl-code="${code}"]`);
  if (row) {
    const selected = dlState.selectedCodes.includes(code);
    row.style.background = selected ? 'var(--blue-dim)' : 'transparent';
    const box = row.querySelector('div');
    if (box) {
      box.style.borderColor = selected ? 'var(--blue)' : 'var(--border2)';
      box.style.background  = selected ? 'var(--blue)' : 'none';
      box.innerHTML = selected ? '<span style="color:#0f1117;font-size:10px;font-weight:700">✓</span>' : '';
    }
  }
  // Update footer
  const btn = document.querySelector('#dl-overlay button[onclick="dlNext()"]');
  if (btn) btn.textContent = `Next → Quick Mastery (${dlState.selectedCodes.length} codes)`;
}

function dlFilterCodes() {
  const q    = (document.getElementById('dl-code-search')?.value || '').toLowerCase();
  const subj = document.getElementById('dl-subj-filter')?.value || 'all';
  const year = document.getElementById('dl-year-filter')?.value || 'all';

  // Rebuild strand options for selected subject FIRST, preserving current selection
  const strandSel = document.getElementById('dl-strand-filter');
  let strand = 'all';
  if (strandSel) {
    const prevStrand = strandSel.value; // save before rebuild
    if (subj !== 'all') {
      const strands = [...new Set(
        state.curriculumCodes
          .filter(c => c.Subject === subj && (year === 'all' || (c['Year Level']||'').trim() === year))
          .map(c => c.Strand).filter(Boolean)
      )].sort();
      strandSel.innerHTML = `<option value="all">All strands</option>${strands.map(s => `<option value="${s}">${s}</option>`).join('')}`;
      // Restore previous selection if still valid
      if (strands.includes(prevStrand)) strandSel.value = prevStrand;
    } else {
      strandSel.innerHTML = `<option value="all">All strands</option>`;
    }
    strand = strandSel.value;
  }

  const filtered = state.curriculumCodes.filter(c => {
    if (subj   !== 'all' && c.Subject !== subj) return false;
    if (strand !== 'all' && c.Strand  !== strand) return false;
    if (year   !== 'all' && (c['Year Level']||'').trim() !== year) return false;
    if (q && !(
      (c.Code||'').toLowerCase().includes(q) ||
      (c.Descriptor||'').toLowerCase().includes(q) ||
      (c.Strand||'').toLowerCase().includes(q)
    )) return false;
    return true;
  }).slice(0, 150);

  const list  = document.getElementById('dl-code-list');
  const count = document.getElementById('dl-code-count');
  if (list)  list.innerHTML  = buildDlCodeListHtml(filtered);
  if (count) count.textContent = `Showing ${filtered.length} codes${filtered.length === 150 ? ' (use filters to narrow)' : ''}`;
}

// ── KEYWORD SCORER (fallback — works with no API key) ──
// Expands common teaching synonyms so "doubling" matches "multiplication facts for twos" etc.
const SYNONYM_MAP = {
  'doubling':'multiplication', 'halving':'division', 'times tables':'multiplication',
  'timestables':'multiplication', 'timetables':'multiplication', 'timestabls':'multiplication',
  'number facts':'multiplication', 'addition facts':'addition', 'subtraction facts':'subtraction',
  'place value':'place', 'number sense':'number', 'counting on':'counting',
  'phonics':'phonemic', 'phonemic awareness':'phonemic', 'blending':'blend',
  'segmenting':'segment', 'decoding':'decode', 'sight words':'sight', 'high frequency':'sight',
  'narratives':'narrative', 'recounts':'recount', 'reports':'report', 'procedures':'procedure',
  'sentence types':'sentence', 'question marks':'punctuation', 'full stops':'punctuation',
  'capital letters':'capitalisation', 'speech marks':'punctuation', 'paragraphs':'paragraph',
  'character':'character', 'setting':'setting', 'plot':'plot',
  'fractions':'fraction', 'decimals':'decimal', 'percentages':'percentage',
  'measurement':'measure', 'length':'length', 'area':'area', 'volume':'volume',
  'data':'data', 'graphs':'graph', 'chance':'probability', 'probability':'probability',
  'living things':'living', 'materials':'material', 'forces':'force', 'energy':'energy',
  'geography':'geography', 'history':'history', 'civics':'civics',
};

function keywordScore(lessonText, descriptor) {
  // Normalise and expand synonyms
  let text = lessonText.toLowerCase();
  Object.entries(SYNONYM_MAP).forEach(([alias, canonical]) => {
    text = text.replace(new RegExp(alias, 'g'), canonical);
  });

  const textWords = new Set(
    text.split(/\W+/).filter(w => w.length > 2 &&
      !['the','and','for','with','are','was','that','this','they','have',
        'from','been','each','will','when','what','how','but','not','can',
        'its','their','about','into','also','using','which','through'].includes(w))
  );

  let desc = (descriptor || '').toLowerCase();
  Object.entries(SYNONYM_MAP).forEach(([alias, canonical]) => {
    desc = desc.replace(new RegExp(alias, 'g'), canonical);
  });
  const descWords = desc.split(/\W+/).filter(w => w.length > 2);

  let score = 0;
  descWords.forEach(w => { if (textWords.has(w)) score++; });
  // Bonus for longer matches (phrase-level)
  textWords.forEach(tw => { if (desc.includes(tw) && tw.length > 4) score += 0.5; });
  return score;
}

function keywordSuggest(lessonText, codes) {
  const scored = codes
    .map(c => ({ code: c.Code, score: keywordScore(lessonText, c.Descriptor || c.Aspect || '') }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  return scored.map(x => x.code);
}

// ── AI SUGGESTER (with keyword fallback) ──
async function dlAISuggest() {
  const input   = document.getElementById('dl-ai-input');
  const btn     = document.getElementById('dl-ai-btn');
  const results = document.getElementById('dl-ai-results');
  const text    = input?.value?.trim();
  if (!text) { toast('Describe what you taught first', 'error'); return; }

  btn.textContent = '…'; btn.disabled = true;
  results.innerHTML = `<div style="font-size:11px;color:var(--text3);display:flex;align-items:center;gap:8px">
    <div class="spinner" style="width:14px;height:14px;border-width:2px"></div> Searching across all subjects…
  </div>`;

  // Always search ALL subjects — only filter by year for relevance
  // Subject filter still applies to the browse list below, but NOT to AI suggestions
  const year = document.getElementById('dl-year-filter')?.value || 'all';
  const relevantCodes = state.curriculumCodes.filter(c => {
    if (year !== 'all' && (c['Year Level']||'').trim() !== year) return false;
    return true;
  });

  if (!relevantCodes.length) {
    results.innerHTML = `<div style="font-size:11px;color:var(--text3)">No codes loaded — make sure your CSV has loaded.</div>`;
    btn.textContent = 'Suggest'; btn.disabled = false;
    return;
  }

  let suggestedCodes = [];
  let reasoning = '';
  let method = 'ai';

  // ── Try AI via Apps Script first ──
  try {
    const yearContext = year !== 'all' ? ` for ${year}` : '';

    // Send all codes across all subjects — AI picks the best regardless of subject
    const codeList = relevantCodes.map(c =>
      `${c.Code}|${c.Subject}|${c.Strand||''}|${(c.Descriptor||c.Aspect||'').slice(0,90)}`
    ).join('\n');

    const prompt = `You are helping an Australian primary school teacher identify Australian Curriculum v9 codes${yearContext}.
The teacher has described everything taught in their day. Identify ALL relevant codes across ALL subjects.
Lesson description: "${text}"
Available codes (Code|Subject|Strand|Descriptor):
${codeList}
Return ONLY valid JSON, no preamble, no backticks:
{"codes":["CODE1","CODE2","CODE3"],"reasoning":"One sentence explanation"}
Return up to 12 codes covering all subjects mentioned. Be generous — include any code that reasonably matches any part of the description.`;

    const result = await apiCall('claudeSuggest', { prompt });

    if (result && result.codes && result.codes.length) {
      suggestedCodes = result.codes.filter(code => state.curriculumCodes.some(c => c.Code === code));
      reasoning = result.reasoning || '';
    } else if (result && result.text) {
      const parsed = JSON.parse(result.text.replace(/```json|```/g,'').trim());
      suggestedCodes = (parsed.codes||[]).filter(code => state.curriculumCodes.some(c => c.Code === code));
      reasoning = parsed.reasoning || '';
    }

    if (!suggestedCodes.length) throw new Error('AI returned no valid codes');

  } catch(aiErr) {
    // ── Keyword fallback — also searches all subjects ──
    console.info('AI suggest fell back to keyword scoring:', aiErr.message);
    method = 'keyword';
    suggestedCodes = keywordSuggest(text, relevantCodes);
    reasoning = suggestedCodes.length
      ? 'Matched by keyword scoring across all subjects'
      : '';
  }

  // ── Render results ──
  if (!suggestedCodes.length) {
    // Show closest keyword matches as clickable buttons even when AI finds nothing
    const closest = relevantCodes
      .map(c => ({ code: c.Code, cd: c, score: keywordScore(text, c.Descriptor||c.Aspect||'') }))
      .filter(x => x.score > 0)
      .sort((a,b) => b.score - a.score)
      .slice(0, 6);

    if (closest.length) {
      results.innerHTML = `
        <div style="font-size:11px;color:var(--text3);margin-bottom:8px">
          No strong matches — showing closest results across all subjects. Click to add:
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:5px">
          ${closest.map(({code, cd}) => {
            const selected = dlState.selectedCodes.includes(code);
            const subjColours = {'English':'var(--blue)','Mathematics':'var(--green)','Science':'var(--teal)','HASS':'var(--gold)'};
            const col = selected ? 'var(--green)' : (subjColours[cd?.Subject] || 'var(--text3)');
            return `<button onclick="dlAddAISuggested('${code}')" id="dl-ai-chip-${code}"
              style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:5px;
              border:1px solid ${col};background:${col}22;color:${col};
              font-size:11px;cursor:pointer;transition:all 0.15s">
              <span style="font-family:'DM Mono',monospace">${selected ? '✓' : '+'} ${code}</span>
              <span style="font-size:10px;color:var(--text3)">${(cd?.Subject||'').slice(0,4).toUpperCase()}</span>
            </button>`;
          }).join('')}
        </div>`;
    } else {
      results.innerHTML = `<div style="font-size:11px;color:var(--text3)">
        No matches found. Try describing your lesson in more detail — include subject-specific terms
        like "phonics", "multiplication", "narrative writing", "living things" etc.
      </div>`;
    }
  } else {
    const methodLabel = method === 'ai'
      ? `<span style="color:var(--purple);font-size:10px;font-weight:600">✦ AI suggested · all subjects</span>`
      : `<span style="color:var(--text3);font-size:10px">⌕ Keyword match · all subjects</span>`;

    // Group suggested codes by subject for easier reading
    const bySubject = {};
    suggestedCodes.forEach(code => {
      const cd = state.curriculumCodes.find(c => c.Code === code);
      const subj = cd?.Subject || 'Other';
      if (!bySubject[subj]) bySubject[subj] = [];
      bySubject[subj].push({ code, cd });
    });

    const subjColours = {'English':'var(--blue)','Mathematics':'var(--green)','Science':'var(--teal)','HASS':'var(--gold)','Health and Physical Education':'var(--rust)','Design and Technologies':'var(--purple)','Digital Technologies':'var(--purple)'};

    const groupedHtml = Object.entries(bySubject).map(([subj, items]) => {
      const col = subjColours[subj] || 'var(--text2)';
      return `<div style="margin-bottom:10px">
        <div style="font-family:'DM Mono',monospace;font-size:9px;color:${col};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px">${subj}</div>
        <div style="display:flex;flex-direction:column;gap:5px">
          ${items.map(({code, cd}) => {
            const selected = dlState.selectedCodes.includes(code);
            const btnCol = selected ? 'var(--green)' : col;
            const btnBg  = selected ? 'var(--green-dim)' : 'var(--surface2)';
            const descriptor = cd ? (cd.Descriptor || cd.Aspect || '') : '';
            return `<button onclick="dlAddAISuggested('${code}')" id="dl-ai-chip-${code}"
              style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:6px;
              border:2px solid ${btnCol};background:${btnBg};
              text-align:left;width:100%;cursor:pointer;transition:all 0.15s">
              <!-- Tick / Plus indicator -->
              <div style="width:20px;height:20px;border-radius:50%;border:2px solid ${btnCol};
                background:${selected?btnCol:'none'};display:flex;align-items:center;justify-content:center;
                flex-shrink:0;margin-top:1px;font-size:11px;color:${selected?'#0f1117':btnCol}">
                ${selected ? '✓' : '+'}
              </div>
              <div style="flex:1;min-width:0">
                <!-- Code + strand row -->
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap">
                  <span style="font-family:'DM Mono',monospace;font-size:11px;font-weight:700;color:${btnCol}">${code}</span>
                  ${cd?.Strand ? `<span style="font-size:9px;background:${col}22;color:${col};padding:1px 6px;border-radius:3px;font-family:'DM Mono',monospace">${cd.Strand}</span>` : ''}
                </div>
                <!-- Full descriptor -->
                <div style="font-size:11px;color:var(--text2);line-height:1.5">${descriptor || '—'}</div>
              </div>
            </button>`;
          }).join('')}
        </div>
      </div>`;
    }).join('');

    results.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        ${methodLabel}
        <span style="font-size:11px;color:var(--text3);font-style:italic;flex:1">${reasoning}</span>
      </div>
      ${groupedHtml}
      <div style="font-size:10px;color:var(--text3);margin-top:6px">Click any code to add it to your selection ↑</div>`;
  }

  btn.textContent = 'Suggest'; btn.disabled = false;
}

function dlAddAISuggested(code) {
  if (!dlState.selectedCodes.includes(code)) {
    dlState.selectedCodes.push(code);
  } else {
    dlState.selectedCodes.splice(dlState.selectedCodes.indexOf(code), 1);
  }
  const selected = dlState.selectedCodes.includes(code);
  const cd = state.curriculumCodes.find(c => c.Code === code);
  const subjColours = {'English':'var(--blue)','Mathematics':'var(--green)','Science':'var(--teal)','HASS':'var(--gold)','Health and Physical Education':'var(--rust)','Design and Technologies':'var(--purple)','Digital Technologies':'var(--purple)'};
  const col    = subjColours[cd?.Subject] || 'var(--purple)';
  const btnCol = selected ? 'var(--green)' : col;
  const btnBg  = selected ? 'var(--green-dim)' : 'var(--surface2)';

  // Update the card button appearance
  const chip = document.getElementById('dl-ai-chip-' + code);
  if (chip) {
    chip.style.borderColor = btnCol;
    chip.style.background  = btnBg;
    // Update the circle indicator (first child div)
    const circle = chip.querySelector('div');
    if (circle) {
      circle.style.borderColor = btnCol;
      circle.style.background  = selected ? btnCol : 'none';
      circle.style.color       = selected ? '#0f1117' : btnCol;
      circle.textContent       = selected ? '✓' : '+';
    }
    // Update code text colour
    const codeSpan = chip.querySelector('span');
    if (codeSpan) codeSpan.style.color = btnCol;
  }

  // Update the selected chips row at top of code list
  const chips = document.getElementById('dl-selected-chips');
  if (chips) chips.innerHTML = buildDlSelectedChips();

  // Update footer next button
  const btn = document.querySelector('#dl-overlay button[onclick="dlNext()"]');
  if (btn) btn.textContent = `Next → Quick Mastery (${dlState.selectedCodes.length} codes)`;

  // Also highlight the row in the code list if it's visible
  const row = document.querySelector(`[data-dl-code="${code}"]`);
  if (row) {
    row.style.background = selected ? 'var(--blue-dim)' : 'transparent';
    const box = row.querySelector('div');
    if (box) {
      box.style.borderColor = selected ? 'var(--blue)' : 'var(--border2)';
      box.style.background  = selected ? 'var(--blue)' : 'none';
      box.innerHTML = selected ? '<span style="color:#0f1117;font-size:10px;font-weight:700">✓</span>' : '';
    }
  }
}

// ── STEP 3: QUICK MASTERY ──
function buildDlStep3() {
  const presentStudents = state.students.filter(s => !dlState.absentIds.has(s.id))
    .sort((a,b) => a.last_name.localeCompare(b.last_name));
  const codes = dlState.selectedCodes;

  if (!codes.length) return `<div class="empty-state" style="padding:40px"><div class="empty-icon">◈</div><div class="empty-title">No codes selected</div><div class="empty-sub">Go back and select codes taught today</div></div>`;

  const masteryColours = {
    'Achieved':  { col:'var(--green)', bg:'var(--green-dim)', dot:'●' },
    'Developing':{ col:'var(--gold)',  bg:'var(--gold-dim)',  dot:'◐' },
    'Emerging':  { col:'var(--rust)',  bg:'var(--rust-dim)',  dot:'○' },
  };

  // Build header: one column per code
  const subjColours = {'English':'var(--blue)','Mathematics':'var(--green)','Science':'var(--teal)','HASS':'var(--gold)','Health and Physical Education':'var(--rust)','Design and Technologies':'var(--purple)','Digital Technologies':'var(--purple)'};

  const codeHeaders = codes.map(code => {
    const cd = state.curriculumCodes.find(c => c.Code === code);
    const col = subjColours[cd?.Subject] || 'var(--blue)';
    const descriptor = cd ? (cd.Descriptor || cd.Aspect || '') : '';
    return `<th style="padding:0;text-align:left;border-bottom:1px solid var(--border);min-width:180px;max-width:240px;vertical-align:bottom;border-left:1px solid var(--border)">
      <div style="display:flex;flex-direction:column;height:100%;padding:10px 12px;min-height:140px">
        <!-- Code + subject tag -->
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap">
          <span style="font-family:'DM Mono',monospace;font-size:11px;font-weight:700;color:${col}">${code}</span>
          ${cd?.Subject ? `<span style="font-size:8px;background:${col}22;color:${col};padding:1px 5px;border-radius:3px;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:0.05em">${cd.Subject.slice(0,4)}</span>` : ''}
          ${cd?.Strand ? `<span style="font-size:8px;color:var(--text3)">${cd.Strand}</span>` : ''}
        </div>
        <!-- Full descriptor — grows to fill space -->
        <div style="font-size:10px;color:var(--text2);line-height:1.4;flex:1;font-weight:400;font-family:'Instrument Sans',sans-serif">${descriptor}</div>
        <!-- Mark all buttons — always at bottom -->
        <div style="display:flex;flex-direction:column;gap:3px;margin-top:8px">
          ${[
            {m:'Achieved',  dot:'●', label:'All Achieved'},
            {m:'Developing',dot:'◐', label:'All Developing'},
            {m:'Emerging',  dot:'○', label:'All Emerging'},
          ].map(({m, dot, label}) => {
            const {col: mc, bg} = masteryColours[m];
            return `<button onclick="dlMarkAllForCode('${code}','${m}')"
              style="padding:4px 8px;border-radius:4px;border:1px solid ${mc};background:${bg};color:${mc};
              font-size:10px;cursor:pointer;width:100%;display:flex;align-items:center;gap:6px;font-family:'Instrument Sans',sans-serif;font-weight:600">
              <span style="font-size:12px;flex-shrink:0">${dot}</span>
              <span>${label}</span>
            </button>`;
          }).join('')}
          <button onclick="dlMarkAllForCode('${code}',null)"
            style="padding:4px 8px;border-radius:4px;border:1px solid var(--border2);background:none;color:var(--text3);
            font-size:10px;cursor:pointer;width:100%;display:flex;align-items:center;gap:6px;font-family:'Instrument Sans',sans-serif">
            <span style="font-size:12px;flex-shrink:0">✕</span>
            <span>Clear all</span>
          </button>
        </div>
      </div>
    </th>`;
  }).join('');

  // Build rows: one row per student
  const studentRows = presentStudents.map((s, si) => {
    const cells = codes.map(code => {
      const key     = s.id + '|' + code;
      const current = dlState.masteryMap[key] || null;
      const opts    = ['Achieved','Developing','Emerging'].map(m => {
        const {col, bg, dot} = masteryColours[m];
        const active = current === m;
        return `<button onclick="dlSetMastery('${s.id}','${code}','${m}')"
          title="${m}"
          style="width:28px;height:28px;border-radius:4px;border:1px solid ${active?col:'var(--border2)'};background:${active?bg:'none'};color:${active?col:'var(--text3)'};font-size:13px;cursor:pointer;transition:all 0.1s;display:flex;align-items:center;justify-content:center">
          ${dot}
        </button>`;
      }).join('');
      return `<td style="padding:5px 8px;text-align:center;border-bottom:1px solid var(--border)">
        <div style="display:flex;gap:3px;justify-content:center">${opts}</div>
      </td>`;
    }).join('');

    return `<tr style="${si%2===1?'background:rgba(255,255,255,0.02)':''}">
      <td style="padding:6px 10px;border-bottom:1px solid var(--border);white-space:nowrap;position:sticky;left:0;background:${si%2===1?'#1c2030':'var(--surface)'}">
        <div style="display:flex;align-items:center;gap:7px">
          <div class="sc-avatar ${getAvClass(si)}" style="width:22px;height:22px;font-size:9px;flex-shrink:0">${getInitials(s)}</div>
          <span style="font-size:12px;color:var(--text2)">${s.first_name} ${s.last_name}</span>
        </div>
      </td>
      ${cells}
    </tr>`;
  }).join('');

  return `
    <div style="font-size:12px;color:var(--text3);margin-bottom:10px">
      Optionally set mastery for each student × code. Tap a dot to select — <span style="color:var(--green)">●</span> Achieved &nbsp;<span style="color:var(--gold)">◐</span> Developing &nbsp;<span style="color:var(--rust)">○</span> Emerging. Leave blank to skip.
    </div>
    <div style="overflow-x:auto;border:1px solid var(--border);border-radius:6px">
      <table style="width:100%;border-collapse:collapse;min-width:${200 + codes.length * 200}px">
        <thead>
          <tr style="background:var(--surface2)">
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);position:sticky;left:0;background:var(--surface2);font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:0.1em;min-width:160px;vertical-align:bottom">Student</th>
            ${codeHeaders}
          </tr>
        </thead>
        <tbody>
          ${studentRows}
        </tbody>
      </table>
    </div>
    <div style="font-size:10px;color:var(--text3);margin-top:8px">
      ${presentStudents.length} students · ${codes.length} codes · ${Object.keys(dlState.masteryMap).length} mastery ratings set
    </div>
  `;
}

function dlMarkAllForCode(code, mastery) {
  const presentStudents = state.students.filter(s => !dlState.absentIds.has(s.id));
  presentStudents.forEach(s => {
    const key = s.id + '|' + code;
    if (mastery === null) delete dlState.masteryMap[key];
    else dlState.masteryMap[key] = mastery;
  });
  const body = document.getElementById('dl-body');
  if (body) body.innerHTML = buildDlStep3();
}

function dlSetMastery(studentId, code, mastery) {
  const key = studentId + '|' + code;
  if (mastery === null) delete dlState.masteryMap[key];
  else dlState.masteryMap[key] = mastery;
  // Re-render step 3 body only
  const body = document.getElementById('dl-body');
  if (body) body.innerHTML = buildDlStep3();
}

function dlSkipMastery() {
  dlState.masteryMap = {};
  saveDailyLog();
}

// ── NAVIGATION ──
function dlBack() {
  if (dlState.step > 1) { dlState.step--; renderDlModal(); }
}

function dlNext() {
  if (dlState.step === 1) {
    dlState.step = 2;
    renderDlModal();
  } else if (dlState.step === 2) {
    if (!dlState.selectedCodes.length) { toast('Select at least one code taught today', 'error'); return; }
    dlState.step = 3;
    renderDlModal();
  } else {
    saveDailyLog();
  }
}

// ── SAVE ──
async function saveDailyLog() {
  closeDlModal();
  const presentStudents = state.students.filter(s => !dlState.absentIds.has(s.id));
  const entries = [];

  presentStudents.forEach(s => {
    dlState.selectedCodes.forEach(code => {
      entries.push({
        date: dlState.date,
        student_id: s.id,
        code,
        notes: dlState.masteryMap[s.id + '|' + code] || ''
      });
    });
  });

  if (!entries.length) { toast('Nothing to save', 'error'); return; }

  toast(`Saving ${entries.length} taught records…`, 'success');
  setSyncing(true);
  let saved = 0;

  try {
    const result = await apiCall('saveTaughtLog', { entries });
    if (result.success) {
      // Add to local state
      entries.forEach((e, i) => {
        state.taughtLog.push({
          id: result.ids ? result.ids[i] : ('local_' + Date.now() + '_' + i),
          date: e.date,
          student_id: e.student_id,
          code: e.code,
          notes: e.notes
        });
      });
      saved = entries.length;
    }
  } catch(err) {
    // Fallback: save locally so session isn't lost
    entries.forEach((e, i) => {
      state.taughtLog.push({ id: 'local_' + Date.now() + '_' + i, ...e });
    });
    saved = entries.length;
    toast('Saved locally (Sheets sync failed)', 'error');
  }

  // Also save any mastery ratings through the existing progress flow
  const masteryEntries = Object.entries(dlState.masteryMap);
  for (const [key, mastery] of masteryEntries) {
    const [studentId, code] = key.split('|');
    if (!mastery) continue;
    try {
      await saveProgress({
        student_id: studentId,
        content_descriptor_code: code,
        mastery_level: mastery,
        date_assessed: dlState.date,
        teacher_notes: 'Logged via daily session'
      });
    } catch(e) { console.warn('Could not save mastery for', key); }
  }

  setSyncing(false);
  checkDailyLogBadge();
  toast(`✓ Session logged — ${saved} codes taught to ${presentStudents.length} students`, 'success');
  if (state.currentView === 'dashboard') renderView();
}

// ── TAUGHT HELPERS ──
function wasCodeTaughtToStudent(studentId, code) {
  return state.taughtLog.some(t => t.student_id === studentId && t.code === code);
}

function getTaughtDatesForCode(studentId, code) {
  return state.taughtLog
    .filter(t => t.student_id === studentId && t.code === code)
    .map(t => t.date)
    .sort()
    .reverse();
}

function getUntaughtCodes(studentId, yearLevel) {
  const YLM = {'F':'Foundation','1':'Year 1','2':'Year 2','3':'Year 3','4':'Year 4','5':'Year 5','6':'Year 6'};
  const csvYear = YLM[normaliseYear(yearLevel)] || yearLevel;
  return state.curriculumCodes.filter(c =>
    (c['Year Level']||'').trim() === csvYear &&
    !wasCodeTaughtToStudent(studentId, c.Code)
  );
}

// ── SESSION HISTORY VIEW ──
function renderDailyLog(main) {
  // Group log entries by date
  const byDate = {};
  state.taughtLog.forEach(t => {
    if (!byDate[t.date]) byDate[t.date] = [];
    byDate[t.date].push(t);
  });
  const dates = Object.keys(byDate).sort().reverse();

  main.innerHTML = `
    <div class="topbar" style="flex-wrap:wrap;gap:8px">
      <div class="topbar-title">Session History</div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn" style="border-color:var(--gold);color:var(--gold)" onclick="openDailyLogWizard()">✦ Log Today</button>
        <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);align-self:center">${APP_VERSION}</span>
      </div>
    </div>
    <div class="content">
      ${dates.length === 0
        ? `<div class="empty-state" style="padding:80px">
            <div class="empty-icon">◷</div>
            <div class="empty-title">No sessions logged yet</div>
            <div class="empty-sub">Use "Log Today" each day to record which codes were taught and to whom.</div>
            <button class="btn btn-primary" style="margin-top:12px" onclick="openDailyLogWizard()">✦ Log Today</button>
          </div>`
        : dates.map(date => {
            const entries = byDate[date];
            const codes   = [...new Set(entries.map(e => e.code))];
            const studs   = [...new Set(entries.map(e => e.student_id))];
            const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-AU', {weekday:'long',day:'numeric',month:'long'});
            const today = new Date().toISOString().split('T')[0];
            return `
              <div class="card" style="margin-bottom:14px">
                <div class="card-head" style="cursor:pointer" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
                  <div style="display:flex;align-items:center;gap:12px">
                    <div>
                      <div class="card-title">${dateLabel} ${date===today?'<span style="font-family:\'DM Mono\',monospace;font-size:9px;background:var(--gold-dim);color:var(--gold);padding:1px 6px;border-radius:4px;margin-left:6px">TODAY</span>':''}</div>
                      <div style="font-size:11px;color:var(--text3);margin-top:2px">${codes.length} codes · ${studs.length} students</div>
                    </div>
                  </div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap">
                    ${codes.slice(0,6).map(code => `<span style="font-family:'DM Mono',monospace;font-size:9px;padding:2px 6px;border-radius:3px;background:var(--blue-dim);color:var(--blue)">${code}</span>`).join('')}
                    ${codes.length > 6 ? `<span style="font-size:10px;color:var(--text3)">+${codes.length-6} more</span>` : ''}
                  </div>
                </div>
                <div style="padding:12px 18px">
                  <table style="width:100%;border-collapse:collapse;font-size:11px">
                    <thead><tr>
                      <th style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);text-transform:uppercase;letter-spacing:0.1em">Student</th>
                      <th style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);text-transform:uppercase;letter-spacing:0.1em">Codes Taught</th>
                      <th style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);text-transform:uppercase;letter-spacing:0.1em">Mastery Logged</th>
                    </tr></thead>
                    <tbody>
                      ${studs.map(sid => {
                        const s = state.students.find(x => x.id === sid);
                        if (!s) return '';
                        const sEntries = entries.filter(e => e.student_id === sid);
                        const sCodes = sEntries.map(e => e.code);
                        const sMastery = sEntries.filter(e => e.notes && e.notes !== '');
                        return `<tr style="border-bottom:1px solid var(--border)">
                          <td style="padding:6px 8px;color:var(--text2)">${s.first_name} ${s.last_name}</td>
                          <td style="padding:6px 8px">
                            <div style="display:flex;gap:4px;flex-wrap:wrap">
                              ${sCodes.map(c => `<span style="font-family:'DM Mono',monospace;font-size:9px;padding:1px 5px;border-radius:3px;background:var(--blue-dim);color:var(--blue)">${c}</span>`).join('')}
                            </div>
                          </td>
                          <td style="padding:6px 8px">
                            ${sMastery.length
                              ? sMastery.map(e => `<span style="font-size:10px;color:${e.notes==='Achieved'?'var(--green)':e.notes==='Developing'?'var(--gold)':'var(--rust)'}">${e.notes}</span>`).join(', ')
                              : `<span style="color:var(--text3);font-size:10px">—</span>`}
                          </td>
                        </tr>`;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              </div>`;
          }).join('')
      }
    </div>
  `;
}

// ── Apps Script additions needed ──
console.info(
  '%cClassTracker — Apps Script updates needed\n\n' +
  '1. Add a sheet called "TaughtLog" with columns:\n' +
  '   A: id  B: date  C: student_id  D: code  E: notes\n\n' +
  '2. Add these functions to your Apps Script:\n\n' +
  'function getTaughtLog() {\n' +
  '  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("TaughtLog");\n' +
  '  if (!sheet) return [[]];\n' +
  '  return sheet.getDataRange().getValues();\n' +
  '}\n\n' +
  'function saveTaughtLog(data) {\n' +
  '  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("TaughtLog");\n' +
  '  if (!sheet) sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet("TaughtLog");\n' +
  '  var ids = [];\n' +
  '  data.entries.forEach(function(e) {\n' +
  '    var id = Utilities.getUuid();\n' +
  '    sheet.appendRow([id, e.date, e.student_id, e.code, e.notes || ""]);\n' +
  '    ids.push(id);\n' +
  '  });\n' +
  '  return { success: true, ids: ids };\n' +
  '}\n\n' +
  'function claudeSuggest(data) {\n' +
  '  var API_KEY = "YOUR_ANTHROPIC_API_KEY_HERE";\n' +
  '  var response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {\n' +
  '    method: "post",\n' +
  '    headers: {\n' +
  '      "Content-Type": "application/json",\n' +
  '      "x-api-key": API_KEY,\n' +
  '      "anthropic-version": "2023-06-01"\n' +
  '    },\n' +
  '    payload: JSON.stringify({\n' +
  '      model: "claude-haiku-4-5-20251001",\n' +
  '      max_tokens: 400,\n' +
  '      messages: [{ role: "user", content: data.prompt }]\n' +
  '    }),\n' +
  '    muteHttpExceptions: true\n' +
  '  });\n' +
  '  var result = JSON.parse(response.getContentText());\n' +
  '  var text = result.content && result.content[0] ? result.content[0].text : "{}";\n' +
  '  try { return JSON.parse(text.replace(/```json|```/g,"").trim()); }\n' +
  '  catch(e) { return { codes: [], reasoning: "Parse error" }; }\n' +
  '}\n\n' +
  '3. Redeploy your web app after adding these functions.',
  'color:#60a5fa;font-family:monospace;font-size:11px'
);

async function init() {
  const verEl = document.getElementById('sidebar-version');
  if (verEl) verEl.textContent = APP_VERSION;

  // Use allSettled so a single failure (e.g. TaughtLog sheet not yet created)
  // doesn't block the whole app from rendering
  const results = await Promise.allSettled([
    loadStudents(),
    loadProgress(),
    loadTaughtLog(),
    fetchAllCSVs()
  ]);

  // Log any failures but don't block render
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const names = ['loadStudents','loadProgress','loadTaughtLog','fetchAllCSVs'];
      console.warn(`Init: ${names[i]} failed:`, r.reason);
    }
  });

  state.loading = false;
  renderView();
  checkDailyLogBadge();
  checkAdminMenuState();

  // Show daily log popup if nothing logged today
  const today = new Date().toISOString().split('T')[0];
  const loggedToday = state.taughtLog.some(t => t.date === today);
  if (!loggedToday && state.students.length > 0) {
    setTimeout(() => openDailyLogWizard(), 1200);
  }

  // Warn if Sheets data didn't load
  if (state.students.length === 0) {
    toast('Could not load student data — check your Sheets connection', 'error');
  }
}

function toggleAdminMenu() {
  const menu     = document.getElementById('admin-menu');
  const chevron  = document.getElementById('admin-chevron');
  const btn      = document.getElementById('nav-admin');
  if (!menu) return;
  const open = menu.style.display === 'flex';
  menu.style.display  = open ? 'none' : 'flex';
  if (chevron) chevron.textContent = open ? '▸' : '▾';
  if (btn) btn.style.background = open ? '' : 'var(--surface2)';
}

// Auto-open admin menu if any CSV file hasn't loaded yet
function checkAdminMenuState() {
  const allLoaded = state.curriculumCodes.length > 0
    && state.standards.length > 0
    && state.progressions.length > 0;
  if (!allLoaded) {
    const menu    = document.getElementById('admin-menu');
    const chevron = document.getElementById('admin-chevron');
    if (menu)    menu.style.display = 'flex';
    if (chevron) chevron.textContent = '▾';
  }
}

function checkDailyLogBadge() {
  const today = new Date().toISOString().split('T')[0];
  const loggedToday = state.taughtLog.some(t => t.date === today);
  const badge = document.getElementById('daily-log-badge');
  if (badge) badge.style.display = loggedToday ? 'none' : 'inline';
}

init();
