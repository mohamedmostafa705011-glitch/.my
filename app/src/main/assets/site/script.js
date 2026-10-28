const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelectorAll('.main-nav a');
const presentationToggle = document.getElementById('presentationToggle');

if (navToggle) {
  navToggle.addEventListener('click', () => {
    document.body.classList.toggle('nav-open');
    const expanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!expanded));
    navToggle.setAttribute('aria-label', expanded ? 'فتح القائمة' : 'إغلاق القائمة');
  });
}

navLinks.forEach((link) => {
  link.addEventListener('click', () => {
    navLinks.forEach((item) => item.classList.remove('active'));
    link.classList.add('active');
    document.body.classList.remove('nav-open');
    if (navToggle) {
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.setAttribute('aria-label', 'فتح القائمة');
    }
  });
});

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.getAttribute('id');
        navLinks.forEach((link) => {
          const href = link.getAttribute('href');
          if (href === '#' + id) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      });
    },
    { rootMargin: '-18% 0px -55% 0px', threshold: 0.1 }
  );

  document.querySelectorAll('section[id]').forEach((section) => observer.observe(section));
} else {
  navLinks[0]?.classList.add('active');
}

if (presentationToggle) {
  presentationToggle.addEventListener('click', () => {
    document.body.classList.toggle('presentation-mode');
    const active = document.body.classList.contains('presentation-mode');
    presentationToggle.textContent = active ? 'الوضع الفاتح  ' : 'الوضع الداكن  ';
    presentationToggle.setAttribute('aria-pressed', String(active));
    document.body.classList.toggle('nav-open', false);
    if (navToggle) {
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.setAttribute('aria-label', 'فتح القائمة');
    }
  });
}

function getCurrentSection(sections) {
  return sections
    .map((section) => ({ section, top: section.getBoundingClientRect().top }))
    .filter(({ top }) => top <= 120)
    .pop()?.section || sections[0];
}

document.addEventListener('keydown', (event) => {
  if (!document.body.classList.contains('presentation-mode')) return;

  if (event.key === 'Escape') {
    document.body.classList.remove('presentation-mode');
    presentationToggle.textContent = 'عرض تقديمي';
    presentationToggle.setAttribute('aria-pressed', 'false');
    return;
  }

  if (event.key === 'ArrowRight' || event.key === 'PageDown') {
    event.preventDefault();
    const sections = [...document.querySelectorAll('section[id]')];
    const currentIndex = sections.indexOf(getCurrentSection(sections));
    const target = sections[Math.min(currentIndex + 1, sections.length - 1)];
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
    event.preventDefault();
    const sections = [...document.querySelectorAll('section[id]')];
    const currentIndex = sections.indexOf(getCurrentSection(sections));
    const target = sections[Math.max(currentIndex - 1, 0)];
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

if (window.location.hash) {
  const target = document.querySelector(window.location.hash);
  if (target) {
    setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }
}

const footerCredit = document.querySelector('.footer-credit');
if (footerCredit) {
  if ('IntersectionObserver' in window) {
    const footerCreditObserver = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      footerCredit.classList.add('is-visible');
      footerCreditObserver.disconnect();
    }, { threshold: 0.2 });
    footerCreditObserver.observe(footerCredit);
  } else {
    footerCredit.classList.add('is-visible');
  }
}

const revealTargets = document.querySelectorAll(
  'main section:not(.footer-block) .section-header, ' +
  '.summary-grid > *, .sectors-grid > *, .map-layout > *, .logistics-grid > *, ' +
  '.media-grid > *, #indicators .table-wrap, #opportunities .table-wrap, ' +
  '#sources .source-card, #sources .methodology-box, #assistant .assistant-panel'
);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (revealTargets.length && !reducedMotion && 'IntersectionObserver' in window) {
  document.body.classList.add('motion-ready');
  revealTargets.forEach((element, index) => {
    element.classList.add('reveal');
    element.style.setProperty('--reveal-delay', `${(index % 4) * 65}ms`);
  });

  const revealObserver = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      currentObserver.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  revealTargets.forEach((element) => revealObserver.observe(element));
}
