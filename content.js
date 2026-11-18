(function () {
  'use strict';

  const ATTR = 'data-better-draft-enhanced';
  // Snapshot of each element's inline style before we touch it, so revert()
  // can restore GitHub's own styling instead of wiping it.
  const originalStyles = new WeakMap();
  let enhanceTimeout = null;
  // Original margin-right of each enhanced merge row, so repeat alignments can
  // reset before measuring instead of compounding.
  const originalMarginRight = new WeakMap();
  let alignResizeTimeout = null;
  // Text nodes we emptied to remove the label, with their original data, so
  // revert() can put the text back: [textNode, originalData][]
  const emptiedTextNodes = [];

  const BTN_STYLES_BASE = {
    backgroundColor: '#0969da',
    color: '#ffffff',
    border: 'none',
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

  // <summary> has a <details-dialog> child — inline-flex would pull it into
  // the layout and blow up the button size. Use inline-block instead.
  const BTN_STYLES_SUMMARY = { ...BTN_STYLES_BASE, display: 'inline-block' };
  const BTN_STYLES_BUTTON  = { ...BTN_STYLES_BASE, display: 'inline-flex', alignItems: 'center' };
  // New PR dashboard: trailing-rail action button (inside "Pull request
  // actions" list). Full-width block, icon left-aligned.
  const BTN_STYLES_RAIL    = { ...BTN_STYLES_BASE, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', width: '100%', padding: '6px 12px' };
  // New PR dashboard: button inside the "Merge status" panel/dialog.
  const BTN_STYLES_DIALOG  = { ...BTN_STYLES_BASE, display: 'inline-flex', alignItems: 'center', padding: '6px 16px' };

  // ── Helpers ──────────────────────────────────────────────────────────────

  function isPullRequestPage() {
    return /^\/[^/]+\/[^/]+\/pull\/\d+(\/|$)/.test(window.location.pathname);
  }

  function isDraftBtnText(el) {
    return el.textContent.trim().toLowerCase() === 'convert to draft';
  }

  // New dashboard: is this button inside the "Merge status" panel/dialog?
  function isInMergeStatusDialog(el) {
    const dialog = el.closest('[role="dialog"]');
    if (!dialog) return false;
    const label = (dialog.getAttribute('aria-label') || '') + ' ' +
      (dialog.getAttribute('aria-labelledby') || '');
    if (label.toLowerCase().includes('merge status')) return true;
    const labelledby = dialog.getAttribute('aria-labelledby');
    if (labelledby) {
      const ref = document.getElementById(labelledby);
      if (ref && ref.textContent.toLowerCase().includes('merge status')) return true;
    }
    return dialog.textContent.toLowerCase().includes('merge status');
  }

  // New dashboard: is this button inside the trailing-rail "Pull request
  // actions" list?
  function isInRailActions(el) {
    return !!el.closest('ul[aria-label="Pull request actions"]');
  }

  // Sidebar: <summary> inside #partial-discussion-sidebar
  function findSidebarDraftLink() {
    const sidebar = document.getElementById('partial-discussion-sidebar');
    if (!sidebar) return null;

    for (const el of sidebar.querySelectorAll('summary')) {
      if (!isDraftBtnText(el)) continue;

      let container = el.parentElement;
      for (let i = 0; i < 5 && container && container !== document.body; i++) {
        if (container.textContent.toLowerCase().includes('still in progress')) {
          return { btn: el, container };
        }
        container = container.parentElement;
      }
      // Anchor text not found — don't guess at a container.
      return { btn: el, container: null };
    }
    return null;
  }

  // Merge-box (old UI): <button> with "Convert to draft" text, NOT in sidebar,
  // NOT in the new dashboard locations.
  function findMergeBoxDraftBtn() {
    const sidebar = document.getElementById('partial-discussion-sidebar');
    for (const el of document.querySelectorAll('button')) {
      if (!isDraftBtnText(el)) continue;
      if (sidebar && sidebar.contains(el)) continue;
      if (isInMergeStatusDialog(el)) continue;
      if (isInRailActions(el)) continue;
      // Walk up to find the row that holds "Still in progress?"
      let container = el.parentElement;
      for (let i = 0; i < 5 && container && container !== document.body; i++) {
        if (container.textContent.toLowerCase().includes('still in progress')) {
          return { btn: el, container };
        }
        container = container.parentElement;
      }
      // Anchor not found — this isn't the old merge box (new dashboard
      // buttons have no "Still in progress?" label). Don't style it here.
      return null;
    }
    return null;
  }

  // New dashboard: trailing-rail button inside "Pull request actions" list
  // (below the participants section in the right rail).
  function findRailDraftBtn() {
    const list = document.querySelector('ul[aria-label="Pull request actions"]');
    if (!list) return null;
    for (const el of list.querySelectorAll('button')) {
      if (isDraftBtnText(el)) {
        return { btn: el, container: list };
      }
    }
    return null;
  }

  // New dashboard: button inside the "Merge status" panel/dialog.
  function findMergeStatusDialogBtn() {
    for (const dialog of document.querySelectorAll('[role="dialog"]')) {
      const label = (dialog.getAttribute('aria-label') || '') + ' ' +
        (dialog.getAttribute('aria-labelledby') || '');
      const labelledby = dialog.getAttribute('aria-labelledby');
      const refText = labelledby && document.getElementById(labelledby)
        ? document.getElementById(labelledby).textContent : '';
      if (!(label + ' ' + refText).toLowerCase().includes('merge status') &&
          !dialog.textContent.toLowerCase().includes('merge status')) continue;
      for (const el of dialog.querySelectorAll('button')) {
        if (isDraftBtnText(el)) return { btn: el, container: dialog };
      }
    }
    // Fallback: Primer React action button outside a detectable dialog.
    for (const el of document.querySelectorAll('button[data-dd-action-name="pull_requests.lifecycle.open_convert_to_draft"]')) {
      if (isInRailActions(el)) continue;
      if (hasStillInProgressAncestor(el)) continue;
      if (isDraftBtnText(el)) return { btn: el, container: el.closest('[role="dialog"]') || el.parentElement };
    }
    return null;
  }

  // True if one of the button's ancestors (up to 5 levels) contains the
  // "Still in progress?" label — identifies the old merge-box button.
  function hasStillInProgressAncestor(el) {
    let node = el.parentElement;
    for (let i = 0; i < 5 && node && node !== document.body; i++) {
      if (node.textContent.toLowerCase().includes('still in progress')) return true;
      node = node.parentElement;
    }
    return false;
  }

  function rememberStyle(el) {
    if (!originalStyles.has(el)) {
      originalStyles.set(el, el.getAttribute('style') || '');
    }
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
        background-color: #0757ba !important;
      }
      [data-better-draft-enhanced="merge-btn"],
      [data-better-draft-enhanced="merge-btn"] *,
      [data-better-draft-enhanced="merge-btn"]:hover,
      [data-better-draft-enhanced="merge-btn"]:hover * {
        color: #ffffff !important;
        text-decoration: none !important;
      }
      [data-better-draft-enhanced="merge-btn"]:hover {
        background-color: #0757ba !important;
      }
      [data-better-draft-enhanced="rail-btn"],
      [data-better-draft-enhanced="rail-btn"] *,
      [data-better-draft-enhanced="rail-btn"]:hover,
      [data-better-draft-enhanced="rail-btn"]:hover * {
        color: #ffffff !important;
        text-decoration: none !important;
      }
      [data-better-draft-enhanced="rail-btn"]:hover {
        background-color: #0757ba !important;
      }
      [data-better-draft-enhanced="dialog-btn"],
      [data-better-draft-enhanced="dialog-btn"] *,
      [data-better-draft-enhanced="dialog-btn"]:hover,
      [data-better-draft-enhanced="dialog-btn"]:hover * {
        color: #ffffff !important;
        text-decoration: none !important;
      }
      [data-better-draft-enhanced="dialog-btn"]:hover {
        background-color: #0757ba !important;
      }
    `;
    document.head.appendChild(style);
  }

  // Remove the "Still in progress?" label inside a container, keeping the
  // button. The label's element is hidden with display:none (tracked via ATTR
  // so revert() restores it); a bare text node is emptied and restored in
  // revert(). Hiding rather than removing keeps the label's text present in
  // textContent, which the finders use as their anchor on later passes.
  function removeStillInProgressLabel(container, btn) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const matches = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.data.toLowerCase().includes('still in progress')) matches.push(node);
    }
    for (const textNode of matches) {
      const el = textNode.parentElement;
      if (el && el !== container && !el.contains(btn)) {
        if (!el.getAttribute(ATTR)) {
          rememberStyle(el);
          el.setAttribute(ATTR, 'label');
        }
        el.style.display = 'none';
      } else if (!emptiedTextNodes.some(([t]) => t === textNode)) {
        emptiedTextNodes.push([textNode, textNode.data]);
        textNode.data = '';
      }
    }
  }

  function revert() {
    for (const [textNode, data] of emptiedTextNodes) {
      textNode.data = data;
    }
    emptiedTextNodes.length = 0;
    for (const el of document.querySelectorAll('[' + ATTR + ']')) {
      const original = originalStyles.get(el);
      if (original === undefined) {
        el.removeAttribute('style');
      } else if (original === '') {
        el.removeAttribute('style');
      } else {
        el.setAttribute('style', original);
      }
      el.removeAttribute(ATTR);
    }
  }

  // Shift the row so its trailing edge matches the merge box's trailing edge.
  // margin-right moves a block row's border-box edge in BOTH directions
  // (padding-right would not), so this works whether the row sits short of
  // the box or sticks out past it.
  function alignMergeRow(row) {
    // A navigation/revert may have happened before this ran.
    if (row.getAttribute(ATTR) !== 'merge-row') return;

    // Walk up from the row to find a wide preceding sibling — the merge box.
    let node = row;
    let mergeBox = null;
    while (node && node !== document.body && !mergeBox) {
      const prev = node.previousElementSibling;
      if (prev && prev.getBoundingClientRect().width > 100) mergeBox = prev;
      node = node.parentElement;
    }
    if (!mergeBox) return;

    if (!originalMarginRight.has(row)) {
      originalMarginRight.set(row, getComputedStyle(row).marginRight);
    }
    const base = originalMarginRight.get(row);
    row.style.marginRight = base; // reset before measuring
    const diff = row.getBoundingClientRect().right - mergeBox.getBoundingClientRect().right;
    if (diff) {
      row.style.marginRight = (parseFloat(base) || 0) + diff + 'px';
    }
  }

  function alignAllMergeRows() {
    for (const row of document.querySelectorAll('[' + ATTR + '="merge-row"]')) {
      alignMergeRow(row);
    }
  }

  // ── Enhancement ───────────────────────────────────────────────────────────

  function enhance() {
    if (!isPullRequestPage()) {
      revert();
      return;
    }

    injectStyles();

    // 1. Sidebar button + its container
    const found = findSidebarDraftLink();
    if (found) {
      const { btn, container } = found;

      if (!btn.getAttribute(ATTR)) {
        rememberStyle(btn);
        btn.setAttribute(ATTR, 'btn');
        Object.assign(btn.style, BTN_STYLES_SUMMARY);

        if (container) {
          rememberStyle(container);
          container.setAttribute(ATTR, 'container');
          Object.assign(container.style, {
            border: 'none',
            padding: '0',
            marginTop: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '8px',
          });
          removeStillInProgressLabel(container, btn);
        }
      }
    }

    // 2. Merge-box button — style in place and align right edge with merge box
    const mergeFound = findMergeBoxDraftBtn();
    if (mergeFound) {
      const { btn: mergeBtn, container: mergeRow } = mergeFound;
      if (!mergeBtn.getAttribute(ATTR)) {
        rememberStyle(mergeBtn);
        mergeBtn.setAttribute(ATTR, 'merge-btn');
        Object.assign(mergeBtn.style, BTN_STYLES_BUTTON);

        if (!mergeRow) return;

        rememberStyle(mergeRow);
        mergeRow.setAttribute(ATTR, 'merge-row');
        removeStillInProgressLabel(mergeRow, mergeBtn);
        // Two frames so fonts/images have settled before measuring.
        requestAnimationFrame(() => requestAnimationFrame(() => alignMergeRow(mergeRow)));
      }
    }

    // 3. New dashboard: trailing-rail button in "Pull request actions" list
    const railFound = findRailDraftBtn();
    if (railFound) {
      const { btn: railBtn, container: railList } = railFound;
      if (!railBtn.getAttribute(ATTR)) {
        rememberStyle(railBtn);
        railBtn.setAttribute(ATTR, 'rail-btn');
        Object.assign(railBtn.style, BTN_STYLES_RAIL);

        // Make the <li> wrapper clean so the full-width button sits flush.
        const li = railBtn.closest('li');
        if (li && railList && railList.contains(li)) {
          rememberStyle(li);
          li.setAttribute(ATTR, 'rail-li');
          Object.assign(li.style, { listStyle: 'none', padding: '0', margin: '0 0 4px 0' });
        }
      }
    }

    // 4. New dashboard: button inside the "Merge status" panel/dialog
    const dialogFound = findMergeStatusDialogBtn();
    if (dialogFound) {
      const { btn: dialogBtn } = dialogFound;
      if (!dialogBtn.getAttribute(ATTR)) {
        rememberStyle(dialogBtn);
        dialogBtn.setAttribute(ATTR, 'dialog-btn');
        Object.assign(dialogBtn.style, BTN_STYLES_DIALOG);
      }
    }
  }

  function scheduleEnhance() {
    clearTimeout(enhanceTimeout);
    enhanceTimeout = setTimeout(enhance, 300);
  }

  // ── Observers & event listeners ───────────────────────────────────────────

  scheduleEnhance();

  window.addEventListener('resize', () => {
    clearTimeout(alignResizeTimeout);
    alignResizeTimeout = setTimeout(alignAllMergeRows, 150);
  });

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
