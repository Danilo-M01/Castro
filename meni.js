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
  
  const isEn = localStorage.getItem('castro-lang') === 'en';
  
  if (isAvailable) {
    if (hhAvailText) {
      hhAvailText.textContent = 'Happy Hour';
      hhAvailText.style.color = '#2EC4B6';
    }
    if (hhInlineDot) hhInlineDot.className = 'hh-inline-promo__dot available';
    if (hhSlideupAvail) {
      hhSlideupAvail.className = 'hh-slideup__avail available';
      hhSlideupAvail.textContent = isEn ? 'Available now' : 'Dostupno sada';
    }
  } else {
    if (hhAvailText) {
      hhAvailText.textContent = isEn ? 'Happy Hour has ended' : 'Happy Hour je završen';
      hhAvailText.style.color = '#E63946';
    }
    if (hhInlineDot) hhInlineDot.className = 'hh-inline-promo__dot unavailable';
    if (hhSlideupAvail) {
      hhSlideupAvail.className = 'hh-slideup__avail unavailable';
      hhSlideupAvail.textContent = isEn ? 'Unavailable' : 'Nedostupno';
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
  "Posna pica": "Lenten Pizza",
  "Posna": "Lenten",
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

  // Missing pizzas & specialties
  "Margarita punjene ivice": "Margarita Stuffed Crust",
  "Vesuvio punjene ivice": "Vesuvio Stuffed Crust",
  "Cardinale punjene ivice": "Cardinale Stuffed Crust",
  "Capricciosa mozzarella": "Capricciosa Mozzarella",
  "Diavola mozzarella": "Diavola Mozzarella",
  "Napolitana mozzarella": "Napoletana Mozzarella",
  "Pizza sa nutelom": "Nutella Pizza",
  "Pizza sa Nutelom": "Nutella Pizza",
  "Couple Goals pancake": "Couple Goals Pancake",
  "Palačinka rolo čoko fantazija": "Rolled Chocolate Fantasy Crepe",
  "Calcona (presavijena pica)": "Calzone (Folded Pizza)",
  "Calcona (presavijena pizza)": "Calzone (Folded Pizza)",
  "Italijanska piroška": "Italian Pirogue",
  "Mini italijanska piroška": "Mini Italian Pirogue",
  "Mini Castro piroška": "Mini Castro Pirogue",
  "Minjon (Piroška)": "Mignon (Pirogue)",
  "Rolovana tortilja 1": "Rolled Tortilla 1",
  "Rolovana tortilja 2": "Rolled Tortilla 2",
  "Tortilja a la Castro": "Castro Tortilla",
  "Posni Brusketi": "Lenten Bruschetta",
  "Castro Brusketi": "Castro Bruschetta",
  "Somun, ( 150g ) / Tost hleb": "Flatbread (Somun, 150g) / Toast bread",
  "Hleb štapići, tost hleb (3 komada)": "Breadsticks, toast bread (3 pieces)",

  // Crepes / Palačinke
  "Slana palačinka 1": "Savory Crepe 1",
  "Slana palačinka 2": "Savory Crepe 2",
  "Slana palačinka 3": "Savory Crepe 3",
  "Slana palačinka 4": "Savory Crepe 4",
  "Slana palačinka 5": "Savory Crepe 5",
  "Slana palačinka 6": "Savory Crepe 6",
  "Slana palačinka 7": "Savory Crepe 7",
  "Slana palačinka 8": "Savory Crepe 8",
  "Slana palačinka 9": "Savory Crepe 9",
  "Slana palačinka 10": "Savory Crepe 10",
  "Slana palačinka 11": "Savory Crepe 11",
  "Slana palačinka 12": "Savory Crepe 12",
  "Slana palačinka 13": "Savory Crepe 13",
  "Castro slana palačinka": "Castro Savory Crepe",
  "Castro rolovana palačinka": "Castro Rolled Crepe",
  "Mini pohovane palačinke": "Mini Fried Crepes (6 pcs)",
  "Pohovanje palačinki": "Frying of crepes",

  "Slatka palačinka 1": "Sweet Crepe 1",
  "Slatka palačinka 2": "Sweet Crepe 2",
  "Slatka palačinka 3": "Sweet Crepe 3",
  "Slatka palačinka 4": "Sweet Crepe 4",
  "Slatka palačinka 5": "Sweet Crepe 5",
  "Slatka palačinka 6": "Sweet Crepe 6",
  "Slatka palačinka 7": "Sweet Crepe 7",
  "Slatka palačinka 8": "Sweet Crepe 8",
  "Slatka palačinka 9": "Sweet Crepe 9",
  "Slatka palačinka 10": "Sweet Crepe 10",
  "Slatka palačinka 11": "Sweet Crepe 11",
  "Slatka palačinka 12": "Sweet Crepe 12",
  "Slatka palačinka 13": "Sweet Crepe 13",
  "Slatka palačinka 14": "Sweet Crepe 14",
  "Slatka palačinka 15": "Sweet Crepe 15",
  "Castro slatka palačinka": "Castro Sweet Crepe",
  "Čipi-činka": "Cipi-crepe",
  "Slatka hladna palačinka 1": "Sweet Cold Crepe 1",
  "Slatka hladna palačinka 2": "Sweet Cold Crepe 2",
  "Slatka hladna palačinka 3": "Sweet Cold Crepe 3",
  "Castro hladna palačinka": "Castro Cold Crepe",
  "Banana split": "Banana Split",
  "Voćna salata": "Fruit Salad",
  "Lava kolač": "Lava Cake",
  "Sladoled (kugla)": "Ice Cream (scoop)",
  "Meksiko kup": "Mexico Cup",
  "Tomato čorba": "Tomato Soup",
  "Potaž od pečurke": "Mushroom Soup",
  "Cezar salata": "Caesar Salad",
  "Biftek salata": "Beef Tenderloin Salad",
  "Castro salata": "Castro Salad",
  "Grčka salata": "Greek Salad",
  "Tuna salata (posno)": "Tuna Salad (Lenten)",
  "Calamari (lignje) salata": "Calamari Salad",
  "Mozzarela salata": "Mozzarella Salad",
  "Mix mini salata": "Mix Mini Salad",
  "Castro kari sendvič (zapečeni)": "Castro Curry Sandwich (Baked)",

  // Drinks / Pića
  "Espresso": "Espresso",
  "Espresso sa mlekom": "Espresso with milk",
  "Espresso Cappuccino": "Espresso Cappuccino",
  "Nescafe Classic (topli ili hladni)": "Nescafe Classic (hot or cold)",
  "Nes cappuccino": "Nes Cappuccino",
  "Topla Čokolada (crna ili bela)": "Hot Chocolate (dark or white)",
  "Frappe Shake (jagoda ili vanila)": "Frappe Shake (strawberry or vanilla)",
  "Plazma Shake": "Plazma Shake",
  "Oreo Shake": "Oreo Shake",
  "Kafa - domaća": "Domestic coffee",
  "Čaj Milford (razni ukusi)": "Milford Tea (various flavors)",
  "Medić (12g)": "Honey (12g)",
  "Mleko 0,2 (toplo ili hladno)": "Milk 0.2l (hot or cold)",
  "Sladoled (kugla 40g)": "Ice cream (40g scoop)",
  "Šlag": "Whipped cream",
  "Pepsi Cola 0,25": "Pepsi Cola 0.25l",
  "Pepsi Max 0,25": "Pepsi Max 0.25l",
  "7up 0,25": "7up 0.25l",
  "Mirinda 0,25": "Mirinda 0.25l",
  "Evervess 0,25 (tonic - bitter)": "Evervess 0.25l (tonic - bitter)",
  "Ivi sok 0,33 (breskva)": "Ivi Juice 0.33l (peach)",
  "Knjaz sa limunom 0,33": "Knjaz sparkling water with lemon 0.33l",
  "Knjaz sa narandžom 0,33": "Knjaz sparkling water with orange 0.33l",
  "Knjaz remix 0,33": "Knjaz Remix 0.33l",
  "Knjaz Miloš 0,25": "Knjaz Milos sparkling water 0.25l",
  "Knjaz Miloš 0,75": "Knjaz Milos sparkling water 0.75l",
  "Cockta 0,275": "Cockta 0.275l",
  "Orangina 0,25": "Orangina 0.25l",
  "Limona 0,25": "Limona 0.25l",
  "Aqua Viva voda 0,33": "Aqua Viva still water 0.33l",
  "Aqua Viva voda 0,75": "Aqua Viva still water 0.75l",
  "Cube sok 0,2 (razni ukusi)": "Cube Juice 0.2l (various flavors)",
  "Lipton (Ledeni Čaj) 0,33": "Lipton Ice Tea 0.33l",
  "Bravo sok 0,2 (grožđe, višnja)": "Bravo Juice 0.2l (grape, cherry)",
  "Cedevita 0,25": "Cedevita 0.25l",
  "Ceđeni limun 0,3": "Squeezed lemon 0.3l",
  "Ceđena pomorandža 0,25": "Squeezed orange 0.25l",
  "Ceđeni grejp 0,25": "Squeezed grapefruit 0.25l",
  "Ceđeni mix 1 (limun, narandža) 0,3": "Fresh Mix 1 (lemon, orange) 0.3l",
  "Ceđeni mix 2 (grejp, narandža) 0,3": "Fresh Mix 2 (grapefruit, orange) 0.3l",
  "Ceđeni mix 3 (limun, narandža, grejp) 0,3": "Fresh Mix 3 (lemon, orange, grapefruit) 0.3l",
  "Aloe Vera 0,24": "Aloe Vera 0.24l",
  "Guarana 0,25": "Guarana 0.25l",
  "Red Bull 0,25": "Red Bull 0.25l",
  "Carlsberg (točeno) 0,3": "Carlsberg (draft) 0.3l",
  "Carlsberg (točeno) 0,5": "Carlsberg (draft) 0.5l",
  "Erdinger 0,33": "Erdinger 0.33l",
  "San Miguel 0,33": "San Miguel 0.33l",
  "Budweiser 0,33 (svetlo/tamno)": "Budweiser 0.33l (light/dark)",
  "Carlsberg 0,25": "Carlsberg 0.25l",
  "Kronenbourg blanc 0,33": "Kronenbourg Blanc 0.33l",
  "Tuborg 0,33": "Tuborg 0.33l",
  "Lav premium 0,33": "Lav Premium 0.33l",
  "Somersby jabuka 0,33": "Somersby apple 0.33l",
  "Somersby kruška 0,33": "Somersby pear 0.33l",
  "Somersby borovnica 0,33": "Somersby blueberry 0.33l",
  "Somersby mango 0,33": "Somersby mango 0.33l",
  "Somersby malina 0,33": "Somersby raspberry 0.33l",
  "Somersby jagoda 0,33 0% alk.": "Somersby strawberry 0.33l 0% alc.",
  "Somersby zova 0,33 0% alk.": "Somersby elderflower 0.33l 0% alc.",
  "Chardonay Plantaže 0,187": "Chardonnay Plantaze 0.187l",
  "Rose Plantaže 0,187": "Rose Plantaze 0.187l",
  "Vranac Plantaže 0,187": "Vranac Plantaze 0.187l",
  "Buteljka vina 0,7 Tikveš": "Wine bottle 0.7l Tikves",
  "Buteljka vina 0,7 Radovanović": "Wine bottle 0.7l Radovanovic",
  "Curvoisier 0,03": "Courvoisier 0.03l",
  "Napoleon 0,03": "Napoleon 0.03l",
  "Stock 0,03": "Stock 0.03l",
  "Vinjak 0,03": "Vinjak 0.03l",
  "Bailey's 0,03l": "Bailey's 0.03l",
  "Meduška 0,03l": "Meduska honey liqueur 0.03l",
  "Šljivovica 0,03l": "Sljivovica plum brandy 0.03l",
  "Kajsijevača 0,03l": "Kajsijevaca apricot brandy 0.03l",
  "Dunjevača 0,03l": "Dunjevaca quince brandy 0.03l",
  "Lozovača 0,03l": "Lozovaca grape brandy 0.03l",
  "Viljamovka 0,03l": "Viljamovka pear brandy 0.03l",
  "Žuta osa 0,03l": "Zuta Osa premium plum brandy 0.03l",
  "Bacardi 0,03l": "Bacardi 0.03l",
  "Jagermeister 0,03l": "Jagermeister 0.03l",
  "Tequila 0,03l": "Tequila 0.03l",
  "Havana Club 0,05l": "Havana Club 0.05l",
  "Martini Bianco 0,05l": "Martini Bianco 0.05l",
  "Gorki List 0,05l": "Gorki List bitter liqueur 0.05l",
  "Vermouth 0,05l": "Vermouth 0.05l",
  "Gin Beefeater 0,03l": "Gin Beefeater 0.03l",
  "Smirnoff 0,03l": "Smirnoff vodka 0.03l",
  "Vodka Baltik 0,03l": "Vodka Baltik 0.03l",
  "Chivas Regal 0,03l": "Chivas Regal 0.03l",
  "Johnnie Walker Black 0,03l": "Johnnie Walker Black 0.03l",
  "Jack Daniels 0,03l": "Jack Daniels 0.03l",
  "Jameson 0,03l": "Jameson 0.03l",
  "Four Roses 0,03l": "Four Roses 0.03l",
  "Johnnie Walker Red 0,03l": "Johnnie Walker Red 0.03l",

  // Add-ons / Dodaci
  "Pavlaka 50g": "Sour cream 50g",
  "Urnebes 50g": "Urnebes spread 50g",
  "Tartar sos 50g": "Tartar sauce 50g",
  "Kajmak 40g": "Kajmak 40g",
  "Feta sir 50g": "Feta cheese 50g",
  "Pečurke u pavlaci 50g": "Creamy mushrooms 50g",
  "Ajvar 50g": "Ajvar 50g",
  "Masline 8 kom.": "Olives 8 pcs",
  "Feferoni 2 kom.": "Hot peppers 2 pcs",
  "Kiseli krastavac 50g": "Pickles 50g",
  "Šunka 30g": "Ham 30g",
  "Pečenica 30g": "Smoked pork loin 30g",
  "Kulen 30g": "Kulen (spicy sausage) 30g",
  "Pančeta 30g": "Pancetta 30g",
  "Pršuta 30g": "Prosciutto 30g",
  "Suvi vrat 30g": "Smoked pork neck 30g",
  "Viršla 1 kom.": "Sausage 1 pc",
  "Jaje 1 kom.": "Egg 1 pc",
  "Tunjevina 70g": "Tuna 70g",
  "Kukuruz 50g": "Corn 50g",
  "Čeri paradajz 4 kom.": "Cherry tomatoes 4 pcs",
  "Med ili džem 30g": "Honey or jam 30g",
  "Orasi 30g": "Walnuts 30g",
  "Eurokrem 40g": "Eurocrem 40g",
  "Nutela 40g": "Nutella 40g",
  "Lešnik, kikiriki ili Plazma 30g": "Hazelnut, peanut or Plazma 30g",
  "Puding 40g": "Pudding 40g",
  "Banana, ananas, kivi ili višnja 40g": "Banana, pineapple, kiwi or cherry 40g",

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
  // Pizze & Specials
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
  "kiseli krastavac": "pickles",
  
  // Novi/Nedostajući sastojci i prilozi
  "maslinovo ulje": "olive oil",
  "beli luk": "garlic",
  "sveža ljuta paprika": "fresh hot pepper",
  "tunjevina ili kulen": "tuna or kulen",
  "testo 300g": "300g dough",
  "testo 180g": "180g dough",
  "baget hleb": "baguette bread",
  "premaz": "spread",
  "posni premaz": "lenten spread",
  "iceberg salata": "iceberg lettuce",
  "tuna": "tuna",
  "mix salata": "salad mix",
  "limun": "lemon",
  "tost hleb": "toast bread",
  "3 tosta": "3 toasts",
  "4 tosta": "4 toasts",
  "gril piletina 140g": "140g grilled chicken",
  "gril slanina": "grilled bacon",
  "zelena salata": "lettuce",
  "paradajz": "tomato",
  "ajsberg": "iceberg lettuce",
  "rukola": "arugula",
  "slatka pavlaka": "whipped cream",
  "piškote": "ladyfingers",
  "toping karamel": "caramel topping",
  "roler": "wafer roll",
  "pomfrit 120 gr": "120g french fries",
  "pomfrit 140g": "140g french fries",
  "pomfrit 120g": "120g french fries",
  "pomfrit 100g": "100g french fries",
  "čeri": "cherry tomatoes",
  "grill piletina 140g": "140g grilled chicken",
  "biftek 100g": "100g beef tenderloin",
  "ela sir": "cream cheese",
  "suvo grožđe": "raisins",
  "preliv čoko i karamel šlag": "chocolate and caramel syrup, whipped cream",
  "pohovane": "fried",
  "toping": "topping",
  "gril piletina 150g": "150g grilled chicken",
  "kari sos": "curry sauce",
  "gril piletina 280g": "280g grilled chicken",
  "castro sos": "Castro sauce",
  "piletina 300g": "300g chicken",
  "piletina 150g": "150g chicken",
  "kornfleks": "cornflakes",
  "piletina 140g": "140g chicken",
  "sos od pečuraka": "mushroom sauce",
  "slanina 3 listića gril": "3 slices of grilled bacon",
  "urnebes 50g": "urnebes 50g",
  "tartar sos 50g": "tartar sauce 50g",
  "kajmak 40g": "kajmak 40g",
  "feta sir 50g": "feta cheese 50g",
  "pečurke u pavlaci 50g": "creamy mushrooms 50g",
  "ajvar 50g": "ajvar 50g",
  "masline 8 kom.": "olives 8 pcs",
  "feferoni 2 kom.": "hot peppers 2 pcs",
  "kiseli krastavac 50g": "pickles 50g",
  "šunka 30g": "ham 30g",
  "pečenica 30g": "smoked pork loin 30g",
  "kulen 30g": "kulen 30g",
  "pančeta 30g": "pancetta 30g",
  "pršuta 30g": "prosciutto 30g",
  "suvi vrat 30g": "smoked pork neck 30g",
  "viršla 1 kom.": "sausage 1 pc",
  "jaje 1 kom.": "egg 1 pc",
  "tunjevina 70g": "tuna 70g",
  "kukuruz 50g": "corn 50g",
  "čeri paradajz 4 kom.": "cherry tomatoes 4 pcs",
  "med ili džem 30g": "honey or jam 30g",
  "orasi 30g": "walnuts 30g",
  "eurokrem 40g": "eurocrem 40g",
  "nutela 40g": "nutella 40g",
  "lešnik, kikiriki ili plazma 30g": "hazelnut, peanut or plazma 30g",
  "puding 40g": "pudding 40g",
  "banana, ananas, kivi ili višnja 40g": "banana, pineapple, kiwi or cherry 40g",
  "2 pržena jaja": "2 fried eggs",
  "2 gril viršle": "2 grilled sausages",
  "3 listića gril slanine": "3 slices of grilled bacon",
  "2 kuvana jaja": "2 boiled eggs",
  "2 barene viršle": "2 boiled sausages",
  "2 listića gaude": "2 slices of gouda",
  "2 kom. zdenka sir": "2 pcs of Zdenka cream cheese",
  "3 jaja": "3 eggs",
  "tost hleb (3 komada)": "toast bread (3 pieces)",
  "hleb štapići": "breadsticks",
  "3 komada": "3 pieces",
  "začini": "spices",
  "jaja": "eggs",
  "sir": "cheese",
  "štapići lignje": "squid strips",
  "novo": "NEW",
  "džem (šljiva, kajsija, jagoda, šumsko voće)": "jam (plum, apricot, strawberry, wild berries)",
  "čoko-vanila cipiripi krem, pahuljice, narandža": "chocolate-vanilla Cipiripi cream, cereal flakes, orange",
  "slatka pavlaka, šlag i kivi": "heavy cream, whipped cream and kiwi",
  "slatka pavlaka, šlag i ananas": "heavy cream, whipped cream and pineapple",
  "slatka pavlaka, šlag i višnja": "heavy cream, whipped cream and cherry",
  "vanila puding, šlag, piškote, toping karamel": "vanilla pudding, whipped cream, ladyfingers, caramel topping",
  "banana, 2 kugle sladoleda, šlag, piškote, čokoladni preliv": "banana, 2 scoops of ice cream, whipped cream, ladyfingers, chocolate syrup",
  "banana, ananas, višnja, kivi, šlag, toping": "banana, pineapple, cherry, kiwi, whipped cream, topping",
  "čokoladni kolač sa kuglom sladoleda": "chocolate cake with a scoop of ice cream",
  "jagoda, čokolada, vanila, straćatela": "strawberry, chocolate, vanilla, stracciatella",
  "banane, ananas, kivi, roler, sladoled (2 kugle), šlag": "bananas, pineapple, kiwi, wafer roll, ice cream (2 scoops), whipped cream",
  "neutralna pavlaka, majonez, šunka, kačkavalj, parmezan, začini": "heavy cream, mayonnaise, ham, cheese, parmesan, spices",
  "neutralna pavlaka, gauda, gorgonzola, mozzarella, parmezan, začini": "heavy cream, gouda, gorgonzola, mozzarella, parmesan, spices",
  "biljni kačkavalj, pečurke, kukuruz, masline, začini": "vegan cheese, mushrooms, corn, olives, spices",
  "pelat, biftek 100g, crni luk, sveža ljuta paprika, začini": "tomato sauce, 100g beef tenderloin, onion, fresh hot pepper, spices",
  "pavlaka, urnebes, kačkavalj, šunka": "sour cream, urnebes spread, cheese, ham",
  "pavlaka, kačkavalj, šunka, kulen": "sour cream, cheese, ham, kulen (spicy sausage)",
  "pavlaka, kačkavalj, šunka, slanina": "sour cream, cheese, ham, bacon",
  "pavlaka, kačkavalj, pečenica, pečurke": "sour cream, cheese, smoked pork loin, mushrooms",
  "pavlaka, urnebes, kačkavalj, pečenica": "sour cream, urnebes spread, cheese, smoked pork loin",
  "pavlaka, kačkavalj, sir, pečenica, susam": "sour cream, cheese, cheese, smoked pork loin, sesame",
  "kečap, kačkavalj, pečurke, pečenica": "ketchup, cheese, mushrooms, smoked pork loin",
  "pavlaka, kačkavalj, šunka, pečenica, sir": "sour cream, cheese, ham, smoked pork loin, cheese",
  "kečap, kačkavalj, pečenica, pečurke, kulen": "ketchup, cheese, smoked pork loin, mushrooms, kulen (spicy sausage)",
  "pavlaka, feta sir, suvi vrat, kajmak": "sour cream, feta cheese, smoked pork neck, kajmak",
  "pavlaka, grill piletina 140g, pomfrit 100g, kajmak": "sour cream, 140g grilled chicken, 100g french fries, kajmak",
  "kečap, šunka, pečenica, kulen, pečurke, kačkavalj": "ketchup, ham, smoked pork loin, kulen (spicy sausage), mushrooms, cheese",
  "pavlaka, kačkavalj, ajsberg, kulen, majonez, rukola": "sour cream, cheese, iceberg lettuce, kulen (spicy sausage), mayonnaise, arugula",
  "pavlaka, šunka, kačkavalj, susam, tartar sos": "sour cream, ham, cheese, sesame, tartar sauce",
  "pavlaka, kačkavalj, šunka, pečurke, kečap": "sour cream, cheese, ham, mushrooms, ketchup",
  "pavlaka, kačkavalj, kulen, pečurke, majonez": "sour cream, cheese, kulen (spicy sausage), mushrooms, mayonnaise",
  "pavlaka, suvi vrat, slanina, kačkavalj": "sour cream, smoked pork neck, bacon, cheese",
  "testo 180g, pavlaka, pečenica ili kulen, kačkavalj": "180g dough, sour cream, smoked pork loin or kulen, cheese",
  "testo 180g, tunjevina, kukuruz, mix salata": "180g dough, tuna, corn, salad mix",
  "slatka pavlaka": "sweet cream",
  "šlag": "whipped cream",
  "kivi": "kiwi",
  "orah": "walnut",
  "lešnik": "hazelnut"
};

function translateIngredients(text) {
  if (!text) return "";
  return text.split(/,(?![^(]*\))/).map(item => {
    let trimmed = item.trim().toLowerCase();
    
    // Direct match check
    if (ingredientTranslations[trimmed]) {
      return ingredientTranslations[trimmed];
    }
    
    // Split by " ili " (or)
    if (trimmed.includes(" ili ")) {
      return trimmed.split(" ili ").map(part => {
        const p = part.trim();
        return ingredientTranslations[p] || p;
      }).join(" or ");
    }
    
    // Split by " i " (and)
    if (trimmed.includes(" i ")) {
      return trimmed.split(" i ").map(part => {
        const p = part.trim();
        return ingredientTranslations[p] || p;
      }).join(" and ");
    }
    
    return ingredientTranslations[trimmed] || trimmed;
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

  // Dynamic SEO Translations (World-class multilingual indexing)
  const seoTranslations = {
    sr: {
      title: "Naruči Hranu Online Požarevac | Castro Meni — Pizza, Paste, Palačinke",
      desc: "Naruči iz Castro restorana u Požarevcu — pizza od 410 RSD, paste, palačinke, gril piletina, salate. Dostava i preuzimanje. Radi od 07:00. Pozovi: 012 531010.",
      keywords: "naruči hranu Požarevac, dostava hrane Požarevac, pizza narudžbina online Požarevac, pizza dostava Požarevac, meni restoran Požarevac, pasta Požarevac narudžbina, palačinke dostava Požarevac, obroci na dostavu Požarevac, Castro meni, Castro dostava, šta da poručim Požarevac, brza hrana dostava Požarevac, gril piletina Požarevac, pizzerija Požarevac meni, sendviči Požarevac",
      ogTitle: "Naruči Online — Castro Požarevac | Pizza, Paste, Palačinke",
      ogDesc: "Pizza od 410 RSD, paste, palačinke i dostava u Požarevcu. Radi od 07:00. Naruči direktno sa sajta — bez telefonskog čekanja!"
    },
    en: {
      title: "Order Food Online Pozarevac | Castro Menu — Pizza, Pasta, Crepes",
      desc: "Order online from Castro Požarevac — pizzas from 410 RSD, pasta, crepes, grilled chicken, fresh salads. Home delivery & pickup. Open from 07:00. Call: 012 531010.",
      keywords: "order food online Pozarevac, food delivery Pozarevac, pizza online order Pozarevac, pizza delivery Pozarevac, menu restaurant Pozarevac, pasta Pozarevac order, crepes delivery Pozarevac, food delivery Pozarevac, Castro menu, Castro delivery, fast food delivery Pozarevac, grilled chicken Pozarevac, pizzeria Pozarevac menu, sandwiches Pozarevac",
      ogTitle: "Order Online — Castro Pozarevac | Pizza, Pasta, Crepes",
      ogDesc: "Pizzas from 410 RSD, pasta, crepes, and fast delivery in Pozarevac. Open from 07:00. Order directly online — skip the phone queue!"
    }
  };

  const seo = seoTranslations[lang];
  if (seo) {
    document.title = seo.title;
    
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', seo.desc);
    
    const metaKeywords = document.querySelector('meta[name="keywords"]');
    if (metaKeywords) metaKeywords.setAttribute('content', seo.keywords);
    
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', seo.ogTitle);
    
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', seo.ogDesc);
    
    const ogLocale = document.querySelector('meta[property="og:locale"]');
    if (ogLocale) ogLocale.setAttribute('content', lang === 'en' ? 'en_US' : 'sr_RS');
  }

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
    
    const baseName = el.dataset.name || (nameSpan.childNodes[0] && nameSpan.childNodes[0].textContent.trim());
    if (!baseName) return;
    
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
  const urlParams = new URLSearchParams(window.location.search);
  const urlLang = urlParams.get('lang');
  
  let savedLang = localStorage.getItem('castro-lang');
  if (urlLang === 'en' || urlLang === 'sr') {
    savedLang = urlLang;
  }
  if (!savedLang) {
    savedLang = 'sr';
  }
  setLanguage(savedLang);
});

/* ─── FAB auto-hide on scroll ─── */
let lastScrollY = window.scrollY;
window.addEventListener('scroll', () => {
  const currentScrollY = window.scrollY;
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    if (currentScrollY > lastScrollY && currentScrollY > 100) {
      // Scroll down
      document.body.classList.add('scroll-down');
    } else {
      // Scroll up
      document.body.classList.remove('scroll-down');
    }
  } else {
    document.body.classList.remove('scroll-down');
  }
  lastScrollY = currentScrollY;
}, { passive: true });

