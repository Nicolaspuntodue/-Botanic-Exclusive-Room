import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { quote } from './booking.js';

gsap.registerPlugin(ScrollTrigger);
// mobile URL bar show/hide must not re-layout pins mid-scroll
ScrollTrigger.config({ ignoreMobileResize: true });

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const portrait = innerWidth / innerHeight < 0.9;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

document.body.classList.add('is-loading');
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
    src: '/media/hero.webp',      // same photo on every screen: the shader crops on the pylon
    mask: '/media/hero-mask.webp',
    sun: [0.99, 0.55],            // low sun, right edge (uv, y up)
    focus: 0.64,                  // pylon x-position, used to centre narrow crops
    portrait,
  });
  // swap the <img> for the canvas only once the canvas has really drawn a frame
  return gl.ready.then(() => document.documentElement.classList.add('has-gl'));
}).catch((err) => console.warn('WebGL unavailable, using static hero', err));

/* ---------- loader: one counter, always moving, always ends on 100 ----------
   (two overlapping tweens used to fight: the slower "to 90" one could finish last and leave 90 on screen) */
const minTime = new Promise((r) => setTimeout(r, 450));
const ready = Promise.race([Promise.all([glReady, minTime]), new Promise((r) => setTimeout(r, 2500))]);
const countEl = $('.loader__count');
let shown = 0, loaded = false;
const t0 = performance.now();
ready.then(() => { loaded = true; });
const loaderDone = new Promise((resolve) => {
  const tick = () => {
    const t = (performance.now() - t0) / 1000;
    // while loading: ease towards 92 and keep creeping (never a hard stop); once loaded: glide to 100
    const target = loaded ? 100 : 92 * (1 - Math.exp(-t / 0.6));
    shown += (target - shown) * (loaded ? 0.18 : 0.1);
    if (loaded && shown > 99.5) shown = 100;
    countEl.textContent = Math.floor(shown);
    if (shown === 100) { gsap.ticker.remove(tick); resolve(); }
  };
  gsap.ticker.add(tick);
});
loaderDone.then(() => {
  {
    document.body.classList.remove('is-loading');
    ScrollTrigger.refresh(); // measure before the user can scroll, never mid-scroll
    lenis?.start(); // scrolling is allowed as soon as the curtain lifts
    const tl = gsap.timeline({ onComplete: () => $('.loader').remove() });
    tl.to('.loader', { clipPath: 'inset(0 0 100% 0)', duration: 0.8, ease: 'expo.inOut' })
      .from('.hero__title .line > *', { yPercent: 110, duration: 1.3, stagger: 0.12, ease: 'expo.out' }, '-=0.45')
      .from('.hero__copy .eyebrow, .hero__lede, .hero__scroll, .nav', { opacity: 0, y: 20, duration: 1, stagger: 0.08, ease: 'power3.out' }, '<0.3');
  }
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
  gsap.from('.book__intro > *, .book__form', { y: 50, opacity: 0, stagger: 0.08, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.book', start: 'top 75%' } });
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

/* ---------- direct booking form ---------- */
{
  const form = $('.book__form');
  const out = (k) => $(`[data-out="${k}"]`, form);
  const eur = (n) => `${n.toLocaleString('it-IT')} €`;
  // dates stay as YYYY-MM-DD strings; "today" is the visitor's local day, not UTC
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const nextDay = (s) => new Date(Date.parse(s) + 86400000).toISOString().slice(0, 10);
  const { checkin, checkout, guests } = form.elements;
  checkin.min = today;
  checkout.min = nextDay(today);

  const update = () => {
    if (checkin.value) {
      checkout.min = nextDay(checkin.value);
      if (checkout.value && checkout.value <= checkin.value) checkout.value = '';
    }
    const q = quote(checkin.value, checkout.value, +guests.value);
    if (q.error) {
      out('line').textContent = checkin.value && checkout.value ? q.error : 'Scegli le date';
      out('total').textContent = '—';
      return q;
    }
    const same = q.perNight.every((r) => r === q.perNight[0]);
    out('line').textContent = same
      ? `${eur(q.perNight[0])} × ${q.nights} ${q.nights === 1 ? 'notte' : 'notti'}`
      : `${q.nights} notti (tariffe stagionali)`;
    out('total').textContent = eur(q.total);
    out('error').textContent = '';
    return q;
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = update();
    const f = form.elements;
    const err = q.error || (!f.name.value.trim() && 'Inserisci nome e cognome')
      || (!f.email.validity.valid || !f.email.value ? 'Inserisci un’email valida' : '');
    if (err) { out('error').textContent = err; return; }
    // ponytail: demo only, nothing is sent. Wire to a booking engine / email endpoint before launch.
    out('done').textContent = `${f.name.value.trim().split(' ')[0]}, abbiamo ricevuto la tua richiesta per ${q.nights} ${q.nights === 1 ? 'notte' : 'notti'} (${eur(q.total)}). Ti scriviamo a ${f.email.value} per confermare.`;
    $('[data-step="form"]', form).hidden = true;
    $('[data-step="done"]', form).hidden = false;
  });
  $('[data-action="reset"]', form).addEventListener('click', () => {
    form.reset(); update();
    $('[data-step="form"]', form).hidden = false;
    $('[data-step="done"]', form).hidden = true;
  });
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
