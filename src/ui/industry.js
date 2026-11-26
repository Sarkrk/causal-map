// 산업 지도(반도체 밸류체인 맵) — 11/23 신설, 11/26 모바일 세로 파이프라인 + 데스크톱 9열 맵 개편.
// - 모바일(≤760px) 기본: 세로 밸류체인 파이프라인 (단계 흐름 화살표 + 핵심 대표기업 4개 먼저 + 더보기 확장)
// - 데스크톱(>760px) 기본: 4대분류 + 9열 균형 가로 맵 (상단 버스 통로 라우팅, 겹침 없음)
// - 상단 버튼으로 언제든 '세로 흐름 ↔ 전체 맵' 전환, 기업·제품 검색, 한국/검증/병목 필터 지원.

/** @typedef {{id:string,name:string,kr:string,ticker?:string,country:string,stage:string,subgroup?:string,role:string,products:string[],supplies_to:string[],sourced_from:string[],sources:{url:string,title?:string,date?:string}[],verified:boolean,note?:string}} Company */
/** @typedef {{id:string,order:number,name:string,short:string,desc:string,color:string,subgroups?:string[],flows_to:string[],flow_label:string,causal_nodes:string[]}} Stage */
/** @typedef {{version:string,title:string,intro:string,macro_overlay:string[],stages:Stage[],companies:Company[],chains:{from:string,to:string,what:string,sources:{url:string}[]}[],bottlenecks:{title:string,desc:string,companies:string[],sources:{url:string}[]}[]}} Industry */

const byId = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** 국가 표기 통일(KR/US/TW/JP/CN/NL/DE/CH/UK) */
const COUNTRY_CODE = /** @type {Record<string,string>} */ ({
  '한국': 'KR', KR: 'KR',
  '미국': 'US', US: 'US',
  '대만': 'TW', TW: 'TW',
  '일본': 'JP', JP: 'JP',
  '중국': 'CN', CN: 'CN',
  '네덜란드': 'NL', NL: 'NL',
  '독일': 'DE', DE: 'DE',
  '스위스': 'CH', CH: 'CH',
  '영국': 'UK', UK: 'UK',
});

/** @param {string} raw */
export function normalizeCountry(raw) {
  return COUNTRY_CODE[raw] || raw || '';
}

/** 단계별 절제된 라이트 팔레트 매핑(원본 데이터의 형광색을 차분한 핀테크 톤으로 치환) */
const STAGE_TONE = /** @type {Record<string,string>} */ ({
  design: '#6d4aff',
  mat: '#b7791f',
  part: '#c95b2b',
  equip: '#d9483b',
  fab: '#2563eb',
  memory: '#1d4ed8',
  package: '#0d8a7b',
  fabless: '#7c3aed',
  system: '#b45309',
  cloud: '#3b5bdb',
  aisw: '#be185d',
});

/** @param {Stage|undefined} s */
function stageTone(s) {
  return (s && (STAGE_TONE[s.id] || s.color)) || '#6b7684';
}

/** 가로 전체 맵용 4개 대분류 배너 (9열 균형 배치) */
const MAP_PHASES = [
  { id: 'p1', label: 'PHASE 1 · 소부장', sub: '원재료 · 핵심 부품 · 장비', colStart: 1, span: 3, color: '#b45309' },
  { id: 'p2', label: 'PHASE 2 · 제조 · 후공정', sub: '파운드리 · 메모리 · 패키징 · 설계IP', colStart: 4, span: 2, color: '#2563eb' },
  { id: 'p3', label: 'PHASE 3 · 칩 · 시스템', sub: '칩 설계사(팹리스) · 서버·기기', colStart: 6, span: 2, color: '#6d4aff' },
  { id: 'p4', label: 'PHASE 4 · 인프라 · AI 서비스', sub: '클라우드 · 데이터센터 · B2C AI', colStart: 8, span: 2, color: '#be185d' },
];

/** 세로 파이프라인용 4개 대분류(단계 순서 1→11 기준) */
const FLOW_PHASES = [
  { label: 'PHASE 1 · 설계 · 소부장', sub: '설계 도구와 원재료·부품·장비', color: '#b45309', stages: ['design', 'mat', 'part', 'equip'] },
  { label: 'PHASE 2 · 제조 · 후공정', sub: '웨이퍼 생산·HBM·패키징', color: '#2563eb', stages: ['fab', 'memory', 'package'] },
  { label: 'PHASE 3 · 칩 · 시스템', sub: '완성 칩과 AI 서버 조립', color: '#6d4aff', stages: ['fabless', 'system'] },
  { label: 'PHASE 4 · 인프라 · AI 서비스', sub: '데이터센터와 B2C AI 수요', color: '#be185d', stages: ['cloud', 'aisw'] },
];

/** 가로 맵 열(1..9) 구성 */
const COLUMNS = [
  { col: 1, stages: ['mat'] },
  { col: 2, stages: ['part'] },
  { col: 3, stages: ['equip'] },
  { col: 4, stages: ['fab', 'memory'] },
  { col: 5, stages: ['package', 'design'] },
  { col: 6, stages: ['fabless'] },
  { col: 7, stages: ['system'] },
  { col: 8, stages: ['cloud'] },
  { col: 9, stages: ['aisw'] },
];

const WIDE_STAGES = new Set(['mat', 'equip', 'package', 'design']);
const STAGE_COL = /** @type {Record<string,number>} */ ({});
for (const c of COLUMNS) for (const sid of c.stages) STAGE_COL[sid] = c.col;

/** 세로 파이프라인 단계당 기본 표시 대표기업 수 */
export const FLOW_TOP_N = 4;

/**
 * 단계 내 기업을 대표성 순으로 정렬한다(병목·검증·공급사슬 연결도 우선, 동률 시 원순서 유지).
 * @param {Company[]} list
 * @param {{from:string,to:string}[]} chains
 * @param {Set<string>} bnSet
 * @returns {Company[]}
 */
export function rankStageCompanies(list, chains, bnSet) {
  /** @type {Map<string,number>} */
  const chDeg = new Map();
  for (const ch of chains || []) {
    chDeg.set(ch.from, (chDeg.get(ch.from) || 0) + 1);
    chDeg.set(ch.to, (chDeg.get(ch.to) || 0) + 1);
  }
  const score = (/** @type {Company} */ c) =>
    (bnSet.has(c.id) ? 6 : 0) +
    (c.verified ? 4 : 0) +
    (chDeg.get(c.id) || 0) * 2 +
    (c.supplies_to?.length || 0) +
    (c.sourced_from?.length || 0);
  return list
    .map((c, i) => ({ c, i, s: score(c) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c);
}

/**
 * @param {HTMLElement} el
 * @param {HTMLElement} ancestor
 */
function relBox(el, ancestor) {
  let l = 0;
  let t = 0;
  /** @type {HTMLElement|null} */
  let cur = el;
  while (cur && cur !== ancestor) {
    l += cur.offsetLeft;
    t += cur.offsetTop;
    cur = cur.offsetParent instanceof HTMLElement ? cur.offsetParent : null;
  }
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  return { l, t, r: l + w, b: t + h, cx: l + w / 2, cy: t + h / 2, w, h };
}

/**
 * @param {Company} c
 * @param {string} filter
 * @param {Set<string>} bnSet
 * @param {string} query
 */
export function matchesFilter(c, filter, bnSet, query) {
  if (filter === 'kr' && normalizeCountry(c.country) !== 'KR') return false;
  if (filter === 'verified' && !c.verified) return false;
  if (filter === 'bottleneck' && !bnSet.has(c.id)) return false;
  if (query) {
    const q = query.toLowerCase();
    const hay = `${c.kr} ${c.name} ${c.ticker || ''} ${c.role} ${(c.products || []).join(' ')} ${c.subgroup || ''}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

/**
 * @param {{revealNode:(id:string)=>void, onMode:(on:boolean)=>void}} opts
 */
export function initIndustry(opts) {
  /** @type {Industry|null} */
  let data = null;
  let on = false;
  /** @type {string|null} */
  let sel = null;
  /** @type {number|null} */
  let activeBnIdx = null;
  /** @type {'all'|'kr'|'verified'|'bottleneck'} */
  let filter = 'all';
  let query = '';
  let showAllChains = false;
  let searchOpen = false;
  /** @type {'flow'|'map'} 모바일은 세로 파이프라인, 데스크톱은 가로 전체 맵이 기본 */
  let viewMode = 'flow';
  let userPickedMode = false;
  /** 세로 파이프라인에서 전체 펼친 단계 id 집합 */
  const expandedStages = new Set();

  /** @type {Map<string,HTMLElement>} */
  const cards = new Map();
  /** @type {Map<string,HTMLElement>} */
  const cols = new Map();
  /** @type {Map<string,HTMLElement>} */
  const stageChips = new Map();
  /** @type {Set<string>} */
  let bnCompSet = new Set();

  let svgBg = /** @type {SVGSVGElement|null} */ (null);
  let svgTop = /** @type {SVGSVGElement|null} */ (null);
  let scroll = /** @type {HTMLElement|null} */ (null);
  let flowWrap = /** @type {HTMLElement|null} */ (null);
  let legendEl = /** @type {HTMLElement|null} */ (null);

  const view = byId('indview');

  async function load() {
    if (data) return data;
    const r = await fetch('industry.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('industry.json ' + r.status);
    data = /** @type {Industry} */ (await r.json());
    bnCompSet = new Set();
    for (const b of data.bottlenecks || []) for (const cid of b.companies || []) bnCompSet.add(cid);
    return data;
  }

  /** 화면 토글 */
  async function toggle() {
    if (!on) {
      try { await load(); } catch (e) { toast('산업 지도 데이터를 못 불러왔어요: ' + e); return; }
      byId('toast').classList.remove('on');
      if (!userPickedMode) {
        viewMode = window.innerWidth <= 760 ? 'flow' : 'map';
      }
      render();
      on = true;
      document.body.classList.add('ind-on');
      view.hidden = false;
      byId('indbtn').textContent = '인과 지도';
      byId('indbtn').classList.add('on');
      opts.onMode(true);
      if (viewMode === 'map') startView();
    } else {
      on = false;
      document.body.classList.remove('ind-on');
      view.hidden = true;
      byId('indbtn').textContent = '산업 지도';
      byId('indbtn').classList.remove('on');
      opts.onMode(false);
    }
  }

  let toastTimer = 0;
  function toast(/** @type {string} */ msg) {
    const t = byId('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => t.classList.remove('on'), 3200);
  }

  function render() {
    if (!data) return;
    const g = data;
    const stages = [...g.stages].sort((a, b) => a.order - b.order);
    const stageById = new Map(stages.map((s) => [s.id, s]));
    view.innerHTML = '';
    view.classList.toggle('flow-mode', viewMode === 'flow');
    view.classList.toggle('search-open', searchOpen || !!query);

    // ─── 상단 바 (모바일 2줄 슬림 구성, 검색은 🔍 탭 시 펼침) ───
    const top = document.createElement('div');
    top.id = 'indtop';

    const row1 = document.createElement('div');
    row1.className = 'ind-row1';
    const back = document.createElement('button');
    back.className = 'ind-back';
    back.textContent = '← 인과';
    back.setAttribute('aria-label', '인과 지도로 돌아가기');
    back.addEventListener('click', () => { if (on) toggle(); });

    const h1 = document.createElement('h1');
    h1.textContent = g.title;

    // 검색 입력 + 즉시 추천
    const searchWrap = document.createElement('div');
    searchWrap.className = 'ind-searchwrap';
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'ind-search';
    searchInput.placeholder = '기업·제품 검색 (예: SK하이닉스, HBM)';
    searchInput.setAttribute('aria-label', '산업 지도 기업 검색');
    searchInput.value = query;
    const searchSug = document.createElement('div');
    searchSug.className = 'ind-sug';
    searchSug.hidden = true;
    searchWrap.append(searchInput, searchSug);

    const searchBtn = document.createElement('button');
    searchBtn.className = 'ind-iconbtn ind-sbtn';
    searchBtn.textContent = '⌕';
    searchBtn.setAttribute('aria-label', '기업 검색 열기');
    searchBtn.addEventListener('click', () => {
      searchOpen = !searchOpen;
      view.classList.toggle('search-open', searchOpen || !!query);
      if (searchOpen) setTimeout(() => searchInput.focus(), 40);
    });

    const updateSearchSug = () => {
      const q = searchInput.value.trim();
      query = q;
      applyFilters();
      if (!q) {
        searchSug.hidden = true;
        searchSug.innerHTML = '';
        return;
      }
      const hits = g.companies.filter((c) => matchesFilter(c, 'all', bnCompSet, q)).slice(0, 8);
      if (!hits.length) {
        searchSug.innerHTML = '<div class="ind-sug-empty">일치하는 기업이 없어요</div>';
        searchSug.hidden = false;
        return;
      }
      searchSug.innerHTML = '';
      for (const c of hits) {
        const st = stageById.get(c.stage);
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'ind-sug-item';
        const cc = normalizeCountry(c.country);
        item.innerHTML = `<i class="ind-sug-dot" style="background:${stageTone(st)}"></i><b>${c.kr}</b><span class="ind-sug-meta">${cc}${c.ticker ? ' · ' + c.ticker : ''} · ${st ? st.name : ''}</span>`;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          searchSug.hidden = true;
          select(c.id);
        });
        searchSug.appendChild(item);
      }
      searchSug.hidden = false;
    };
    searchInput.addEventListener('input', updateSearchSug);
    searchInput.addEventListener('focus', () => { if (searchInput.value.trim()) updateSearchSug(); });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        searchOpen = false;
        view.classList.remove('search-open');
        updateSearchSug();
        searchInput.blur();
      } else if (e.key === 'Enter') {
        const first = searchSug.querySelector('.ind-sug-item');
        if (first instanceof HTMLElement) first.click();
      }
    });

    // 세로 흐름 ↔ 전체 맵 전환 버튼
    const modeBtn = document.createElement('button');
    modeBtn.className = 'ind-modebtn';
    modeBtn.textContent = viewMode === 'flow' ? '전체 맵' : '세로 흐름';
    modeBtn.setAttribute('aria-label', '세로 흐름과 가로 전체 맵 전환');
    modeBtn.addEventListener('click', () => {
      userPickedMode = true;
      setViewMode(viewMode === 'flow' ? 'map' : 'flow');
      modeBtn.textContent = viewMode === 'flow' ? '전체 맵' : '세로 흐름';
    });

    const info = document.createElement('button');
    info.className = 'ind-iconbtn ind-info';
    info.textContent = 'ⓘ';
    info.setAttribute('aria-label', '설명');

    row1.append(back, h1, searchWrap, searchBtn, modeBtn, info);

    const intro = document.createElement('p');
    intro.className = 'ind-intro';
    intro.hidden = true;
    intro.textContent = g.intro;
    info.addEventListener('click', () => { intro.hidden = !intro.hidden; });

    // Row 2: 퀵 필터 + 단계 칩 바
    const row2 = document.createElement('div');
    row2.className = 'ind-row2';

    const krCount = g.companies.filter((c) => normalizeCountry(c.country) === 'KR').length;
    const verCount = g.companies.filter((c) => c.verified).length;
    const bnCount = bnCompSet.size;

    const filterGroup = document.createElement('div');
    filterGroup.className = 'ind-filters';
    /** @type {Array<{id:'all'|'kr'|'verified'|'bottleneck', label:string}>} */
    const filterDefs = [
      { id: 'all', label: `전체 ${g.companies.length}` },
      { id: 'kr', label: `한국 ${krCount}` },
      { id: 'verified', label: `✓ 검증 ${verCount}` },
      { id: 'bottleneck', label: `⚠ 병목 ${bnCount}` },
    ];
    /** @type {Map<string,HTMLButtonElement>} */
    const filterBtns = new Map();
    for (const fd of filterDefs) {
      const fb = document.createElement('button');
      fb.className = 'ind-fchip' + (filter === fd.id ? ' on' : '');
      fb.textContent = fd.label;
      fb.addEventListener('click', () => {
        filter = fd.id;
        activeBnIdx = null;
        for (const [k2, b2] of filterBtns) b2.classList.toggle('on', k2 === filter);
        applyFilters();
      });
      filterBtns.set(fd.id, fb);
      filterGroup.appendChild(fb);
    }

    const lineToggle = document.createElement('button');
    lineToggle.className = 'ind-fchip ind-linetog' + (showAllChains ? ' on' : '');
    lineToggle.textContent = '공급선';
    lineToggle.title = '핵심 공급 사슬 25건 전체 표시/숨김';
    lineToggle.addEventListener('click', () => {
      showAllChains = !showAllChains;
      lineToggle.classList.toggle('on', showAllChains);
      drawLines();
    });
    filterGroup.appendChild(lineToggle);

    const sep = document.createElement('span');
    sep.className = 'ind-sep';

    const strip = document.createElement('div');
    strip.className = 'ind-strip';
    stageChips.clear();
    stages.forEach((s, i) => {
      const chip = document.createElement('button');
      chip.className = 'ind-stagechip';
      chip.dataset.stage = s.id;
      chip.style.setProperty('--sc', stageTone(s));
      chip.innerHTML = `<i class="ind-scdot"></i><b>${s.order}. ${s.name}</b>`;
      chip.addEventListener('click', () => {
        setActiveStageChip(s.id);
        if (viewMode === 'flow') {
          const sec = flowWrap && flowWrap.querySelector(`.ind-fsec[data-stage="${s.id}"]`);
          if (sec instanceof HTMLElement) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          focusStage(s.id);
          openStage(s);
        }
      });
      stageChips.set(s.id, chip);
      strip.appendChild(chip);
      if (i < stages.length - 1) {
        const ar = document.createElement('i');
        ar.className = 'ind-arrow';
        ar.textContent = '›';
        strip.appendChild(ar);
      }
    });

    row2.append(filterGroup, sep, strip);
    top.append(row1, intro, row2);

    // ─── 가로 전체 맵 캔버스 (데스크톱 기본 / 모바일 선택 전환) ───
    scroll = document.createElement('div');
    scroll.id = 'indscroll';
    scroll.hidden = viewMode !== 'map';
    const inner = document.createElement('div');
    inner.id = 'indinner';

    const mkDefs = (/** @type {string} */ prefix) =>
      `<defs><marker id="${prefix}ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0,0.5L8,4L0,7.5z" fill="context-stroke"/></marker></defs>`;

    svgBg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgBg.id = 'indsvg';
    svgBg.innerHTML = mkDefs('indbg');
    inner.appendChild(svgBg);

    svgTop = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgTop.id = 'indsvg-top';
    svgTop.innerHTML = mkDefs('indtop');
    inner.appendChild(svgTop);

    for (const ph of MAP_PHASES) {
      const pb = document.createElement('div');
      pb.className = 'ind-phase';
      pb.style.gridColumn = `${ph.colStart} / span ${ph.span}`;
      pb.style.gridRow = '1';
      pb.style.setProperty('--pc', ph.color);
      pb.innerHTML = `<b>${ph.label}</b><span>${ph.sub}</span>`;
      inner.appendChild(pb);
    }

    cards.clear();
    cols.clear();
    for (const colDef of COLUMNS) {
      const stack = document.createElement('div');
      stack.className = 'ind-stack';
      stack.style.gridColumn = String(colDef.col);
      stack.style.gridRow = '2';

      for (const sid of colDef.stages) {
        const s = stageById.get(sid);
        if (!s) continue;
        const col = document.createElement('section');
        col.className = 'ind-col' + (WIDE_STAGES.has(s.id) ? ' wide' : '');
        col.dataset.stage = s.id;
        col.style.setProperty('--sc', stageTone(s));
        cols.set(s.id, col);

        const comps = g.companies.filter((c) => c.stage === s.id);
        const ch = document.createElement('button');
        ch.className = 'ind-colhead';
        ch.innerHTML = `<div class="ind-cht"><span class="ind-num">${s.order}</span><b>${s.name}</b><em class="ind-cnt">${comps.length}</em></div><span class="ind-chs">${s.short}</span>`;
        ch.addEventListener('click', (e) => {
          e.stopPropagation();
          if (moved) return;
          setActiveStageChip(s.id);
          openStage(s);
        });
        col.appendChild(ch);

        const body = document.createElement('div');
        body.className = 'ind-colbody';

        const groups = s.subgroups && s.subgroups.length ? s.subgroups : [null];
        const renderGroup = (/** @type {Company[]} */ list, /** @type {string|null} */ grp) => {
          if (!list.length) return;
          const wrap = document.createElement('div');
          wrap.className = 'ind-grp';
          if (grp) {
            const gl = document.createElement('div');
            gl.className = 'ind-sub';
            gl.textContent = grp;
            wrap.appendChild(gl);
          }
          const grid = document.createElement('div');
          grid.className = 'ind-cgrid';
          for (const c of list) {
            const card = document.createElement('button');
            card.className = 'ind-card';
            if (bnCompSet.has(c.id)) card.classList.add('is-bn');
            if (c.verified) card.classList.add('is-ver');
            card.dataset.id = c.id;
            const cc = normalizeCountry(c.country);
            const tk = c.ticker && c.ticker !== '비상장' ? c.ticker : '';
            card.innerHTML =
              `<div class="ind-ctop"><b>${c.kr}</b><span class="ind-badges">` +
              (c.verified ? '<i class="ind-ver" title="공시·1차 출처 검증 완료">✓</i>' : '') +
              `<i class="ind-cc cc-${cc.toLowerCase()}">${cc}</i></span></div>` +
              (tk || c.name !== c.kr ? `<span class="ind-tk">${c.name !== c.kr ? c.name : ''}${c.name !== c.kr && tk ? ' · ' : ''}${tk}</span>` : '') +
              `<span class="ind-role">${c.role}</span>`;
            card.addEventListener('click', (e) => {
              e.stopPropagation();
              if (moved) return;
              searchSug.hidden = true;
              select(c.id);
            });
            cards.set(c.id, card);
            grid.appendChild(card);
          }
          wrap.appendChild(grid);
          body.appendChild(wrap);
        };

        for (const grp of groups) renderGroup(comps.filter((c) => (c.subgroup || null) === grp), grp);
        const known = new Set(groups);
        const rest = comps.filter((c) => !known.has(c.subgroup || null));
        if (rest.length) renderGroup(rest, groups[0] === null ? null : '기타');

        col.appendChild(body);
        stack.appendChild(col);
      }
      inner.appendChild(stack);
    }

    scroll.appendChild(inner);
    view.appendChild(scroll);

    // ─── 세로 밸류체인 파이프라인 (모바일 기본) ───
    flowWrap = document.createElement('div');
    flowWrap.id = 'indflow';
    flowWrap.hidden = viewMode !== 'flow';
    renderFlowView();
    view.appendChild(flowWrap);

    view.appendChild(top);

    // 선택 범례 (가로 맵에서 기업 선택 시)
    legendEl = document.createElement('div');
    legendEl.id = 'indlegend';
    legendEl.hidden = true;
    legendEl.innerHTML =
      '<span><i style="background:#0d9488"></i>상류 공급받음</span>' +
      '<span><i style="background:#d97706"></i>하류 납품함</span>' +
      '<span><i style="background:#4f46e5"></i>양방향</span>';
    view.appendChild(legendEl);

    // 확대·축소 버튼 (가로 맵 전용)
    const zb = document.createElement('div');
    zb.id = 'indzoom';
    zb.hidden = viewMode !== 'map';
    for (const [t, lab, fn] of /** @type {[string,string,()=>void][]} */ ([
      ['+', '확대', () => zoomBy(1.28)],
      ['−', '축소', () => zoomBy(1 / 1.28)],
      ['⤢', '전체 보기', () => fitAll(true)],
    ])) {
      const b = document.createElement('button');
      b.className = 'ind-zb';
      b.textContent = t;
      b.setAttribute('aria-label', lab);
      b.title = lab;
      b.addEventListener('click', fn);
      zb.appendChild(b);
    }
    view.appendChild(zb);
    bindGestures();

    // 병목 띠 (가로 맵 전용 — 세로 파이프라인에서는 상단 인라인 스트립으로 표시)
    const bn = document.createElement('div');
    bn.className = 'ind-bns';
    (g.bottlenecks || []).forEach((b, idx) => {
      const el = document.createElement('button');
      el.className = 'ind-bn';
      el.dataset.bn = String(idx);
      const names = (b.companies || [])
        .map((cid) => g.companies.find((x) => x.id === cid)?.kr || cid)
        .join(' · ');
      el.innerHTML = `<b>⚠ ${b.title}</b><span>${b.desc}</span><em>관련: ${names}</em>`;
      el.addEventListener('click', () => highlightBottleneck(idx));
      bn.appendChild(el);
    });
    const bnWrap = document.createElement('div');
    bnWrap.className = 'ind-bnwrap';
    bnWrap.hidden = viewMode !== 'map';
    const bnBtn = document.createElement('button');
    bnBtn.className = 'ind-bntoggle';
    bnBtn.textContent = '⚠ 병목 ' + (g.bottlenecks || []).length + '건 보기';
    bnBtn.addEventListener('click', () => {
      const opened = bnWrap.classList.toggle('open');
      bnBtn.textContent = opened ? '⚠ 병목 닫기' : '⚠ 병목 ' + (g.bottlenecks || []).length + '건 보기';
    });
    bnWrap.append(bnBtn, bn);
    view.appendChild(bnWrap);

    // 상세 패널
    const panel = document.createElement('div');
    panel.id = 'indpanel';
    panel.hidden = true;
    view.appendChild(panel);

    view.addEventListener('click', (e) => {
      if (moved) return;
      searchSug.hidden = true;
      if (e.target === view || e.target === scroll || e.target === inner) {
        if (sel || activeBnIdx !== null) select(null);
      }
    });

    if (!globalBound) {
      globalBound = true;
      window.addEventListener('resize', () => { if (on && viewMode === 'map') drawLines(); });
      window.addEventListener('keydown', (e) => {
        if (!on) return;
        if (e.key === 'Escape') {
          if (sel || activeBnIdx !== null) select(null);
          else if (!byId('indpanel').hidden) byId('indpanel').hidden = true;
        }
      });
    }

    applyFilters();
    if (viewMode === 'map') {
      drawLines();
      startView();
    }
  }

  /** 세로 밸류체인 파이프라인 렌더(모바일 기본: 단계 흐름 화살표 + 대표기업 4개 + 더보기) */
  function renderFlowView() {
    if (!data || !flowWrap) return;
    const g = data;
    const stageById = new Map(g.stages.map((s) => [s.id, s]));
    const hasFilter = filter !== 'all' || !!query;
    flowWrap.innerHTML = '';

    const cont = document.createElement('div');
    cont.className = 'ind-fcont';

    // 상단 인라인 병목 바(화면 하단을 가리지 않고 흐름 맨 위에 깔끔하게 배치)
    if ((g.bottlenecks || []).length && !query) {
      const bnBox = document.createElement('div');
      bnBox.className = 'ind-fbn';
      const bnHead = document.createElement('div');
      bnHead.className = 'ind-fbn-hd';
      bnHead.innerHTML = `<b>⚠ 공급망 핵심 병목 ${g.bottlenecks.length}곳</b><span>탭하면 관련 기업·설명 보기</span>`;
      const bnRow = document.createElement('div');
      bnRow.className = 'ind-fbn-row';
      g.bottlenecks.forEach((b, idx) => {
        const chip = document.createElement('button');
        chip.className = 'ind-fbn-chip' + (activeBnIdx === idx ? ' on' : '');
        chip.textContent = b.title;
        chip.addEventListener('click', () => highlightBottleneck(idx));
        bnRow.appendChild(chip);
      });
      bnBox.append(bnHead, bnRow);
      cont.appendChild(bnBox);
    }

    let totalShown = 0;
    let renderedStages = 0;

    for (const ph of FLOW_PHASES) {
      /** @type {{stage:Stage, comps:Company[]}[]} */
      const phStages = [];
      for (const sid of ph.stages) {
        const st = stageById.get(sid);
        if (!st) continue;
        const matched = g.companies.filter((c) => c.stage === sid && matchesFilter(c, filter, bnCompSet, query));
        if (!matched.length) continue;
        phStages.push({ stage: st, comps: rankStageCompanies(matched, g.chains, bnCompSet) });
      }
      if (!phStages.length) continue;

      const pBanner = document.createElement('div');
      pBanner.className = 'ind-fphase';
      pBanner.style.setProperty('--pc', ph.color);
      pBanner.innerHTML = `<b>${ph.label}</b><span>${ph.sub}</span>`;
      cont.appendChild(pBanner);

      phStages.forEach(({ stage: s, comps }, idx) => {
        totalShown += comps.length;
        renderedStages += 1;

        const sec = document.createElement('section');
        sec.className = 'ind-fsec';
        sec.dataset.stage = s.id;
        sec.style.setProperty('--sc', stageTone(s));

        const hd = document.createElement('button');
        hd.className = 'ind-fhd';
        hd.innerHTML =
          `<span class="ind-num">${s.order}</span>` +
          `<div class="ind-fhd-txt"><b>${s.name}</b><span>${s.short}</span></div>` +
          `<em class="ind-cnt">${comps.length}</em>`;
        hd.addEventListener('click', () => openStage(s));
        sec.appendChild(hd);

        const isExp = hasFilter || expandedStages.has(s.id) || comps.length <= FLOW_TOP_N;
        const visibleComps = isExp ? comps : comps.slice(0, FLOW_TOP_N);

        const grid = document.createElement('div');
        grid.className = 'ind-fgrid';
        for (const c of visibleComps) {
          const cc = normalizeCountry(c.country);
          const item = document.createElement('button');
          item.className = 'ind-fcard' + (sel === c.id ? ' sel' : '') + (c.verified ? ' is-ver' : '') + (bnCompSet.has(c.id) ? ' is-bn' : '');
          item.innerHTML =
            `<div class="ind-ctop"><b>${c.kr}</b><span class="ind-badges">` +
            (c.verified ? '<i class="ind-ver" title="검증 완료">✓</i>' : '') +
            `<i class="ind-cc cc-${cc.toLowerCase()}">${cc}</i></span></div>` +
            `<span class="ind-fsub">${c.subgroup || (c.ticker && c.ticker !== '비상장' ? c.ticker : c.name)}</span>` +
            `<span class="ind-frole">${c.role}</span>`;
          item.addEventListener('click', () => select(c.id));
          grid.appendChild(item);
        }
        sec.appendChild(grid);

        if (!hasFilter && comps.length > FLOW_TOP_N) {
          const more = document.createElement('button');
          more.className = 'ind-fmore';
          more.textContent = isExp ? '핵심 4개만 보기 ▲' : `+ 나머지 ${comps.length - FLOW_TOP_N}개 기업 더보기 ▼`;
          more.addEventListener('click', () => {
            if (expandedStages.has(s.id)) expandedStages.delete(s.id);
            else expandedStages.add(s.id);
            renderFlowView();
          });
          sec.appendChild(more);
        }

        cont.appendChild(sec);

        // 단계 간 흐름 연결 화살표 (마지막 단계에는 선순환 피드백 배지)
        if (s.id === 'aisw') {
          const loop = document.createElement('button');
          loop.className = 'ind-floop';
          loop.innerHTML = `<span>↺ ${s.flow_label}</span><em>8. 칩 설계사로 이동 ↑</em>`;
          loop.addEventListener('click', () => {
            const target = flowWrap && flowWrap.querySelector('.ind-fsec[data-stage="fabless"]');
            if (target instanceof HTMLElement) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
          cont.appendChild(loop);
        } else if (s.flow_label && (idx < phStages.length - 1 || ph.stages[ph.stages.length - 1] === s.id)) {
          const arrow = document.createElement('div');
          arrow.className = 'ind-fconn';
          arrow.style.setProperty('--sc', stageTone(s));
          arrow.innerHTML = `<i class="ind-fline"></i><span>↓ ${s.flow_label}</span>`;
          cont.appendChild(arrow);
        }
      });
    }

    if (!totalShown || !renderedStages) {
      const empty = document.createElement('div');
      empty.className = 'ind-lempty';
      empty.textContent = '조건에 맞는 기업이 없어요. 필터나 검색어를 바꿔 보세요.';
      cont.appendChild(empty);
    }

    flowWrap.appendChild(cont);
  }

  /** @param {'flow'|'map'} mode */
  function setViewMode(mode) {
    viewMode = mode;
    view.classList.toggle('flow-mode', mode === 'flow');
    if (scroll) scroll.hidden = mode !== 'map';
    if (flowWrap) {
      flowWrap.hidden = mode !== 'flow';
      if (mode === 'flow') renderFlowView();
    }
    const zb = document.getElementById('indzoom');
    if (zb) zb.hidden = mode !== 'map';
    const bnWrap = view.querySelector('.ind-bnwrap');
    if (bnWrap instanceof HTMLElement) bnWrap.hidden = mode !== 'map';
    if (legendEl) legendEl.hidden = mode !== 'map' || !sel;
    if (mode === 'map') {
      requestAnimationFrame(() => {
        if (sel) centerOn(sel);
        else startView();
        drawLines();
      });
    }
  }

  function setActiveStageChip(/** @type {string|null} */ sid) {
    for (const [k2, el] of stageChips) el.classList.toggle('active', k2 === sid);
  }

  function applyFilters() {
    if (!data) return;
    const hasFilter = filter !== 'all' || !!query;
    for (const c of data.companies) {
      const card = cards.get(c.id);
      if (!card) continue;
      const ok = matchesFilter(c, filter, bnCompSet, query);
      card.classList.toggle('f-hit', hasFilter && ok);
      card.classList.toggle('f-dim', hasFilter && !ok);
    }
    if (viewMode === 'flow') renderFlowView();
  }

  /** 병목 카드 클릭: 관련 기업 전체 동시 강조 + 상세 패널 */
  function highlightBottleneck(/** @type {number} */ idx) {
    if (!data) return;
    const b = (data.bottlenecks || [])[idx];
    if (!b) return;
    sel = null;
    activeBnIdx = idx;
    const set = new Set(b.companies || []);
    for (const [cid, card] of cards) {
      card.classList.remove('sel', 'up', 'down', 'both', 'rel');
      card.classList.toggle('bn-hi', set.has(cid));
      card.classList.toggle('dim', !set.has(cid));
    }
    view.classList.add('has-sel');
    if (legendEl) legendEl.hidden = true;

    const panel = byId('indpanel');
    panel.hidden = false;
    panel.innerHTML = '';
    const hd = document.createElement('div');
    hd.className = 'indp-hd';
    hd.style.setProperty('--sc', '#d97706');
    hd.innerHTML = `<div><h2>⚠ ${b.title}</h2><div class="indp-sub">반도체 밸류체인 핵심 병목 · 관련 기업 ${set.size}곳</div></div>`;
    const close = document.createElement('button');
    close.className = 'chip';
    close.textContent = '✕';
    close.setAttribute('aria-label', '닫기');
    close.addEventListener('click', () => select(null));
    hd.appendChild(close);
    panel.appendChild(hd);

    const bd = document.createElement('div');
    bd.className = 'indp-bd';
    const p = document.createElement('p');
    p.className = 'indp-role';
    p.textContent = b.desc;
    bd.appendChild(p);

    const sec = document.createElement('div');
    sec.className = 'indp-sec';
    sec.innerHTML = '<b>병목 관련 핵심 기업</b>';
    const row = document.createElement('div');
    row.className = 'indp-tags';
    for (const cid of b.companies || []) {
      const comp = data.companies.find((x) => x.id === cid);
      if (!comp) continue;
      const btn = document.createElement('button');
      btn.className = 'ind-tag ind-link';
      btn.textContent = `${comp.kr} (${normalizeCountry(comp.country)})`;
      btn.addEventListener('click', () => select(comp.id));
      row.appendChild(btn);
    }
    sec.appendChild(row);
    bd.appendChild(sec);

    if (b.sources && b.sources.length) {
      const ssec = document.createElement('div');
      ssec.className = 'indp-sec';
      ssec.innerHTML = '<b>출처</b>';
      for (const s of b.sources) {
        const a = document.createElement('a');
        a.className = 'indp-src';
        a.href = s.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = (s.title || s.url) + (s.date ? ' (' + s.date + ')' : '');
        ssec.appendChild(a);
      }
      bd.appendChild(ssec);
    }
    panel.appendChild(bd);

    if (viewMode === 'flow') {
      renderFlowView();
    } else if (b.companies && b.companies.length) {
      fitCompanies(b.companies);
      drawLines();
    }
  }

  // ───── 가로 맵 카메라(이동·확대) ─────
  const MINK = 0.10;
  const MAXK = 2.4;
  let tx = 0;
  let ty = 0;
  let k = 1;
  let moved = false;
  let globalBound = false;

  function applyCam(/** @type {boolean} */ smooth) {
    const inner = byId('indinner');
    inner.style.transition = smooth ? 'transform .26s cubic-bezier(.22,1,.36,1)' : 'none';
    inner.style.transform = `translate(${tx}px,${ty}px) scale(${k})`;
    inner.classList.toggle('lod', k < 0.62);
    inner.classList.toggle('lod2', k < 0.34);
  }
  function viewSize() {
    const r = scroll ? scroll.getBoundingClientRect() : { width: innerWidth, height: innerHeight };
    return { w: r.width || innerWidth, h: r.height || innerHeight };
  }
  function topPad() {
    const t = document.getElementById('indtop');
    return t ? t.getBoundingClientRect().height + 8 : 96;
  }
  function freeRect() {
    const { w, h } = viewSize();
    const panelOpen = !byId('indpanel').hidden;
    const small = w <= 700;
    let left = 0;
    let right = w;
    let bottom = h;
    if (panelOpen) {
      if (small) bottom = h * 0.48;
      else right = w - Math.min(400, w * 0.92);
    }
    return { left, right, top: topPad(), bottom };
  }
  function clampCam() {
    const inner = byId('indinner');
    const W = inner.offsetWidth * k;
    const H = inner.offsetHeight * k;
    const { w, h } = viewSize();
    const m = 80;
    tx = Math.min(w - m, Math.max(m - W, tx));
    ty = Math.min(h - m, Math.max(m - H, ty));
  }
  function zoomAt(/** @type {number} */ nk, /** @type {number} */ cx, /** @type {number} */ cy) {
    nk = Math.min(MAXK, Math.max(MINK, nk));
    const f = nk / k;
    tx = cx - (cx - tx) * f;
    ty = cy - (cy - ty) * f;
    k = nk;
    clampCam();
    applyCam(false);
  }
  function zoomBy(/** @type {number} */ f) {
    const fr = freeRect();
    const cx = (fr.left + fr.right) / 2;
    const cy = (fr.top + fr.bottom) / 2;
    const nk = Math.min(MAXK, Math.max(MINK, k * f));
    const g2 = nk / k;
    tx = cx - (cx - tx) * g2;
    ty = cy - (cy - ty) * g2;
    k = nk;
    clampCam();
    applyCam(true);
  }
  function fitAll(/** @type {boolean} */ smooth) {
    const inner = byId('indinner');
    const fr = freeRect();
    const availW = Math.max(200, fr.right - fr.left - 24);
    const availH = Math.max(200, fr.bottom - fr.top - 56);
    const rawW = inner.offsetWidth || 2800;
    const rawH = inner.offsetHeight || 820;
    k = Math.min(1.0, Math.max(MINK, Math.min(availW / rawW, availH / rawH)));
    applyCam(false);
    const W = inner.offsetWidth || rawW;
    const H = inner.offsetHeight || rawH;
    k = Math.min(1.0, Math.max(MINK, Math.min(availW / W, availH / H)));
    tx = fr.left + (fr.right - fr.left - W * k) / 2;
    ty = fr.top + Math.max(6, (availH - H * k) / 2);
    applyCam(smooth);
    drawLines();
  }
  function fitCompanies(/** @type {string[]} */ ids) {
    const inner = byId('indinner');
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of ids) {
      const el = cards.get(id);
      if (!el) continue;
      const b = relBox(el, inner);
      minX = Math.min(minX, b.l);
      minY = Math.min(minY, b.t);
      maxX = Math.max(maxX, b.r);
      maxY = Math.max(maxY, b.b);
    }
    if (!isFinite(minX)) return;
    const fr = freeRect();
    const bw = Math.max(240, maxX - minX + 120);
    const bh = Math.max(200, maxY - minY + 120);
    k = Math.min(1.05, Math.max(MINK, Math.min((fr.right - fr.left - 24) / bw, (fr.bottom - fr.top - 24) / bh)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    tx = (fr.left + fr.right) / 2 - cx * k;
    ty = (fr.top + fr.bottom) / 2 - cy * k;
    clampCam();
    applyCam(true);
  }
  function startView() {
    const { w } = viewSize();
    if (w >= 960) {
      fitAll(false);
    } else {
      const fr = freeRect();
      k = Math.min(0.84, Math.max(0.56, (w - 20) / 420));
      applyCam(false);
      tx = 12 - 28 * k;
      ty = fr.top - 10 * k;
      clampCam();
      applyCam(false);
      drawLines();
    }
  }
  function focusStage(/** @type {string} */ sid) {
    const col = cols.get(sid);
    if (!col) return;
    const inner = byId('indinner');
    const fr = freeRect();
    const box = relBox(col, inner);
    const availW = Math.max(200, fr.right - fr.left - 32);
    const availH = Math.max(200, fr.bottom - fr.top - 28);
    k = Math.min(1.0, Math.max(0.68, Math.min(availW / (box.w + 48), availH / (box.h + 48))));
    applyCam(false);
    const b2 = relBox(col, inner);
    tx = (fr.left + fr.right) / 2 - b2.cx * k;
    ty = fr.top + 8 - b2.t * k;
    clampCam();
    applyCam(true);
    drawLines();
  }
  function centerOn(/** @type {string} */ id) {
    const card = cards.get(id);
    if (!card) return;
    const inner = byId('indinner');
    k = Math.min(1.1, Math.max(0.76, k));
    applyCam(false);
    const b = relBox(card, inner);
    const fr = freeRect();
    tx = (fr.left + fr.right) / 2 - b.cx * k;
    ty = (fr.top + fr.bottom) / 2 - b.cy * k;
    clampCam();
    applyCam(true);
  }

  let gestureBound = false;
  function bindGestures() {
    if (!scroll) return;
    const el = scroll;
    /** @type {Map<number,{x:number,y:number}>} */
    const ptrs = new Map();
    let lastDist = 0;
    let startX = 0;
    let startY = 0;
    el.addEventListener('pointerdown', (e) => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) { startX = e.clientX; startY = e.clientY; moved = false; }
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; lastDist = Math.hypot(a.x - b.x, a.y - b.y); moved = true; }
    });
    const move = (/** @type {PointerEvent} */ e) => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (ptrs.size === 1) {
        if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
        moved = true;
        tx += dx;
        ty += dy;
        clampCam();
        applyCam(false);
      } else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const r = el.getBoundingClientRect();
        if (lastDist > 0) zoomAt(k * (d / lastDist), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        lastDist = d;
      }
    };
    const up = (/** @type {PointerEvent} */ e) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) lastDist = 0;
      if (ptrs.size === 0) setTimeout(() => { moved = false; }, 0);
    };
    if (!gestureBound) {
      gestureBound = true;
      window.addEventListener('pointermove', (e) => { if (on && viewMode === 'map') move(e); });
      window.addEventListener('pointerup', (e) => { if (on && viewMode === 'map') up(e); });
      window.addEventListener('pointercancel', (e) => { if (on && viewMode === 'map') up(e); });
    }
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
  }

  /** 카드 선택 → 이웃 강조 + 상세 패널 */
  function select(/** @type {string|null} */ id) {
    sel = id;
    activeBnIdx = null;
    if (!data) return;
    const g = data;
    const upSet = new Set();
    const downSet = new Set();
    const rel = new Set();
    if (id) {
      rel.add(id);
      const c0 = g.companies.find((x) => x.id === id);
      if (c0) {
        for (const t of c0.supplies_to) { downSet.add(t); rel.add(t); }
        for (const t of c0.sourced_from) { upSet.add(t); rel.add(t); }
      }
      for (const ch of g.chains) {
        if (ch.from === id) { downSet.add(ch.to); rel.add(ch.to); }
        if (ch.to === id) { upSet.add(ch.from); rel.add(ch.from); }
      }
    }
    for (const [cid, card] of cards) {
      const isUp = !!id && upSet.has(cid) && cid !== id;
      const isDown = !!id && downSet.has(cid) && cid !== id;
      const isBoth = isUp && isDown;
      card.classList.remove('bn-hi');
      card.classList.toggle('both', isBoth);
      card.classList.toggle('up', isUp && !isBoth);
      card.classList.toggle('down', isDown && !isBoth);
      card.classList.toggle('sel', cid === id);
      card.classList.toggle('rel', !!id && rel.has(cid) && cid !== id);
      card.classList.toggle('dim', !!id && !rel.has(cid));
    }
    const panel = byId('indpanel');
    view.classList.toggle('has-sel', !!id);
    if (legendEl) legendEl.hidden = !id || viewMode !== 'map';
    if (!id) {
      panel.hidden = true;
      setActiveStageChip(null);
      if (viewMode === 'flow') renderFlowView();
      else drawLines();
      return;
    }

    const c = g.companies.find((x) => x.id === id);
    if (!c) return;
    const st = g.stages.find((s) => s.id === c.stage);
    setActiveStageChip(c.stage);

    const up = g.companies.filter((x) => upSet.has(x.id) && x.id !== id);
    const down = g.companies.filter((x) => downSet.has(x.id) && x.id !== id);
    const chains = g.chains.filter((ch) => ch.from === id || ch.to === id);

    panel.hidden = false;
    panel.innerHTML = '';
    const hd = document.createElement('div');
    hd.className = 'indp-hd';
    hd.style.setProperty('--sc', stageTone(st));
    const cc = normalizeCountry(c.country);
    hd.innerHTML =
      `<div><h2>${c.kr}${c.name !== c.kr ? ` <small>${c.name}</small>` : ''}</h2>` +
      `<div class="indp-sub">${st ? st.order + '. ' + st.name : ''}${c.subgroup ? ' · ' + c.subgroup : ''} · ${cc} · ${c.ticker || '비상장'}${c.verified ? ' · ✓ 검증' : ''}</div></div>`;
    const close = document.createElement('button');
    close.className = 'chip';
    close.textContent = '✕';
    close.setAttribute('aria-label', '닫기');
    close.addEventListener('click', () => select(null));
    hd.appendChild(close);
    panel.appendChild(hd);

    const bd = document.createElement('div');
    bd.className = 'indp-bd';

    if (viewMode === 'flow') {
      const jumpMap = document.createElement('button');
      jumpMap.className = 'ind-jumpmap';
      jumpMap.textContent = '🗺 가로 전체 맵에서 공급선 보기';
      jumpMap.addEventListener('click', () => {
        userPickedMode = true;
        setViewMode('map');
        const mb = view.querySelector('.ind-modebtn');
        if (mb) mb.textContent = '세로 흐름';
        requestAnimationFrame(() => {
          centerOn(c.id);
          drawLines();
        });
      });
      bd.appendChild(jumpMap);
    }

    const role = document.createElement('p');
    role.className = 'indp-role';
    role.textContent = c.role + (c.note ? ' — ' + c.note : '');
    bd.appendChild(role);

    if (c.products && c.products.length) {
      const pr = document.createElement('div');
      pr.className = 'indp-sec';
      pr.innerHTML = '<b>핵심 제품</b>';
      const row = document.createElement('div');
      row.className = 'indp-tags';
      for (const p of c.products) {
        const t = document.createElement('span');
        t.className = 'ind-tag';
        t.textContent = p;
        row.appendChild(t);
      }
      pr.appendChild(row);
      bd.appendChild(pr);
    }

    const mkList = (/** @type {string} */ title, /** @type {Company[]} */ list, /** @type {'up'|'down'} */ dir) => {
      if (!list.length) return;
      const sec = document.createElement('div');
      sec.className = 'indp-sec';
      sec.innerHTML = `<b>${title} (${list.length})</b>`;
      const row = document.createElement('div');
      row.className = 'indp-tags';
      for (const x of list) {
        const b = document.createElement('button');
        b.className = `ind-tag ind-link ind-dir-${dir}`;
        b.textContent = (dir === 'up' ? '← ' : '→ ') + x.kr;
        b.addEventListener('click', () => select(x.id));
        row.appendChild(b);
      }
      sec.appendChild(row);
      bd.appendChild(sec);
    };
    mkList('납품하는 곳 (고객)', down, 'down');
    mkList('공급받는 곳 (원재료·부품·장비)', up, 'up');

    if (chains.length) {
      const sec = document.createElement('div');
      sec.className = 'indp-sec';
      sec.innerHTML = '<b>핵심 공급 사슬</b>';
      for (const ch of chains) {
        const a = g.companies.find((x) => x.id === ch.from);
        const b = g.companies.find((x) => x.id === ch.to);
        const li = document.createElement('div');
        li.className = 'indp-chain';
        li.textContent = `${a ? a.kr : ch.from} → ${b ? b.kr : ch.to} : ${ch.what}`;
        sec.appendChild(li);
      }
      bd.appendChild(sec);
    }

    if (st && st.causal_nodes.length) {
      const sec = document.createElement('div');
      sec.className = 'indp-sec';
      sec.innerHTML = '<b>관련 인과 노드 (거시 연결)</b>';
      const row = document.createElement('div');
      row.className = 'indp-tags';
      for (const n of st.causal_nodes) {
        const b = document.createElement('button');
        b.className = 'ind-tag ind-link';
        b.textContent = '◎ ' + n;
        b.addEventListener('click', () => jumpCausal(n));
        row.appendChild(b);
      }
      sec.appendChild(row);
      bd.appendChild(sec);
    }

    const srcs = [...(c.sources || [])];
    for (const ch of chains) for (const s of ch.sources || []) srcs.push(s);
    if (srcs.length) {
      const sec = document.createElement('div');
      sec.className = 'indp-sec';
      sec.innerHTML = '<b>출처</b>';
      for (const s of srcs) {
        const a = document.createElement('a');
        a.className = 'indp-src';
        a.href = s.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = (s.title || s.url) + (s.date ? ' (' + s.date + ')' : '');
        sec.appendChild(a);
      }
      bd.appendChild(sec);
    }

    if (!c.verified) {
      const w = document.createElement('div');
      w.className = 'indp-warn';
      w.textContent = '1차 공시 검증 전 참고 자료예요. 세부 수치·거래 비중은 확인 후 확정돼요.';
      bd.appendChild(w);
    }

    panel.appendChild(bd);
    if (viewMode === 'flow') {
      renderFlowView();
    } else {
      centerOn(id);
      drawLines();
    }
  }

  /** 단계 상세 패널 */
  function openStage(/** @type {Stage} */ s) {
    if (!data) return;
    sel = null;
    activeBnIdx = null;
    for (const card of cards.values()) card.classList.remove('sel', 'up', 'down', 'both', 'rel', 'dim', 'bn-hi');
    view.classList.remove('has-sel');
    if (legendEl) legendEl.hidden = true;
    if (viewMode === 'map') drawLines();

    const panel = byId('indpanel');
    panel.hidden = false;
    panel.innerHTML = '';
    const hd = document.createElement('div');
    hd.className = 'indp-hd';
    hd.style.setProperty('--sc', stageTone(s));
    hd.innerHTML = `<div><h2>${s.order}. ${s.name}</h2><div class="indp-sub">${s.short}</div></div>`;
    const close = document.createElement('button');
    close.className = 'chip';
    close.textContent = '✕';
    close.setAttribute('aria-label', '닫기');
    close.addEventListener('click', () => { panel.hidden = true; setActiveStageChip(null); });
    hd.appendChild(close);
    panel.appendChild(hd);

    const bd = document.createElement('div');
    bd.className = 'indp-bd';
    const p = document.createElement('p');
    p.className = 'indp-role';
    p.textContent = s.desc;
    bd.appendChild(p);

    const fl = document.createElement('div');
    fl.className = 'indp-chain';
    fl.textContent = '흐름: ' + s.flow_label;
    bd.appendChild(fl);

    if (s.causal_nodes.length) {
      const sec = document.createElement('div');
      sec.className = 'indp-sec';
      sec.innerHTML = '<b>이 단계를 움직이는 인과 노드</b>';
      const row = document.createElement('div');
      row.className = 'indp-tags';
      for (const n of s.causal_nodes) {
        const b = document.createElement('button');
        b.className = 'ind-tag ind-link';
        b.textContent = '◎ ' + n;
        b.addEventListener('click', () => jumpCausal(n));
        row.appendChild(b);
      }
      sec.appendChild(row);
      bd.appendChild(sec);
    }
    panel.appendChild(bd);
  }

  /** 인과 지도로 점프 */
  function jumpCausal(/** @type {string} */ name) {
    if (on) toggle();
    opts.revealNode(name);
  }

  /** 가로 맵 SVG 곡선 */
  function drawLines() {
    if (!svgBg || !svgTop || !scroll || !data || viewMode !== 'map') return;
    const inner = byId('indinner');
    const W = inner.offsetWidth;
    const H = inner.offsetHeight;
    for (const s of [svgBg, svgTop]) {
      s.setAttribute('width', String(W));
      s.setAttribute('height', String(H));
      s.setAttribute('viewBox', `0 0 ${W} ${H}`);
      for (const el of [...s.querySelectorAll('.ind-line')]) el.remove();
    }

    const NS = 'http://www.w3.org/2000/svg';
    const stColor = (/** @type {string} */ cid) => {
      const c = data.companies.find((x) => x.id === cid);
      const st = c && data.stages.find((x) => x.id === c.stage);
      return stageTone(st);
    };

    const stageBoxes = new Map();
    const headBoxes = new Map();
    for (const [sid, col] of cols) {
      stageBoxes.set(sid, relBox(col, inner));
      const h = col.firstElementChild;
      if (h instanceof HTMLElement) headBoxes.set(sid, relBox(h, inner));
    }

    let row2Top = Infinity;
    for (const sid of ['mat', 'part', 'equip', 'fab', 'package', 'fabless', 'system', 'cloud', 'aisw']) {
      const b = stageBoxes.get(sid);
      if (b) row2Top = Math.min(row2Top, b.t);
    }
    if (!isFinite(row2Top)) row2Top = 100;

    const busLanes = /** @type {Record<string,{y:number,offSrc:number,offDst:number}>} */ ({
      'mat>fab': { y: row2Top - 44, offSrc: 0, offDst: -18 },
      'mat>memory': { y: row2Top - 44, offSrc: 0, offDst: 0 },
      'part>package': { y: row2Top - 29, offSrc: 0, offDst: -22 },
      'equip>package': { y: row2Top - 15, offSrc: 14, offDst: 22 },
      'aisw>fabless': { y: row2Top - 46, offSrc: 0, offDst: 0 },
    });

    const addStagePath = (/** @type {string} */ d, /** @type {string} */ color, /** @type {boolean} */ dashed) => {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('class', 'ind-line ind-flow');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', dashed ? '2.5' : '3');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      if (dashed) path.setAttribute('stroke-dasharray', '7 5');
      path.setAttribute('opacity', sel || activeBnIdx !== null ? '0.14' : dashed ? '0.78' : '0.82');
      path.setAttribute('marker-end', 'url(#indbgah)');
      svgBg.appendChild(path);
    };

    const fabColBox = stageBoxes.get('fab');
    const gutterCol4Left = fabColBox ? fabColBox.l - 18 : 0;

    for (const st of data.stages) {
      const colA = STAGE_COL[st.id];
      const A = headBoxes.get(st.id);
      if (!A || !colA) continue;

      for (const tid of st.flows_to) {
        const colB = STAGE_COL[tid];
        const B = headBoxes.get(tid);
        if (!B || !colB) continue;

        const key = `${st.id}>${tid}`;
        const lane = busLanes[key];

        if (key === 'aisw>fabless' && lane) {
          const x1 = A.cx;
          const y1 = A.t - 2;
          const x2 = B.cx;
          const y2 = B.t - 4;
          const ly = lane.y;
          const r = 12;
          const d = `M${x1},${y1} L${x1},${ly + r} Q${x1},${ly} ${x1 - r},${ly} L${x2 + r},${ly} Q${x2},${ly} ${x2},${ly + r} L${x2},${y2}`;
          addStagePath(d, stageTone(st), true);
          if (!sel && activeBnIdx === null) {
            const mx = (x1 + x2) / 2;
            const gLbl = document.createElementNS(NS, 'g');
            gLbl.setAttribute('class', 'ind-line');
            const rect = document.createElementNS(NS, 'rect');
            rect.setAttribute('x', String(mx - 62));
            rect.setAttribute('y', String(ly - 11));
            rect.setAttribute('width', '124');
            rect.setAttribute('height', '20');
            rect.setAttribute('rx', '6');
            rect.setAttribute('fill', '#ffffff');
            rect.setAttribute('stroke', '#d1d6db');
            rect.setAttribute('stroke-width', '1');
            const txt = document.createElementNS(NS, 'text');
            txt.setAttribute('x', String(mx));
            txt.setAttribute('y', String(ly + 3));
            txt.setAttribute('text-anchor', 'middle');
            txt.setAttribute('fill', stageTone(st));
            txt.setAttribute('font-size', '10.5');
            txt.setAttribute('font-weight', '700');
            txt.textContent = 'AI 수요 선순환 ↺';
            gLbl.append(rect, txt);
            svgBg.appendChild(gLbl);
          }
          continue;
        }

        const flowStroke = '#94a3b8';
        if (colB === colA + 1) {
          const x1 = A.r + 2;
          const y1 = A.cy;
          const x2 = B.l - 4;
          const y2 = B.cy;
          const mx = (x1 + x2) / 2;
          addStagePath(`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, flowStroke, false);
        } else if (key === 'mat>memory' && lane && gutterCol4Left) {
          const x1 = A.cx + lane.offSrc;
          const y1 = A.t - 2;
          const ly = lane.y;
          const gx = gutterCol4Left;
          const x2 = B.l - 4;
          const y2 = B.cy;
          const r = 10;
          const d = `M${x1},${y1} L${x1},${ly + r} Q${x1},${ly} ${x1 + r},${ly} L${gx - r},${ly} Q${gx},${ly} ${gx},${ly + r} L${gx},${y2 - r} Q${gx},${y2} ${gx + r},${y2} L${x2},${y2}`;
          addStagePath(d, flowStroke, false);
        } else if (lane) {
          const x1 = A.cx + lane.offSrc;
          const y1 = A.t - 2;
          const x2 = B.cx + lane.offDst;
          const y2 = B.t - 4;
          const ly = lane.y;
          const r = 10;
          const d = `M${x1},${y1} L${x1},${ly + r} Q${x1},${ly} ${x1 + r},${ly} L${x2 - r},${ly} Q${x2},${ly} ${x2},${ly + r} L${x2},${y2}`;
          addStagePath(d, flowStroke, false);
        }
      }
    }

    /** @type {{from:string,to:string,what?:string}[]} */
    const edges = [];
    const have = new Set();

    if (showAllChains && !sel) {
      for (const ch of data.chains) {
        edges.push(ch);
        have.add(ch.from + '>' + ch.to);
      }
    } else if (sel) {
      for (const ch of data.chains) {
        if (ch.from === sel || ch.to === sel) {
          edges.push(ch);
          have.add(ch.from + '>' + ch.to);
        }
      }
      const c0 = data.companies.find((x) => x.id === sel);
      if (c0) {
        for (const t of c0.supplies_to) {
          if (!have.has(sel + '>' + t)) { edges.push({ from: sel, to: t }); have.add(sel + '>' + t); }
        }
        for (const f of c0.sourced_from) {
          if (!have.has(f + '>' + sel)) { edges.push({ from: f, to: sel }); have.add(f + '>' + sel); }
        }
      }
    }

    const pairCounts = new Map();
    for (const e of edges) {
      const k2 = [e.from, e.to].sort().join('|');
      pairCounts.set(k2, (pairCounts.get(k2) || 0) + 1);
    }

    /** @type {SVGGElement[]} */
    const labelGroups = [];
    const targetSvg = sel ? svgTop : svgBg;
    const markerRef = sel ? 'url(#indtopah)' : 'url(#indbgah)';

    for (const ch of edges) {
      const elA = cards.get(ch.from);
      const elB = cards.get(ch.to);
      if (!elA || !elB) continue;
      const a = relBox(elA, inner);
      const b = relBox(elB, inner);

      const active = !!sel && (ch.from === sel || ch.to === sel);
      const pairKey = [ch.from, ch.to].sort().join('|');
      const isBidi = (pairCounts.get(pairKey) || 0) >= 2;
      const down = ch.from === sel;
      const fwd = b.cx >= a.cx;
      const x1 = fwd ? a.r : a.l;
      const x2 = fwd ? b.l : b.r;
      const yOff = isBidi ? (down ? 7 : -7) : 0;
      const y1 = a.cy + yOff;
      const y2 = b.cy + yOff;
      const dx = Math.max(44, Math.abs(x2 - x1) * 0.42);
      const c1x = fwd ? x1 + dx : x1 - dx;
      const c2x = fwd ? x2 - dx : x2 + dx;

      const col = active ? (isBidi ? '#4f46e5' : down ? '#d97706' : '#0d9488') : stColor(ch.from);

      if (active) {
        const halo = document.createElementNS(NS, 'path');
        halo.setAttribute('class', 'ind-line');
        halo.setAttribute('d', `M${x1},${y1} C${c1x},${y1} ${c2x},${y2} ${x2},${y2}`);
        halo.setAttribute('fill', 'none');
        halo.setAttribute('stroke', '#f4f5f7');
        halo.setAttribute('stroke-width', '5');
        halo.setAttribute('opacity', '0.9');
        targetSvg.appendChild(halo);
      }

      const p = document.createElementNS(NS, 'path');
      p.setAttribute('class', 'ind-line');
      p.setAttribute('d', `M${x1},${y1} C${c1x},${y1} ${c2x},${y2} ${x2},${y2}`);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', col);
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-width', active ? '2.4' : '1.4');
      p.setAttribute('opacity', active ? '0.95' : '0.35');
      p.setAttribute('marker-end', markerRef);
      targetSvg.appendChild(p);

      if (active && 'what' in ch && ch.what) {
        const mx = 0.125 * x1 + 0.375 * c1x + 0.375 * c2x + 0.125 * x2;
        const my = 0.5 * y1 + 0.5 * y2 + (isBidi ? (down ? 12 : -12) : 0);
        const textStr = ch.what.length > 22 ? ch.what.slice(0, 21) + '…' : ch.what;
        const pw = Math.max(54, textStr.length * 8.2 + 16);

        const gLbl = document.createElementNS(NS, 'g');
        gLbl.setAttribute('class', 'ind-line');
        const rect = document.createElementNS(NS, 'rect');
        rect.setAttribute('x', String(mx - pw / 2));
        rect.setAttribute('y', String(my - 10));
        rect.setAttribute('width', String(pw));
        rect.setAttribute('height', '20');
        rect.setAttribute('rx', '6');
        rect.setAttribute('fill', '#ffffff');
        rect.setAttribute('stroke', col);
        rect.setAttribute('stroke-width', '1.2');

        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', String(mx));
        t.setAttribute('y', String(my + 3.5));
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('fill', '#191f28');
        t.setAttribute('font-size', '10.5');
        t.setAttribute('font-weight', '700');
        t.textContent = textStr;
        gLbl.append(rect, t);
        labelGroups.push(gLbl);
      }
    }
    for (const lg of labelGroups) targetSvg.appendChild(lg);
  }

  return { toggle, isOn: () => on };
}
