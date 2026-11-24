(function () {
  'use strict';

  console.log('[better-draft] content.js loaded on', window.location.pathname);

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
    // Neutralize any `gap` GitHub's button CSS applies between children —
    // the injected icon carries its own margin-inline-end, so icon-to-text
    // spacing is uniformly 8px on every enhanced button.
    gap: '0px',
  };

  // <summary> has a <details-dialog> child — inline-flex would pull it into
  // the layout and blow up the button size. Use inline-block instead.
  const BTN_STYLES_SUMMARY = { ...BTN_STYLES_BASE, display: 'inline-block' };
  const BTN_STYLES_BUTTON  = { ...BTN_STYLES_BASE, display: 'inline-flex', alignItems: 'center' };
  // New PR dashboard: trailing-rail action button (inside "Pull request
  // actions" list). Full-width block, icon left-aligned with a gap so it
  // lines up with the unstyled "Close pull request" button below it.
  const BTN_STYLES_RAIL    = { ...BTN_STYLES_BASE, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', width: '100%', margin: '0', padding: '6px 12px' };
  // New PR dashboard: button inside the "Merge status" modal dialog. Inline
  // block, slightly larger padding for the dialog context.
  const BTN_STYLES_DIALOG  = { ...BTN_STYLES_BASE, display: 'inline-flex', alignItems: 'center', padding: '6px 16px' };

  // Fallback draft icon (octicon git-pull-request-draft-16) for the merge
  // status dialog button, which has no SVG of its own. Used when the rail
  // button's icon can't be cloned (e.g. rail not yet rendered).
  const DRAFT_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 14a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM14 7.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0-4.25a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z"/></svg>';

  // ── Helpers ──────────────────────────────────────────────────────────────

  function isPullRequestPage() {
    return /^\/[^/]+\/[^/]+\/pull\/\d+(\/|$)/.test(window.location.pathname);
  }

  function isDraftBtnText(el) {
    return el.textContent.trim().toLowerCase() === 'convert to draft';
  }

  // New dashboard: is this button inside the "Merge status" panel/dialog?
  // Match any dialog whose accessible name (aria-label / aria-labelledby) or
  // content mentions "merge status" — GitHub's Primer React panel may use
  // either attribute, and sometimes omits aria-modal.
  function isInMergeStatusDialog(el) {
    const dialog = el.closest('[role="dialog"]');
    if (!dialog) return false;
    const label = (dialog.getAttribute('aria-label') || '') + ' ' +
      (dialog.getAttribute('aria-labelledby') || '');
    if (label.toLowerCase().includes('merge status')) return true;
    // aria-labelledby points at an id — resolve it.
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
    const list = el.closest('ul[aria-label="Pull request actions"]');
    return !!list;
  }

  // Sidebar (old UI): <summary> inside #partial-discussion-sidebar
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
      // Anchor text not found — this isn't the old merge box (the new
      // dashboard buttons have no "Still in progress?" label). Don't style
      // it as merge-btn.
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

  // New dashboard: button inside the "Merge status" panel/dialog. Match by
  // dialog role (any aria naming) or by GitHub's Primer action attribute.
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
    // Exclude the old merge-box button ("Still in progress?" anchor) — it is
    // styled by findMergeBoxDraftBtn; it still gets the icon via that path.
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

  // Insert the draft icon into a button that has no SVG, cloning the rail
  // button's icon when available and falling back to the bundled octicon.
  // Idempotent: no-op if the button already contains an <svg>.
  function ensureIcon(btn) {
    if (btn.querySelector('svg')) return;
    const railFound = findRailDraftBtn();
    const srcSvg = railFound ? railFound.btn.querySelector('svg') : null;
    let icon;
    if (srcSvg) {
      icon = srcSvg.cloneNode(true);
      icon.removeAttribute('uid');
      icon.setAttribute('fill', 'currentColor');
    } else {
      // DOMParser instead of innerHTML — addons-linter flags innerHTML with
      // dynamic values.
      const doc = new DOMParser().parseFromString(DRAFT_ICON_SVG, 'image/svg+xml');
      icon = document.importNode(doc.documentElement, true);
    }
    icon.setAttribute('aria-hidden', 'true');
    // Icon-to-text spacing via margin (not flex gap) so it also works in
    // inline-block contexts like <summary>, where `gap` has no effect.
    // Fine-tune the inline SVG's vertical position with a pixel offset:
    // baseline (default) is too high, `middle` overshoots low. -3px centers
    // a 16px icon against the button's 20px line-height.
    icon.style.marginInlineEnd = '8px';
    icon.style.marginInlineStart = '0px';
    icon.style.verticalAlign = '-3px';
    btn.insertBefore(icon, btn.firstChild);
  }

  function rememberStyle(el) {
    if (!originalStyles.has(el)) {
      originalStyles.set(el, el.getAttribute('style') || '');
    }
  }

  // Cached computed padding-left of the rail's "Close pull request" button,
  // keyed by the rail list, so we don't force style recalc on every pass.
  // Cleared on resize.
  const railPaddingCache = new WeakMap();

  function setStyleIfChanged(el, prop, value) {
    if (el.style[prop] !== value) el.style[prop] = value;
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
      [data-better-draft-enhanced="rail-btn"]:hover *,
      [data-better-draft-enhanced="rail-btn"]:focus,
      [data-better-draft-enhanced="rail-btn"]:focus * {
        color: #ffffff !important;
        text-decoration: none !important;
      }
      [data-better-draft-enhanced="rail-btn"]:hover {
        background-color: #0757ba !important;
      }
      [data-better-draft-enhanced="dialog-btn"],
      [data-better-draft-enhanced="dialog-btn"] *,
      [data-better-draft-enhanced="dialog-btn"]:hover,
      [data-better-draft-enhanced="dialog-btn"]:hover *,
      [data-better-draft-enhanced="dialog-btn"]:focus,
      [data-better-draft-enhanced="dialog-btn"]:focus * {
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

  // Set once the old merge-box button has been found and marked, so steady
  // state passes skip the full-document button scan. Reset in revert().
  let mergeBoxHandled = false;

  function revert() {
    mergeBoxHandled = false;
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

    // 1. Sidebar button + its container (old UI)
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
      // Old sidebar button has no icon either — give it the draft icon.
      ensureIcon(btn);
    }

    // 2. Merge-box button (old UI) — style in place and align right edge with merge box
    const mergeFound = mergeBoxHandled ? null : findMergeBoxDraftBtn();
    if (mergeFound) {
      const { btn: mergeBtn, container: mergeRow } = mergeFound;
      mergeBoxHandled = true;
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
      // Keep the draft icon here too (previously picked up accidentally).
      ensureIcon(mergeBtn);
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

      // Align the icon with the unstyled "Close pull request" button below:
      // copy its computed left padding so both icons start at the same x.
      // Cached per rail list and only recomputed when the viewport width
      // changes, so steady-state passes don't force style recalc.
      let cache = railPaddingCache.get(railList);
      if (!cache || cache.w !== window.innerWidth) {
        const closeBtn = Array.from(railList.querySelectorAll('button'))
          .find(b => b !== railBtn && b.textContent.trim().toLowerCase().includes('close pull request'));
        cache = { w: window.innerWidth, pad: closeBtn ? getComputedStyle(closeBtn).paddingLeft : null };
        railPaddingCache.set(railList, cache);
      }
      if (cache.pad) setStyleIfChanged(railBtn, 'paddingLeft', cache.pad);
    }

    // 4. New dashboard: button inside the "Merge status" modal dialog
    const dialogFound = findMergeStatusDialogBtn();
    if (dialogFound) {
      const { btn: dialogBtn } = dialogFound;
      if (!dialogBtn.getAttribute(ATTR)) {
        rememberStyle(dialogBtn);
        dialogBtn.setAttribute(ATTR, 'dialog-btn');
        Object.assign(dialogBtn.style, BTN_STYLES_DIALOG);
      }

      // The dialog button has no icon — clone the draft SVG from the rail
      // button if present, otherwise fall back to the bundled octicon.
      // ensureIcon() is idempotent and runs on every pass because the rail
      // button may not exist yet when the dialog first opens.
      ensureIcon(dialogBtn);
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
      // Ignore text-only / attribute-free churn (GitHub updates lots of
      // text nodes on timers) — only element insertions/removals can reveal
      // a new draft button.
      const hasElement = Array.from(m.addedNodes).some(n => n.nodeType === 1) ||
        Array.from(m.removedNodes).some(n => n.nodeType === 1);
      if (hasElement) {
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

  let lastPath = window.location.pathname + window.location.search;
  setInterval(() => {
    const current = window.location.pathname + window.location.search;
    if (current !== lastPath) {
      lastPath = current;
      revert();
      scheduleEnhance();
    }
  }, 1000);

}());
