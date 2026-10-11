// Smart Canteen - plain JavaScript, data kept in localStorage
const KEYS = { users: "sc_users", session: "sc_session", menu: "sc_menu", orders: "sc_orders", token: "sc_token" };
const STATUSES = ["Placed", "Preparing", "Ready", "Collected"];
const NEXT_LABEL = { Placed: "Start Preparing", Preparing: "Mark Ready", Ready: "Mark Collected" };
const EMOJI = { Breakfast: "🍳", Meals: "🍛", Snacks: "🥪", Drinks: "🥤", Desserts: "🍨" };

const DEFAULT_MENU = [
  { id: 1, name: "Masala Dosa", price: 60, category: "Breakfast", available: true },
  { id: 2, name: "Idli Sambar", price: 40, category: "Breakfast", available: true },
  { id: 3, name: "Veg Meals", price: 90, category: "Meals", available: true },
  { id: 4, name: "Chicken Biryani", price: 140, category: "Meals", available: true },
  { id: 5, name: "Samosa", price: 20, category: "Snacks", available: true },
  { id: 6, name: "Veg Sandwich", price: 50, category: "Snacks", available: true },
  { id: 7, name: "Masala Chai", price: 15, category: "Drinks", available: true },
];
const DEMO_USERS = [
  { name: "Demo Customer", email: "customer@canteen.com", password: "customer123", role: "customer" },
  { name: "Chef Suresh", email: "manager@canteen.com", password: "manager123", role: "manager" },
];

// ---------- storage helpers ----------
const load = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const $ = (id) => document.getElementById(id);
const rupee = (n) => "₹" + n.toLocaleString("en-IN");

function seed() {
  if (!localStorage.getItem(KEYS.menu)) save(KEYS.menu, DEFAULT_MENU);
  if (!localStorage.getItem(KEYS.users)) save(KEYS.users, DEMO_USERS);
  if (!localStorage.getItem(KEYS.orders)) save(KEYS.orders, []);
}

// ---------- state ----------
let authMode = "login";
let cart = {};          // { itemId: qty }
let activeCat = "All";

// ---------- auth ----------
function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll("[data-auth]").forEach(b => b.classList.toggle("active", b.dataset.auth === mode));
  $("nameField").classList.toggle("hidden", mode === "login");
  $("authSubmit").textContent = mode === "login" ? "Sign In" : "Create Account";
  $("authError").textContent = "";
}

function handleAuth(e) {
  e.preventDefault();
  const email = $("authEmail").value.trim().toLowerCase();
  const password = $("authPass").value;
  const role = document.querySelector("input[name=role]:checked").value;
  const users = load(KEYS.users, []);

  if (authMode === "signup") {
    const name = $("authName").value.trim();
    if (!name) return showAuthError("Please enter your name.");
    if (password.length < 6) return showAuthError("Password must be at least 6 characters.");
    if (users.some(u => u.email === email)) return showAuthError("That email is already registered.");
    const user = { name, email, password, role };
    users.push(user);
    save(KEYS.users, users);
    return login(user);
  }

  const user = users.find(u => u.email === email && u.password === password);
  if (!user) return showAuthError("Wrong email or password.");
  if (user.role !== role) return showAuthError(`This account is a ${user.role}. Pick the right role.`);
  login(user);
}

function showAuthError(msg) { $("authError").textContent = msg; }

function login(user) {
  save(KEYS.session, { email: user.email, name: user.name, role: user.role });
  $("authForm").reset();
  render();
}

function logout() {
  localStorage.removeItem(KEYS.session);
  cart = {};
  render();
}

const session = () => load(KEYS.session, null);

// ---------- main render ----------
function render() {
  const s = session();
  $("authView").classList.toggle("hidden", !!s);
  $("userBox").classList.toggle("hidden", !s);
  $("customerView").classList.toggle("hidden", !s || s.role !== "customer");
  $("managerView").classList.toggle("hidden", !s || s.role !== "manager");
  if (!s) return;
  $("userName").textContent = s.name;
  $("userRole").textContent = s.role;
  if (s.role === "customer") renderCustomer(); else renderManager();
}

// ---------- customer ----------
function renderCustomer() {
  const menu = load(KEYS.menu, []);
  // drop cart items that became sold out
  Object.keys(cart).forEach(id => { const m = menu.find(x => x.id == id); if (!m || !m.available) delete cart[id]; });

  const cats = ["All", ...new Set(menu.map(m => m.category))];
  $("catFilters").innerHTML = cats.map(c => `<button class="chip ${c === activeCat ? "active" : ""}" data-cat="${c}">${c}</button>`).join("");

  const q = $("search").value.trim().toLowerCase();
  const items = menu.filter(m => m.available && (activeCat === "All" || m.category === activeCat) && m.name.toLowerCase().includes(q));
  $("menuGrid").innerHTML = items.length ? items.map(m => `
    <div class="card food">
      <div class="emoji">${EMOJI[m.category] || "🍽️"}</div>
      <h4>${m.name}</h4>
      <span class="muted">${m.category}</span>
      <div class="row"><span class="price">${rupee(m.price)}</span>
        <button class="btn btn-primary btn-sm" data-add="${m.id}">Add</button></div>
    </div>`).join("") : `<p class="empty">No items found.</p>`;

  renderCart(menu);
  renderMyOrders();
}

function renderCart(menu) {
  const lines = Object.entries(cart).map(([id, qty]) => ({ item: menu.find(m => m.id == id), qty }));
  const total = lines.reduce((sum, l) => sum + l.item.price * l.qty, 0);
  $("cartItems").innerHTML = lines.length ? lines.map(l => `
    <div class="cart-line"><span>${l.item.name}</span>
      <div class="qty"><button data-dec="${l.item.id}">−</button>${l.qty}<button data-inc="${l.item.id}">+</button>
      <strong>${rupee(l.item.price * l.qty)}</strong></div></div>`).join("") : `<p class="empty">Cart is empty</p>`;
  $("cartTotal").textContent = rupee(total);
  $("placeOrder").disabled = lines.length === 0;
}

function placeOrder() {
  const s = session();
  const menu = load(KEYS.menu, []);
  const items = Object.entries(cart).map(([id, qty]) => {
    const m = menu.find(x => x.id == id);
    return { name: m.name, price: m.price, qty };
  });
  if (!items.length) return;
  const method = document.querySelector("input[name=pay]:checked").value;
  const token = load(KEYS.token, 100) + 1;
  save(KEYS.token, token);
  const order = {
    id: Date.now(), token, customer: s.email, customerName: s.name, items,
    total: items.reduce((t, i) => t + i.price * i.qty, 0),
    payment: method, paid: method === "UPI", // UPI is simulated as paid instantly
    status: "Placed", createdAt: new Date().toISOString(),
  };
  const orders = load(KEYS.orders, []);
  orders.unshift(order);
  save(KEYS.orders, orders);
  cart = {};
  $("tokenNo").textContent = token;
  $("tokenInfo").textContent = method === "UPI" ? `Paid ${rupee(order.total)} via UPI` : `Pay ${rupee(order.total)} at the counter`;
  $("tokenModal").classList.remove("hidden");
  renderCustomer();
}

function orderCard(o, managerMode = false) {
  const payTag = o.paid ? `<span class="paid">✔ Paid (${o.payment})</span>` : `<span class="unpaid">Unpaid (${o.payment})</span>`;
  const time = new Date(o.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  let actions = "";
  if (managerMode) {
    const next = NEXT_LABEL[o.status];
    actions = `<div class="actions">
      ${next ? `<button class="btn btn-primary btn-sm" data-next="${o.id}">${next}</button>` : ""}
      ${!o.paid ? `<button class="btn btn-ghost btn-sm" data-paid="${o.id}">Mark Paid</button>` : ""}</div>`;
  }
  return `<div class="card order">
    <div class="order-head"><span class="order-token">#${o.token}</span><span class="badge s-${o.status}">${o.status}</span></div>
    <div class="order-items">${o.items.map(i => `${i.qty}× ${i.name}`).join(", ")}</div>
    ${managerMode ? `<div class="muted">${o.customerName} · ${time}</div>` : `<div class="muted">${time}</div>`}
    <div class="order-head"><strong>${rupee(o.total)}</strong>${payTag}</div>
    ${actions}</div>`;
}

function renderMyOrders() {
  const s = session();
  const mine = load(KEYS.orders, []).filter(o => o.customer === s.email);
  $("myOrders").innerHTML = mine.length ? mine.map(o => orderCard(o)).join("") : `<p class="empty">No orders yet.</p>`;
}

// ---------- manager ----------
function renderManager() {
  const orders = load(KEYS.orders, []);
  const today = new Date().toDateString();
  const todays = orders.filter(o => new Date(o.createdAt).toDateString() === today);
  $("kOrders").textContent = todays.length;
  $("kRevenue").textContent = rupee(todays.filter(o => o.paid).reduce((t, o) => t + o.total, 0));
  $("kPending").textContent = orders.filter(o => o.status === "Placed" || o.status === "Preparing").length;
  $("kReady").textContent = orders.filter(o => o.status === "Ready").length;

  $("mBoard").innerHTML = STATUSES.map(st => {
    const list = orders.filter(o => o.status === st && (st !== "Collected" || new Date(o.createdAt).toDateString() === today));
    return `<div class="col"><h4>${st} <span class="muted">${list.length}</span></h4>
      ${list.map(o => orderCard(o, true)).join("") || `<p class="empty">—</p>`}</div>`;
  }).join("");

  const menu = load(KEYS.menu, []);
  $("menuTable").innerHTML = menu.map(m => `
    <div class="card menu-row">
      <div class="info"><strong>${m.name}</strong> <span class="muted">· ${m.category}</span></div>
      <span class="price">${rupee(m.price)}</span>
      <button class="btn btn-sm toggle ${m.available ? "on" : "off"}" data-toggle="${m.id}">${m.available ? "Available" : "Sold out"}</button>
      <button class="btn btn-ghost btn-sm" data-edit="${m.id}">Edit</button>
      <button class="btn btn-ghost btn-sm" data-del="${m.id}">Delete</button>
    </div>`).join("");
}

function updateOrder(id, fn) {
  const orders = load(KEYS.orders, []);
  const o = orders.find(x => x.id == id);
  if (!o) return;
  fn(o);
  save(KEYS.orders, orders);
  renderManager();
}

function saveItem(e) {
  e.preventDefault();
  const menu = load(KEYS.menu, []);
  const id = $("itemId").value;
  const data = { name: $("itemName").value.trim(), price: Number($("itemPrice").value), category: $("itemCat").value.trim() };
  if (id) Object.assign(menu.find(m => m.id == id), data);
  else menu.push({ id: Math.max(0, ...menu.map(m => m.id)) + 1, ...data, available: true });
  save(KEYS.menu, menu);
  resetItemForm();
  renderManager();
}

function resetItemForm() {
  $("itemForm").reset();
  $("itemId").value = "";
  $("itemSave").textContent = "Add Item";
  $("itemCancel").classList.add("hidden");
}

// ---------- events ----------
function switchTabs(attr, value, panels) {
  document.querySelectorAll(`[data-${attr}]`).forEach(b => b.classList.toggle("active", b.dataset[attr] === value));
  Object.entries(panels).forEach(([key, el]) => $(el).classList.toggle("hidden", key !== value));
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  const d = t.dataset;
  if (d.auth) setAuthMode(d.auth);
  else if (d.demo) { const u = DEMO_USERS.find(x => x.role === d.demo); login(load(KEYS.users, []).find(x => x.email === u.email) || u); }
  else if (d.ctab) switchTabs("ctab", d.ctab, { menu: "cMenu", orders: "cOrders" });
  else if (d.mtab) switchTabs("mtab", d.mtab, { board: "mBoard", menu: "mMenu" });
  else if (d.cat) { activeCat = d.cat; renderCustomer(); }
  else if (d.add || d.inc) { const id = d.add || d.inc; cart[id] = (cart[id] || 0) + 1; renderCustomer(); }
  else if (d.dec) { cart[d.dec]--; if (cart[d.dec] <= 0) delete cart[d.dec]; renderCustomer(); }
  else if (d.next) updateOrder(d.next, o => { o.status = STATUSES[STATUSES.indexOf(o.status) + 1] || o.status; });
  else if (d.paid) updateOrder(d.paid, o => { o.paid = true; });
  else if (d.toggle) { const menu = load(KEYS.menu, []); const m = menu.find(x => x.id == d.toggle); m.available = !m.available; save(KEYS.menu, menu); renderManager(); }
  else if (d.edit) {
    const m = load(KEYS.menu, []).find(x => x.id == d.edit);
    $("itemId").value = m.id; $("itemName").value = m.name; $("itemPrice").value = m.price; $("itemCat").value = m.category;
    $("itemSave").textContent = "Save Changes"; $("itemCancel").classList.remove("hidden");
  }
  else if (d.del) { if (confirm("Delete this item?")) { save(KEYS.menu, load(KEYS.menu, []).filter(m => m.id != d.del)); renderManager(); } }
});

$("authForm").addEventListener("submit", handleAuth);
$("logoutBtn").addEventListener("click", logout);
$("search").addEventListener("input", renderCustomer);
$("placeOrder").addEventListener("click", placeOrder);
$("closeModal").addEventListener("click", () => $("tokenModal").classList.add("hidden"));
$("itemForm").addEventListener("submit", saveItem);
$("itemCancel").addEventListener("click", resetItemForm);

// live sync: other tabs (storage event) + polling every 2s
window.addEventListener("storage", render);
setInterval(() => { const s = session(); if (s) (s.role === "manager" ? renderManager : renderMyOrders)(); }, 2000);

seed();
render();
