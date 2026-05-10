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

  add(btn) {
    const el = btn.closest('.item');
    if (el.classList.contains("item--unavailable")) return;
    // Pice sa velicinama — otvori size picker
    if (el.dataset.sizes) { openSizePicker(el); return; }
    const name  = el.dataset.name;
    const price = parseInt(el.dataset.price);
    const existing = this.items.find(i => i.name === name);
    if (existing) existing.qty++;
    else this.items.push({ name, price, qty: 1 });
    this.save();
    this.render();
    this.popBadge();
  },

  inc(name) {
    const item = this.items.find(i => i.name === name);
    if (item) { item.qty++; this.save(); this.render(); renderItemControls(); }
  },

  dec(name) {
    const item = this.items.find(i => i.name === name);
    if (!item) return;
    item.qty--;
    if (item.qty <= 0) this.items = this.items.filter(i => i.name !== name);
    this.save(); this.render(); renderItemControls();
  },

  get count() { return this.items.reduce((s, i) => s + i.qty, 0); },
  get total() { return this.items.reduce((s, i) => s + i.price * i.qty, 0); },

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
        const row = document.createElement('div');
        row.className = 'cart-item';
        row.innerHTML = `
          <div class="cart-item__name">${item.name}</div>
          <div class="qty-ctrl">
            <button onclick="cart.dec('${item.name.replace(/'/g, "\\'")}')">−</button>
            <span>${item.qty}</span>
            <button onclick="cart.inc('${item.name.replace(/'/g, "\\'")}')">+</button>
          </div>
          <span class="cart-item__price">${(item.price * item.qty).toLocaleString('sr-Latn')} RSD</span>
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
    const lines = this.items.map(i =>
      `• ${i.name} ×${i.qty} — ${(i.price * i.qty).toLocaleString('sr-Latn')} RSD`
    ).join('\n');
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
}
function closeCart() {
  document.getElementById('cartPanel').classList.remove('open');
  document.getElementById('cartOverlay').classList.remove('open');
  document.body.style.overflow = '';
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
  generateTimeSlots();
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
document.getElementById('checkoutFab')?.addEventListener('click', () => { openModal(); });
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

/* ─── Order form submit ─── */
document.getElementById('orderForm')?.addEventListener('submit', e => {
  e.preventDefault();
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
  const scheduledTime = document.getElementById('oTime')?.value || 'asap';
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
      scheduledTime,
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

// iOS-compatible scroll lock: body { position: fixed } is the only reliable approach
let _savedScrollY = 0;

function menuLock() {
  _savedScrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${_savedScrollY}px`;
  document.body.style.width = '100%';
  document.body.style.overflow = 'hidden';
}

function menuUnlock() {
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  document.body.style.overflow = '';
  window.scrollTo(0, _savedScrollY);
}

burger?.addEventListener('click', () => {
  const open = burger.classList.toggle('open');
  navCenter?.classList.toggle('open', open);
  open ? menuLock() : menuUnlock();
});

navCenter?.querySelectorAll('.nav__tab').forEach(tab => {
  tab.addEventListener('click', () => {
    burger?.classList.remove('open');
    navCenter.classList.remove('open');
    // Unlock body first, then restore position so smooth scroll
    // calculates the correct getBoundingClientRect offset
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
    window.scrollTo(0, _savedScrollY);
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



/* ─── Init ─── */
cart.render();

fetch("/api/menu-availability")
  .then((res) => res.json())
  .then((data) => renderAvailability(data.menuAvailability || {}));

socket.on("menu:availability", (payload) => {
  renderAvailability(payload.menuAvailability || {});
});

if (liveOrder?.orderId && liveOrder?.customerToken) {
  socket.emit("order:subscribe", liveOrder);
}

socket.on("order:notification", ({ order, message }) => {
  if (liveOrder) {
    Object.assign(liveOrder, order);
    localStorage.setItem("castro-live-order", JSON.stringify(liveOrder));
  }
  updateCustomerStatus(`${message} (${order.id})`);
  if (order.status === "completed") {
    const keepUntil = Date.now() + 10 * 60 * 1000;
    localStorage.setItem("castro-live-order-expires-at", String(keepUntil));
    setTimeout(() => {
      localStorage.removeItem("castro-live-order");
      localStorage.removeItem("castro-live-order-expires-at");
      liveOrder = null;
    }, 10 * 60 * 1000);
  }
  if (order.status === "rejected" || order.status === "missed") {
    localStorage.removeItem("castro-live-order");
    localStorage.removeItem("castro-live-order-expires-at");
    liveOrder = null;
    liveOrder = null;
  }
});

if (liveOrder?.orderId && liveOrder?.customerToken) {
  fetch(`/api/track/${encodeURIComponent(liveOrder.orderId)}?token=${encodeURIComponent(liveOrder.customerToken)}`)
    .then(res => res.json())
    .then(data => {
      if (data.order) {
        Object.assign(liveOrder, data.order);
        localStorage.setItem("castro-live-order", JSON.stringify(liveOrder));
      }
    }).catch(e => console.error(e));
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



if (liveOrder) {
  const expiresAt = Number(localStorage.getItem("castro-live-order-expires-at") || 0);
  if (expiresAt && Date.now() > expiresAt) {
    localStorage.removeItem("castro-live-order");
    localStorage.removeItem("castro-live-order-expires-at");
    liveOrder = null;
  }
}

/* ─── Inline qty kontrole na stavkama menija ─── */
function renderItemControls() {
  document.querySelectorAll('.item').forEach(itemEl => {
    if (itemEl.classList.contains('item--unavailable')) return;
    const name = itemEl.dataset.name;
    const hasSizes = !!itemEl.dataset.sizes;
    const rightEl = itemEl.querySelector('.item__right');
    if (!rightEl) return;

    if (hasSizes) {
      // Pice sa velicinama — pokazi ukupan broj u korpi kao badge
      const totalQty = cart.items
        .filter(i => i.baseName === name)
        .reduce((s, i) => s + i.qty, 0);
      let badge = rightEl.querySelector('.size-count-badge');
      if (totalQty > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'size-count-badge';
          rightEl.insertBefore(badge, rightEl.querySelector('.add-btn'));
        }
        badge.textContent = totalQty + '×';
      } else if (badge) {
        badge.remove();
      }
    } else {
      // Obicne stavke — inline qty ctrl
      const cartItem = cart.items.find(i => i.name === name);
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

function openSizePicker(itemEl) {
  _sizePickerItem = itemEl;
  const name = itemEl.dataset.name;
  const sizesRaw = itemEl.dataset.sizes; // format: "22:410|30:830|50:1350"
  const sizes = sizesRaw.split('|').map(s => {
    const [cm, price] = s.split(':');
    return { cm, price: parseInt(price) };
  });

  document.getElementById('sizePickerTitle').textContent = name;
  const optsEl = document.getElementById('sizePickerOpts');
  optsEl.innerHTML = sizes.map(s => `
    <button class="size-opt" data-cm="${s.cm}" data-price="${s.price}">
      <span class="size-opt__cm">⌀ ${s.cm} cm</span>
      <span class="size-opt__price">${s.price.toLocaleString('sr-Latn')} RSD</span>
    </button>
  `).join('');

  optsEl.querySelectorAll('.size-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      addWithSize(_sizePickerItem, btn.dataset.cm, parseInt(btn.dataset.price));
    });
  });

  document.getElementById('sizePickerOverlay').classList.add('open');
  document.getElementById('sizePicker').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeSizePicker() {
  document.getElementById('sizePickerOverlay').classList.remove('open');
  document.getElementById('sizePicker').classList.remove('open');
  document.body.style.overflow = '';
  _sizePickerItem = null;
}

function addWithSize(itemEl, cm, price) {
  const baseName = itemEl.dataset.name;
  const sizeName = `${baseName} (${cm}cm)`;
  const existing = cart.items.find(i => i.name === sizeName);
  if (existing) existing.qty++;
  else cart.items.push({ name: sizeName, baseName, price, qty: 1 });
  cart.save();
  cart.render();
  cart.popBadge();
  closeSizePicker();
}

document.getElementById('sizePickerOverlay')?.addEventListener('click', closeSizePicker);
document.getElementById('sizePickerClose')?.addEventListener('click', closeSizePicker);
