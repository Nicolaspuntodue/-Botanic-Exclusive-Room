import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);
// mobile URL bar show/hide must not re-layout pins mid-scroll
ScrollTrigger.config({ ignoreMobileResize: true });

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const portrait = innerWidth / innerHeight < 0.9;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

document.body.classList.add('is-loading');
if (portrait) $('.hero__fallback').src = '/media/hero-m.webp';
// always start at the top: scroll-linked states (hero fold, pins) assume it
history.scrollRestoration = 'manual';
scrollTo(0, 0);

/* ---------- smooth scroll ---------- */
let lenis;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.09 });
  lenis.stop(); // locked until the loader leaves
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const t = $(a.getAttribute('href'));
    if (t) { e.preventDefault(); lenis.scrollTo(t, { offset: a.getAttribute('href') === '#top' ? 0 : -10 }); }
  }));
}

/* ---------- WebGL hero (three.js loaded async so the poster paints first) ---------- */
let gl = null;
const glReady = import('./gl.js').then(({ initHero }) => {
  gl = initHero($('.hero__gl'), {
    videoSrc: portrait ? '/media/hero-m' : '/media/hero',
    poster: portrait ? '/media/hero-m.webp' : '/media/hero.webp',
    portrait,
  });
  document.documentElement.classList.add('has-gl');
  return gl.ready;
}).catch((err) => console.warn('WebGL unavailable, using static hero', err));

/* ---------- loader ---------- */
const counter = { v: 0 };
const minTime = new Promise((r) => setTimeout(r, 1200));
const ready = Promise.race([Promise.all([glReady, document.fonts.ready, minTime]), new Promise((r) => setTimeout(r, 4000))]);
const countTo = (v, d) => gsap.to(counter, { v, duration: d, ease: 'power2.out', onUpdate: () => { $('.loader__count').textContent = Math.round(counter.v); } });
countTo(80, 1.6);
ready.then(() => {
  countTo(100, 0.4).then(() => {
    const tl = gsap.timeline({ onComplete: () => { $('.loader').remove(); document.body.classList.remove('is-loading'); lenis?.start(); ScrollTrigger.refresh(); } });
    tl.to('.loader', { clipPath: 'inset(0 0 100% 0)', duration: 1.1, ease: 'expo.inOut' })
      .from('.hero__title .line > *', { yPercent: 110, duration: 1.3, stagger: 0.12, ease: 'expo.out' }, '-=0.45')
      .from('.hero__copy .eyebrow, .hero__lede, .hero__scroll, .nav', { opacity: 0, y: 20, duration: 1, stagger: 0.08, ease: 'power3.out' }, '<0.3');
  });
});

/* ---------- hero scroll: video folds into the balcony window ---------- */
const nav = $('.nav');
if (!reduced) {
  gsap.timeline({
    scrollTrigger: {
      trigger: '.hero', start: 'top top', end: 'bottom bottom', scrub: true,
      onUpdate: (st) => { gl?.setProgress(st.progress); nav.classList.toggle('is-solid', st.progress > 0.55); },
      onLeave: () => nav.classList.add('is-solid'),
    },
  })
    .to('.hero__copy', { yPercent: -30, opacity: 0, filter: 'blur(10px)', ease: 'none', duration: 0.3 }, 0.04)
    .to('.hero__scroll', { opacity: 0, duration: 0.1 }, 0)
    .fromTo('.hero__window-copy', { autoAlpha: 0, y: 40, filter: 'blur(10px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.2, ease: 'none' }, 0.66)
    .to({}, { duration: 0.14 });
} else {
  ScrollTrigger.create({ trigger: '.stanza', start: 'top 80px', onToggle: (st) => nav.classList.toggle('is-solid', st.isActive || st.progress > 0) });
}

/* ---------- word reveal (blur + rise) ---------- */
$$('.reveal-words').forEach((el) => {
  const wrap = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((w) => {
          if (!w.trim()) return frag.append(w);
          const s = document.createElement('span'); s.className = 'w'; s.textContent = w; frag.append(s);
        });
        n.replaceWith(frag);
      } else wrap(n);
    });
  };
  wrap(el);
  if (reduced) return;
  gsap.from($$('.w', el), {
    yPercent: 60, opacity: 0, filter: 'blur(12px)', stagger: 0.06, duration: 1.2, ease: 'expo.out',
    scrollTrigger: { trigger: el, start: 'top 82%' },
  });
});

if (!reduced) {
  /* image frames: reveal + parallax */
  $$('[data-parallax]').forEach((f) => {
    gsap.from(f, { clipPath: 'inset(100% 0 0 0)', duration: 1.5, ease: 'expo.out', scrollTrigger: { trigger: f, start: 'top 85%' } });
    gsap.fromTo($('img', f), { yPercent: -12 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: f, scrub: true } });
  });
  gsap.from('.stanza__text > *', { y: 30, opacity: 0, stagger: 0.12, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: '.stanza__text', start: 'top 85%' } });

  /* stats count-up */
  $$('[data-count]').forEach((el) => {
    const to = +el.dataset.count, dec = +(el.dataset.dec || 0), o = { v: 0 };
    gsap.to(o, { v: to, duration: 2, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 90%' },
      onUpdate: () => { el.textContent = o.v.toFixed(dec).replace('.', ','); } });
  });

  /* horizontal details track */
  const track = $('.track');
  const dist = () => Math.max(0, track.scrollWidth - innerWidth);
  gsap.to(track, {
    x: () => -dist(), ease: 'none',
    scrollTrigger: { trigger: '.dettagli', start: 'top top', end: () => '+=' + dist(), pin: '.dettagli__pin', scrub: 0.6, invalidateOnRefresh: true },
  });
  gsap.from('.card', { opacity: 0, y: 60, rotate: (i) => (i % 2 ? 2 : -2), stagger: 0.06, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.dettagli', start: 'top 70%' } });

  /* city: video zoom-out + copy */
  gsap.fromTo('.citta__video', { scale: 1.2 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.citta__media', start: 'top bottom', end: 'bottom top', scrub: true } });
  gsap.from('.places li', { opacity: 0, x: 40, stagger: 0.08, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: '.places', start: 'top 80%' } });
  gsap.from('.footer .display, .footer__cta', { y: 60, opacity: 0, stagger: 0.1, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.footer', start: 'top 70%' } });
  // wordmark: letters rise in once it's on screen, then stay fully visible
  const word = $('.footer__word');
  word.innerHTML = [...word.textContent].map((c) => `<span class="ch">${c}</span>`).join('');
  gsap.from($$('.ch', word), { yPercent: 60, opacity: 0, filter: 'blur(8px)', stagger: 0.06, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: '.footer__mark', start: 'top 85%' } });
  gsap.from('.footer__tag', { opacity: 0, letterSpacing: '1em', duration: 1.6, ease: 'expo.out', scrollTrigger: { trigger: '.footer__mark', start: 'top 80%' } });
} else {
  $$('[data-count]').forEach((el) => { el.textContent = (+el.dataset.count).toFixed(+(el.dataset.dec || 0)).replace('.', ','); });
}

/* ---------- section videos: load + play only when visible ---------- */
const probe = document.createElement('video');
const ext = probe.canPlayType('video/webm; codecs="vp9"') ? 'webm' : 'mp4';
const vio = new IntersectionObserver((entries) => entries.forEach(({ target: v, isIntersecting }) => {
  if (isIntersecting) {
    if (!v.src) v.src = `${v.dataset.src}.${ext}`;
    if (!reduced) v.play().catch(() => {});
  } else v.pause();
}), { rootMargin: '200px 0px' });
$$('video[data-src]').forEach((v) => vio.observe(v));

/* Nave di Cascella: WebGL water, initialised only when the section approaches */
if (!reduced) {
  const box = $('.citta__video');
  const io = new IntersectionObserver(([en]) => {
    if (!en.isIntersecting) return;
    io.disconnect();
    import('./gl.js').then(({ initWater }) => initWater($('canvas', box), {
      src: portrait ? '/media/nave-sm.webp' : '/media/nave.webp',
      mask: '/media/nave-mask.webp',
      sun: [0.943, 0.612],
    }).ready).then(() => box.classList.add('is-live')).catch((e) => console.warn('water effect off', e));
  }, { rootMargin: '600px 0px' });
  io.observe(box);
}

/* duplicate marquee content for a seamless loop */
const row = $('.marquee__row');
row.innerHTML += row.innerHTML.replace(/<blockquote/g, '<blockquote aria-hidden="true"');

/* nav switches to its dark glass over the dark sections (created after the pin so positions include its spacer) */
$$('.dettagli, .citta, .footer').forEach((s) => ScrollTrigger.create({
  trigger: s, start: 'top 60px', end: 'bottom 60px',
  onToggle: (st) => nav.classList.toggle('is-dark', st.isActive),
}));

document.fonts.ready.then(() => ScrollTrigger.refresh());
