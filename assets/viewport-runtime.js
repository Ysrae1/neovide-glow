/* One viewport sample, read phase and commit phase for the presentation. */
(() => {
  'use strict';
  const root = document.documentElement;
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;left:-100px;top:0;width:0;height:100svh;visibility:hidden;pointer-events:none;contain:strict;';
  document.body.append(probe);
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const subscribers = new Set();
  let frame = 0, revision = 0, dirty = true, dimensions = true, previous = null;
  let width = 0, height = 0;
  function request() {
    if (!frame) frame = requestAnimationFrame(flush);
  }
  function invalidate() { dirty = true; dimensions = true; request(); }
  function flush(now) {
    frame = 0;
    if (dimensions) {
      const nextWidth = root.clientWidth;
      const nextHeight = Math.round(probe.getBoundingClientRect().height || innerHeight);
      if (nextWidth !== width || nextHeight !== height) dirty = true;
      width = nextWidth; height = nextHeight; dimensions = false;
    }
    const layoutChanged = dirty;
    if (dirty) { revision++; dirty = false; }
    const y = scrollY, x = scrollX;
    const state = Object.freeze({
      now, y, x, width, height,
      visualHeight: visualViewport?.height || innerHeight,
      visualTop: visualViewport?.offsetTop || 0,
      direction: layoutChanged ? 0 : Math.sign(y - (previous?.y ?? y)),
      reduced: preference.matches || root.dataset.motion === 'reduce',
      layoutRevision: revision, layoutChanged,
    });
    const batch = [...subscribers].sort((a, b) => a.priority - b.priority);
    previous = state;
    // Paint masks sample the geometry after all presentation transforms land.
    // This bounded second read phase avoids stale coordinates without each
    // component interleaving its own reads and writes.
    for (const phase of ['layout','paint']) {
      const clients=batch.filter(client=>(client.phase||'layout')===phase);
      const samples=clients.map(client=>client.measure?.(state));
      clients.forEach((client,index)=>client.commit?.(state,samples[index]));
    }
  }
  window.GlowViewport = {
    subscribe(client, priority = 0) {
      const entry = { ...client, priority }; subscribers.add(entry); request();
      return () => subscribers.delete(entry);
    }, request, invalidate,
    get state() { return previous; }
  };
  addEventListener('scroll', request, { passive: true });
  addEventListener('scrollend', request, { passive: true });
  const resized = () => { dimensions = true; request(); };
  addEventListener('resize', resized, { passive: true });
  visualViewport?.addEventListener('resize', resized, { passive: true });
  visualViewport?.addEventListener('scroll', request, { passive: true });
  addEventListener('orientationchange', invalidate, { passive: true });
  addEventListener('pageshow', invalidate);
  document.addEventListener('glow:motionchange', invalidate);
  preference.addEventListener('change', invalidate);
  document.fonts?.ready.then(invalidate);
  request();
})();
