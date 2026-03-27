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
    // GitHub renders "Still in progress? Convert to draft" in both the sidebar
    // and the merge/checks area. We want the sidebar one.
    // Prefer searching inside known sidebar containers first.
    const sidebarRoots = [
      ...document.querySelectorAll(
        '.Layout-sidebar, .discussion-sidebar, .js-discussion-sidebar, ' +
        '[data-target="issue-sidebar"], aside'
      ),
    ];
    // Fall back to the whole document if no sidebar container found
    const searchRoots = sidebarRoots.length ? sidebarRoots : [document.body];

    for (const root of searchRoots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      let node;
      while ((node = walker.nextNode())) {
        if (!node.textContent.toLowerCase().includes('still in progress')) continue;

        const tightContainer = node.parentElement;
        if (!tightContainer) continue;

        // Search up a few levels for the link, but always highlight tightContainer
        let search = tightContainer;
        for (let i = 0; i < 3 && search && search !== document.body; i++) {
          const link = search.querySelector('a, button');
          if (link && link.textContent.trim().toLowerCase() === 'convert to draft') {
            return { btn: link, container: tightContainer };
          }
          search = search.parentElement;
        }
      }
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
