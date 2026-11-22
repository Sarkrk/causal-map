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
      scheduleLines();
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

    // 머리말: 제목 + 쉬운 말 흐름 설명 + 단계 흐름 띠 + 거시 요인
    const head = document.createElement('div');
    head.id = 'indhead';
    const h1 = document.createElement('h1');
    h1.textContent = g.title;
    const intro = document.createElement('p');
    intro.className = 'ind-intro';
    intro.textContent = g.intro;
    const fold = document.createElement('button');
    fold.className = 'ind-fold';
    const small = window.matchMedia('(max-width:640px)').matches;
    if (small) intro.classList.add('folded');
    fold.textContent = small ? '설명 펼치기 ▼' : '설명 접기 ▲';
    fold.addEventListener('click', () => {
      const f = intro.classList.toggle('folded');
      fold.textContent = f ? '설명 펼치기 ▼' : '설명 접기 ▲';
      scheduleLines();
    });
    head.append(h1, fold, intro);

    const strip = document.createElement('div');
    strip.className = 'ind-strip';
    stages.forEach((s, i) => {
      const chip = document.createElement('button');
      chip.className = 'ind-stagechip';
      chip.style.setProperty('--sc', s.color);
      chip.innerHTML = `<b>${s.order}. ${s.name}</b><span>${s.short}</span>`;
      chip.addEventListener('click', () => openStage(s));
      strip.appendChild(chip);
      if (i < stages.length - 1) {
        const ar = document.createElement('i');
        ar.className = 'ind-arrow';
        ar.textContent = '→';
        strip.appendChild(ar);
      }
    });
    head.appendChild(strip);

    const macro = document.createElement('div');
    macro.className = 'ind-macro';
    macro.innerHTML = '<span class="ind-macro-t">거시 요인 (클릭하면 인과 지도로):</span>';
    for (const n of g.macro_overlay || []) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = n;
      b.addEventListener('click', () => jumpCausal(n));
      macro.appendChild(b);
    }
    head.appendChild(macro);
    view.appendChild(head);

    // 평면 맵: 단계 컬럼 + SVG 연결
    scroll = document.createElement('div');
    scroll.id = 'indscroll';
    const inner = document.createElement('div');
    inner.id = 'indinner';
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'indsvg';
    svg.innerHTML = '<defs><marker id="indah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L8,4L0,8z" fill="context-stroke"/></marker></defs>';
    inner.appendChild(svg);

    cards.clear();
    for (const s of stages) {
      const col = document.createElement('div');
      col.className = 'ind-col';
      col.style.setProperty('--sc', s.color);
      const ch = document.createElement('button');
      ch.className = 'ind-colhead';
      const comps = g.companies.filter((c) => c.stage === s.id);
      ch.innerHTML = `<b>${s.name}</b><span>${s.short} · ${comps.length}개 기업</span>`;
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
          card.addEventListener('click', (e) => { e.stopPropagation(); select(c.id); });
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
    scroll.addEventListener('scroll', scheduleLines, { passive: true });
    view.appendChild(scroll);

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
    view.appendChild(bn);

    // 상세 패널
    const panel = document.createElement('div');
    panel.id = 'indpanel';
    panel.hidden = true;
    view.appendChild(panel);

    view.addEventListener('click', (e) => {
      if (e.target === view || e.target === scroll || e.target === inner) select(null);
    });
    window.addEventListener('resize', scheduleLines);
    drawLines();
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
    for (const [cid, card] of cards) {
      card.classList.toggle('sel', cid === id);
      card.classList.toggle('rel', !!id && rel.has(cid) && cid !== id);
      card.classList.toggle('dim', !!id && !rel.has(cid));
    }
    const panel = byId('indpanel');
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
        b.addEventListener('click', () => { select(x.id); const el = cards.get(x.id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); });
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
    const W = inner.scrollWidth;
    const H = inner.scrollHeight;
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    // 기존 선 제거(defs 보존)
    for (const el of [...svg.querySelectorAll('path.ind-line')]) el.remove();
    const base = inner.getBoundingClientRect();
    /** @param {string} id */
    const pos = (id) => {
      const el = cards.get(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { l: r.left - base.left, r: r.right - base.left, t: r.top - base.top, b: r.bottom - base.top, cy: r.top - base.top + r.height / 2 };
    };
    for (const ch of data.chains) {
      const a = pos(ch.from);
      const b = pos(ch.to);
      if (!a || !b) continue;
      const active = !!sel && (ch.from === sel || ch.to === sel);
      const dim = !!sel && !active;
      const fwd = b.l >= a.r;
      const x1 = fwd ? a.r : a.l;
      const x2 = fwd ? b.l : b.r;
      const y1 = a.cy;
      const y2 = b.cy;
      const dx = Math.max(40, Math.abs(x2 - x1) * 0.45);
      const c1x = fwd ? x1 + dx : x1 - dx;
      const c2x = fwd ? x2 - dx : x2 + dx;
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('class', 'ind-line');
      p.setAttribute('d', `M${x1},${y1} C${c1x},${y1} ${c2x},${y2} ${x2},${y2}`);
      p.setAttribute('fill', 'none');
      const col = active ? (data.stages.find((s) => s.id === (data.companies.find((c) => c.id === sel) || {}).stage) || {}).color || '#c8d6e8' : '#c8d6e8';
      p.setAttribute('stroke', col);
      p.setAttribute('stroke-width', active ? '2.2' : '1.3');
      p.setAttribute('opacity', dim ? '0.05' : active ? '0.9' : '0.28');
      if (active) p.setAttribute('marker-end', 'url(#indah)');
      svg.appendChild(p);
    }
  }

  return { toggle, isOn: () => on };
}