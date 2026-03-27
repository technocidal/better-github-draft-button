(function () {
  'use strict';

  const BTN_ID = 'better-github-draft-btn';
  let injectTimeout = null;

  // ── Helpers ──────────────────────────────────────────────────────────────

  function isPullRequestPage() {
    return /^\/[^/]+\/[^/]+\/pull\/\d+(\/|$)/.test(window.location.pathname);
  }

  /**
   * Find the original "Convert to draft" button buried in the PR merge box.
   */
  function findConvertToDraftButton() {
    const byClass = document.querySelector('.js-convert-draft-button');
    if (byClass) return byClass;

    const clickables = document.querySelectorAll('button, input[type="submit"]');
    for (const el of clickables) {
      const text = (el.value || el.textContent || '').trim().toLowerCase();
      if (text === 'convert to draft') return el;
    }

    const convertForm = document.querySelector(
      'form[action*="convert_to_draft"], form[action*="convert-to-draft"]'
    );
    if (convertForm) {
      const btn = convertForm.querySelector(
        'button[type="submit"], input[type="submit"], button:not([type])'
      );
      if (btn) return btn;
    }

    return null;
  }

  function removeButton() {
    const el = document.getElementById(BTN_ID);
    if (el) el.remove();
  }

  // ── Button creation ───────────────────────────────────────────────────────

  // GitHub Octicons pencil path
  const ICON_PENCIL =
    'M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 ' +
    '8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286' +
    '.235-.547.445-.758l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44' +
    ' 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086ZM11.189 6.25 9.75 4.81 3.23 ' +
    '11.33c-.03.03-.052.067-.063.107l-.652 2.283 2.284-.651a.237.237 0 0 0 ' +
    '.107-.063L11.19 6.25Z';

  function buildSvg(pathD) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.style.cssText = 'flex-shrink:0;fill:currentColor;vertical-align:text-bottom;';
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', pathD);
    svg.appendChild(path);
    return svg;
  }

  function createDraftButton() {
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Convert to draft');

    // Match the style of GitHub's header action buttons ("Code", "Edit", etc.)
    btn.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'gap:6px',
      'appearance:none',
      '-webkit-appearance:none',
      'background-color:var(--button-default-bgColor-rest,#f6f8fa)',
      'border:1px solid var(--button-default-borderColor-rest,rgba(27,31,36,0.15))',
      'border-radius:6px',
      'box-shadow:var(--button-default-shadow-resting,0 1px 0 rgba(27,31,36,0.04))',
      'color:var(--button-default-fgColor-rest,#24292f)',
      'cursor:pointer',
      'font-size:14px',
      'font-weight:500',
      'line-height:20px',
      'padding:5px 16px',
      'font-family:inherit',
      'white-space:nowrap',
      'flex-shrink:0',
      'text-decoration:none',
    ].join(';');

    btn.appendChild(buildSvg(ICON_PENCIL));
    btn.appendChild(document.createTextNode('Convert to draft'));

    btn.addEventListener('mouseenter', () => {
      btn.style.backgroundColor = 'var(--button-default-bgColor-hover,#f3f4f6)';
      btn.style.borderColor = 'var(--button-default-borderColor-hover,rgba(27,31,36,0.3))';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.backgroundColor = 'var(--button-default-bgColor-rest,#f6f8fa)';
      btn.style.borderColor = 'var(--button-default-borderColor-rest,rgba(27,31,36,0.15))';
    });
    btn.addEventListener('click', () => {
      const orig = findConvertToDraftButton();
      if (!orig) return;
      let node = orig.parentElement;
      while (node) {
        if (node.tagName === 'DETAILS') node.open = true;
        node = node.parentElement;
      }
      orig.click();
    });

    return btn;
  }

  // ── Injection logic ───────────────────────────────────────────────────────

  /**
   * Find the element that acts as the anchor for the "Code" dropdown button.
   * The "Code" button is a <details> or <summary> in the PR header actions row.
   * We insert our button just before that element (or its closest group wrapper).
   */
  function findCodeButtonAnchor() {
    // The "Code" button is a <details> element whose <summary> contains "Code"
    const details = document.querySelectorAll('details');
    for (const d of details) {
      const summary = d.querySelector('summary');
      if (summary && summary.textContent.trim().toLowerCase().startsWith('code')) {
        return d;
      }
    }

    // Fallback: find a <summary> or <button> with text "Code"
    for (const el of document.querySelectorAll('summary, button, a')) {
      if (el.textContent.trim().toLowerCase() === 'code') {
        // Return the closest wrapping group or the element itself
        return el.closest('details') || el;
      }
    }

    return null;
  }

  function injectButton() {
    if (!isPullRequestPage()) {
      removeButton();
      return;
    }

    const originalBtn = findConvertToDraftButton();
    if (!originalBtn) {
      removeButton();
      return;
    }

    if (document.getElementById(BTN_ID)) return;

    const draftBtn = createDraftButton();

    // 1. Insert right before the "Code" button in the same row
    const codeAnchor = findCodeButtonAnchor();
    if (codeAnchor) {
      codeAnchor.parentNode.insertBefore(draftBtn, codeAnchor);
      return;
    }

    // 2. Append into .gh-header-actions (the right-side action buttons in the PR header)
    const headerActions = document.querySelector('.gh-header-actions');
    if (headerActions) {
      headerActions.appendChild(draftBtn);
      return;
    }

    // 3. Prepend into .gh-header (whole PR header block)
    const ghHeader = document.querySelector('.gh-header');
    if (ghHeader) {
      ghHeader.insertBefore(draftBtn, ghHeader.firstChild);
      return;
    }
  }

  function scheduleInject() {
    clearTimeout(injectTimeout);
    injectTimeout = setTimeout(injectButton, 300);
  }

  // ── Observers & event listeners ───────────────────────────────────────────

  scheduleInject();

  const domObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.addedNodes.length || m.removedNodes.length) {
        scheduleInject();
        return;
      }
    }
  });
  domObserver.observe(document.body, { childList: true, subtree: true });

  for (const evt of ['turbo:load', 'turbo:render', 'pjax:end']) {
    document.addEventListener(evt, () => {
      removeButton();
      scheduleInject();
    });
  }

  let lastPath = window.location.pathname;
  setInterval(() => {
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname;
      removeButton();
      scheduleInject();
    }
  }, 1000);

}());
