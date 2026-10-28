// done-kit.js : 제출 완료 화면 도우미 (활동지 공용)
//  1) 제출하면 "제출 완료" 안내를 띄우고, 쓴 내용은 그대로 둔 채 입력을 잠급니다.
//  2) 선생님이 반려하거나 삭제하면 화면이 자동으로 풀려서 고쳐 쓸 수 있습니다.
//  3) 긴 글은 칸이 늘어나고, 잠긴 화면에서는 글이 칸 밖으로 잘리지 않고 모두 보입니다.
//  4) "이미지로 저장" 버튼으로 작성 내용 전체를 한 장(PNG)으로 저장합니다.
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const CSS = `
textarea.dk-grow { overflow: hidden !important; resize: none !important; }
.dk-mirror { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
.dk-bar { border-radius: 12px; padding: 14px 16px; margin-bottom: 18px; line-height: 1.5; font-family: inherit; }
.dk-bar.dk-done { background: #ecfdf5; border: 2px solid #34d399; color: #065f46; }
.dk-bar.dk-rej  { background: #fff7ed; border: 2px solid #fb923c; color: #9a3412; }
.dk-title { font-size: 1.15rem; font-weight: bold; }
.dk-sub { font-size: 0.92rem; margin-top: 4px; word-break: keep-all; }
.dk-btns { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.dk-btns button { padding: 10px 16px; border: none; border-radius: 10px; font-weight: bold; font-size: 0.95rem; cursor: pointer; color: #fff; background: #059669; }
.dk-btns button[data-act="home"] { background: #475569; }
.dk-btns button:disabled { opacity: .6; cursor: wait; }
`;

function injectCss() {
  if (document.getElementById('dk-style')) return;
  const s = document.createElement('style');
  s.id = 'dk-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ---------- 칸 자동 늘리기 ----------
function grow(ta) {
  if (ta.offsetParent === null) return;
  ta.style.height = 'auto';
  ta.style.height = (ta.scrollHeight + 2) + 'px';
}
export function growAll(root = document) {
  root.querySelectorAll('textarea.dk-grow').forEach(grow);
}
export function initAutoGrow(root = document) {
  injectCss();
  root.querySelectorAll('textarea').forEach(ta => {
    ta.classList.add('dk-grow');
    ta.style.minHeight = ta.offsetHeight + 'px';
    ta.addEventListener('input', () => grow(ta));
    grow(ta);
  });
  window.addEventListener('resize', () => growAll(root));
}

// ---------- 잠긴 화면에서 글 전체 보여 주기 ----------
const MIRROR_PROPS = [
  'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color', 'textAlign', 'backgroundColor',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
  'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'borderRadius', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'flexGrow', 'flexShrink', 'flexBasis', 'maxWidth', 'minWidth'
];

function addMirrors(root) {
  root.querySelectorAll('input[type=text],input[type=number],textarea').forEach(el => {
    if (el.dataset.dkHidden) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    const m = document.createElement('div');
    m.className = 'dk-mirror';
    MIRROR_PROPS.forEach(p => { m.style[p] = cs[p]; });
    m.style.boxSizing = 'border-box';
    m.style.display = (cs.display === 'inline-block' || cs.display === 'inline') ? 'block' : cs.display;
    m.style.width = parseFloat(cs.flexGrow) > 0 ? 'auto' : cs.width;
    m.style.minHeight = '1.6em';
    m.textContent = el.value || '';
    el.after(m);
    el.dataset.dkHidden = '1';
    el.dataset.dkDisplay = el.style.display;
    el.style.display = 'none';
  });
}
function removeMirrors(root) {
  root.querySelectorAll('.dk-mirror').forEach(m => m.remove());
  root.querySelectorAll('[data-dk-hidden]').forEach(el => {
    el.style.display = el.dataset.dkDisplay || '';
    delete el.dataset.dkHidden;
    delete el.dataset.dkDisplay;
  });
}

// ---------- 이미지 저장 ----------
async function ensureH2C() {
  if (window.html2canvas) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
async function saveImage(root, fileName) {
  await ensureH2C();
  const w = root.scrollWidth, h = root.scrollHeight;
  const scale = Math.max(1, Math.min(2, Math.sqrt(14000000 / (w * h))));
  const canvas = await window.html2canvas(root, {
    scale, useCORS: true, backgroundColor: '#ffffff',
    ignoreElements: el => el.hasAttribute && el.hasAttribute('data-nocapture')
  });
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ---------- 제출 완료 화면 ----------
// options: { db, path, root, getFileName(), onReopen(), lockEls() }
export function createDoneKit(options) {
  injectCss();
  const { db, path, root, getFileName, onReopen, lockEls } = options;

  const bar = document.createElement('div');
  bar.style.display = 'none';
  bar.setAttribute('data-nocapture', '');
  root.insertBefore(bar, root.firstChild);

  let unsub = null;
  let locked = [];

  function targets() {
    if (lockEls) return lockEls();
    return Array.from(root.children).filter(c => c !== bar && c.tagName !== 'H1');
  }
  function lock() {
    locked = targets();
    locked.forEach(t => { t.inert = true; });
    addMirrors(root);
  }
  function unlock() {
    removeMirrors(root);
    locked.forEach(t => { t.inert = false; });
    locked = [];
  }
  function stopWatching() {
    if (unsub) { unsub(); unsub = null; }
  }

  function renderDone() {
    bar.className = 'dk-bar dk-done';
    bar.innerHTML =
      '<div class="dk-title">🎉 제출이 완료되었습니다!</div>' +
      '<div class="dk-sub">쓴 내용은 아래에 그대로 남아 있어요. 필요하면 이미지로 저장해 두세요.</div>' +
      '<div class="dk-btns">' +
      '<button type="button" data-act="save">🖼️ 이미지로 저장</button>' +
      '<button type="button" data-act="home">처음으로</button>' +
      '</div>';
    bar.style.display = 'block';
  }
  function renderReleased(kind, reason) {
    bar.className = 'dk-bar dk-rej';
    bar.innerHTML = '';
    const t = document.createElement('div');
    t.className = 'dk-title';
    const s = document.createElement('div');
    s.className = 'dk-sub';
    if (kind === 'rejected') {
      t.textContent = '↩️ 선생님이 제출을 반려했어요.';
      s.textContent = (reason ? '사유: ' + reason + ' — ' : '') + '쓴 내용을 고쳐서 다시 제출해 주세요.';
    } else {
      t.textContent = '선생님이 이 제출을 삭제했어요.';
      s.textContent = '내용을 다시 확인하고 제출해 주세요.';
    }
    bar.appendChild(t);
    bar.appendChild(s);
    bar.style.display = 'block';
  }

  bar.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'home') { location.href = 'index.html'; return; }
    if (btn.dataset.act === 'save') {
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = '저장 중...';
      try {
        await saveImage(root, (getFileName ? getFileName() : '활동지') + '.png');
      } catch (err) {
        console.error(err);
        alert('이미지 저장에 실패했어요. 화면 캡처를 이용해 주세요.');
      }
      btn.disabled = false;
      btn.textContent = label;
    }
  });

  function release(kind, reason) {
    stopWatching();
    unlock();
    renderReleased(kind, reason);
    if (onReopen) onReopen();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return {
    // 제출이 끝난 기록의 key를 받아서 화면을 잠그고, 선생님의 반려/삭제를 지켜봅니다.
    show(key) {
      stopWatching();
      if (locked.length) unlock();
      lock();
      renderDone();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      try {
        unsub = onValue(ref(db, path + '/' + key), (snap) => {
          const v = snap.val();
          if (!v) release('deleted');
          else if (v.status === 'rejected') release('rejected', v.rejectReason);
        }, () => { /* 지켜보지 못해도 제출 내용에는 영향 없음 */ });
      } catch (e) { /* 같은 이유로 무시 */ }
    }
  };
}
