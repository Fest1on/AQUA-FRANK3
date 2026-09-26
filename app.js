const PRODUCTS = [
  { id: "water_189", name: "Вода Aqua Frank 18,9 л", price: 140, category: "water", image: "assets/water-189.jpg", label: "Основна вода" },
  { id: "m15_light", name: "Моршинська слабогазована 1,5 л × 6", price: 200, category: "morsh", image: "assets/m15-light.jpg", label: "Моршинська" },
  { id: "m15_sparkling", name: "Моршинська сильногазована 1,5 л × 6", price: 200, category: "morsh", image: "assets/m15-sparkling.jpg", label: "Моршинська" },
  { id: "m15_still", name: "Моршинська негазована 1,5 л × 6", price: 200, category: "morsh", image: "assets/m15-still.jpg", label: "Моршинська" },
  { id: "m075_still", name: "Моршинська негазована 0,75 л × 12", price: 300, category: "morsh", image: "assets/m075-still.jpg", label: "Моршинська" },
  { id: "m075_light", name: "Моршинська слабогазована 0,75 л × 12", price: 300, category: "morsh", image: "assets/m075-light.jpg", label: "Моршинська" },
  { id: "m075_sport", name: "Моршинська Sport 0,75 л × 12", price: 365, category: "morsh", image: "assets/m075-sport.jpg", label: "Моршинська" },
  { id: "m05_light", name: "Моршинська слабогазована 0,5 л × 12", price: 275, category: "morsh", image: "assets/m05-light.jpg", label: "Моршинська" },
  { id: "m05_still", name: "Моршинська негазована 0,5 л × 12", price: 275, category: "morsh", image: "assets/m05-still.jpg", label: "Моршинська" },
  { id: "m6_still", name: "Моршинська негазована 6 л × 2", price: 210, category: "morsh", image: "assets/m6-still.jpg", label: "Моршинська" },
  { id: "pump_electric", name: "Помпа електрична PRIMO", price: 270, category: "accessory", image: "assets/pump-electric.jpg", label: "Аксесуар" },
  { id: "pump_manual", name: "Помпа механічна Lilu", price: 200, category: "accessory", image: "assets/pump-manual.jpg", label: "Аксесуар" },
  { id: "handle", name: "Ручка для перенесення VIAPLAST", price: 90, category: "accessory", image: "assets/handle.jpg", label: "Аксесуар" },
  { id: "cups", name: "Стакан паперовий 250 мл (50 шт)", price: 65, category: "accessory", image: "assets/cups.jpg", label: "Аксесуар" },
];

const BOTTLE_DEPOSIT = 400;
const STORAGE_CART = "aqua-frank-cart";
const STORAGE_ORDERS = "aqua-frank-orders";

let currentFilter = "all";
let checkoutState = null;
let toastTimeout = null;

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const productById = (id) => PRODUCTS.find((product) => product.id === id);
const formatMoney = (value) => `${new Intl.NumberFormat("uk-UA").format(value)} ₴`;
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", "\"": "&quot;",
})[character]);

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function getCart() {
  const cart = readStorage(STORAGE_CART, {});
  return Object.fromEntries(
    Object.entries(cart).filter(([id, quantity]) => productById(id) && Number.isInteger(quantity) && quantity > 0),
  );
}

function getOrders() {
  const orders = readStorage(STORAGE_ORDERS, []);
  return Array.isArray(orders) ? orders : [];
}

function saveCart(cart) {
  localStorage.setItem(STORAGE_CART, JSON.stringify(cart));
}

function isNewCustomer() {
  return getOrders().length === 0;
}

function waterUnitPrice(quantity) {
  if (quantity >= 10) return 125;
  if (quantity >= 5) return 135;
  return 140;
}

function getPricing(cart = getCart(), hasExchange = true) {
  const newCustomer = isNewCustomer();
  const lines = Object.entries(cart).map(([id, quantity]) => {
    const product = productById(id);
    const promoApplies = id === "water_189" && quantity === 2 && newCustomer;
    const unitPrice = id === "water_189" ? waterUnitPrice(quantity) : product.price;
    const total = promoApplies ? 200 : unitPrice * quantity;
    const note = promoApplies
      ? "Акція для нових клієнтів"
      : id === "water_189" && unitPrice < product.price
        ? `Оптова ціна ${unitPrice} ₴/шт.`
        : "";
    return { id, product, quantity, unitPrice, total, note, promoApplies };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
  const waterQuantity = cart.water_189 || 0;
  const deposit = waterQuantity > 0 && !hasExchange ? waterQuantity * BOTTLE_DEPOSIT : 0;
  return { lines, subtotal, deposit, total: subtotal + deposit, waterQuantity, newCustomer };
}

function changeCart(id, delta) {
  const cart = getCart();
  const nextQuantity = (cart[id] || 0) + delta;
  if (nextQuantity <= 0) delete cart[id];
  else cart[id] = nextQuantity;
  saveCart(cart);
  renderAll();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 2800);
}

function renderProducts() {
  const products = currentFilter === "all"
    ? PRODUCTS
    : PRODUCTS.filter((product) => product.category === currentFilter);
  $("#product-grid").innerHTML = products.map((product) => {
    const specialClass = product.id === "water_189" ? " accent" : "";
    const label = product.id === "water_189" ? "Від 125 ₴ при замовленні від 10 шт." : product.label;
    return `
      <article class="product-card">
        <span class="product-label${specialClass}">${label}</span>
        <div class="product-photo"><img src="${product.image}" alt="${product.name}" loading="lazy" /></div>
        <h3>${product.name}</h3>
        <div class="product-bottom">
          <div class="price">${formatMoney(product.price)} <small>/ шт.</small></div>
          <button class="add-button" type="button" data-add="${product.id}" aria-label="Додати ${product.name} до кошика">+</button>
        </div>
      </article>`;
  }).join("");
}

function renderCart() {
  const cart = getCart();
  const pricing = getPricing(cart);
  const entries = Object.entries(cart);
  const checkoutButton = $("[data-action='checkout']");
  checkoutButton.disabled = entries.length === 0;

  $("#cart-items").innerHTML = entries.length
    ? pricing.lines.map((line) => `
        <article class="cart-line">
          <img src="${line.product.image}" alt="${line.product.name}" />
          <div class="cart-line-main">
            <h3>${line.product.name}</h3>
            <div class="cart-line-foot">
              <span class="cart-line-price">${formatMoney(line.total)}</span>
              <div class="qty-control" aria-label="Кількість ${line.product.name}">
                <button type="button" data-cart-change="-1" data-id="${line.id}" aria-label="Зменшити кількість">−</button>
                <span>${line.quantity}</span>
                <button type="button" data-cart-change="1" data-id="${line.id}" aria-label="Збільшити кількість">+</button>
              </div>
            </div>
          </div>
        </article>`).join("")
    : `<div class="empty-cart"><span>🫧</span><b>Кошик поки порожній</b><p>Додайте воду або аксесуари з каталогу.</p></div>`;

  if (!entries.length) {
    $("#cart-summary").innerHTML = "";
    return;
  }

  const itemCount = entries.reduce((sum, [, quantity]) => sum + quantity, 0);
  const promo = pricing.lines.find((line) => line.promoApplies);
  $("#cart-summary").innerHTML = `
    <div class="summary-row"><span>Товарів</span><b>${itemCount}</b></div>
    <div class="summary-row"><span>Попередня сума</span><b>${formatMoney(pricing.subtotal)}</b></div>
    <div class="summary-row total"><span>Разом</span><span>${formatMoney(pricing.subtotal)}</span></div>
    ${promo ? `<p class="cart-note">✓ Застосовано акцію: 2 бутлі Aqua Frank за 200 ₴.</p>` : ""}
    ${pricing.waterQuantity ? `<p class="cart-note">Застава за нову тару буде розрахована під час оформлення, якщо немає бутлів на обмін.</p>` : ""}`;
}

function renderHeader() {
  const count = Object.values(getCart()).reduce((sum, quantity) => sum + quantity, 0);
  $("#cart-count").textContent = count;
}

function renderAll() {
  renderProducts();
  renderHeader();
  renderCart();
}

function openCart() {
  $("#overlay").hidden = false;
  $("#cart-drawer").classList.add("open");
  $("#cart-drawer").setAttribute("aria-hidden", "false");
}

function closeCart() {
  $("#overlay").hidden = true;
  $("#cart-drawer").classList.remove("open");
  $("#cart-drawer").setAttribute("aria-hidden", "true");
}

function showCheckout() {
  if (!Object.keys(getCart()).length) {
    showToast("Додайте хоча б один товар до кошика.");
    return;
  }
  closeCart();
  checkoutState = {
    step: 1,
    data: { name: "", phone: "", address: "", hasExchange: true, payment: "Готівка" },
  };
  $("#checkout-modal").hidden = false;
  renderCheckout();
}

function closeCheckout() {
  $("#checkout-modal").hidden = true;
  checkoutState = null;
}

function renderProgress() {
  const progress = $$(".checkout-progress span");
  progress.forEach((part, index) => part.classList.toggle("active", index < checkoutState.step));
}

function renderCheckout() {
  if (!checkoutState) return;
  const content = $("#checkout-content");
  const { step, data } = checkoutState;
  renderProgress();

  if (step === 1) {
    content.innerHTML = `
      <h2 class="checkout-title" id="checkout-title">Контактні дані</h2>
      <p class="checkout-lead">Залиште контакти — менеджер уточнить час доставки.</p>
      <form id="checkout-contact" novalidate>
        <label class="form-group"><span class="form-label">Як до вас звертатись?</span><input class="text-input" name="name" value="${escapeHtml(data.name)}" placeholder="Ваше ім'я" autocomplete="name" /></label>
        <label class="form-group"><span class="form-label">Номер телефону</span><input class="text-input" name="phone" value="${escapeHtml(data.phone)}" placeholder="+380 97 123 45 67" autocomplete="tel" inputmode="tel" /></label>
        <p class="form-error" id="contact-error"></p>
        <div class="modal-actions"><button class="button button-primary" type="submit">Далі <span>→</span></button></div>
      </form>`;
    return;
  }

  if (step === 2) {
    const needsExchange = Boolean(getCart().water_189);
    content.innerHTML = `
      <h2 class="checkout-title" id="checkout-title">Адреса та тара</h2>
      <p class="checkout-lead">${needsExchange ? "Підкажіть, чи є у вас пусті бутлі на обмін." : "Вкажіть адресу, куди доставити замовлення."}</p>
      <form id="checkout-details" novalidate>
        ${needsExchange ? `
          <div class="option-list">
            <label class="choice-option"><input type="radio" name="exchange" value="yes" ${data.hasExchange ? "checked" : ""} /><span class="choice-circle"></span><span><strong>Так, є тара на обмін</strong><small>Застава за бутлі не додається.</small></span></label>
            <label class="choice-option"><input type="radio" name="exchange" value="no" ${!data.hasExchange ? "checked" : ""} /><span class="choice-circle"></span><span><strong>Ні, потрібна нова тара</strong><small>Додамо заставу ${formatMoney(BOTTLE_DEPOSIT)} за кожен бутель 18,9 л.</small></span></label>
          </div>` : ""}
        <label class="form-group"><span class="form-label">Адреса доставки</span><input class="text-input" name="address" value="${escapeHtml(data.address)}" placeholder="Вулиця, будинок, квартира або офіс" autocomplete="street-address" /></label>
        <p class="form-error" id="details-error"></p>
        <div class="modal-actions"><button class="button button-light" type="button" data-action="checkout-back">← Назад</button><button class="button button-primary" type="submit">Далі <span>→</span></button></div>
      </form>`;
    return;
  }

  if (step === 3) {
    content.innerHTML = `
      <h2 class="checkout-title" id="checkout-title">Спосіб оплати</h2>
      <p class="checkout-lead">Оберіть зручний спосіб, остаточну суму вже розраховано.</p>
      <form id="checkout-payment">
        <div class="option-list">
          <label class="choice-option"><input type="radio" name="payment" value="Готівка" ${data.payment === "Готівка" ? "checked" : ""} /><span class="choice-circle"></span><span><strong>Готівка при отриманні</strong><small>Оплата кур'єру після доставки.</small></span></label>
          <label class="choice-option"><input type="radio" name="payment" value="Переказ на картку" ${data.payment === "Переказ на картку" ? "checked" : ""} /><span class="choice-circle"></span><span><strong>Переказ на картку</strong><small>Менеджер надішле реквізити після підтвердження.</small></span></label>
        </div>
        <div class="modal-actions"><button class="button button-light" type="button" data-action="checkout-back">← Назад</button><button class="button button-primary" type="submit">Перевірити замовлення <span>→</span></button></div>
      </form>`;
    return;
  }

  const pricing = getPricing(getCart(), data.hasExchange);
  content.innerHTML = `
    <h2 class="checkout-title" id="checkout-title">Перевірте замовлення</h2>
    <p class="checkout-lead">Усе вірно? Після підтвердження ми отримаємо заявку.</p>
    <div class="checkout-review">
      <div class="review-row"><span>Ім'я</span><b>${escapeHtml(data.name)}</b></div>
      <div class="review-row"><span>Телефон</span><b>${escapeHtml(data.phone)}</b></div>
      <div class="review-row"><span>Адреса</span><b>${escapeHtml(data.address)}</b></div>
      <div class="review-row"><span>Оплата</span><b>${escapeHtml(data.payment)}</b></div>
    </div>
    <div class="checkout-lines">
      ${pricing.lines.map((line) => `<div><span>${line.product.name} × ${line.quantity}${line.note ? ` <em>(${line.note})</em>` : ""}</span><b>${formatMoney(line.total)}</b></div>`).join("")}
      ${pricing.deposit ? `<div><span>Застава за нову тару × ${pricing.waterQuantity}</span><b>${formatMoney(pricing.deposit)}</b></div>` : ""}
    </div>
    <div class="checkout-total"><span>Разом</span><span>${formatMoney(pricing.total)}</span></div>
    <div class="modal-actions"><button class="button button-light" type="button" data-action="checkout-back">← Назад</button><button class="button button-primary" type="button" data-action="confirm-order">Підтвердити <span>✓</span></button></div>`;
}

async function submitOrder(order) {
  const response = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(order),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || "Сервер не прийняв замовлення.");
  return result;
}

async function finishOrder() {
  const cart = getCart();
  const pricing = getPricing(cart, checkoutState.data.hasExchange);
  const orders = getOrders();
  const fallbackId = `AF-${String(orders.length + 1).padStart(4, "0")}`;
  const order = {
    id: fallbackId,
    createdAt: new Date().toISOString(),
    cart,
    total: pricing.total,
    ...checkoutState.data,
    items: pricing.lines.map((line) => ({ name: line.product.name, quantity: line.quantity, total: line.total, note: line.note })),
  };
  const button = $("[data-action='confirm-order']");
  button.disabled = true;
  button.textContent = "Надсилаємо…";
  let serverResult = null;
  try {
    serverResult = await submitOrder(order);
    order.id = serverResult.orderId;
  } catch {
    // Сайт також можна відкрити напряму як статичний файл: у такому режимі
    // демо-замовлення зберігається лише в браузері, без передачі даних назовні.
  }
  localStorage.setItem(STORAGE_ORDERS, JSON.stringify([...orders, order]));
  saveCart({});
  renderAll();
  $("#checkout-content").innerHTML = `
    <div class="success-state">
      <div class="success-icon">✓</div>
      <h2 id="checkout-title">Замовлення прийнято!</h2>
      <p>Дякуємо, ${escapeHtml(order.name)}. Заявка <b>${order.id}</b> на суму <b>${formatMoney(order.total)}</b> сформована.${serverResult?.sentToTelegram ? " Її надіслано менеджерам Aqua Frank у Telegram." : serverResult ? " Заявку збережено на сервері; Telegram-бот тимчасово не налаштований." : " Для надсилання менеджеру запустіть сайт через server.js."}</p>
      <button class="button button-primary" type="button" data-action="return-to-shop">Повернутися до каталогу <span>→</span></button>
    </div>`;
  $$(".checkout-progress span").forEach((part) => part.classList.add("active"));
}

function handleContactSubmit(form) {
  const name = form.elements.name.value.trim();
  const phone = form.elements.phone.value.replace(/[\s-]/g, "");
  const error = $("#contact-error");
  if (name.length < 2) {
    error.textContent = "Вкажіть ім'я — щонайменше 2 символи.";
    return;
  }
  if (!/^\+?3?8?0\d{9}$|^\+?\d{9,15}$/.test(phone)) {
    error.textContent = "Введіть коректний номер, наприклад +380971234567.";
    return;
  }
  checkoutState.data.name = name;
  checkoutState.data.phone = phone;
  checkoutState.step = 2;
  renderCheckout();
}

function handleDetailsSubmit(form) {
  const address = form.elements.address.value.trim();
  const error = $("#details-error");
  if (address.length < 5) {
    error.textContent = "Вкажіть, будь ласка, вулицю та номер будинку.";
    return;
  }
  const exchange = form.elements.exchange;
  checkoutState.data.hasExchange = exchange ? exchange.value === "yes" : true;
  checkoutState.data.address = address;
  checkoutState.step = 3;
  renderCheckout();
}

function handlePaymentSubmit(form) {
  checkoutState.data.payment = form.elements.payment.value;
  checkoutState.step = 4;
  renderCheckout();
}

document.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add]");
  if (addButton) {
    const id = addButton.dataset.add;
    const cart = getCart();
    if (addButton.closest(".promo")) {
      const difference = Math.max(0, 2 - (cart.water_189 || 0));
      changeCart("water_189", difference || 1);
      showToast(difference ? "У кошик додано 2 бутлі за акційною ціною." : "Вода Aqua Frank додана до кошика.");
    } else {
      changeCart(id, 1);
      showToast("Товар додано до кошика.");
    }
    return;
  }

  const cartChange = event.target.closest("[data-cart-change]");
  if (cartChange) {
    changeCart(cartChange.dataset.id, Number(cartChange.dataset.cartChange));
    return;
  }

  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    currentFilter = filterButton.dataset.filter;
    $$(".category-tab").forEach((button) => button.classList.toggle("active", button.dataset.filter === currentFilter));
    renderProducts();
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const action = actionButton.dataset.action;
  if (action === "open-cart") openCart();
  if (action === "close-cart") closeCart();
  if (action === "checkout") showCheckout();
  if (action === "close-checkout") closeCheckout();
  if (action === "checkout-back" && checkoutState?.step > 1) {
    checkoutState.step -= 1;
    renderCheckout();
  }
  if (action === "confirm-order") finishOrder();
  if (action === "return-to-shop") {
    closeCheckout();
    $("#catalog").scrollIntoView({ behavior: "smooth" });
  }
});

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!["checkout-contact", "checkout-details", "checkout-payment"].includes(form.id)) return;
  event.preventDefault();
  if (form.id === "checkout-contact") handleContactSubmit(form);
  if (form.id === "checkout-details") handleDetailsSubmit(form);
  if (form.id === "checkout-payment") handlePaymentSubmit(form);
});

$("#overlay").addEventListener("click", closeCart);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!$("#checkout-modal").hidden) closeCheckout();
  else closeCart();
});

$("#year").textContent = new Date().getFullYear();
renderAll();
