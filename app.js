// Smart Canteen frontend

// ---------- SETTINGS ----------
const API_BASE = "https://wjdjzob4ne.execute-api.us-east-1.amazonaws.com";

const KEYS = {
  users: "sc_users",     // customer accounts (demo only, not secure)
  session: "sc_session"  // who is signed in
};

const STATUSES = ["Placed", "Preparing", "Ready", "Collected"];

const NEXT_LABEL = {
  Placed: "Start Preparing",
  Preparing: "Mark Ready",
  Ready: "Mark Collected"
};

const EMOJI = {
  Breakfast: "🍳",
  Meals: "🍛",
  Snacks: "🥪",
  Drinks: "🥤",
  Desserts: "🍨"
};

// ---------- STATE (kept in memory, filled from the API) ----------
let menu = [];
let orders = [];
let cart = {};          // { itemId: qty }
let activeCat = "All";
let authMode = "login";

// ---------- SMALL HELPERS ----------
const $ = id => document.getElementById(id);

const rupee = amount => "₹" + Number(amount || 0).toLocaleString("en-IN");

const load = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

const session = () => load(KEYS.session, null);

// The manager key is kept in sessionStorage, so it is forgotten when the tab closes
const managerKey = () => sessionStorage.getItem("sc_manager_key") || "";

// Escape text before putting it inside innerHTML (stops XSS like <script> in a name)
function esc(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// ---------- API ----------
// One function for every request. Adds the manager key when a manager is signed in.
async function api(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (session()?.role === "manager") headers["x-manager-key"] = managerKey();

  const response = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // Details go to the console for us; the user gets a friendly message
    console.error(method, path, response.status, data);
    const error = new Error(data.message || "Something went wrong.");
    error.status = response.status;
    throw error;
  }
  return data;
}

// Load the latest menu and orders, then redraw the screen
async function refresh() {
  const user = session();
  if (!user) return;

  try {
    menu = await api("GET", "/menu");

    orders = user.role === "manager"
      ? await api("GET", "/orders")
      : await api("GET", "/orders?customer=" + encodeURIComponent(user.email));

    render();
  } catch (error) {
    if (error.status === 403 && user.role === "manager") {
      alert("Manager key is no longer valid. Please sign in again.");
      logout();
    }
  }
}

// ---------- AUTHENTICATION ----------
function setAuthMode(mode) {
  authMode = mode;

  document.querySelectorAll("[data-auth]").forEach(button => {
    button.classList.toggle("active", button.dataset.auth === mode);
  });

  // Sign Up is for customers only, so hide the role choice there
  $("nameField").classList.toggle("hidden", mode === "login");
  $("roleField").classList.toggle("hidden", mode === "signup");
  if (mode === "signup") document.querySelector('input[value="customer"]').checked = true;

  $("authSubmit").textContent = mode === "login" ? "Sign In" : "Create Account";
  $("authError").textContent = "";
  updatePasswordLabel();
}

// Managers type the staff key instead of a password
function updatePasswordLabel() {
  const role = document.querySelector('input[name="role"]:checked').value;
  $("passLabel").textContent = role === "manager" ? "Manager key" : "Password";
}

const showAuthError = message => ($("authError").textContent = message);

async function handleAuth(event) {
  event.preventDefault();

  const email = $("authEmail").value.trim().toLowerCase();
  const password = $("authPass").value;
  const role = document.querySelector('input[name="role"]:checked').value;
  const users = load(KEYS.users, []);

  // --- Manager: ask the server whether the key is right ---
  if (role === "manager") {
    sessionStorage.setItem("sc_manager_key", password);
    try {
      const headers = { "x-manager-key": password };
      const response = await fetch(API_BASE + "/orders", { headers });
      if (!response.ok) throw new Error();
      login({ name: "Canteen Manager", email, role: "manager" });
    } catch {
      sessionStorage.removeItem("sc_manager_key");
      showAuthError("Wrong manager key.");
    }
    return;
  }

  // --- Customer sign up ---
  if (authMode === "signup") {
    const name = $("authName").value.trim();

    if (!name) return showAuthError("Please enter your name.");
    if (password.length < 6) return showAuthError("Password must be at least 6 characters.");
    if (users.some(user => user.email === email)) return showAuthError("That email is already registered.");

    const user = { name, email, password }; // demo only: real apps never store plain passwords
    users.push(user);
    save(KEYS.users, users);
    login({ ...user, role: "customer" });
    return;
  }

  // --- Customer sign in ---
  const user = users.find(item => item.email === email && item.password === password);
  if (!user) return showAuthError("Wrong email or password.");

  login({ ...user, role: "customer" });
}

function login(user) {
  save(KEYS.session, { email: user.email, name: user.name, role: user.role });
  $("authForm").reset();
  setAuthMode("login");
  render();
  refresh();
}

function logout() {
  localStorage.removeItem(KEYS.session);
  sessionStorage.removeItem("sc_manager_key");
  cart = {};
  menu = [];
  orders = [];
  render();
}

// ---------- MAIN RENDER ----------
function render() {
  const user = session();

  $("authView").classList.toggle("hidden", !!user);
  $("userBox").classList.toggle("hidden", !user);
  $("customerView").classList.toggle("hidden", user?.role !== "customer");
  $("managerView").classList.toggle("hidden", user?.role !== "manager");

  if (!user) return;

  $("userName").textContent = user.name;
  $("userRole").textContent = user.role;

  if (user.role === "customer") renderCustomer();
  else renderManager();
}

// ---------- CUSTOMER ----------
function renderCustomer() {
  // Drop cart items that were deleted or sold out
  Object.keys(cart).forEach(id => {
    const item = menu.find(m => m.id == id);
    if (!item || !item.available) delete cart[id];
  });

  const categories = ["All", ...new Set(menu.map(item => item.category))];

  $("catFilters").innerHTML = categories.map(cat => `
    <button class="chip ${cat === activeCat ? "active" : ""}" data-cat="${esc(cat)}">${esc(cat)}</button>
  `).join("");

  const query = $("search").value.trim().toLowerCase();

  const items = menu.filter(item =>
    item.available &&
    (activeCat === "All" || item.category === activeCat) &&
    item.name.toLowerCase().includes(query)
  );

  $("menuGrid").innerHTML = items.length
    ? items.map(item => `
      <div class="card food">
        <div class="emoji">${EMOJI[item.category] || "🍽️"}</div>
        <h4>${esc(item.name)}</h4>
        <span class="muted">${esc(item.category)}</span>
        <div class="row">
          <span class="price">${rupee(item.price)}</span>
          <button class="btn btn-primary btn-sm" data-add="${item.id}">Add</button>
        </div>
      </div>
    `).join("")
    : `<p class="empty">No items found.</p>`;

  renderCart();
  renderMyOrders();
}

function renderCart() {
  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ item: menu.find(m => m.id == id), qty }))
    .filter(line => line.item);

  // This total is only a preview; the server recalculates the real one
  const total = lines.reduce((sum, line) => sum + line.item.price * line.qty, 0);

  $("cartItems").innerHTML = lines.length
    ? lines.map(line => `
      <div class="cart-line">
        <span>${esc(line.item.name)}</span>
        <div class="qty">
          <button data-dec="${line.item.id}">−</button>
          ${line.qty}
          <button data-inc="${line.item.id}">+</button>
          <strong>${rupee(line.item.price * line.qty)}</strong>
        </div>
      </div>
    `).join("")
    : `<p class="empty">Cart is empty</p>`;

  $("cartTotal").textContent = rupee(total);
  $("placeOrder").disabled = lines.length === 0;
}

async function placeOrder() {
  const user = session();
  if (!user || Object.keys(cart).length === 0) return;

  const button = $("placeOrder");
  const payment = document.querySelector('input[name="pay"]:checked').value;

  // Send only item ids and quantities. Prices, total and token come from the server.
  const body = {
    customer: user.email,
    customerName: user.name,
    payment,
    items: Object.entries(cart).map(([id, qty]) => ({ id: Number(id), qty }))
  };

  button.disabled = true;
  button.textContent = "Placing Order...";

  try {
    const order = await api("POST", "/orders", body);

    cart = {};
    $("tokenNo").textContent = order.token;
    $("tokenInfo").textContent = payment === "UPI"
      ? "UPI is a demo option; no real payment was taken. Pay at the counter."
      : `Pay ${rupee(order.total)} at the counter.`;
    $("tokenModal").classList.remove("hidden");

    await refresh();
  } catch (error) {
    alert("Sorry, your order could not be placed. " + error.message);
    refresh(); // the menu may have changed (e.g. item sold out)
  } finally {
    button.textContent = "Place Order";
    button.disabled = Object.keys(cart).length === 0;
  }
}

function renderMyOrders() {
  $("myOrders").innerHTML = orders.length
    ? orders.map(order => orderCard(order)).join("")
    : `<p class="empty">No orders yet today.</p>`;
}

// ---------- ORDER CARD (shared by customer and manager) ----------
function orderCard(order, managerMode = false) {
  const payTag = order.paid
    ? `<span class="paid">✔ Paid (${esc(order.payment)})</span>`
    : `<span class="unpaid">Unpaid (${esc(order.payment)})</span>`;

  const time = new Date(order.createdAt).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit"
  });

  let actions = "";
  if (managerMode) {
    const next = NEXT_LABEL[order.status];
    actions = `<div class="actions">
      ${next ? `<button class="btn btn-primary btn-sm" data-next="${esc(order.orderId)}">${next}</button>` : ""}
      ${!order.paid ? `<button class="btn btn-ghost btn-sm" data-paid="${esc(order.orderId)}">Mark Paid</button>` : ""}
    </div>`;
  }

  return `<div class="card order">
    <div class="order-head">
      <span class="order-token">#${order.token}</span>
      <span class="badge s-${esc(order.status)}">${esc(order.status)}</span>
    </div>
    <div class="order-items">
      ${order.items.map(item => `${item.qty}× ${esc(item.name)}`).join(", ")}
    </div>
    <div class="muted">${managerMode ? esc(order.customerName) + " · " : ""}${time}</div>
    <div class="order-head">
      <strong>${rupee(order.total)}</strong>
      ${payTag}
    </div>
    ${actions}
  </div>`;
}

// ---------- MANAGER ----------
// The server already returns only today's orders, so the KPIs are today-only
function renderManager() {
  $("kOrders").textContent = orders.length;
  $("kRevenue").textContent = rupee(
    orders.filter(o => o.paid).reduce((sum, o) => sum + o.total, 0)
  );
  $("kPending").textContent = orders.filter(o => o.status === "Placed" || o.status === "Preparing").length;
  $("kReady").textContent = orders.filter(o => o.status === "Ready").length;

  $("mBoard").innerHTML = STATUSES.map(status => {
    const list = orders.filter(o => o.status === status);
    return `<div class="col">
      <h4>${status} <span class="muted">${list.length}</span></h4>
      ${list.map(o => orderCard(o, true)).join("") || `<p class="empty">—</p>`}
    </div>`;
  }).join("");

  $("menuTable").innerHTML = menu.map(item => `
    <div class="card menu-row">
      <div class="info">
        <strong>${esc(item.name)}</strong>
        <span class="muted">· ${esc(item.category)}</span>
      </div>
      <span class="price">${rupee(item.price)}</span>
      <button class="btn btn-sm toggle ${item.available ? "on" : "off"}" data-toggle="${item.id}">
        ${item.available ? "Available" : "Sold out"}
      </button>
      <button class="btn btn-ghost btn-sm" data-edit="${item.id}">Edit</button>
      <button class="btn btn-ghost btn-sm" data-del="${item.id}">Delete</button>
    </div>
  `).join("");
}

// Ask the server to move an order forward or mark it paid
async function changeOrder(orderId, action) {
  try {
    await api("PATCH", "/orders/" + encodeURIComponent(orderId), { action });
    await refresh();
  } catch (error) {
    alert("Could not update the order. " + error.message);
  }
}

// Save the whole menu to the server (managers only; the server checks the key)
async function saveMenu(newMenu) {
  try {
    menu = await api("PUT", "/menu", { items: newMenu });
    renderManager();
  } catch (error) {
    alert("Could not save the menu. " + error.message);
  }
}

function saveItem(event) {
  event.preventDefault();

  const id = $("itemId").value;
  const data = {
    name: $("itemName").value.trim(),
    price: Number($("itemPrice").value),
    category: $("itemCat").value.trim()
  };

  // Work on a copy, so the screen only changes after the server agrees
  const newMenu = menu.map(item => ({ ...item }));

  if (id) {
    const item = newMenu.find(m => m.id == id);
    if (item) Object.assign(item, data);
  } else {
    const nextId = Math.max(0, ...newMenu.map(m => m.id)) + 1;
    newMenu.push({ id: nextId, ...data, available: true });
  }

  saveMenu(newMenu);
  resetItemForm();
}

function resetItemForm() {
  $("itemForm").reset();
  $("itemId").value = "";
  $("itemSave").textContent = "Add Item";
  $("itemCancel").classList.add("hidden");
}

// ---------- TABS ----------
function switchTabs(attribute, value, panels) {
  document.querySelectorAll(`[data-${attribute}]`).forEach(button => {
    button.classList.toggle("active", button.dataset[attribute] === value);
  });
  Object.entries(panels).forEach(([key, elementId]) => {
    $(elementId).classList.toggle("hidden", key !== value);
  });
}

// ---------- CLICKS (one listener for every button) ----------
document.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  const data = button.dataset;

  if (data.auth) {
    setAuthMode(data.auth);

  } else if (data.ctab) {
    switchTabs("ctab", data.ctab, { menu: "cMenu", orders: "cOrders" });

  } else if (data.mtab) {
    switchTabs("mtab", data.mtab, { board: "mBoard", menu: "mMenu" });

  } else if (data.cat) {
    activeCat = data.cat;
    renderCustomer();

  } else if (data.add || data.inc) {
    const id = data.add || data.inc;
    cart[id] = (cart[id] || 0) + 1;
    renderCustomer();

  } else if (data.dec) {
    cart[data.dec]--;
    if (cart[data.dec] <= 0) delete cart[data.dec];
    renderCustomer();

  } else if (data.next) {
    changeOrder(data.next, "next");

  } else if (data.paid) {
    changeOrder(data.paid, "paid");

  } else if (data.toggle) {
    saveMenu(menu.map(m => m.id == data.toggle ? { ...m, available: !m.available } : m));

  } else if (data.edit) {
    const item = menu.find(m => m.id == data.edit);
    if (!item) return;
    $("itemId").value = item.id;
    $("itemName").value = item.name;
    $("itemPrice").value = item.price;
    $("itemCat").value = item.category;
    $("itemSave").textContent = "Save Changes";
    $("itemCancel").classList.remove("hidden");

  } else if (data.del) {
    if (confirm("Delete this item?")) saveMenu(menu.filter(m => m.id != data.del));
  }
});

// ---------- OTHER EVENTS ----------
$("authForm").addEventListener("submit", handleAuth);
$("logoutBtn").addEventListener("click", logout);
$("search").addEventListener("input", renderCustomer);
$("placeOrder").addEventListener("click", placeOrder);
$("closeModal").addEventListener("click", () => $("tokenModal").classList.add("hidden"));
$("itemForm").addEventListener("submit", saveItem);
$("itemCancel").addEventListener("click", resetItemForm);
document.querySelectorAll('input[name="role"]').forEach(radio =>
  radio.addEventListener("change", updatePasswordLabel)
);

// Live updates: ask the server for new data every 5 seconds
setInterval(refresh, 5000);

// ---------- START ----------
render();
refresh();
