lucide.createIcons();

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

window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 30);
  const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollableHeight > 0 ? (window.scrollY / scrollableHeight) * 100 : 0;
  document.documentElement.style.setProperty('--scroll-progress', `${progress}%`);
  const sections = [...document.querySelectorAll('main section[id]')];
  const current = sections.find(section => window.scrollY >= section.offsetTop - 180 && window.scrollY < section.offsetTop + section.offsetHeight - 180);
  navAnchors.forEach(anchor => anchor.classList.toggle('active', current?.id === anchor.getAttribute('href').slice(1)));
});

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

const modal = document.querySelector('.modal');
const modalTitle = document.querySelector('#modal-title');
const modalBody = document.querySelector('.modal-body');
const projectDescriptions = {
  'Northstar File Studio': 'A polished desktop utility for merging PDFs and converting, compressing and organizing images. It turns repetitive file work into a clear, focused workflow with practical controls and dependable output.',
  'NovaCart': 'NovaCart is a complete E-commerce experience: product browsing with search and categories, a working cart and a smooth checkout flow. Built end to end with a focus on clear UI, responsive layouts and a dependable shop API — all under one clean brand.',
};
const projectStacks = {
  'Northstar File Studio': ['Python', 'CustomTkinter', 'Pillow'],
  'NovaCart': ['React', 'Node.js', 'MongoDB'],
};
const featuredProject = document.querySelector('.project-card.featured');
document.querySelectorAll('.art-weather, .art-notes').forEach(art => art.closest('.project-card')?.remove());
if (featuredProject) {
  featuredProject.innerHTML = `<div class="project-art art-northstar"><strong class="live-badge">LIVE</strong><div class="northstar-logo"><img src="https://cdn-icons-png.flaticon.com/512/337/337946.png" alt="PDF merge logo" /></div><strong>NORTHSTAR</strong><span>FILE STUDIO</span><div class="northstar-tools"><i data-lucide="file-up"></i><i data-lucide="image"></i><i data-lucide="download"></i></div></div><div class="project-info"><span class="project-number">01 / Featured</span><h3>Northstar File Studio</h3><p>Merge PDFs. Convert images. Keep file work simple.</p><div class="project-tech"><span>Python</span><span>CustomTkinter</span><span>Pillow</span></div><div class="project-actions"><button class="text-link project-open" data-project="Northstar File Studio"><span>View details</span><i data-lucide="arrow-up-right"></i></button><a class="text-link project-github" href="https://github.com/prajwalpradhan009-spec/-Northstar-Compress-PDF" target="_blank" rel="noreferrer"><span>GitHub</span><i data-lucide="github"></i></a><a class="text-link project-download" href="https://github.com/prajwalpradhan009-spec/-Northstar-Compress-PDF/archive/refs/heads/main.zip"><span>Download</span><i data-lucide="download"></i></a></div></div>`;
  featuredProject.insertAdjacentHTML('afterend', `<article class="project-card banking-project reveal reveal-delay"><div class="project-art art-banking art-shop"><strong class="progress-badge">Project In Progress</strong><div class="jarvis-scan"></div><div class="shop-tile tile-1"><i data-lucide="shopping-bag"></i></div><div class="shop-tile tile-2"><i data-lucide="package"></i></div><div class="shop-tile tile-3"><i data-lucide="tag"></i></div><div class="novacart-logo"><svg viewBox="0 0 120 120" fill="none" aria-hidden="true"><defs><linearGradient id="ncGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#69e5e1"/><stop offset="1" stop-color="#ffab84"/></linearGradient></defs><rect x="10" y="10" width="100" height="100" rx="28" fill="#0f2832" stroke="url(#ncGrad)" stroke-width="3"/><path d="M48 41v-6a12 12 0 0 1 24 0v6" stroke="#69e5e1" stroke-width="5" fill="none"/><rect x="31" y="41" width="58" height="45" rx="10" fill="#12333d" stroke="#69e5e1" stroke-width="5"/><path d="M42 79V49l36 30V49" stroke="#ffab84" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="60" cy="28" r="7" fill="#69e5e1"/></svg></div><strong>NOVACART</strong><small>E-COMMERCE</small></div><div class="project-info"><span class="project-number">02 / Experiment</span><h3>NovaCart</h3><p>A complete online store — browse products, build your cart and check out through a clean, responsive shopping flow.</p><div class="project-tech"><span>React</span><span>Node.js</span><span>MongoDB</span></div><div class="project-actions"><button class="text-link project-open" data-project="NovaCart"><span>View details</span><i data-lucide="arrow-up-right"></i></button><a class="text-link project-github" href="https://github.com/prajwalpradhan009-spec" target="_blank" rel="noreferrer"><span>GitHub</span><i data-lucide="github"></i></a></div></div></article>`);
  featuredProject.nextElementSibling.classList.add('visible');
  lucide.createIcons();
}
document.querySelectorAll('.project-open').forEach(button => button.addEventListener('click', () => {
  modalTitle.textContent = button.dataset.project;
  modalBody.textContent = projectDescriptions[button.dataset.project];
  document.querySelector('.modal-stack').innerHTML = projectStacks[button.dataset.project].map(technology => `<span>${technology}</span>`).join('');
  modal.classList.add('open');
}));
function closeModal() { modal.classList.remove('open'); }
document.querySelector('.modal-close').addEventListener('click', closeModal);
modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });

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
    return response.json();
  }).then(result => {
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
