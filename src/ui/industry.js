// 산업 지도(반도체 밸류체인 평면 맵) — 11/23 신설.
// 인과 3D 그래프와 별개 데이터(industry.json). 기업 카드를 단계별 컬럼으로 배치하고
// 공급 사슬을 SVG 곡선으로 잇는다. 카드 클릭 → 상세 패널 + 이웃 강조.
// 단계 헤더의 '관련 인과 노드' 칩은 3D 그래프로 점프한다(거시 요인 ↔ 산업 단계 브리지).

/** @typedef {{id:string,name:string,kr:string,ticker?:string,country:string,stage:string,subgroup?:string,role:string,products:string[],supplies_to:string[],sourced_from:string[],sources:{url:string,title?:string,date?:string}[],verified:boolean,note?:string}} Company */
/** @typedef {{id:string,order:number,name:string,short:string,desc:string,color:string,subgroups?:string[],flows_to:string[],flow_label:string,causal_nodes:string[]}} Stage */
/** @typedef {{version:string,title:string,intro:string,macro_overlay:string[],stages:Stage[],companies:Company[],chains:{from:string,to:string,what:string,sources:{url:string}[]}[],bottlenecks:{title:string,desc:string,companies:string[],sources:{url:string}[]}[]}} Industry */

const byId = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * @param {{revealNode:(id:string)=>void, onMode:(on:boolean)=>void}} opts
 */
export function initIndustry(opts) {
  /** @type {Industry|null} */
  let data = null;
  let on = false;
  /** @type {string|null} */
  let sel = null;
  /** @type {Map<string,HTMLElement>} */
  const cards = new Map();
  let svg = /** @type {SVGSVGElement|null} */ (null);
  let scroll = /** @type {HTMLElement|null} */ (null);
  let raf = 0;

  const view = byId('indview');

  async function load() {
    if (data) return data;
    const r = await fetch('industry.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('industry.json ' + r.status);
    data = /** @type {Industry} */ (await r.json());
    return data;
  }

  /** 화면 토글 */
  async function toggle() {
    if (!on) {
      try { await load(); } catch (e) { toast('산업 지도 데이터를 못 불러왔어요: ' + e); return; }
      render();
      on = true;
      document.body.classList.add('ind-on');
      view.hidden = false;
      byId('indbtn').textContent = '인과 지도';
      byId('indbtn').classList.add('on');
      opts.onMode(true);
      startView();
    } else {
      on = false;
      document.body.classList.remove('ind-on');
      view.hidden = true;
      byId('indbtn').textContent = '산업 지도';
      byId('indbtn').classList.remove('on');
      opts.onMode(false);
    }
  }

  function toast(/** @type {string} */ msg) {
    const t = byId('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3500);
  }

  function render() {
    if (!data) return;
    const g = data;
    const stages = [...g.stages].sort((a, b) => a.order - b.order);
    view.innerHTML = '';

    // 상단 바(떠 있는 오버레이): ← 인과 지도 / 제목 / ⓘ / 단계 칩(누르면 그 단계로 이동)
    const top = document.createElement('div');
    top.id = 'indtop';
    const row1 = document.createElement('div');
    row1.className = 'ind-row1';
    const back = document.createElement('button');
    back.className = 'ind-back';
    back.textContent = '← 인과 지도';
    back.setAttribute('aria-label', '인과 지도(기존 DB)로 돌아가기');
    back.addEventListener('click', () => { if (on) toggle(); });
    const h1 = document.createElement('h1');
    h1.textContent = g.title;
    const info = document.createElement('button');
    info.className = 'ind-info';
    info.textContent = 'ⓘ';
    info.setAttribute('aria-label', '설명');
    row1.append(back, h1, info);
    const intro = document.createElement('p');
    intro.className = 'ind-intro';
    intro.hidden = true;
    intro.textContent = g.intro;
    info.addEventListener('click', () => { intro.hidden = !intro.hidden; });
    const strip = document.createElement('div');
    strip.className = 'ind-strip';
    stages.forEach((s, i) => {
      const chip = document.createElement('button');
      chip.className = 'ind-stagechip';
      chip.dataset.stage = s.id;
      chip.style.setProperty('--sc', s.color);
      chip.innerHTML = `<b>${s.order}. ${s.name}</b>`;
      chip.addEventListener('click', () => { focusStage(s.id); openStage(s); });
      strip.appendChild(chip);
      if (i < stages.length - 1) {
        const ar = document.createElement('i');
        ar.className = 'ind-arrow';
        ar.textContent = '›';
        strip.appendChild(ar);
      }
    });
    top.append(row1, intro, strip);

    // 평면 맵: 무한 캔버스(드래그 이동·핀치/휠 확대) + 단계 컬럼 + SVG 연결
    scroll = document.createElement('div');
    scroll.id = 'indscroll';
    const inner = document.createElement('div');
    inner.id = 'indinner';
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'indsvg';
    svg.innerHTML = '<defs><marker id="indah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L8,4L0,8z" fill="context-stroke"/></marker></defs>';
    inner.appendChild(svg);

    cards.clear();
    cols.clear();
    for (const s of stages) {
      const col = document.createElement('div');
      col.className = 'ind-col';
      col.dataset.stage = s.id;
      cols.set(s.id, col);
      { const gp = GRID[s.id]; if (gp) { col.style.gridColumn = String(gp[0]); col.style.gridRow = String(gp[1]) + (gp[2] ? ' / span ' + gp[2] : ''); } }
      col.style.setProperty('--sc', s.color);
      const ch = document.createElement('button');
      ch.className = 'ind-colhead';
      const comps = g.companies.filter((c) => c.stage === s.id);
      ch.innerHTML = `<b>${s.order}. ${s.name}</b><span>${s.short} · ${comps.length}개 기업</span>`;
      ch.addEventListener('click', () => openStage(s));
      col.appendChild(ch);

      const groups = s.subgroups && s.subgroups.length ? s.subgroups : [null];
      const renderList = (list, grp) => {
        if (!list.length) return;
        if (grp) {
          const gl = document.createElement('div');
          gl.className = 'ind-sub';
          gl.textContent = grp;
          col.appendChild(gl);
        }
        for (const c of list) {
          const card = document.createElement('button');
          card.className = 'ind-card';
          card.dataset.id = c.id;
          card.innerHTML = `<b>${c.kr}</b><span class="ind-tk">${c.name !== c.kr ? c.name + ' · ' : ''}${c.ticker || ''}</span><span class="ind-role">${c.role}</span>${c.verified ? '' : '<i class="ind-cand" title="출처 검증 전 후보">후보</i>'}`;
          card.addEventListener('click', (e) => { e.stopPropagation(); if (moved) return; select(c.id); });
          cards.set(c.id, card);
          col.appendChild(card);
        }
      };
      for (const grp of groups) renderList(comps.filter((c) => (c.subgroup || null) === grp), grp);
      // 목록에 없는 소그룹(또는 미지정) 기업도 빠짐없이 렌더 — 11/23
      const known = new Set(groups);
      const rest = comps.filter((c) => !known.has(c.subgroup || null));
      if (rest.length) renderList(rest, groups[0] === null ? null : '기타');
      inner.appendChild(col);
    }
    scroll.appendChild(inner);
    view.appendChild(scroll);
    view.appendChild(top);

    // 확대·축소 버튼
    const zb = document.createElement('div');
    zb.id = 'indzoom';
    for (const [t, lab, fn] of /** @type {[string,string,()=>void][]} */ ([
      ['+', '확대', () => zoomBy(1.3)],
      ['−', '축소', () => zoomBy(1 / 1.3)],
      ['⤢', '전체 보기', () => fitAll(true)],
    ])) {
      const b = document.createElement('button');
      b.className = 'ind-zb';
      b.textContent = t;
      b.setAttribute('aria-label', lab);
      b.addEventListener('click', fn);
      zb.appendChild(b);
    }
    view.appendChild(zb);
    bindGestures();

    // 병목 띠
    const bn = document.createElement('div');
    bn.className = 'ind-bns';
    for (const b of g.bottlenecks || []) {
      const el = document.createElement('button');
      el.className = 'ind-bn';
      el.innerHTML = `<b>⚠ ${b.title}</b><span>${b.desc}</span>`;
      el.addEventListener('click', () => { select(b.companies[0]); toast(b.title + ': ' + b.desc); });
      bn.appendChild(el);
    }
    const bnWrap = document.createElement('div');
    bnWrap.className = 'ind-bnwrap';
    const bnBtn = document.createElement('button');
    bnBtn.className = 'ind-bntoggle';
    bnBtn.textContent = '⚠ 병목 ' + (g.bottlenecks || []).length + '건 보기';
    bnBtn.addEventListener('click', () => {
      const on = bnWrap.classList.toggle('open');
      bnBtn.textContent = on ? '⚠ 병목 닫기' : '⚠ 병목 ' + (g.bottlenecks || []).length + '건 보기';
    });
    bnWrap.appendChild(bnBtn);
    bnWrap.appendChild(bn);
    view.appendChild(bnWrap);

    // 상세 패널
    const panel = document.createElement('div');
    panel.id = 'indpanel';
    panel.hidden = true;
    view.appendChild(panel);

    view.addEventListener('click', (e) => {
      if (moved) return;
      if (e.target === view || e.target === scroll || e.target === inner) select(null);
    });
    if (!resizeBound) { resizeBound = true; window.addEventListener('resize', () => { if (on) { drawLines(); } }); }
    drawLines();
    startView();
  }

  // ───── 카메라(이동·확대) ─────
  /** 단계 배치(열,행[,행 span]): 일렬이 아니라 갈래별로 위아래로 쌓는다 */
  const GRID = {
    mat: [1, 1], part: [2, 1], equip: [3, 1],
    fab: [4, 1], memory: [4, 2],
    package: [5, 1, 2], design: [5, 3],
    fabless: [6, 1], system: [7, 1], cloud: [8, 1], aisw: [9, 1],
  };

  const MINK = 0.16;
  const MAXK = 2.6;
  let tx = 0;
  let ty = 0;
  let k = 1;
  let moved = false;
  let resizeBound = false;
  /** @type {Map<string,HTMLElement>} */
  const cols = new Map();

  function applyCam(/** @type {boolean} */ smooth) {
    const inner = byId('indinner');
    inner.style.transition = smooth ? 'transform .28s ease' : 'none';
    inner.style.transform = `translate(${tx}px,${ty}px) scale(${k})`;
    inner.classList.toggle('lod', k < 0.55);
    inner.classList.toggle('lod2', k < 0.3);
  }
  function viewSize() {
    const r = scroll ? scroll.getBoundingClientRect() : { width: innerWidth, height: innerHeight };
    return { w: r.width, h: r.height };
  }
  /** 위 바에 가려지는 높이(맵을 이 아래에 배치) */
  function topPad() {
    const t = document.getElementById('indtop');
    return t ? t.getBoundingClientRect().height + 6 : 90;
  }
  /** 패널·시트에 가려지는 영역을 뺀 보이는 영역 */
  function freeRect() {
    const { w, h } = viewSize();
    const panelOpen = !byId('indpanel').hidden;
    const small = w <= 700;
    let left = 0;
    let right = w;
    let bottom = h;
    if (panelOpen) { if (small) bottom = h * 0.48; else right = w - Math.min(400, w * 0.92); }
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
  /** 전체가 한눈에 들어오게(가로 기준, 너무 작으면 최소 배율) */
  function fitAll(/** @type {boolean} */ smooth) {
    const inner = byId('indinner');
    const { w, h } = viewSize();
    const W = inner.offsetWidth;
    const H = inner.offsetHeight;
    const fr = freeRect();
    k = Math.min(MAXK, Math.max(MINK, Math.min((w - 24) / W, (h - fr.top - 70) / H)));
    tx = (w - W * k) / 2;
    ty = fr.top;
    applyCam(smooth);
    drawLines();
  }
  /** 처음 열 때: 1단계 왼쪽 위에서 읽기 좋은 크기로(전체 보기는 ⤢) */
  function startView() {
    const { w } = viewSize();
    const fr = freeRect();
    k = Math.min(0.8, Math.max(MINK, (w - 24) / 520));
    tx = 12 - 20 * k;
    ty = fr.top;
    clampCam();
    applyCam(false);
    drawLines();
  }
  function focusStage(/** @type {string} */ sid) {
    const col = cols.get(sid);
    if (!col) return;
    const { w } = viewSize();
    const fr = freeRect();
    k = Math.min(1.1, Math.max(0.6, (w - 24) / (col.offsetWidth + 40)));
    applyCam(false);
    tx = w / 2 - (col.offsetLeft + col.offsetWidth / 2) * k;
    ty = fr.top - col.offsetTop * k;
    clampCam();
    applyCam(true);
  }
  function centerOn(/** @type {string} */ id) {
    const card = cards.get(id);
    if (!card) return;
    // 배율(→ 글자 생략 단계)을 먼저 확정해야 카드 위치가 맞다
    k = Math.min(1.2, Math.max(0.75, k));
    applyCam(false);
    const col = card.offsetParent instanceof HTMLElement ? card.offsetParent : null;
    const cx = (col ? col.offsetLeft : 0) + card.offsetLeft + card.offsetWidth / 2;
    const cy = (col ? col.offsetTop : 0) + card.offsetTop + card.offsetHeight / 2;
    const fr = freeRect();
    k = Math.min(1.2, Math.max(0.75, k));
    tx = (fr.left + fr.right) / 2 - cx * k;
    ty = (fr.top + fr.bottom) / 2 - cy * k;
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
      window.addEventListener('pointermove', (e) => { if (on) move(e); });
      window.addEventListener('pointerup', (e) => { if (on) up(e); });
      window.addEventListener('pointercancel', (e) => { if (on) up(e); });
    }
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
  }

  /** 카드 선택 → 이웃 강조 + 패널 */
  function select(/** @type {string|null} */ id) {
    sel = id;
    if (!data) return;
    const g = data;
    const rel = new Set();
    if (id) {
      rel.add(id);
      const c = g.companies.find((x) => x.id === id);
      if (c) {
        for (const t of c.supplies_to) rel.add(t);
        for (const t of c.sourced_from) rel.add(t);
      }
      for (const ch of g.chains) {
        if (ch.from === id) rel.add(ch.to);
        if (ch.to === id) rel.add(ch.from);
      }
    }
    const upSet = new Set();
    const downSet = new Set();
    if (id) {
      const c0 = g.companies.find((x) => x.id === id);
      if (c0) {
        c0.supplies_to.forEach((t) => downSet.add(t));
        c0.sourced_from.forEach((t) => upSet.add(t));
      }
      for (const ch of g.chains) {
        if (ch.from === id) downSet.add(ch.to);
        if (ch.to === id) upSet.add(ch.from);
      }
    }
    for (const [cid, card] of cards) {
      card.classList.toggle('up', !!id && upSet.has(cid) && cid !== id);
      card.classList.toggle('down', !!id && downSet.has(cid) && cid !== id);
      card.classList.toggle('sel', cid === id);
      card.classList.toggle('rel', !!id && rel.has(cid) && cid !== id);
      card.classList.toggle('dim', !!id && !rel.has(cid));
    }
    const panel = byId('indpanel');
    byId('indview').classList.toggle('has-sel', !!id);
    if (!id) { panel.hidden = true; drawLines(); return; }
    const c = g.companies.find((x) => x.id === id);
    if (!c) return;
    const st = g.stages.find((s) => s.id === c.stage);
    const up = g.companies.filter((x) => c.sourced_from.includes(x.id));
    const down = g.companies.filter((x) => c.supplies_to.includes(x.id));
    const chains = g.chains.filter((ch) => ch.from === id || ch.to === id);
    panel.hidden = false;
    panel.innerHTML = '';
    const hd = document.createElement('div');
    hd.className = 'indp-hd';
    hd.style.setProperty('--sc', st ? st.color : '#8a9bb0');
    hd.innerHTML = `<div><h2>${c.kr}${c.name !== c.kr ? ` <small>${c.name}</small>` : ''}</h2><div class="indp-sub">${st ? st.name : ''}${c.subgroup ? ' · ' + c.subgroup : ''} · ${c.country} · ${c.ticker || '비상장'}</div></div>`;
    const close = document.createElement('button');
    close.className = 'chip';
    close.textContent = '✕';
    close.setAttribute('aria-label', '닫기');
    close.addEventListener('click', () => select(null));
    hd.appendChild(close);
    panel.appendChild(hd);

    const bd = document.createElement('div');
    bd.className = 'indp-bd';
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
    const mkList = (/** @type {string} */ title, /** @type {Company[]} */ list, /** @type {string} */ dir) => {
      if (!list.length) return;
      const sec = document.createElement('div');
      sec.className = 'indp-sec';
      sec.innerHTML = `<b>${title}</b>`;
      const row = document.createElement('div');
      row.className = 'indp-tags';
      for (const x of list) {
        const b = document.createElement('button');
        b.className = 'ind-tag ind-link';
        b.textContent = (dir === 'up' ? '← ' : '→ ') + x.kr;
        b.addEventListener('click', () => { select(x.id); });
        row.appendChild(b);
      }
      sec.appendChild(row);
      bd.appendChild(sec);
    };
    mkList('공급받는 곳 (고객)', down, 'down');
    mkList('공급받는 곳 (부품·소재)', up, 'up');
    if (chains.length) {
      const sec = document.createElement('div');
      sec.className = 'indp-sec';
      sec.innerHTML = '<b>이 회사의 공급 사슬</b>';
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
      w.textContent = '출처 검증 전 후보 자료예요. 수치·관계는 확인 후 확정돼요.';
      bd.appendChild(w);
    }
    panel.appendChild(bd);
    centerOn(id);
    drawLines();
  }

  /** 단계 상세 패널 */
  function openStage(/** @type {Stage} */ s) {
    if (!data) return;
    select(null);
    const panel = byId('indpanel');
    panel.hidden = false;
    panel.innerHTML = '';
    const hd = document.createElement('div');
    hd.className = 'indp-hd';
    hd.style.setProperty('--sc', s.color);
    hd.innerHTML = `<div><h2>${s.order}. ${s.name}</h2><div class="indp-sub">${s.short}</div></div>`;
    const close = document.createElement('button');
    close.className = 'chip';
    close.textContent = '✕';
    close.addEventListener('click', () => { panel.hidden = true; });
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

  /** 인과 3D 그래프로 점프 */
  function jumpCausal(/** @type {string} */ name) {
    if (on) toggle();
    opts.revealNode(name);
  }

  function scheduleLines() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; drawLines(); });
  }

  /** 공급 사슬 SVG 곡선 */
  function drawLines() {
    if (!svg || !scroll || !data) return;
    const inner = byId('indinner');
    const W = inner.offsetWidth;
    const H = inner.offsetHeight;
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    for (const el of [...svg.querySelectorAll('.ind-line')]) el.remove();
    /** 변환(확대·이동)과 무관한 레이아웃 좌표 @param {string} id */
    const pos = (id) => {
      const el = cards.get(id);
      if (!el) return null;
      const col = el.offsetParent instanceof HTMLElement ? el.offsetParent : null;
      const l = (col ? col.offsetLeft : 0) + el.offsetLeft;
      const t = (col ? col.offsetTop : 0) + el.offsetTop;
      return { l, r: l + el.offsetWidth, t, b: t + el.offsetHeight, cy: t + el.offsetHeight / 2 };
    };
    const stColor = (/** @type {string} */ cid) => {
      const c = data.companies.find((x) => x.id === cid);
      const st = c && data.stages.find((x) => x.id === c.stage);
      return (st && st.color) || '#c8d6e8';
    };
    const NS = 'http://www.w3.org/2000/svg';
    /** @type {SVGElement[]} */
    const labels = [];
    // 선택 안 한 선 먼저, 활성 선은 위에 그린다.
    // 선택한 기업의 공급 관계(supplies_to/sourced_from)도 선으로 그린다(사슬에 없는 것만).
    /** @type {{from:string,to:string,what?:string}[]} */
    const edges = [...data.chains];
    if (sel) {
      const have = new Set(edges.map((e) => e.from + '>' + e.to));
      const c0 = data.companies.find((x) => x.id === sel);
      if (c0) {
        for (const t of c0.supplies_to) if (!have.has(sel + '>' + t)) { edges.push({ from: sel, to: t }); have.add(sel + '>' + t); }
        for (const f of c0.sourced_from) if (!have.has(f + '>' + sel)) { edges.push({ from: f, to: sel }); have.add(f + '>' + sel); }
      }
    }
    // 단계(계통) 간 분기선: 컬럼 머리끼리 이어서 갈라지는 길을 보여준다. 가까우면 직선, 멀면 위로 둥글게.
    const NS0 = 'http://www.w3.org/2000/svg';
    const heads = new Map();
    for (const [sid, col] of cols) {
      const h = col.firstElementChild;
      if (h instanceof HTMLElement) heads.set(sid, { l: col.offsetLeft, r: col.offsetLeft + col.offsetWidth, y: col.offsetTop + h.offsetHeight / 2, t: col.offsetTop });
    }
    const orderOf = new Map(data.stages.map((x) => [x.id, x.order]));
    for (const st of data.stages) {
      for (const tid of st.flows_to) {
        const A = heads.get(st.id);
        const B = heads.get(tid);
        if (!A || !B || B.l < A.r - 4) continue;
        const x1 = A.r;
        const x2 = B.l;
        const dx = Math.max(30, (x2 - x1) / 2);
        const path = document.createElementNS(NS0, 'path');
        path.setAttribute('class', 'ind-line ind-flow');
        path.setAttribute('d', `M${x1},${A.y} C${x1 + dx},${A.y} ${x2 - dx},${B.y} ${x2},${B.y}`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', st.color);
        path.setAttribute('stroke-width', '5');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('opacity', sel ? '0.12' : '0.9');
        path.setAttribute('marker-end', 'url(#indah)');
        svg.appendChild(path);
      }
    }
    const order = edges.sort((x, y) => Number(sel && (x.from === sel || x.to === sel)) - Number(sel && (y.from === sel || y.to === sel)));
    for (const ch of order) {
      const a = pos(ch.from);
      const b = pos(ch.to);
      if (!a || !b) continue;
      const active = !!sel && (ch.from === sel || ch.to === sel);
      const dim = !!sel && !active;
      const down = ch.from === sel; // 선택 기업이 납품하는 쪽(하류)
      const fwd = b.l >= a.r;
      const x1 = fwd ? a.r : a.l;
      const x2 = fwd ? b.l : b.r;
      const y1 = a.cy;
      const y2 = b.cy;
      const dx = Math.max(40, Math.abs(x2 - x1) * 0.45);
      const c1x = fwd ? x1 + dx : x1 - dx;
      const c2x = fwd ? x2 - dx : x2 + dx;
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('class', 'ind-line');
      p.setAttribute('d', `M${x1},${y1} C${c1x},${y1} ${c2x},${y2} ${x2},${y2}`);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke-linecap', 'round');
      // 평소: 출발 단계 색(분기가 어느 단계에서 갈라지는지 보이게). 선택 시: 상류 민트 / 하류 호박색.
      const col = active ? (down ? '#ffc247' : '#5eead4') : stColor(ch.from);
      p.setAttribute('stroke', col);
      p.setAttribute('stroke-width', active ? '3' : '1.8');
      p.setAttribute('opacity', dim ? '0.06' : active ? '0.95' : '0.5');
      p.setAttribute('marker-end', 'url(#indah)');
      svg.appendChild(p);
      if (active && 'what' in ch && ch.what) {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('class', 'ind-line');
        t.setAttribute('x', String(mx));
        t.setAttribute('y', String(my - 4));
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('fill', col);
        t.setAttribute('font-size', '11');
        t.setAttribute('font-weight', '700');
        t.setAttribute('stroke', '#0a0b0d');
        t.setAttribute('stroke-width', '3');
        t.setAttribute('paint-order', 'stroke');
        t.textContent = ch.what;
        labels.push(t);
      }
    }
    labels.forEach((t) => svg.appendChild(t));
  }

  return { toggle, isOn: () => on };
}