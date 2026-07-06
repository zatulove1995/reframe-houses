// ============================================================
//  Reframe Houses — interactions
// ============================================================

// Current year in footer
document.getElementById('year').textContent = new Date().getFullYear();

// Mobile nav toggle
const toggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.main-nav');
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  // Close menu after clicking a link
  nav.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    })
  );
}

// Hero mini form -> scroll to full offer form and prefill address
const miniForm = document.getElementById('offer');
if (miniForm) {
  miniForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const address = document.getElementById('mini-address').value.trim();
    const propertyField = document.getElementById('property');
    if (propertyField && address) propertyField.value = address;
    document.getElementById('get-offer').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => document.getElementById('name')?.focus(), 600);
  });
}

// Full lead form → posts to /api/lead (Cloudflare Pages Function → monday.com)
const leadForm = document.getElementById('lead-form');
if (leadForm) {
  leadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Basic required-field check
    const required = ['name', 'phone', 'email', 'property'];
    let valid = true;
    required.forEach((id) => {
      const el = document.getElementById(id);
      if (el && !el.value.trim()) {
        valid = false;
        el.style.borderColor = '#c0554e';
      } else if (el) {
        el.style.borderColor = '';
      }
    });
    if (!valid) return;

    const btn = leadForm.querySelector('.btn');
    const success = document.getElementById('form-success');
    const payload = Object.fromEntries(new FormData(leadForm).entries());

    btn.disabled = true;
    btn.textContent = 'Sending…';

    try {
      // API lives on the Worker (cross-origin from reframehouses.com)
      const res = await fetch('https://reframe-houses1.brian-abb.workers.dev/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('bad response');

      btn.textContent = 'Sent ✓';
      success.hidden = false;
      leadForm.querySelectorAll('input, select, textarea').forEach((el) => (el.value = ''));
    } catch (err) {
      // Network/endpoint not available (e.g. opened as a local file) — fail gracefully.
      console.error('Lead submit failed:', err, payload);
      btn.disabled = false;
      btn.textContent = 'Get My Cash Offer →';
      success.hidden = false;
      success.textContent = "✓ Thanks! We've received your info and will reach out within 24 hours.";
    }
  });
}
