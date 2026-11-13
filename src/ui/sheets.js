// @ts-check
// 하단 시트 3개(노드 상세 ns, 보기 설정 fs)의 상태 전환과 드래그 제스처. 원본 sheet()·dragSheet()와 같은 수치.

/** @typedef {'peek'|'half'|'open'|''} SheetState */
/** @typedef {import('../store/store.js').Listener} Listener */

/**
 * @param {{ns: HTMLElement, fs: HTMLElement, nsh: HTMLElement, fsh: HTMLElement, fb: HTMLElement, zoombox: HTMLElement}} els
 * @param {{onDeselect: () => void}} cb  노드 시트를 아래로 내려 닫을 때 선택 해제
 * @returns {{setSheet: (el: HTMLElement, st: SheetState) => void, onStore: Listener, fb: HTMLElement}}
 */
export function initSheets(els, cb) {
  const { ns, fs, nsh, fsh, fb, zoombox } = els;

  /**
   * @param {HTMLElement} el
   * @param {SheetState} st
   */
  function setSheet(el, st) {
    for (const s of [ns, fs]) if (s !== el) s.className = 'sheet';
    el.className = 'sheet' + (st ? ' ' + st : '');
    zoombox.style.display = st === 'open' ? 'none' : 'flex';
    zoombox.style.bottom = `calc(env(safe-area-inset-bottom) + ${16 + (st === 'peek' ? 132 : st === 'half' ? innerHeight * 0.5 : 0)}px)`;
  }

  /**
   * @param {HTMLElement} hd
   * @param {HTMLElement} el
   */
  function drag(hd, el) {
    /** @type {number|null} */
    let y0 = null;
    hd.addEventListener('pointerdown', (e) => {
      y0 = e.clientY;
      hd.setPointerCapture(e.pointerId);
    });
    hd.addEventListener('pointerup', (e) => {
      if (y0 == null) return;
      const dy = e.clientY - y0;
      y0 = null;
      const open = el.classList.contains('open');
      if (el === ns) {
        if (Math.abs(dy) < 8) {
          setSheet(ns, open ? 'half' : 'open');
          return;
        }
        if (dy < -30) setSheet(ns, 'open');
        else if (dy > 30) {
          if (open) setSheet(ns, 'half');
          else {
            setSheet(ns, '');
            cb.onDeselect();
          }
        }
        return;
      }
      if (Math.abs(dy) < 8) {
        setSheet(el, open ? '' : 'open');
        return;
      }
      if (dy < -30) setSheet(el, 'open');
      else if (dy > 30) setSheet(el, '');
    });
  }

  drag(nsh, ns);
  drag(fsh, fs);
  fb.addEventListener('click', () => {
    if (fs.classList.contains('open')) setSheet(fs, '');
    else setSheet(fs, 'open');
  });

  return {
    setSheet,
    fb,
    /** 선택이 바뀌면 노드 시트를 맞춘다(원본 select()/deselect()의 시트 동작). */
    onStore(_st, _prev, action) {
      if (action.type === 'select') setSheet(ns, ns.classList.contains('open') ? 'open' : 'half');
      else if (action.type === 'deselect') setSheet(ns, '');
    },
  };
}
