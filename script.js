/* ═══════════════════════════════════════════════
   CASTRO RESTORAN — script.js
═══════════════════════════════════════════════ */

/* ─── Nav: mobile menu ─── */
const nav      = document.getElementById('nav');
const burger   = document.getElementById('burger');
const navLinks = document.getElementById('navLinks');

let _savedScrollY = 0;

function menuLock() {
  _savedScrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${_savedScrollY}px`;
  document.body.style.width = '100%';
  document.body.style.overflow = 'hidden';
}

function menuUnlock(restoreScroll = true) {
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  document.body.style.overflow = '';
  if (restoreScroll) window.scrollTo(0, _savedScrollY);
}

burger.addEventListener('click', () => {
  const open = burger.classList.toggle('open');
  navLinks.classList.toggle('open', open);
  burger.setAttribute('aria-expanded', open);
  open ? menuLock() : menuUnlock();
});

navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    burger.classList.remove('open');
    navLinks.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
    menuUnlock();
  });
});

/* ─── Scroll reveal ─── */
const revealEls = Array.from(
  document.querySelectorAll('.reveal-up, .reveal-right')
).filter(el => !el.closest('.hero'));

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -32px 0px' });

revealEls.forEach(el => revealObserver.observe(el));

/* ─── Counter animation ─── */
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const el     = entry.target;
    const target = parseInt(el.dataset.target, 10);
    const start  = performance.now();

    const tick = (now) => {
      const p = Math.min((now - start) / 1400, 1);
      el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target);
      if (p < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    counterObserver.unobserve(el);
  });
}, { threshold: 0.5 });

document.querySelectorAll('.stat__num[data-target]').forEach(c => counterObserver.observe(c));

/* ─── Smooth nav link scrolling ─── */
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    window.scrollTo({
      top: target.getBoundingClientRect().top + window.scrollY - 80,
      behavior: 'smooth'
    });
  });
});

/* ─── Scrollytelling + parallax ─── */
const heroBgWrap  = document.querySelector('.hero__bg'); // wrapper, not img — avoids CSS animation conflict
const storyEl     = document.querySelector('.story');
const storyPanels = document.querySelectorAll('.story__panel');
const storyDots   = document.querySelectorAll('.story__dot');
const storyBar    = document.getElementById('storyBar');
const PANELS      = storyPanels.length;

// Cache bg images — no querySelectorAll in scroll hot path
const panelBgs = Array.from(storyPanels).map(p => p.querySelector('.story__bg'));

// Cache layout-dependent values; refresh on resize
let mobile      = window.innerWidth <= 768;
let storyHeight = storyEl ? storyEl.offsetHeight : 0;
let vh          = window.innerHeight;

window.addEventListener('resize', () => {
  mobile      = window.innerWidth <= 768;
  storyHeight = storyEl ? storyEl.offsetHeight : 0;
  vh          = window.innerHeight;
}, { passive: true });

let raf = null;

function updateScroll() {
  raf = null;

  // ── READS (all together, no interleaving) ──
  const sy        = window.scrollY;
  const navScroll = sy > 40;
  const heroEnd   = vh;

  let storyTop = 0, storyProgress = -1;
  if (storyEl) {
    storyTop = storyEl.getBoundingClientRect().top;
    const scrolled  = -storyTop;
    const maxScroll = storyHeight - vh;
    if (maxScroll > 0 && scrolled >= 0 && scrolled <= maxScroll) {
      storyProgress = Math.max(0, Math.min(1, scrolled / maxScroll));
    }
  }

  // ── WRITES (all together after reads) ──

  // Nav
  nav.classList.toggle('scrolled', navScroll);

  // Hero parallax — wrapper only, never the img (img has CSS animation)
  if (heroBgWrap && !mobile) {
    heroBgWrap.style.transform = sy < heroEnd
      ? `translateY(${sy * 0.25}px)`
      : '';
  }

  // Story
  if (storyProgress < 0) return;

  const idx     = Math.min(Math.floor(storyProgress * PANELS), PANELS - 1);
  const seg     = 1 / PANELS;
  const segProg = (storyProgress - idx * seg) / seg;

  storyPanels.forEach((p, i) => p.classList.toggle('active', i === idx));
  storyDots.forEach((d, i)   => d.classList.toggle('active', i === idx));
  if (storyBar) storyBar.style.width = (segProg * 100).toFixed(1) + '%';

  // Story bg parallax — desktop only
  if (!mobile) {
    panelBgs.forEach((bg, i) => {
      if (!bg) return;
      bg.style.transform = i === idx ? `translateY(${(segProg - 0.5) * 36}px)` : '';
    });
  }
}

window.addEventListener('scroll', () => {
  if (!raf) raf = requestAnimationFrame(updateScroll);
}, { passive: true });

updateScroll();

storyDots.forEach(dot => {
  dot.addEventListener('click', () => {
    const t         = parseInt(dot.dataset.target, 10);
    const maxScroll = storyHeight - vh;
    window.scrollTo({ top: storyEl.offsetTop + (t / PANELS) * maxScroll + 4, behavior: 'smooth' });
  });
});

/* ─── Reservation form ─── */
const form = document.getElementById('reservationForm');
if (form) {
  const dateInput = form.querySelector('#date');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.setAttribute('min', today);
    dateInput.value = today;
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    let valid = true;

    form.querySelectorAll('[required]').forEach(field => {
      field.classList.remove('error');
      if (!field.value.trim()) { field.classList.add('error'); valid = false; }
    });
    if (!valid) return;

    const btn = form.querySelector('button[type="submit"]');
    btn.textContent = 'Slanje...';
    btn.disabled = true;

    setTimeout(() => {
      btn.textContent = 'Rezervacija primljena!';
      btn.style.background = '#2EC4B6';
      form.reset();
      if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

      setTimeout(() => {
        btn.textContent = 'Rezervišite sto →';
        btn.style.background = '';
        btn.disabled = false;
      }, 3000);
    }, 1000);
  });

  form.querySelectorAll('[required]').forEach(field => {
    field.addEventListener('input', () => field.classList.remove('error'));
  });
}

/* ─── Language Translation Logic ─── */
function setLanguage(lang) {
  document.body.classList.toggle('lang-sr', lang === 'sr');
  document.body.classList.toggle('lang-en', lang === 'en');
  localStorage.setItem('castro-lang', lang);

  // Set active class on language toggle buttons
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  // Translate elements with data-en attribute
  document.querySelectorAll('[data-en]').forEach(el => {
    if (lang === 'en') {
      if (!el.dataset.srText) el.dataset.srText = el.innerHTML;
      el.innerHTML = el.dataset.en;
    } else {
      if (el.dataset.srText) el.innerHTML = el.dataset.srText;
    }
  });

  // Translate placeholders
  document.querySelectorAll('[data-en-placeholder]').forEach(el => {
    if (lang === 'en') {
      if (!el.dataset.srPlaceholder) el.dataset.srPlaceholder = el.placeholder;
      el.placeholder = el.dataset.enPlaceholder;
    } else {
      if (el.dataset.srPlaceholder) el.placeholder = el.dataset.srPlaceholder;
    }
  });

  // Translate dynamic buttons/inputs
  document.querySelectorAll('input[type="submit"][data-en-value], button[data-en-value]').forEach(el => {
    if (lang === 'en') {
      if (!el.dataset.srValue) el.dataset.srValue = el.value || el.textContent;
      if (el.value) el.value = el.dataset.enValue;
      else el.textContent = el.dataset.enValue;
    } else {
      if (el.dataset.srValue) {
        if (el.value) el.value = el.dataset.srValue;
        else el.textContent = el.dataset.srValue;
      }
    }
  });

  // Fire event for dynamic elements (like happy hour script) to update
  window.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

// Initial set
document.addEventListener('DOMContentLoaded', () => {
  const savedLang = localStorage.getItem('castro-lang') || 'sr';
  setLanguage(savedLang);
});

