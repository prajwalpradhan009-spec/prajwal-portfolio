lucide.createIcons();

const termBody = document.getElementById('termBody');
if (termBody) {
  const codeLines = [
    'import { AI_Agent } from "./jarvis";',
    'const agent = new AI_Agent();',
    'agent.configure({ voice: true, tasks: "auto" });',
    'agent.watch("everyday work");',
    '',
    '// listening...',
    'agent.on("idea", async (msg) => {',
    '  await agent.build(msg);',
    '  const reply = agent.answer(msg);',
    '  console.log(reply);',
    '});',
    '',
    'agent.run();',
  ];
  let lineIndex = 0;
  let charIndex = 0;
  const caret = termBody.querySelector('.term-caret');
  function typeCode() {
    if (document.hidden) { setTimeout(typeCode, 80); return; }
    const full = codeLines[lineIndex];
    if (charIndex < full.length) {
      caret.before(document.createTextNode(full[charIndex]));
      charIndex++;
      setTimeout(typeCode, 26);
      return;
    }
    termBody.append(document.createTextNode('\n'));
    lineIndex++;
    charIndex = 0;
    if (lineIndex >= codeLines.length) {
      setTimeout(() => { termBody.replaceChildren(caret); lineIndex = 0; typeCode(); }, 3200);
    } else {
      setTimeout(typeCode, 180);
    }
  }
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setTimeout(typeCode, 400);
  } else {
    caret.before(document.createTextNode(codeLines.join('\n')));
  }
}

const themeToggle = document.querySelector('.theme-toggle');
const isLocal = window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname);
const apiBase = window.PORTFOLIO_API_URL || (isLocal ? 'http://127.0.0.1:3000/api' : `${window.location.origin}/api`);
const savedTheme = localStorage.getItem('portfolio-theme');
if (savedTheme === 'dark') document.documentElement.dataset.theme = 'dark';
function updateThemeToggle() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  themeToggle.setAttribute('aria-pressed', isDark);
  themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  themeToggle.innerHTML = `<i data-lucide="${isDark ? 'sun' : 'moon'}"></i><span>${isDark ? 'Light' : 'Dark'}</span>`;
  lucide.createIcons();
}
updateThemeToggle();
themeToggle.addEventListener('click', () => {
  const isDark = document.documentElement.dataset.theme === 'dark';
  document.documentElement.dataset.theme = isDark ? 'light' : 'dark';
  localStorage.setItem('portfolio-theme', isDark ? 'light' : 'dark');
  updateThemeToggle();
});

const header = document.querySelector('.site-header');
const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');
const navAnchors = document.querySelectorAll('.nav-links a:not(.resume-link)');

// Scroll work used to run on every scroll event and re-read the offset of every
// section each time. Those offsetTop/offsetHeight reads force a synchronous
// layout, so the handler fought the compositor and produced visible stutter on
// phones. Off-screen sections also report their placeholder height (see the
// `content-visibility` rules in styles.css), which made cached offsets wrong, so
// the section you are looking at is now tracked with an IntersectionObserver
// instead. Only the header and the progress bar are handled here, and updates
// are coalesced into a single requestAnimationFrame callback.
let scrollFrameQueued = false;
let lastScrollProgress = -1;
let lastHeaderScrolled = null;
let scrollIdleTimer = null;

function applyScrollState() {
  scrollFrameQueued = false;
  const y = window.scrollY;

  const isScrolled = y > 30;
  if (isScrolled !== lastHeaderScrolled) {
    header.classList.toggle('scrolled', isScrolled);
    lastHeaderScrolled = isScrolled;
  }

  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const progress = maxScroll > 0 ? Math.min(100, (y / maxScroll) * 100) : 0;
  const roundedProgress = Math.round(progress * 10) / 10;
  // Skip the style write when nothing meaningful changed: every write here
  // invalidates style for the whole document.
  if (roundedProgress !== lastScrollProgress) {
    document.documentElement.style.setProperty('--scroll-progress', `${roundedProgress}%`);
    lastScrollProgress = roundedProgress;
  }
}

// The page runs dozens of decorative looping animations (glows, sweeps, shimmers,
// pulses). They are pleasant when the page is still, but every one of them
// competes with the compositor for the frames that scrolling needs, which is
// what makes movement feel heavy on a phone. Pausing them for the duration of a
// scroll keeps the motion exactly as designed the rest of the time and gives the
// frames back to the scroll itself.
function markScrolling() {
  document.documentElement.classList.add('is-scrolling');
  clearTimeout(scrollIdleTimer);
  scrollIdleTimer = setTimeout(() => {
    document.documentElement.classList.remove('is-scrolling');
  }, 180);
}

window.addEventListener(
  'scroll',
  () => {
    markScrolling();
    if (scrollFrameQueued) return;
    scrollFrameQueued = true;
    requestAnimationFrame(applyScrollState);
  },
  { passive: true }
);

window.addEventListener('touchstart', markScrolling, { passive: true });
window.addEventListener('wheel', markScrolling, { passive: true });

// Highlight the nav link for whichever section currently occupies the middle of
// the screen. The rootMargin shrinks the observed area to a band around the
// middle, so the active link changes when a section reaches the centre rather
// than the instant its edge appears.
const scrollSections = [...document.querySelectorAll('main section[id]')];
const sectionsInView = new Set();
let lastActiveSection = null;

function setActiveSection(id) {
  if (id === lastActiveSection) return;
  lastActiveSection = id;
  navAnchors.forEach(anchor =>
    anchor.classList.toggle('active', id === anchor.getAttribute('href').slice(1))
  );
}

if (scrollSections.length) {
  const sectionObserver = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) sectionsInView.add(entry.target.id);
        else sectionsInView.delete(entry.target.id);
      }
      const current = scrollSections.find(section => sectionsInView.has(section.id));
      setActiveSection(current ? current.id : null);
    },
    { rootMargin: '-25% 0px -55% 0px', threshold: 0 }
  );
  scrollSections.forEach(section => sectionObserver.observe(section));
}

menuToggle.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', isOpen);
  menuToggle.innerHTML = `<i data-lucide="${isOpen ? 'x' : 'menu'}"></i>`;
  lucide.createIcons();
});
navAnchors.forEach(anchor => anchor.addEventListener('click', () => {
  navLinks.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.innerHTML = '<i data-lucide="menu"></i>';
  lucide.createIcons();
}));

const phrases = ['Full-Stack Development', 'Python Development', 'Creative Problem Solving', 'Building for the web'];
const typedText = document.querySelector('#typed-text');
let phraseIndex = 0;
let characterIndex = phrases[0].length;
let deleting = true;
function typeLoop() {
  const phrase = phrases[phraseIndex];
  typedText.textContent = phrase.slice(0, characterIndex);
  if (deleting) characterIndex -= 1; else characterIndex += 1;
  if (characterIndex === 0) { deleting = false; phraseIndex = (phraseIndex + 1) % phrases.length; }
  if (characterIndex === phrases[phraseIndex].length) { deleting = true; }
  setTimeout(typeLoop, deleting ? 55 : 105);
}
setTimeout(typeLoop, 1800);

const observer = new IntersectionObserver(entries => entries.forEach(entry => {
  if (!entry.isIntersecting) return;
  entry.target.classList.add('visible');
  if (entry.target.classList.contains('stats')) animateCounts();
  observer.unobserve(entry.target);
}), { threshold: .15 });
document.querySelectorAll('.reveal, .stats').forEach(element => observer.observe(element));

let countsAnimated = false;
function animateCounts() {
  if (countsAnimated) return;
  countsAnimated = true;
  document.querySelectorAll('[data-count]').forEach(counter => {
    const target = Number(counter.dataset.count);
    let value = 0;
    const tick = () => {
      value += Math.ceil(target / 18);
      counter.textContent = Math.min(value, target);
      if (value < target) requestAnimationFrame(tick);
    };
    tick();
  });
}

document.querySelector('.contact-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  const message = document.querySelector('.form-message');
  const submitButton = form.querySelector('button[type="submit"]');
  const payload = {
    name: form.elements[0].value.trim(),
    email: form.elements[1].value.trim(),
    message: form.elements[2].value.trim()
  };
  submitButton.disabled = true;
  form.classList.remove('is-sent');
  form.classList.add('is-sending');
  message.textContent = 'Sending...';
  fetch(`${apiBase}/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(response => {
    if (!response.ok) throw new Error('Unable to send');
  }).then(() => {
    message.textContent = 'Successful! Your message has been sent.';
    form.classList.add('is-sent');
    form.reset();
  }).catch(() => {
    message.textContent = 'Unable to send your message. Please try again later.';
  }).finally(() => {
    form.classList.remove('is-sending');
    submitButton.disabled = false;
  });
});
