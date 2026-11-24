// 학습 상태 저장소: Claude 아티팩트에서는 db 기능(개인 전용 경로), 그 외(GitHub Pages)는 localStorage.
// 둘 다 실패하면 메모리에만 두고 화면에 '저장 안 됨'을 표시한다.

const LS_KEY = 'ekb.state.v1';
export const DEFAULT_SETTINGS = {
  timezone: 'Asia/Seoul',
  cadence: 'daily',
  daily_foundation_count: 1,
  daily_engineering_count: 1,
  weekly_review_day: 1, // 월요일
  notification_mode: 'none',
  enabled: false, // 자동 생성 스케줄러는 미연동 → 기본 비활성
  selected_roles: ['fde', 'ai-app', 'ontology', 'ai-native'],
};

export function emptyState() {
  return { v: 1, savedAt: null, progress: {}, evidence: [], manualPriority: {}, settings: { ...DEFAULT_SETTINGS }, readLog: [] };
}

/** 가져오기·원격 데이터를 안전하게 정리(모르는 필드는 버림) */
export function sanitizeState(raw) {
  const s = emptyState();
  if (!raw || typeof raw !== 'object') return s;
  const okStatus = ['unread', 'reading', 'understood', 'review'];
  for (const [id, p] of Object.entries(raw.progress || {})) {
    if (!/^[A-Z]{2,6}-[A-Z]{2,6}-\d{3}$/.test(id) || !p || typeof p !== 'object') continue;
    s.progress[id] = {
      status: okStatus.includes(p.status) ? p.status : 'unread',
      bookmarked: !!p.bookmarked,
      last_read_at: typeof p.last_read_at === 'string' ? p.last_read_at : null,
      notes: typeof p.notes === 'string' ? p.notes.slice(0, 5000) : '',
      review_due_at: typeof p.review_due_at === 'string' ? p.review_due_at : null,
      updated_at: typeof p.updated_at === 'string' ? p.updated_at : null,
    };
  }
  if (Array.isArray(raw.evidence)) {
    s.evidence = raw.evidence.filter((e) => e && typeof e.concept_id === 'string' && typeof e.dedup_key === 'string').slice(0, 2000).map((e) => ({
      id: String(e.id || ''), job_id: String(e.job_id || e.dedup_key), dedup_key: e.dedup_key, concept_id: e.concept_id,
      requirement_type: ['required', 'preferred', 'unknown'].includes(e.requirement_type) ? e.requirement_type : 'unknown',
      evidence_text: String(e.evidence_text || '').slice(0, 300), observed_at: String(e.observed_at || ''),
      company: String(e.company || '').slice(0, 100), title: String(e.title || '').slice(0, 150),
      url: /^https:\/\//.test(e.url || '') ? e.url : '', posting_status: e.posting_status === 'closed' ? 'closed' : 'active',
    }));
  }
  for (const [k, v] of Object.entries(raw.manualPriority || {})) if (typeof v === 'number' && v >= 0 && v <= 100) s.manualPriority[k] = v;
  const st = raw.settings || {};
  s.settings = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (st[k] !== undefined && typeof st[k] === typeof DEFAULT_SETTINGS[k]) s.settings[k] = st[k];
  if (Array.isArray(raw.readLog)) s.readLog = raw.readLog.filter((r) => r && r.id && r.at).slice(-300);
  s.savedAt = typeof raw.savedAt === 'string' ? raw.savedAt : null;
  return s;
}

function lsGet() { try { const t = localStorage.getItem(LS_KEY); return t ? JSON.parse(t) : null; } catch { return null; } }
function lsSet(v) { try { localStorage.setItem(LS_KEY, JSON.stringify(v)); return true; } catch { return false; } }

export function createStore(onChange) {
  let state = sanitizeState(lsGet());
  let mode = lsSet(state) ? 'local' : 'memory';
  let docRef = null;
  let writing = false, pending = false, timer = null;
  const listeners = new Set(onChange ? [onChange] : []);
  const emit = () => listeners.forEach((f) => f(state, mode));

  async function flushRemote() {
    if (!docRef) return;
    if (writing) { pending = true; return; }
    writing = true;
    try { await docRef.set(JSON.parse(JSON.stringify(state))); }
    catch (e) { console.warn('[ekb] 원격 저장 실패, 로컬에는 저장됨', e?.code || e); }
    writing = false;
    if (pending) { pending = false; flushRemote(); }
  }

  const api = {
    get state() { return state; },
    get mode() { return mode; },
    subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
    /** 상태를 변경하고 저장. mutate는 state 초안을 직접 수정한다. */
    update(mutate) {
      mutate(state);
      state.savedAt = new Date().toISOString();
      if (!lsSet(state) && mode === 'local') mode = 'memory';
      clearTimeout(timer);
      timer = setTimeout(flushRemote, 700); // 연속 입력을 한 번의 쓰기로 묶음
      emit();
    },
    replace(next) { api.update((s) => { Object.assign(s, sanitizeState(next)); }); },
    /** Claude 아티팩트 뷰어 안이면 db 기능에 연결한다. 실패해도 로컬 모드로 계속 동작. */
    async connectRemote() {
      if (typeof window === 'undefined' || !window.claude?.use) return { mode, replaced: false };
      try {
        const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
        if (!db || !user) return { mode, replaced: false };
        const id = await user.id();
        if (!id) return { mode, replaced: false };
        docRef = db.doc(`data/users/${id}/ekb`);
        const snap = await Promise.race([docRef.get(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))]);
        const remote = snap.exists ? sanitizeState(snap.data()) : null;
        let replaced = false;
        if (remote && (!state.savedAt || (remote.savedAt && remote.savedAt > state.savedAt))) {
          state = remote; lsSet(state); replaced = true;
        } else if (state.savedAt) {
          await docRef.set(JSON.parse(JSON.stringify(state)));
        }
        mode = 'cloud';
        emit();
        return { mode, replaced };
      } catch (e) {
        console.warn('[ekb] db 연결 실패, 로컬 저장으로 계속', e?.code || e?.message || e);
        docRef = null;
      }
      return { mode, replaced: false };
    },
  };
  return api;
}
