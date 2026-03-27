(function () {
  'use strict';

  const ATTR = 'data-better-draft-enhanced';
  let enhanceTimeout = null;

  const BTN_STYLES = {
    display: 'inline-flex',
    alignItems: 'center',
    backgroundColor: '#9a6700',
    color: '#ffffff',
    border: '1px solid rgba(0,0,0,0.15)',
    borderRadius: '6px',
    padding: '4px 12px',
    fontSize: '13px',
    fontWeight: '500',
    lineHeight: '20px',
    cursor: 'pointer',
    textDecoration: 'none',
    verticalAlign: 'middle',
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif',
    boxShadow: '0 1px 0 rgba(0,0,0,0.1)',
  };

  // ── Helpers ──────────────────────────────────────────────────────────────

  function isPullRequestPage() {
    return /^\/[^/]+\/[^/]+\/pull\/\d+(\/|$)/.test(window.location.pathname);
  }

  // Sidebar: <summary> inside #partial-discussion-sidebar
  function findSidebarDraftLink() {
    const sidebar = document.getElementById('partial-discussion-sidebar');
    const scope = sidebar || document;

    for (const el of scope.querySelectorAll('summary')) {
      if (el.textContent.trim().toLowerCase() !== 'convert to draft') continue;

      let container = el.parentElement;
      for (let i = 0; i < 5 && container && container !== document.body; i++) {
        if (container.textContent.toLowerCase().includes('still in progress')) {
          return { btn: el, container };
        }
        container = container.parentElement;
      }
      return { btn: el, container: el.parentElement };
    }
    return null;
  }

  // Merge-box: <button> with "Convert to draft" text, NOT in sidebar
  function findMergeBoxDraftBtn() {
    const sidebar = document.getElementById('partial-discussion-sidebar');
    for (const el of document.querySelectorAll('button')) {
      if (el.textContent.trim().toLowerCase() !== 'convert to draft') continue;
      if (sidebar && sidebar.contains(el)) continue;
      // Walk up to find the row that holds "Still in progress?"
      let container = el.parentElement;
      for (let i = 0; i < 5 && container && container !== document.body; i++) {
        if (container.textContent.toLowerCase().includes('still in progress')) {
          return { btn: el, container };
        }
        container = container.parentElement;
      }
      return { btn: el, container: el.parentElement };
    }
    return null;
  }

  function injectStyles() {
    if (document.getElementById('better-draft-style')) return;
    const style = document.createElement('style');
    style.id = 'better-draft-style';
    style.textContent = `
      [data-better-draft-enhanced="btn"],
      [data-better-draft-enhanced="btn"] *,
      [data-better-draft-enhanced="btn"]:hover,
      [data-better-draft-enhanced="btn"]:hover *,
      [data-better-draft-enhanced="btn"]:focus,
      [data-better-draft-enhanced="btn"]:focus * {
        color: #ffffff !important;
        text-decoration: none !important;
      }
      [data-better-draft-enhanced="btn"]:hover {
        background-color: #7d5300 !important;
      }
      [data-better-draft-enhanced="merge-btn"],
      [data-better-draft-enhanced="merge-btn"] *,
      [data-better-draft-enhanced="merge-btn"]:hover,
      [data-better-draft-enhanced="merge-btn"]:hover * {
        color: #ffffff !important;
        text-decoration: none !important;
      }
      [data-better-draft-enhanced="merge-btn"]:hover {
        background-color: #7d5300 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function revert() {
    for (const el of document.querySelectorAll('[' + ATTR + ']')) {
      el.removeAttribute(ATTR);
      el.removeAttribute('style');
    }
  }

  // ── Enhancement ───────────────────────────────────────────────────────────

  function enhance() {
    if (!isPullRequestPage()) {
      revert();
      return;
    }

    injectStyles();

    // 1. Sidebar button + yellow container
    const found = findSidebarDraftLink();
    if (found) {
      const { btn, container } = found;

      if (!btn.getAttribute(ATTR)) {
        btn.setAttribute(ATTR, 'btn');
        Object.assign(btn.style, BTN_STYLES);

        container.setAttribute(ATTR, 'container');
        Object.assign(container.style, {
          backgroundColor: '#fff8c5',
          border: '1px solid rgba(212,167,44,0.5)',
          borderRadius: '6px',
          padding: '6px 10px',
          marginTop: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        });
      }
    }

    // 2. Merge-box button — style in place and align right edge with merge box
    const mergeFound = findMergeBoxDraftBtn();
    if (mergeFound) {
      const { btn: mergeBtn, container: mergeRow } = mergeFound;
      if (!mergeBtn.getAttribute(ATTR)) {
        mergeBtn.setAttribute(ATTR, 'merge-btn');
        Object.assign(mergeBtn.style, BTN_STYLES);

        // Find the bordered merge box (previous sibling of the row or an ancestor's
        // previous sibling) and add paddingRight so our row's right edge matches it.
        mergeRow.setAttribute(ATTR, 'merge-row');
        requestAnimationFrame(() => {
          // Walk up from the row to find a sibling that looks like the merge box
          let node = mergeRow;
          let mergeBox = null;
          while (node && node !== document.body && !mergeBox) {
            const prev = node.previousElementSibling;
            if (prev && prev.getBoundingClientRect().width > 100) {
              mergeBox = prev;
            }
            node = node.parentElement;
          }
          if (mergeBox) {
            const boxRight = mergeBox.getBoundingClientRect().right;
            const rowRight = mergeRow.getBoundingClientRect().right;
            const diff = rowRight - boxRight;
            if (diff > 0) {
              mergeRow.style.paddingRight = diff + 'px';
            }
          }
        });
      }
    }
  }

  function scheduleEnhance() {
    clearTimeout(enhanceTimeout);
    enhanceTimeout = setTimeout(enhance, 300);
  }

  // ── Observers & event listeners ───────────────────────────────────────────

  scheduleEnhance();

  const domObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.addedNodes.length || m.removedNodes.length) {
        scheduleEnhance();
        return;
      }
    }
  });
  domObserver.observe(document.body, { childList: true, subtree: true });

  for (const evt of ['turbo:load', 'turbo:render', 'pjax:end']) {
    document.addEventListener(evt, () => {
      revert();
      scheduleEnhance();
    });
  }

  let lastPath = window.location.pathname;
  setInterval(() => {
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname;
      revert();
      scheduleEnhance();
    }
  }, 1000);

}());
