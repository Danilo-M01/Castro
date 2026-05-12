/* ══════════════════════════════════════════
   CASTRO — meni.js
══════════════════════════════════════════ */

const socket = io();
const customerStatusEl = document.getElementById("customerStatus");
let liveOrder = JSON.parse(localStorage.getItem("castro-live-order") || "null");
const phoneInputEl = document.getElementById("oPhone");

function isValidSerbianPhone(value) {
  const cleaned = String(value || "").replace(/\s+/g, "");
  return /^\+3816\d{7,8}$/.test(cleaned);
}

/* ─── Cart ─── */
const cart = {
  items: JSON.parse(localStorage.getItem('castro-cart') || '[]'),

  generateId(name, addons) {
    if (!addons || addons.length === 0) return name;
    return name + '|' + addons.map(a => `${a.name}:${a.qty}`).sort().join('|');
  },

  add(btn) {
    const el = btn.closest('.item');
    if (el.classList.contains("item--unavailable")) return;
    
    const catEl = el.closest('.cat');
    const catId = catEl ? catEl.id : '';
    const isDodaciSection = catId === 'dodaci';
    const isPalacinkaOrTortilja = !isDodaciSection && (catId === 'palacinka' || catId === 'tortilje');
    const type = (catId === 'palacinka' && el.dataset.name.includes("Palačinka —")) ? 'slatki' : 'slani';
    const isSlatka = type === 'slatki';

    if (el.dataset.sizes) { 
      openSizePicker(el, isPalacinkaOrTortilja ? type : null); 
      return; 
    }

    if (isPalacinkaOrTortilja) {
      openAddonPicker(el, el.dataset.name, parseInt(el.dataset.price), type);
      return;
    }

    // Provera dodataka narucenih sa strane (max 2)
    if (isDodaciSection) {
       const existing = this.items.find(i => i.name === el.dataset.name);
       if (existing && existing.qty >= 2) {
          alert('Možete poručiti maksimalno 2 ista dodatka zasebno.');
          return;
       }
    }

    const name  = el.dataset.name;
    const price = parseInt(el.dataset.price);
    this.addItem(name, price, []);
  },

  addItem(name, price, addons = []) {
    const id = this.generateId(name, addons);
    const existing = this.items.find(i => i.id === id);
    if (existing) existing.qty++;
    else this.items.push({ id, name, price, qty: 1, addons });
    this.save();
    this.render();
    this.popBadge();
  },

  inc(id) {
    const item = this.items.find(i => i.id === id || i.name === id);
    if (item) { 
      // Provera za zasebne dodatke
      if (document.getElementById('dodaci')) {
         const dodatakEl = document.querySelector(`#dodaci .item[data-name="${item.name}"]`);
         if (dodatakEl && item.qty >= 2) {
            alert('Možete poručiti maksimalno 2 ista dodatka zasebno.');
            return;
         }
      }
      item.qty++; this.save(); this.render(); renderItemControls(); 
    }
  },

  dec(id) {
    const item = this.items.find(i => i.id === id || i.name === id);
    if (!item) return;
    item.qty--;
    if (item.qty <= 0) this.items = this.items.filter(i => i.id !== id && i.name !== id);
    this.save(); this.render(); renderItemControls();
  },

  get count() { return this.items.reduce((s, i) => s + i.qty, 0); },
  get total() { 
    return this.items.reduce((s, i) => {
      let itemPrice = i.price;
      if (i.addons) {
        itemPrice += i.addons.reduce((as, a) => as + a.price * a.qty, 0);
      }
      return s + itemPrice * i.qty;
    }, 0); 
  },

  save() { localStorage.setItem('castro-cart', JSON.stringify(this.items)); },

  render() {
    const count = this.count;
    const total = this.total;

    // Badges
    ['cartBadge', 'fabBadge'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = count;
    });

    // Order button
    const orderBtn = document.getElementById('orderBtn');
    if (orderBtn) orderBtn.disabled = count === 0;

    // Total
    const totalEl = document.getElementById('cartTotal');
    if (totalEl) totalEl.textContent = total.toLocaleString('sr-Latn') + ' RSD';

    // Mobilni "Završi kupovinu" FAB
    const checkoutFab = document.getElementById('checkoutFab');
    if (checkoutFab) {
      if (count > 0) {
        checkoutFab.classList.add('visible');
        const fabTotal = checkoutFab.querySelector('.checkout-fab__total');
        if (fabTotal) fabTotal.textContent = total.toLocaleString('sr-Latn') + ' RSD';
      } else {
        checkoutFab.classList.remove('visible');
      }
    }

    // Items list
    const listEl = document.getElementById('cartItems');
    const emptyEl = document.getElementById('cartEmpty');
    if (!listEl) return;

    // Remove old item rows
    listEl.querySelectorAll('.cart-item').forEach(el => el.remove());

    if (this.items.length === 0) {
      if (emptyEl) emptyEl.style.display = 'flex';
    } else {
      if (emptyEl) emptyEl.style.display = 'none';
      this.items.forEach(item => {
        const id = item.id || item.name;
        let itemPrice = item.price;
        let addonsHtml = '';
        
        if (item.addons && item.addons.length > 0) {
          itemPrice += item.addons.reduce((as, a) => as + a.price * a.qty, 0);
          const addonTexts = item.addons.map(a => `${a.name}${a.qty > 1 ? ' x' + a.qty : ''}`);
          addonsHtml = `<div class="cart-item__addons" style="font-size:12px;color:#aaa;margin-top:2px;">+ ${addonTexts.join(', ')}</div>`;
        }

        const row = document.createElement('div');
        row.className = 'cart-item';
        row.innerHTML = `
          <div style="flex:1;display:flex;flex-direction:column;justify-content:center;">
            <div class="cart-item__name">${item.name}</div>
            ${addonsHtml}
          </div>
          <div class="qty-ctrl">
            <button onclick="cart.dec('${id.replace(/'/g, "\\'")}')">−</button>
            <span>${item.qty}</span>
            <button onclick="cart.inc('${id.replace(/'/g, "\\'")}')">+</button>
          </div>
          <span class="cart-item__price">${(itemPrice * item.qty).toLocaleString('sr-Latn')} RSD</span>
        `;
        listEl.appendChild(row);
      });
    }
    // Ažuriraj inline kontrole na stavkama menija
    renderItemControls();
  },

  flashBtn(btn) {
    btn.classList.add('added');
    btn.textContent = '✓';
    setTimeout(() => { btn.classList.remove('added'); btn.textContent = '+'; }, 900);
  },

  popBadge() {
    ['cartBadge', 'fabBadge'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
      setTimeout(() => el.classList.remove('pop'), 300);
    });
  },

  showPanel() {
    document.getElementById('cartPanel').classList.add('open');
    document.getElementById('cartOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  },

  buildOrderMessage(name, phone, type, addr, note) {
    const lines = this.items.map(i => {
      let itemPrice = i.price;
      let addonStr = '';
      if (i.addons && i.addons.length > 0) {
        itemPrice += i.addons.reduce((as, a) => as + a.price * a.qty, 0);
        addonStr = '\n    + ' + i.addons.map(a => `${a.name}${a.qty > 1 ? ' x' + a.qty : ''}`).join(', ');
      }
      return `• ${i.name} ×${i.qty} — ${(itemPrice * i.qty).toLocaleString('sr-Latn')} RSD${addonStr}`;
    }).join('\n');
    const total = this.total.toLocaleString('sr-Latn');
    let msg = `🍕 *Nova narudžbina — Castro Restoran*\n\n${lines}\n\n*Ukupno: ${total} RSD*\n\n👤 ${name}\n📞 ${phone}\n🛵 ${type}`;
    if (type === 'Dostava' && addr) msg += `\n📍 ${addr}`;
    if (note) msg += `\n📝 ${note}`;
    return msg;
  }
};

function openOrderPopup() {
  document.getElementById('orderDetailPopup')?.classList.add('open');
  document.getElementById('orderStatusOverlay')?.classList.add('open');
}
function closeOrderPopup() {
  document.getElementById('orderDetailPopup')?.classList.remove('open');
  document.getElementById('orderStatusOverlay')?.classList.remove('open');
}

function updateCustomerStatus(text, allowHtml = false, trackUrl = null) {
  const pill   = document.getElementById('orderStatusPill');
  const msgEl  = document.getElementById('odpMsg');
  const trackEl = document.getElementById('odpTrack');

  // Odredi status tekst iz poruke
  let statusText = 'Porudžbina u toku';
  if (text.includes('poslata') || text.includes('potvrda')) statusText = '⏳ Čeka se potvrda';
  else if (text.includes('prihvacena') || text.includes('prihvaćena')) statusText = '✅ Prihvaćena';
  else if (text.includes('pripremi')) statusText = '👨‍🍳 U pripremi';
  else if (text.includes('skoro')) statusText = '⚡ Skoro gotovo';
  else if (text.includes('spremna')) statusText = '🟢 Spremna!';
  else if (text.includes('zavrsena') || text.includes('završena')) statusText = '✓ Završena';
  else if (text.includes('odbijena')) statusText = '❌ Odbijena';
  else if (text.includes('nije prihvacena') || text.includes('nije prihvaćena')) statusText = '⚠️ Propuštena';

  if (msgEl) {
    if (allowHtml) msgEl.innerHTML = text;
    else msgEl.textContent = text;
  }
  document.getElementById('odpStatus').textContent = statusText;

  if (trackUrl && trackEl) {
    trackEl.href = trackUrl;
    trackEl.style.display = 'inline-flex';
  }

  // Popuni order ID u popup-u ako liveOrder postoji
  if (liveOrder?.orderId) {
    document.getElementById('odpOrderId').textContent = liveOrder.orderId;
    document.getElementById('osPillText').textContent = `Porudžbina ${liveOrder.orderId}`;
  }

  if (pill) {
    pill.style.display = 'flex';
    if (statusText === '⏳ Čeka se potvrda') {
      pill.classList.add('waiting');
      pill.innerHTML = `
        <span class="osp-pulse" style="background:#888;"></span>
        <span id="osPillText">Čeka se potvrda...</span>
        <svg viewBox="0 0 24 24" fill="none" width="14" height="14"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      `;
    } else if (['❌ Odbijena', '⚠️ Propuštena'].includes(statusText)) {
      pill.classList.remove('waiting');
      pill.innerHTML = `
        <span class="osp-pulse" style="background:var(--red);"></span>
        <span id="osPillText">${statusText}</span>
        <svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      `;
    } else {
      pill.classList.remove('waiting');
      pill.innerHTML = `
        <span class="osp-pulse"></span>
        <span id="osPillText">Porudžbina ${liveOrder?.orderId || ''}</span>
        <svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      `;
    }
  }
}

function renderAvailability(availabilityMap) {
  document.querySelectorAll(".item").forEach((itemEl) => {
    const itemName = itemEl.dataset.name;
    const isAvailable = availabilityMap[itemName] !== false;
    itemEl.classList.toggle("item--unavailable", !isAvailable);
    let tag = itemEl.querySelector(".unavailable-tag");
    if (!isAvailable) {
      if (!tag) {
        tag = document.createElement("span");
        tag.className = "unavailable-tag";
        tag.textContent = "Trenutno nije na stanju";
        itemEl.querySelector(".item__name")?.appendChild(tag);
      }
    } else if (tag) {
      tag.remove();
    }
  });
}

/* ─── Panel open/close ─── */
function openCart() {
  document.getElementById('cartPanel').classList.add('open');
  document.getElementById('cartOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('checkoutFab')?.classList.add('temp-hidden');
}
function closeCart() {
  document.getElementById('cartPanel').classList.remove('open');
  document.getElementById('cartOverlay').classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('checkoutFab')?.classList.remove('temp-hidden');
}
function generateTimeSlots() {
  const select = document.getElementById('oTime');
  if (!select) return;
  select.innerHTML = '';

  const now = new Date();
  const day = now.getDay(); // 0 (Sun) - 6 (Sat)
  const isWeekend = (day === 5 || day === 6);
  
  const openTime = new Date(now);
  openTime.setHours(7, 0, 0, 0);
  
  const closeTime = new Date(now);
  if (isWeekend) closeTime.setHours(23, 59, 59, 999);
  else closeTime.setHours(23, 30, 0, 0);

  const isOpenNow = now >= openTime && now <= closeTime;

  if (isOpenNow) {
    select.innerHTML += `<option value="asap">Što pre</option>`;
  } else {
    const opt = document.createElement('option');
    opt.value = "";
    opt.text = "Restoran zatvoren (zakažite za kasnije)";
    opt.disabled = true;
    opt.selected = true;
    select.appendChild(opt);
  }

  // Generate today's slots (minimum 30 mins from now)
  let slot = new Date(now.getTime() + 30 * 60000);
  const remainder = slot.getMinutes() % 15;
  if (remainder !== 0) slot.setMinutes(slot.getMinutes() + (15 - remainder));
  
  // Prvi moguci termin je pola sata od otvaranja (07:30)
  const firstSlot = new Date(now);
  firstSlot.setHours(7, 30, 0, 0);
  if (slot < firstSlot) slot = firstSlot;

  if (slot <= closeTime) {
    select.innerHTML += `<optgroup label="Danas">`;
    while (slot <= closeTime) {
      const timeStr = `${slot.getHours().toString().padStart(2, '0')}:${slot.getMinutes().toString().padStart(2, '0')}`;
      select.innerHTML += `<option value="${timeStr}">${timeStr}</option>`;
      slot.setMinutes(slot.getMinutes() + 15);
    }
    select.innerHTML += `</optgroup>`;
  }

  // Generate tomorrow's slots
  let tomorrowSlot = new Date(now);
  tomorrowSlot.setDate(tomorrowSlot.getDate() + 1);
  tomorrowSlot.setHours(7, 30, 0, 0);
  
  const tomorrowDay = tomorrowSlot.getDay();
  const isTomorrowWeekend = (tomorrowDay === 5 || tomorrowDay === 6);
  const tomorrowCloseTime = new Date(tomorrowSlot);
  if (isTomorrowWeekend) tomorrowCloseTime.setHours(23, 59, 59, 999);
  else tomorrowCloseTime.setHours(23, 30, 0, 0);

  select.innerHTML += `<optgroup label="Sutra">`;
  while (tomorrowSlot <= tomorrowCloseTime) {
    const timeStr = `${tomorrowSlot.getHours().toString().padStart(2, '0')}:${tomorrowSlot.getMinutes().toString().padStart(2, '0')}`;
    select.innerHTML += `<option value="Sutra u ${timeStr}">${timeStr}</option>`;
    tomorrowSlot.setMinutes(tomorrowSlot.getMinutes() + 15);
  }
  select.innerHTML += `</optgroup>`;
}

function openModal() {
  document.getElementById('orderModal').classList.add('open');
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal() {
  document.getElementById('orderModal').classList.remove('open');
  document.getElementById('modalOverlay').classList.remove('open');
}

document.getElementById('cartBtn')?.addEventListener('click', openCart);
document.getElementById('fabCart')?.addEventListener('click', openCart);
// Mobilni "Završi kupovinu" FAB — direktno otvara modal
document.getElementById('checkoutFab')?.addEventListener('click', () => {
  const MIN_ORDER = 700;
  if (cart.total < MIN_ORDER) {
    showMinOrderAlert(MIN_ORDER);
    return;
  }
  openModal();
});
document.getElementById('cartClose')?.addEventListener('click', closeCart);
document.getElementById('cartOverlay')?.addEventListener('click', closeCart);
document.getElementById('orderBtn')?.addEventListener('click', () => { closeCart(); openModal(); });
document.getElementById('modalClose')?.addEventListener('click', closeModal);
document.getElementById('modalOverlay')?.addEventListener('click', closeModal);

// Customer order pill & popup
document.getElementById('orderStatusPill')?.addEventListener('click', openOrderPopup);
document.getElementById('odpClose')?.addEventListener('click', closeOrderPopup);
document.getElementById('orderStatusOverlay')?.addEventListener('click', closeOrderPopup);

/* ─── Delivery toggle ─── */
document.querySelectorAll('input[name="type"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const addrField = document.getElementById('addrField');
    if (addrField) addrField.style.display = radio.value === 'Dostava' ? 'flex' : 'none';
  });
});

/* ─── Minimum order alert ─── */
function showMinOrderAlert(min) {
  let overlay = document.getElementById('minOrderOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'minOrderOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);';
    overlay.innerHTML = `
      <div style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:32px 28px;max-width:340px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.6);">
        <div style="font-size:44px;margin-bottom:12px;">🛵</div>
        <h3 style="color:#fff;font-size:18px;margin:0 0 10px;font-family:inherit;">Minimalna porudžbina</h3>
        <p style="color:rgba(255,255,255,0.65);font-size:14px;line-height:1.6;margin:0 0 22px;">Za online narudžbinu potrebno je minimum <strong style="color:#e8b84b;">${min.toLocaleString('sr-Latn')} RSD</strong>. Dodajte još nešto u korpu. 😊</p>
        <button id="minOrderClose" style="background:#e8b84b;color:#000;border:none;border-radius:10px;padding:12px 28px;font-size:15px;font-weight:700;cursor:pointer;width:100%;">
          U redu, dodaću još
        </button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#minOrderClose').addEventListener('click', () => { overlay.remove(); });
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  }
}

/* ─── Order form submit ─── */
document.getElementById('orderForm')?.addEventListener('submit', e => {
  e.preventDefault();

  // Minimum order check
  const MIN_ORDER = 700;
  if (cart.total < MIN_ORDER) {
    closeModal();
    showMinOrderAlert(MIN_ORDER);
    return;
  }

  const name  = document.getElementById('oName');
  const phone = document.getElementById('oPhone');
  let valid = true;
  [name, phone].forEach(f => {
    f.classList.remove('err');
    if (!f.value.trim()) { f.classList.add('err'); valid = false; }
  });
  if (valid && !isValidSerbianPhone(phone.value.trim())) {
    phone.classList.add('err');
    valid = false;
    updateCustomerStatus("Telefon mora biti validan srpski broj (npr. +3816XXXXXXXX).");
  }
  if (!valid) return;

  const type = document.querySelector('input[name="type"]:checked').value;
  const addr = document.getElementById('oAddr')?.value || '';
  const note = document.getElementById('oNote')?.value || '';
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: cart.items,
      customerName: name.value.trim(),
      phone: phone.value.trim(),
      type,
      address: addr,
      note
    })
  })
    .then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Greška pri slanju.");
      liveOrder = { orderId: data.orderId, customerToken: data.customerToken };
      localStorage.setItem("castro-live-order", JSON.stringify(liveOrder));
      socket.emit("order:subscribe", liveOrder);
      updateCustomerStatus(`Porudžbina ${data.orderId} je poslata. Čeka se potvrda.`, false, data.trackUrl || null);
      openOrderPopup();
      cart.items = [];
      cart.save();
      cart.render();
      closeModal();
    })
    .catch((error) => {
      updateCustomerStatus(error.message);
    })
    .finally(() => {
      btn.disabled = false;
    });
});

/* ─── Nav burger (mobile) ─── */
const burger = document.getElementById('burger');
const navCenter = document.querySelector('.nav__center');

burger?.addEventListener('click', () => {
  const open = burger.classList.toggle('open');
  navCenter?.classList.toggle('open', open);
  // Zaključaj scroll tela dok je meni otvoren
  document.body.style.overflow = open ? 'hidden' : '';
});

navCenter?.querySelectorAll('.nav__tab').forEach(tab => {
  tab.addEventListener('click', () => {
    burger?.classList.remove('open');
    navCenter.classList.remove('open');
    document.body.style.overflow = '';
  });
});

/* ─── Smooth scroll for nav tabs ─── */
document.querySelectorAll('.nav__tab[href^="#"]').forEach(tab => {
  tab.addEventListener('click', e => {
    e.preventDefault();
    const target = document.querySelector(tab.getAttribute('href'));
    if (!target) return;
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 68;
    const offset = target.getBoundingClientRect().top + window.scrollY - navH;
    window.scrollTo({ top: offset, behavior: 'smooth' });
  });
});

/* ─── Active tab on scroll ─── */
const sections = document.querySelectorAll('.cat[id]');
const tabs     = document.querySelectorAll('.nav__tab');

const tabObs = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const id = entry.target.id;
    tabs.forEach(t => t.classList.toggle('active', t.getAttribute('href') === `#${id}`));
  });
}, { rootMargin: '-30% 0px -60% 0px' });

sections.forEach(s => tabObs.observe(s));

/* ─── Sub-nav scroll-spy ─── */
const subNavLinks = document.querySelectorAll('.sub-nav__item[data-target]');
const subNavInner = document.querySelector('.sub-nav__inner');

function centerActiveSubNavItem(id) {
  const active = subNavInner?.querySelector(`.sub-nav__item[data-target="${id}"]`);
  if (!active || !subNavInner) return;
  // Izračunaj offset da bude u centru sub-nav-a
  const containerW = subNavInner.offsetWidth;
  const itemLeft   = active.offsetLeft;
  const itemW      = active.offsetWidth;
  const target     = itemLeft - containerW / 2 + itemW / 2;
  subNavInner.scrollTo({ left: target, behavior: 'smooth' });
}

const subNavObs = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const id = entry.target.id;
    subNavLinks.forEach(l => l.classList.toggle('active', l.dataset.target === id));
    centerActiveSubNavItem(id);
  });
}, { rootMargin: '-15% 0px -70% 0px', threshold: 0 });

sections.forEach(s => subNavObs.observe(s));

/* ─── Smooth scroll for sub-nav links ─── */
// Računamo total sticky offset: nav + sub-nav visina
function getStickyOffset() {
  const navH    = document.querySelector('.nav')?.offsetHeight    || 68;
  const subNavH = document.querySelector('.sub-nav')?.offsetHeight || 90;
  return navH + subNavH + 8; // 8px extra breathing room
}

// Postavi scroll-padding-top dinamicki
function updateScrollPadding() {
  document.documentElement.style.scrollPaddingTop = getStickyOffset() + 'px';
}
updateScrollPadding();
window.addEventListener('resize', updateScrollPadding);

subNavLinks.forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const target = document.getElementById(link.dataset.target);
    if (!target) return;
    const offset = target.getBoundingClientRect().top + window.scrollY - getStickyOffset();
    window.scrollTo({ top: offset, behavior: 'smooth' });
  });
});

/* ─── Hero slideshow ─── */
const heroSlides = document.querySelectorAll('.meni-hero__slide');
if (heroSlides.length > 1) {
  let slideIdx = 0;
  setInterval(() => {
    heroSlides[slideIdx].classList.remove('active');
    slideIdx = (slideIdx + 1) % heroSlides.length;
    heroSlides[slideIdx].classList.add('active');
  }, 4500);
}



/* ─── Init: proveri expiry pre svega ─── */
function clearLiveOrder() {
  localStorage.removeItem('castro-live-order');
  localStorage.removeItem('castro-live-order-expires-at');
  liveOrder = null;
  const pill = document.getElementById('orderStatusPill');
  if (pill) pill.style.display = 'none';
}

function scheduleCompletionClear() {
  const expiresAt = Number(localStorage.getItem('castro-live-order-expires-at') || 0) || (Date.now() + 5 * 60 * 1000);
  localStorage.setItem('castro-live-order-expires-at', String(expiresAt));
  const delay = Math.max(0, expiresAt - Date.now());
  if (delay > 0) {
    setTimeout(clearLiveOrder, delay);
  } else {
    clearLiveOrder();
  }
}

(function checkExpiry() {
  if (!liveOrder) return;
  const expiresAt = Number(localStorage.getItem('castro-live-order-expires-at') || 0);
  if (liveOrder.status === 'completed') {
    if (!expiresAt) {
      scheduleCompletionClear();
      return;
    }
    if (Date.now() > expiresAt) {
      clearLiveOrder();
    } else {
      scheduleCompletionClear();
    }
    return;
  }
  if (expiresAt && Date.now() > expiresAt) {
    clearLiveOrder();
  }
})();

cart.render();

fetch("/api/menu-availability")
  .then((res) => res.json())
  .then((data) => renderAvailability(data.menuAvailability || {}));

socket.on("menu:availability", (payload) => {
  renderAvailability(payload.menuAvailability || {});
});

// Ako korisnik vrati stranicu a ima aktivan order — prikaži pill odmah
if (liveOrder?.orderId && liveOrder?.customerToken) {
  socket.emit("order:subscribe", liveOrder);
  // Obnovi prikaz pilla sa poslednjim poznatim statusom
  const lastStatus = liveOrder.status || 'pending';
  const statusMap = {
    pending: '⏳ Čeka se potvrda',
    accepted: '✅ Prihvaćena',
    preparing: '👨‍🍳 U pripremi',
    ready: '🟢 Spremna!',
    completed: '✓ Završena',
    rejected: '❌ Odbijena',
    missed: '⚠️ Propuštena',
  };
  const displayStatus = statusMap[lastStatus] || '⏳ Čeka se potvrda';
  updateCustomerStatus(`Vraćen na praćenje porudžbine ${liveOrder.orderId}. Status: ${displayStatus}`);
}

socket.on("order:notification", ({ order, message }) => {
  if (liveOrder) {
    Object.assign(liveOrder, order);
    localStorage.setItem("castro-live-order", JSON.stringify(liveOrder));
  }
  updateCustomerStatus(`${message} (${order.id})`);
  if (order.status === "completed") {
    scheduleCompletionClear();
  }
  if (order.status === "rejected" || order.status === "missed") {
    clearLiveOrder();
  }
});

if (liveOrder?.orderId && liveOrder?.customerToken) {
  fetch(`/api/track/${encodeURIComponent(liveOrder.orderId)}?token=${encodeURIComponent(liveOrder.customerToken)}`)
    .then(res => {
      if (!res.ok) throw new Error("Order not found");
      return res.json();
    })
    .then(data => {
      if (data.order) {
        Object.assign(liveOrder, data.order);
        localStorage.setItem("castro-live-order", JSON.stringify(liveOrder));
      }
    }).catch(e => {
      console.error(e);
      localStorage.removeItem("castro-live-order");
      localStorage.removeItem("castro-live-order-expires-at");
      liveOrder = null;
      const pill = document.getElementById('orderStatusPill');
      if (pill) pill.style.display = 'none';
    });
}

function updateTimer() {
  const timerEl = document.getElementById('odpTimer');
  const timerVal = document.getElementById('odpTimerVal');
  if (!liveOrder || !liveOrder.acceptedAt || !liveOrder.prepMinutes || 
      liveOrder.status === 'completed' || liveOrder.status === 'rejected' || 
      liveOrder.status === 'missed' || liveOrder.status === 'ready') {
    if (timerEl) timerEl.style.display = 'none';
    return;
  }
  
  if (timerEl) timerEl.style.display = 'flex';
  
  const acceptedTime = new Date(liveOrder.acceptedAt).getTime();
  const targetTime = acceptedTime + liveOrder.prepMinutes * 60000;
  const now = Date.now();
  
  let diff = targetTime - now;
  if (diff < 0) diff = 0;
  
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  
  if (timerVal) {
    timerVal.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}
setInterval(updateTimer, 1000);

if (phoneInputEl) {
  phoneInputEl.addEventListener("focus", () => {
    if (!phoneInputEl.value.trim()) {
      phoneInputEl.value = "+381";
    }
  });
}



/* ═════════════════════════════════════════
   DORUČAK — Beograd timezone cutoff u 13:00
═════════════════════════════════════════ */
function isBreakfastOpen() {
  // Beograd = Europe/Belgrade = UTC+1 zimi, UTC+2 leti
  const now = new Date();
  const belgradeTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Belgrade' }));
  const h = belgradeTime.getHours();
  const m = belgradeTime.getMinutes();
  return h < 13 || (h === 13 && m === 0);
}

function applyBreakfastCutoff() {
  const open = isBreakfastOpen();
  const banner = document.getElementById('dorucakUnavailableBanner');
  if (banner) banner.style.display = open ? 'none' : 'flex';

  document.querySelectorAll('.item--breakfast-only').forEach(el => {
    el.classList.toggle('item--breakfast-closed', !open);
    // ako je zatvoreno, označi kao nedostupno za cart.add
    if (!open) el.classList.add('item--unavailable');
    else el.classList.remove('item--unavailable');
  });
}

// Primeni odmah pri učitavanju
applyBreakfastCutoff();

// Re-proveri svakih 60s (za slučaj da je stranica otvorena pre i posle 13:00)
setInterval(applyBreakfastCutoff, 60000);

/* ═════════════════════════════════════════
   ORDER TRACKING PERSISTENCE (po ulasku/izlasku)
═════════════════════════════════════════ */
// Proveri expiry pri učitavanju
function renderItemControls() {
  document.querySelectorAll('.item').forEach(itemEl => {
    if (itemEl.classList.contains('item--unavailable')) return;
    const name = itemEl.dataset.name;
    const hasSizes = !!itemEl.dataset.sizes;
    const rightEl = itemEl.querySelector('.item__right');
    if (!rightEl) return;

    if (hasSizes) {
      // Pice sa velicinama — pokazi ukupan broj u korpi kao badge
      const totalQty = cart.items.reduce((sum, item) => {
        // Ako je baseName isti, brojimo u total (Pizze)
        if (item.baseName === name) return sum + item.qty;
        // Ako se ime tačno poklapa, brojimo u total
        if (item.name === name) return sum + item.qty;
        // Ako je item nastao od ovog jela (npr palačinka + pohovanje)
        if (item.name.startsWith(name + " (")) return sum + item.qty;
        return sum;
      }, 0);
      
      let badge = rightEl.querySelector('.item-size-badge');
      if (totalQty > 0) {
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'item-size-badge';
          rightEl.appendChild(badge);
        }
        badge.textContent = totalQty + '×';
      } else if (badge) {
        badge.remove();
      }
      
      // Inline kontrola ne radi za stavke sa dodacima, pa ih tretiramo kao `data-sizes` (značka umesto +/-)
    } else {
      // Obicne stavke — inline qty ctrl
      const cartItem = cart.items.find(i => (i.id === name || i.name === name) && (!i.addons || i.addons.length === 0));
      const addBtn = rightEl.querySelector('.add-btn');
      let qtyCtrl = rightEl.querySelector('.item-qty-ctrl');

      if (cartItem && cartItem.qty > 0) {
        if (addBtn) addBtn.style.display = 'none';
        if (qtyCtrl) {
          qtyCtrl.querySelector('.item-qty-num').textContent = cartItem.qty;
        } else {
          qtyCtrl = document.createElement('div');
          qtyCtrl.className = 'item-qty-ctrl';
          qtyCtrl.dataset.itemName = name;
          qtyCtrl.innerHTML = `
            <button class="item-qty-btn" data-action="dec" data-name="${name.replace(/"/g, '&quot;')}">−</button>
            <span class="item-qty-num">${cartItem.qty}</span>
            <button class="item-qty-btn" data-action="inc" data-name="${name.replace(/"/g, '&quot;')}">+</button>
          `;
          rightEl.appendChild(qtyCtrl);
        }
      } else {
        if (qtyCtrl) qtyCtrl.remove();
        if (addBtn) addBtn.style.display = '';
      }
    }
  });
}

// Event delegation za item qty btn-ove
document.addEventListener('click', e => {
  const btn = e.target.closest('.item-qty-btn');
  if (!btn) return;
  const name = btn.dataset.name;
  if (!name) return;
  if (btn.dataset.action === 'inc') cart.inc(name);
  else cart.dec(name);
});

/* ─── Size Picker za pice ─── */
let _sizePickerItem = null;

function openSizePicker(itemEl, needsAddons = null) {
  _sizePickerItem = itemEl;
  _sizePickerNeedsAddons = needsAddons;
  const name = itemEl.dataset.name;
  const sizesRaw = itemEl.dataset.sizes; // format: "22:410|30:830|50:1350"
  const sizes = sizesRaw.split('|').map(s => {
    const [cm, price] = s.split(':');
    return { cm, price: parseInt(price) };
  });

  document.getElementById('sizePickerTitle').textContent = name;
  const optsEl = document.getElementById('sizePickerOpts');
  optsEl.innerHTML = sizes.map(s => {
    const isNumberOnly = /^\d+$/.test(s.cm);
    const displayName = isNumberOnly ? `⌀ ${s.cm} cm` : s.cm;
    return `
    <button class="size-opt" data-cm="${s.cm}" data-price="${s.price}">
      <span class="size-opt__cm">${displayName}</span>
      <span class="size-opt__price">${s.price.toLocaleString('sr-Latn')} RSD</span>
    </button>
  `}).join('');

  optsEl.querySelectorAll('.size-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      addWithSize(_sizePickerItem, btn.dataset.cm, parseInt(btn.dataset.price));
    });
  });

  document.getElementById('sizePickerOverlay').classList.add('open');
  document.getElementById('sizePicker').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('checkoutFab')?.classList.add('temp-hidden');
}

function closeSizePicker() {
  document.getElementById('sizePickerOverlay').classList.remove('open');
  document.getElementById('sizePicker').classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('checkoutFab')?.classList.remove('temp-hidden');
  _sizePickerItem = null;
}

function addWithSize(itemEl, cm, price) {
  const baseName = itemEl.dataset.name;
  const isNumberOnly = /^\d+$/.test(cm);
  const suffix = isNumberOnly ? `${cm}cm` : cm;
  const sizeName = `${baseName} (${suffix})`;
  
  closeSizePicker();

  if (_sizePickerNeedsAddons) {
    openAddonPicker(itemEl, sizeName, price, _sizePickerNeedsAddons);
  } else {
    cart.addItem(sizeName, price, []);
  }
}

// ==========================================
// ADDON PICKER LOGIC
// ==========================================

let _addonPickerItem = null;
let _addonPickerBaseName = "";
let _addonPickerBasePrice = 0;
let _addonPickerType = "";
let currentAddons = {}; // { name: { qty, price } }

function getAddonsForType(type) {
  const isSweet = type === 'slatki';
  const headerText = isSweet ? 'Slatki dodaci' : 'Slani dodaci i prilozi';
  const group = Array.from(document.querySelectorAll('#dodaci .item-group')).find(g => {
    const h3 = g.querySelector('h3');
    return h3 && h3.textContent.includes(headerText);
  });
  let items = [];
  if (group) {
    items = Array.from(group.querySelectorAll('.item')).map(el => ({
      name: el.dataset.name.replace(/ \d+g$| \d+ kom\.$/, ''), // Ukloni gramažu zbog lepšeg prikaza
      price: parseInt(el.dataset.price)
    }));
  }
  if (!isSweet) {
    const free = ['Kečap', 'Majonez', 'Senf', 'Čili', 'Tabasco', 'Balsamico', 'Maslinovo ulje', 'Vinsko sirće'];
    free.forEach(f => items.push({ name: f, price: 0 }));
  }
  return items;
}

function openAddonPicker(itemEl, baseName, basePrice, type) {
  _addonPickerItem = itemEl;
  _addonPickerBaseName = baseName;
  _addonPickerBasePrice = basePrice;
  _addonPickerType = type;
  currentAddons = {};

  const addonsList = getAddonsForType(type);

  document.getElementById('addonPickerTitle').textContent = "Dodaci: " + baseName;
  document.getElementById('addonPickerDesc').textContent = "Možete izabrati do 4 različita dodatka.";

  const optsEl = document.getElementById('addonPickerOpts');
  optsEl.innerHTML = addonsList.map(a => `
    <div class="addon-opt" data-name="${a.name}" data-price="${a.price}">
      <div class="addon-opt__info">
        <span class="addon-opt__name">${a.name}</span>
        <span class="addon-opt__price">${a.price === 0 ? 'Besplatno' : '+ ' + a.price + ' RSD'}</span>
      </div>
      <div class="addon-opt__ctrl">
        <button onclick="updateAddonQty('${a.name}', -1)">−</button>
        <span id="addon-qty-${a.name.replace(/[^a-zA-Z0-9]/g, '')}">0</span>
        <button onclick="updateAddonQty('${a.name}', 1)">+</button>
      </div>
    </div>
  `).join('');

  document.getElementById('addonPickerOverlay').classList.add('open');
  document.getElementById('addonPicker').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('checkoutFab')?.classList.add('temp-hidden');
}

function closeAddonPicker() {
  document.getElementById('addonPickerOverlay').classList.remove('open');
  document.getElementById('addonPicker').classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('checkoutFab')?.classList.remove('temp-hidden');
  _addonPickerItem = null;
}

function updateAddonQty(name, delta) {
  const safeId = name.replace(/[^a-zA-Z0-9]/g, '');
  const el = document.getElementById('addon-qty-' + safeId);
  const optEl = document.querySelector(`.addon-opt[data-name="${name}"]`);
  const price = parseInt(optEl.dataset.price);
  
  if (!currentAddons[name]) currentAddons[name] = { qty: 0, price };
  
  let newQty = currentAddons[name].qty + delta;
  if (newQty < 0) newQty = 0;
  
  // Pravila
  const isFree = price === 0;
  if (isFree && newQty > 1) {
    alert("Besplatni dodaci mogu se dodati najviše 1 put.");
    return;
  }
  if (!isFree && newQty > 2) {
    alert("Isti dodatak možete dodati najviše 2 puta.");
    return;
  }

  // Max 4 različita dodatka ukupno
  const selectedTypes = Object.keys(currentAddons).filter(k => (k === name ? newQty : currentAddons[k].qty) > 0);
  if (selectedTypes.length > 4) {
    alert("Možete izabrati maksimalno 4 različita dodatka po jelu.");
    return;
  }

  currentAddons[name].qty = newQty;
  el.textContent = newQty;
}

function confirmAddonsAndAdd() {
  const addonsArr = [];
  for (const name in currentAddons) {
    if (currentAddons[name].qty > 0) {
      addonsArr.push({ name, price: currentAddons[name].price, qty: currentAddons[name].qty });
    }
  }
  cart.addItem(_addonPickerBaseName, _addonPickerBasePrice, addonsArr);
  closeAddonPicker();
}



document.getElementById('sizePickerOverlay')?.addEventListener('click', closeSizePicker);
document.getElementById('sizePickerClose')?.addEventListener('click', closeSizePicker);
