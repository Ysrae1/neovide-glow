    (() => {
      const root = document.documentElement;
      const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
      const reduced = {
        get matches() { return motionPreference.matches || root.dataset.motion === 'reduce'; },
        addEventListener(_, callback) { document.addEventListener('glow:motionchange', callback); }
      };
      const motionToggle = document.getElementById('motion-toggle');
      const syncMotionLabel = () => {
        motionToggle.setAttribute('aria-pressed', String(reduced.matches));
        const text = motionPreference.matches ? '系统已减少动态效果' : reduced.matches ? '恢复动态效果' : '减少动态效果';
        const label = window.GlowLocale?.t(text) || text;
        motionToggle.setAttribute('aria-label', label);
        motionToggle.title = label;
        motionToggle.disabled = motionPreference.matches;
      };
      motionToggle.addEventListener('click', () => {
        root.dataset.motion = root.dataset.motion === 'reduce' ? 'normal' : 'reduce';
        try { localStorage.setItem('glow-motion', root.dataset.motion); } catch (_) {}
        syncMotionLabel();
        document.dispatchEvent(new Event('glow:motionchange'));
      });
      motionPreference.addEventListener('change', () => { syncMotionLabel(); document.dispatchEvent(new Event('glow:motionchange')); });
      syncMotionLabel();

      // Theme: dark by default, manual toggle remembered; the canvas re-reads its colors.
      const toggle = document.getElementById('theme-toggle');
      const meta = document.querySelector('meta[name="theme-color"]');
      const label = () => {
        const text = root.dataset.theme === 'dark' ? '切换浅色外观' : '切换深色外观';
        toggle.setAttribute('aria-label', text);
        toggle.title = text;
        meta.content = root.dataset.theme === 'dark' ? '#07090d' : '#f3f6fb';
      };
      toggle.addEventListener('click', () => {
        root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem('glow-theme', root.dataset.theme); } catch (_) {}
        label();
        document.dispatchEvent(new Event('glow:themechange'));
      });
      label();

      // Navigation and hero share the same viewport sample as the story.
      const nav = document.querySelector('.nav');
      const hero = document.querySelector('.hero');
      let navTravel = 0, lastNavY = scrollY;
      let navIdleTimer = 0;
      const scheduleNavIdle = () => {
        clearTimeout(navIdleTimer);
        navIdleTimer = 0;
        if (scrollY < 30) return;
        navIdleTimer = setTimeout(() => {
          navIdleTimer = 0;
          if (scrollY >= 30) nav.classList.add('is-compact');
        }, 1000);
      };
      window.GlowViewport.subscribe({commit(state) {
        const delta=state.y-lastNavY;
        if(delta)navTravel=Math.sign(delta)===Math.sign(navTravel)?navTravel+delta:delta;
        if(state.y<30)nav.classList.remove('is-compact');
        else if(delta) {
          if(navTravel< -8)nav.classList.remove('is-compact');
          else if(navTravel>16)nav.classList.add('is-compact');
        }
        if(delta)scheduleNavIdle();
        lastNavY=state.y;
        nav.classList.toggle('is-scrolled',state.y>12);
        hero.style.setProperty('--hp',state.reduced?'0':String(Math.min(1,Math.max(0,state.y/state.height))));
      }},0);
      scheduleNavIdle();

      // Section entrances.
      if ('IntersectionObserver' in window && !reduced.matches) {
        const reveal = new IntersectionObserver(entries => entries.forEach(entry => {
          if (entry.isIntersecting) { entry.target.classList.add('is-visible'); reveal.unobserve(entry.target); }
        }), { threshold: .08, rootMargin: '0px 0px -24px 0px' });
        root.classList.add('reveal-ready');
        document.querySelectorAll('[data-reveal="demo-controls"]').forEach(element => reveal.observe(element));
      }

      window.GlowViewport.request();
    })();
