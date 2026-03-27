(function () {
  'use strict';

  const ATTR = 'data-better-draft-enhanced';
  let enhanceTimeout = null;

  // ── Helpers ──────────────────────────────────────────────────────────────

  function isPullRequestPage() {
    return /^\/[^/]+\/[^/]+\/pull\/\d+(\/|$)/.test(window.location.pathname);
  }

  /**
   * Find the "Convert to draft" link/button that sits next to the
   * "Still in progress?" label in the PR sidebar.
   * We anchor on the "Still in progress?" text node to avoid matching any
   * other "Convert to draft" elements GitHub may render elsewhere (e.g. the
   * sticky header).
   */
  function findSidebarDraftLink() {
    // Collect every "Still in progress? … Convert to draft" occurrence on the page.
    const candidates = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent.toLowerCase().includes('still in progress')) continue;

      const tightContainer = node.parentElement;
      if (!tightContainer) continue;

      // Search up a few levels for the link, always keeping tightContainer for styling.
      let search = tightContainer;
      for (let i = 0; i < 3 && search && search !== document.body; i++) {
        const link = search.querySelector('a, button');
        if (link && link.textContent.trim().toLowerCase() === 'convert to draft') {
          candidates.push({ btn: link, container: tightContainer });
          break;
        }
        search = search.parentElement;
      }
    }

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // When there are multiple (sidebar + merge/checks area), the sidebar is the
    // right-hand column — its left edge is past the horizontal midpoint of the page.
    const mid = window.innerWidth / 2;
    const sidebar = candidates.find(({ container }) => {
      const rect = container.getBoundingClientRect();
      return rect.width > 0 && rect.left > mid;
    });

    return sidebar || candidates[0];
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

    const found = findSidebarDraftLink();
    if (!found) {
      revert();
      return;
    }

    const { btn, container } = found;

    // Already enhanced
    if (btn.getAttribute(ATTR)) return;
    btn.setAttribute(ATTR, 'btn');

    // Make the link look like a real button
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

    btn.addEventListener('mouseenter', () => { btn.style.backgroundColor = '#7d5300'; });
    btn.addEventListener('mouseleave', () => { btn.style.backgroundColor = '#9a6700'; });

    // Highlight the "Still in progress? [Convert to draft]" container
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
