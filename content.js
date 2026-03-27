(function () {
  'use strict';

  const ATTR = 'data-better-draft-enhanced';
  let enhanceTimeout = null;

  // ── Helpers ──────────────────────────────────────────────────────────────

  function isPullRequestPage() {
    return /^\/[^/]+\/[^/]+\/pull\/\d+(\/|$)/.test(window.location.pathname);
  }

  function findConvertToDraftButton() {
    const byClass = document.querySelector('.js-convert-draft-button');
    if (byClass) return byClass;

    for (const el of document.querySelectorAll('button, a, input[type="submit"]')) {
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

    const btn = findConvertToDraftButton();
    if (!btn) {
      revert();
      return;
    }

    // Already enhanced
    if (btn.getAttribute(ATTR)) return;
    btn.setAttribute(ATTR, 'btn');

    // Style the "Convert to draft" element to look like a proper button
    Object.assign(btn.style, {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
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
    });

    btn.addEventListener('mouseenter', () => {
      btn.style.backgroundColor = '#7d5300';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.backgroundColor = '#9a6700';
    });

    // Walk up to find the container that holds "Still in progress?" text
    // and highlight the whole block
    let container = btn.parentElement;
    while (container && container !== document.body) {
      if ((container.textContent || '').toLowerCase().includes('still in progress')) {
        break;
      }
      // Stop at common block elements that are unlikely to be the right wrapper
      if (['FORM', 'SECTION', 'ARTICLE', 'MAIN', 'ASIDE'].includes(container.tagName)) {
        container = null;
        break;
      }
      container = container.parentElement;
    }

    if (container && container !== document.body) {
      container.setAttribute(ATTR, 'container');
      Object.assign(container.style, {
        backgroundColor: '#fff8c5',
        border: '1px solid rgba(212,167,44,0.5)',
        borderRadius: '6px',
        padding: '8px 12px',
        marginTop: '8px',
        lineHeight: '28px',
      });
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
