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
    const isSweetPancake = catId === 'palacinka' && (
      el.dataset.name.includes("Palačinka —") || 
      el.closest('.item-group')?.querySelector('.group-label')?.textContent.includes("Slatke")
    );
    const type = isSweetPancake ? 'slatki' : 'slani';
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
          const lang = localStorage.getItem('castro-lang') || 'sr';
          alert(lang === 'en' ? 'You can order a maximum of 2 of the same add-ons separately.' : 'Možete poručiti maksimalno 2 ista dodatka zasebno.');
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
         if (document.getElementById('dodaci') && dodatakEl && item.qty >= 2) {
            const lang = localStorage.getItem('castro-lang') || 'sr';
            alert(lang === 'en' ? 'You can order a maximum of 2 of the same add-ons separately.' : 'Možete poručiti maksimalno 2 ista dodatka zasebno.');
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
          const addonTexts = item.addons.map(a => {
            const transName = (typeof addonTranslations !== 'undefined' && localStorage.getItem('castro-lang') === 'en' && addonTranslations[a.name]) ? addonTranslations[a.name] : a.name;
            return `${transName}${a.qty > 1 ? ' x' + a.qty : ''}`;
          });
          addonsHtml = `<div class="cart-item__addons" style="font-size:12px;color:#aaa;margin-top:2px;">+ ${addonTexts.join(', ')}</div>`;
        }

        const displayName = typeof translateItemName === 'function' ? translateItemName(item.name) : item.name;

        const row = document.createElement('div');
        row.className = 'cart-item';
        row.innerHTML = `
          <div style="flex:1;display:flex;flex-direction:column;justify-content:center;">
            <div class="cart-item__name">${displayName}</div>
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
const sections = document.querySelectorAll('.cat[id], #happyhour');
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
  return true;
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
  const lang = localStorage.getItem('castro-lang') || 'sr';

  document.getElementById('addonPickerTitle').textContent = lang === 'en' ? "Add-ons: " + (typeof translateItemName === 'function' ? translateItemName(baseName) : baseName) : "Dodaci: " + baseName;
  document.getElementById('addonPickerDesc').textContent = lang === 'en' ? "You can choose up to 4 different add-ons." : "Možete izabrati do 4 različita dodatka.";

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
  const lang = localStorage.getItem('castro-lang') || 'sr';
  if (isFree && newQty > 1) {
    alert(lang === 'en' ? "Free add-ons can be added at most 1 time." : "Besplatni dodaci mogu se dodati najviše 1 put.");
    return;
  }
  if (!isFree && newQty > 2) {
    alert(lang === 'en' ? "The same add-on can be added at most 2 times." : "Isti dodatak možete dodati najviše 2 puta.");
    return;
  }

  // Max 4 različita dodatka ukupno
  const selectedTypes = Object.keys(currentAddons).filter(k => (k === name ? newQty : currentAddons[k].qty) > 0);
  if (selectedTypes.length > 4) {
    alert(lang === 'en' ? "You can choose a maximum of 4 different add-ons per dish." : "Možete izabrati maksimalno 4 različita dodatka po jelu.");
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

/* ═════════════════════════════════════════
   HAPPY HOUR — Beograd timezone availability and popup
   ═════════════════════════════════════════ */
function checkHappyHour() {
  const now = new Date();
  const belgradeTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Belgrade' }));
  const day = belgradeTime.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const h = belgradeTime.getHours();
  const m = belgradeTime.getMinutes();
  
  let isAvailable = false;
  if (day >= 1 && day <= 5) {
    // Pon-Pet: 07:00 - 10:00
    isAvailable = h >= 7 && (h < 10 || (h === 10 && m === 0));
  } else {
    // Sub-Ned: 07:00 - 12:00
    isAvailable = h >= 7 && (h < 12 || (h === 12 && m === 0));
  }
  
  const hhAvailText = document.getElementById('hhAvailText');
  const hhInlineDot = document.getElementById('hhInlineDot');
  const hhSlideupAvail = document.getElementById('hhSlideupAvail');
  const hhFab = document.getElementById('hhFab');
  
  if (isAvailable) {
    if (hhAvailText) {
      hhAvailText.textContent = 'Happy Hour';
      hhAvailText.style.color = '#2EC4B6';
    }
    if (hhInlineDot) hhInlineDot.className = 'hh-inline-promo__dot available';
    if (hhSlideupAvail) {
      hhSlideupAvail.className = 'hh-slideup__avail available';
      hhSlideupAvail.textContent = 'Dostupno sada';
    }
  } else {
    if (hhAvailText) {
      hhAvailText.textContent = 'Happy Hour je završen';
      hhAvailText.style.color = '#E63946';
    }
    if (hhInlineDot) hhInlineDot.className = 'hh-inline-promo__dot unavailable';
    if (hhSlideupAvail) {
      hhSlideupAvail.className = 'hh-slideup__avail unavailable';
      hhSlideupAvail.textContent = 'Nedostupno';
    }
  }
  
  // FAB should always be visible so users can open details
  if (hhFab) {
    hhFab.classList.add('visible');
  }
}

function openHhSlideup() {
  document.getElementById('hhSlideupOverlay')?.classList.add('open');
  document.getElementById('hhSlideup')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeHhSlideup() {
  document.getElementById('hhSlideupOverlay')?.classList.remove('open');
  document.getElementById('hhSlideup')?.classList.remove('open');
  document.body.style.overflow = '';
}

// Event listeners
document.getElementById('hhFab')?.addEventListener('click', openHhSlideup);
document.getElementById('hhSlideupClose')?.addEventListener('click', closeHhSlideup);
document.getElementById('hhSlideupOverlay')?.addEventListener('click', closeHhSlideup);

document.getElementById('hhSlideupCta')?.addEventListener('click', (e) => {
  closeHhSlideup();
  const target = document.getElementById('happyhour');
  if (target) {
    e.preventDefault();
    const offset = target.getBoundingClientRect().top + window.scrollY - getStickyOffset();
    window.scrollTo({ top: offset, behavior: 'smooth' });
  }
});

// Run immediately and check every 60 seconds
checkHappyHour();
setInterval(checkHappyHour, 60000);
window.addEventListener('langchange', checkHappyHour);

/* ═════════════════════════════════════════
   BILINGUAL TRANSLATION LOGIC FOR THE MENU
   ═════════════════════════════════════════ */

const itemTranslations = {
  // Pizze
  "Margarita": "Margarita",
  "Vesuvio": "Vesuvio",
  "Capricccosa": "Capricciosa",
  "Primavera": "Primavera",
  "Chilli": "Chilli",
  "Fortuna": "Fortuna",
  "Hawaii": "Hawaii",
  "Porto": "Porto",
  "Posna pica": "Lenten Pizza (Vegan)",
  "Posna": "Lenten (Vegan)",
  "Mexicana": "Mexicana",
  "Cardinale": "Cardinale",
  "Quatro Stagione": "Quattro Stagioni",
  "Carpie": "Carpie",
  "Diavola": "Diavola",
  "Pizza auf Kubanisch": "Cuban Style Pizza",
  "Napolitana": "Napoletana",
  "Castro pica": "Castro Special Pizza",
  "Castro": "Castro Special",
  "Quatro Formaggi": "Quattro Formaggi",
  "Piccante": "Piccante",
  "Srpska Pica": "Serbian Pizza",
  "Chicken Pizza": "Chicken Pizza",

  // Doručak
  "Jaja na oko (3 kom.) sa slaninom": "Fried eggs (3 pcs) with bacon",
  "Kajgana sa šunkom (3 jaja)": "Scrambled eggs with ham (3 eggs)",
  "Kajgana sa povrćem": "Scrambled eggs with vegetables",
  "Castro doručak (3 jaja, kobasica, sir, namaz)": "Castro Breakfast (3 eggs, sausage, cheese, spread)",
  "Prženice sa sirom i namazom": "French toast with cheese and spread",

  // Obroci / Piletina
  "Grilovani pileći file 250g": "Grilled chicken fillet 250g",
  "Pohovani pileći štapići sa susamom 250g": "Fried chicken strips with sesame 250g",
  "Piletina u kornfleksu 250g": "Cornflake crusted chicken 250g",
  "Piletina u sosu od pečuraka 250g": "Chicken in mushroom sauce 250g",
  "Piletina u sosu od 4 vrste sira 250g": "Chicken in 4 cheese sauce 250g",
  "Piletina gorgonzola 250g": "Chicken gorgonzola 250g",
  "Karađorđeva šnicla (svinjska/pileća)": "Karadjordjeva schnitzel (pork/chicken)",
  "Pohovani kačkavalj 200g": "Fried yellow cheese 200g",
  "Pomfrit 200g": "French fries 200g",
  "Začinjeni krompirići 200g": "Seasoned potato wedges 200g",

  // Palačinke
  "Palačinka sa džemom": "Crepe with jam",
  "Palačinka sa eurokremom": "Crepe with Eurocrem",
  "Palačinka sa nutelom": "Crepe with Nutella",
  "Palačinka slana (šunka, sir, pavlaka)": "Savory crepe (ham, cheese, sour cream)",
  "Palačinka Castro slana (pečenica, kulen, sir, kajmak)": "Castro savory crepe (smoked pork, kulen, cheese, kajmak)",

  // Paste
  "Spaghetti Bolognese": "Spaghetti Bolognese",
  "Spaghetti Carbonara": "Spaghetti Carbonara",
  "Penne Arrabbiata": "Penne Arrabbiata",
  "Tagliatelle sa piletinom i povrćem": "Tagliatelle with chicken and vegetables",
  "Tagliatelle sa šumskim pečurkama": "Tagliatelle with wild mushrooms",

  // Tortilje
  "Tortilja sa piletinom i povrćem": "Chicken and vegetable tortilla",
  "Tortilja sa svinjskim vratom i kajmakom": "Pork neck and kajmak tortilla",
  "Castro ljuta tortilja": "Castro spicy tortilla",

  // Salate
  "Cezar salata 350g": "Caesar salad 350g",
  "Grčka salata 350g": "Greek salad 350g",
  "Tuna salata 350g": "Tuna salad 350g",
  "Šopska salata 250g": "Sopska salad (traditional) 250g",
  "Sezonska salata": "Seasonal salad",

  // Sendviči
  "Sendvič sa šunkom": "Ham sandwich",
  "Sendvič sa pečenicom": "Smoked pork sandwich",
  "Sendvič sa kulenom": "Kulen (spicy sausage) sandwich",
  "Castro sendvič (suvi vrat, kajmak, kačkavalj)": "Castro sandwich (smoked pork neck, kajmak, cheese)",

  // Deserti
  "Tri leće": "Tres Leches (Three milks cake)",
  "Čokoladni sufle": "Chocolate soufflé",
  "Voćni kup": "Fruit cup",
  "Sladoled porcija (3 kugle)": "Ice cream portion (3 scoops)",

  // Čorbe
  "Domaća pileća čorba": "Homemade chicken soup",
  "Potaž dana": "Soup potage of the day"
};

const addonTranslations = {
  "Pavlaka 50g": "Sour cream 50g",
  "Urnebes 50g": "Urnebes 50g",
  "Tartar sos 50g": "Tartar sauce 50g",
  "Kajmak 40g": "Kajmak 40g",
  "Feta sir 50g": "Feta cheese 50g",
  "Pečurke u pavlaci 50g": "Creamy mushrooms 50g",
  "Ajvar 50g": "Ajvar 50g",
  "Masline 8 kom.": "Olives 8 pcs",
  "Feferoni 2 kom.": "Hot peppers 2 pcs",
  "Kiseli krastavac 50g": "Pickles 50g",
  "Šunka 30g": "Ham 30g",
  "Pečenica 30g": "Smoked pork 30g",
  "Kulen 30g": "Kulen 30g",
  "Pančeta 30g": "Pancetta 30g",
  "Pršuta 30g": "Prosciutto 30g",
  "Suvi vrat 30g": "Smoked pork neck 30g",
  "Viršla 1 kom.": "Sausage 1 pc",
  "Jaje 1 kom.": "Egg 1 pc",
  "Tunjevina 70g": "Tuna 70g",
  "Kukuruz 50g": "Corn 50g",
  "Čeri paradajz 4 kom.": "Cherry tomatoes 4 pcs",
  "Kečap": "Ketchup",
  "Majonez": "Mayonnaise",
  "Senf": "Mustard",
  "Čili": "Chili",
  "Tabasco": "Tabasco",
  "Balsamico": "Balsamic",
  "Maslinovo ulje": "Olive oil",
  "Vinsko sirće": "Wine vinegar",
  "Med ili džem 30g": "Honey or jam 30g",
  "Orasi 30g": "Walnuts 30g",
  "Eurokrem 40g": "Eurocrem 40g",
  "Nutela 40g": "Nutella 40g",
  "Lešnik, kikiriki ili Plazma 30g": "Hazelnut, peanut or Plazma 30g",
  "Puding 40g": "Pudding 40g",
  "Banana, ananas, kivi ili višnja 40g": "Banana, pineapple, kiwi or cherry 40g"
};

const ingredientTranslations = {
  "pelat": "tomato sauce",
  "kačkavalj": "cheese",
  "masline": "olives",
  "origano": "oregano",
  "šunka": "ham",
  "pečurke": "mushrooms",
  "šampinjoni": "mushrooms",
  "pečenica": "smoked pork loin",
  "čeri paradajz": "cherry tomatoes",
  "mleveno meso": "minced meat",
  "feferone": "hot peppers",
  "feferoni": "hot peppers",
  "slanina": "bacon",
  "jaje": "egg",
  "uprženo jaje": "fried egg",
  "kisela pavlaka": "sour cream",
  "pavlaka": "sour cream",
  "ananas": "pineapple",
  "susam": "sesame",
  "kulen": "kulen (spicy sausage)",
  "tunjevina": "tuna",
  "kukuruz": "corn",
  "suvi vrat": "smoked pork neck",
  "blago ljuti sos": "mild spicy sauce",
  "ljuti sos": "spicy sauce",
  "mozzarella": "mozzarella",
  "gorgonzola": "gorgonzola",
  "gauda": "gouda",
  "parmezan": "parmesan",
  "bosiljak": "basil",
  "kajmak": "kajmak",
  "feta sir": "feta cheese",
  "feta": "feta",
  "gril piletina": "grilled chicken",
  "grilovani pileći file": "grilled chicken file",
  "piletina": "chicken",
  "pomfrit": "french fries",
  "sos": "sauce",
  "tartar sos": "tartar sauce",
  "neutralna pavlaka": "heavy cream",
  "paprika": "pepper",
  "crni luk": "onion",
  "pančeta": "pancetta",
  "urnebes": "urnebes spread",
  "suvo vrat": "smoked pork neck",
  "kečap": "ketchup",
  "majonez": "mayonnaise",
  "zelena salata": "lettuce",
  "dresing": "dressing",
  "tost": "toast",
  "eurokrem": "eurocrem",
  "nutela": "nutella",
  "plazma": "plazma biscuit",
  "banana": "banana",
  "višnja": "cherry",
  "lešnik": "hazelnut",
  "kikiriki": "peanut",
  "džem": "jam",
  "šlag": "whipped cream",
  "čokoladni preliv": "chocolate syrup",
  "voće": "fruit",
  "sladoled": "ice cream",
  "med": "honey",
  "puter": "butter",
  "kiseli krastavci": "pickles",
  "kiseli krastavac": "pickles"
};

function translateIngredients(text) {
  if (!text) return "";
  return text.split(',').map(item => {
    const trimmed = item.trim().toLowerCase();
    const trans = ingredientTranslations[trimmed];
    if (trans) return trans;
    return trimmed;
  }).join(', ');
}

function translateItemName(fullName) {
  if (localStorage.getItem('castro-lang') !== 'en') return fullName;
  
  const match = fullName.match(/^([^(]+)\s*\(([^)]+)\)$/);
  if (match) {
    const baseName = match[1].trim();
    let sizeInfo = match[2].trim();
    
    if (sizeInfo === 'Porodična') sizeInfo = 'Family size';
    else if (sizeInfo === 'Standard') sizeInfo = 'Standard';
    else if (sizeInfo === 'Mini') sizeInfo = 'Mini';
    
    const translatedBase = itemTranslations[baseName] || baseName;
    return `${translatedBase} (${sizeInfo})`;
  }
  
  return itemTranslations[fullName] || fullName;
}

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

  // Translate menu items and their descriptions dynamically
  document.querySelectorAll('.item').forEach(el => {
    const nameSpan = el.querySelector('.item__name');
    if (!nameSpan) return;
    const descSpan = nameSpan.querySelector('.item__desc');
    
    const baseName = el.dataset.name;
    
    if (lang === 'en') {
      if (!nameSpan.dataset.srName) {
        nameSpan.dataset.srName = nameSpan.childNodes[0].textContent;
      }
      if (descSpan && !descSpan.dataset.srDesc) {
        descSpan.dataset.srDesc = descSpan.textContent;
      }
      
      nameSpan.childNodes[0].textContent = itemTranslations[baseName] || baseName;
      if (descSpan) {
        descSpan.textContent = translateIngredients(descSpan.dataset.srDesc);
      }
    } else {
      if (nameSpan.dataset.srName) {
        nameSpan.childNodes[0].textContent = nameSpan.dataset.srName;
      }
      if (descSpan && descSpan.dataset.srDesc) {
        descSpan.textContent = descSpan.dataset.srDesc;
      }
    }
  });

  // Re-render cart with translated names
  if (typeof cart !== 'undefined' && typeof cart.render === 'function') {
    cart.render();
  }

  // Fire event for dynamic elements to update
  window.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

// Initial set
document.addEventListener('DOMContentLoaded', () => {
  const savedLang = localStorage.getItem('castro-lang') || 'sr';
  setLanguage(savedLang);
});

