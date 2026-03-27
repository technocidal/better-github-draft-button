(function () {
  'use strict';

  const BANNER_ID = 'better-github-draft-banner';
  let injectTimeout = null;

  // ── Helpers ──────────────────────────────────────────────────────────────

  function isPullRequestPage() {
    return /^\/[^/]+\/[^/]+\/pull\/\d+(\/|$)/.test(window.location.pathname);
  }

  /**
   * Find the original "Convert to draft" button buried in the PR merge box.
   * Tries a specific class first, then falls back to text content matching.
   */
  function findConvertToDraftButton() {
    // GitHub has used this class historically
    const byClass = document.querySelector('.js-convert-draft-button');
    if (byClass) return byClass;

    // Search all buttons and submit inputs by text
    const clickables = document.querySelectorAll('button, input[type="submit"]');
    for (const el of clickables) {
      const text = (el.value || el.textContent || '').trim().toLowerCase();
      if (text === 'convert to draft') {
        return el;
      }
    }

    // Search inside any form whose action contains "convert"
    const convertForm = document.querySelector('form[action*="convert_to_draft"], form[action*="convert-to-draft"]');
    if (convertForm) {
      const btn = convertForm.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
      if (btn) return btn;
    }

    return null;
  }

  function removeBanner() {
    const el = document.getElementById(BANNER_ID);
    if (el) el.remove();
  }

  // ── Banner creation ───────────────────────────────────────────────────────

  function buildSvg(pathD) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.style.cssText = 'flex-shrink:0;fill:currentColor;';
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', pathD);
    svg.appendChild(path);
    return svg;
  }

  // GitHub Octicons paths
  const ICON_PENCIL =
    'M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 ' +
    '8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286' +
    '.235-.547.445-.758l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44' +
    ' 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086ZM11.189 6.25 9.75 4.81 3.23 ' +
    '11.33c-.03.03-.052.067-.063.107l-.652 2.283 2.284-.651a.237.237 0 0 0 ' +
    '.107-.063L11.19 6.25Z';
  const ICON_X =
    'M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 ' +
    '0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215' +
    'L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 ' +
    '3.72 4.78a.75.75 0 0 1 0-1.06Z';

  function createBanner() {
    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.setAttribute('role', 'complementary');
    banner.setAttribute('aria-label', 'Convert to draft shortcut');

    // Matches GitHub's flash-warn colour scheme
    banner.style.cssText = [
      'box-sizing:border-box',
      'width:100%',
      'background-color:#fff8c5',
      'border-bottom:1px solid rgba(212,167,44,0.4)',
      'padding:8px 16px',
      'display:flex',
      'align-items:center',
      'gap:10px',
      'font-size:14px',
      'line-height:1.5',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif',
      'color:#57370d',
      'z-index:1',
    ].join(';');

    // Icon
    const icon = buildSvg(ICON_PENCIL);
    icon.style.color = '#9a6700';

    // Message text
    const msg = document.createElement('span');
    msg.textContent = 'Still in progress?';
    msg.style.cssText = 'flex-grow:1;';

    // Proxy "Convert to draft" button
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.textContent = 'Convert to draft';
    actionBtn.style.cssText = [
      'appearance:none',
      '-webkit-appearance:none',
      'background-color:#f6f8fa',
      'border:1px solid rgba(27,31,36,0.15)',
      'border-radius:6px',
      'box-shadow:0 1px 0 rgba(27,31,36,0.04),inset 0 1px 0 rgba(255,255,255,0.25)',
      'color:#24292f',
      'cursor:pointer',
      'display:inline-flex',
      'align-items:center',
      'font-size:14px',
      'font-weight:500',
      'line-height:20px',
      'padding:5px 16px',
      'font-family:inherit',
      'white-space:nowrap',
      'flex-shrink:0',
    ].join(';');

    actionBtn.addEventListener('mouseenter', () => {
      actionBtn.style.backgroundColor = '#f3f4f6';
      actionBtn.style.borderColor = 'rgba(27,31,36,0.3)';
    });
    actionBtn.addEventListener('mouseleave', () => {
      actionBtn.style.backgroundColor = '#f6f8fa';
      actionBtn.style.borderColor = 'rgba(27,31,36,0.15)';
    });
    actionBtn.addEventListener('click', () => {
      const orig = findConvertToDraftButton();
      if (!orig) return;
      // Open any ancestor <details> elements so GitHub's JS can handle the click
      let node = orig.parentElement;
      while (node) {
        if (node.tagName === 'DETAILS') node.open = true;
        node = node.parentElement;
      }
      orig.click();
    });

    // Dismiss (×) button
    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.setAttribute('aria-label', 'Dismiss');
    dismissBtn.style.cssText = [
      'background:none',
      'border:none',
      'cursor:pointer',
      'color:#57370d',
      'padding:2px',
      'display:flex',
      'align-items:center',
      'border-radius:4px',
      'flex-shrink:0',
      'opacity:0.7',
    ].join(';');
    dismissBtn.appendChild(buildSvg(ICON_X));
    dismissBtn.addEventListener('mouseenter', () => { dismissBtn.style.opacity = '1'; });
    dismissBtn.addEventListener('mouseleave', () => { dismissBtn.style.opacity = '0.7'; });
    dismissBtn.addEventListener('click', removeBanner);

    banner.appendChild(icon);
    banner.appendChild(msg);
    banner.appendChild(actionBtn);
    banner.appendChild(dismissBtn);

    return banner;
  }

  // ── Injection logic ───────────────────────────────────────────────────────

  function insertBanner(banner) {
    // 1. After the PR title/header block
    const ghHeader = document.querySelector('.gh-header');
    if (ghHeader) {
      ghHeader.insertAdjacentElement('afterend', banner);
      return;
    }

    // 2. Before the PR tab navigation (Conversation / Commits / Checks / Files)
    const tabnav = document.querySelector('.tabnav');
    if (tabnav) {
      tabnav.parentNode.insertBefore(banner, tabnav);
      return;
    }

    // 3. Top of the main pjax/turbo container
    const main =
      document.querySelector('#js-repo-pjax-container') ||
      document.querySelector('.repository-content') ||
      document.querySelector('main');
    if (main) {
      main.insertBefore(banner, main.firstChild);
      return;
    }

    // 4. Last resort
    document.body.insertBefore(banner, document.body.firstChild);
  }

  function injectBanner() {
    if (!isPullRequestPage()) {
      removeBanner();
      return;
    }

    const originalBtn = findConvertToDraftButton();

    if (!originalBtn) {
      // PR is already a draft, merged, or closed — remove any leftover banner
      removeBanner();
      return;
    }

    // Don't re-inject if the banner is already present
    if (document.getElementById(BANNER_ID)) return;

    insertBanner(createBanner());
  }

  function scheduleInject() {
    clearTimeout(injectTimeout);
    injectTimeout = setTimeout(injectBanner, 300);
  }

  // ── Observers & event listeners ───────────────────────────────────────────

  // Initial run
  scheduleInject();

  // Watch for dynamic DOM changes (GitHub loads the merge box asynchronously)
  const domObserver = new MutationObserver((mutations) => {
    let relevant = false;
    for (const m of mutations) {
      if (m.addedNodes.length || m.removedNodes.length) {
        relevant = true;
        break;
      }
    }
    if (relevant) scheduleInject();
  });
  domObserver.observe(document.body, { childList: true, subtree: true });

  // GitHub Turbo / pjax navigation events
  for (const evt of ['turbo:load', 'turbo:render', 'pjax:end']) {
    document.addEventListener(evt, () => {
      removeBanner();
      scheduleInject();
    });
  }

  // Fallback: poll for URL changes (covers any navigation mechanism not caught above)
  let lastPath = window.location.pathname;
  setInterval(() => {
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname;
      removeBanner();
      scheduleInject();
    }
  }, 1000);

}());
