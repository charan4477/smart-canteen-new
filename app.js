
const KEYS = {
  users: "sc_users",
  session: "sc_session",
  menu: "sc_menu",
  orders: "sc_orders",
  token: "sc_token"
};

const API_URL =
  "https://wjdjzob4ne.execute-api.us-east-1.amazonaws.com/orders";

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

const DEFAULT_MENU = [
  { id: 1, name: "Masala Dosa", price: 60, category: "Breakfast", available: true },
  { id: 2, name: "Idli Sambar", price: 40, category: "Breakfast", available: true },
  { id: 3, name: "Veg Meals", price: 90, category: "Meals", available: true },
  { id: 4, name: "Chicken Biryani", price: 140, category: "Meals", available: true },
  { id: 5, name: "Samosa", price: 20, category: "Snacks", available: true },
  { id: 6, name: "Veg Sandwich", price: 50, category: "Snacks", available: true },
  { id: 7, name: "Masala Chai", price: 15, category: "Drinks", available: true }
];

const DEMO_USERS = [
  {
    name: "Demo Customer",
    email: "customer@canteen.com",
    password: "customer123",
    role: "customer"
  },
  {
    name: "Chef Suresh",
    email: "manager@canteen.com",
    password: "manager123",
    role: "manager"
  }
];

// ---------- STORAGE ----------
const load = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

const save = (key, value) =>
  localStorage.setItem(key, JSON.stringify(value));

const $ = id => document.getElementById(id);

const rupee = amount =>
  "₹" + Number(amount || 0).toLocaleString("en-IN");

function seed() {
  if (!localStorage.getItem(KEYS.menu)) {
    save(KEYS.menu, DEFAULT_MENU);
  }

  if (!localStorage.getItem(KEYS.users)) {
    save(KEYS.users, DEMO_USERS);
  }

  if (!localStorage.getItem(KEYS.orders)) {
    save(KEYS.orders, []);
  }
}

// ---------- STATE ----------
let authMode = "login";
let cart = {};
let activeCat = "All";

const session = () => load(KEYS.session, null);

// ---------- AUTHENTICATION ----------
function setAuthMode(mode) {
  authMode = mode;

  document.querySelectorAll("[data-auth]").forEach(button => {
    button.classList.toggle("active", button.dataset.auth === mode);
  });

  $("nameField").classList.toggle("hidden", mode === "login");
  $("authSubmit").textContent =
    mode === "login" ? "Sign In" : "Create Account";

  $("authError").textContent = "";
}

function showAuthError(message) {
  $("authError").textContent = message;
}

function handleAuth(event) {
  event.preventDefault();

  const email = $("authEmail").value.trim().toLowerCase();
  const password = $("authPass").value;
  const role = document.querySelector(
    'input[name="role"]:checked'
  ).value;

  const users = load(KEYS.users, []);

  if (authMode === "signup") {
    const name = $("authName").value.trim();

    if (!name) {
      return showAuthError("Please enter your name.");
    }

    if (password.length < 6) {
      return showAuthError(
        "Password must be at least 6 characters."
      );
    }

    if (users.some(user => user.email === email)) {
      return showAuthError("That email is already registered.");
    }

    const user = { name, email, password, role };
    users.push(user);
    save(KEYS.users, users);
    login(user);
    return;
  }

  const user = users.find(
    item => item.email === email && item.password === password
  );

  if (!user) {
    return showAuthError("Wrong email or password.");
  }

  if (user.role !== role) {
    return showAuthError(
      `This account is a ${user.role}. Pick the right role.`
    );
  }

  login(user);
}

function login(user) {
  save(KEYS.session, {
    email: user.email,
    name: user.name,
    role: user.role
  });

  $("authForm").reset();
  render();
}

function logout() {
  localStorage.removeItem(KEYS.session);
  cart = {};
  render();
}

// ---------- MAIN RENDER ----------
function render() {
  const currentSession = session();

  $("authView").classList.toggle("hidden", !!currentSession);
  $("userBox").classList.toggle("hidden", !currentSession);

  $("customerView").classList.toggle(
    "hidden",
    !currentSession || currentSession.role !== "customer"
  );

  $("managerView").classList.toggle(
    "hidden",
    !currentSession || currentSession.role !== "manager"
  );

  if (!currentSession) return;

  $("userName").textContent = currentSession.name;
  $("userRole").textContent = currentSession.role;

  if (currentSession.role === "customer") {
    renderCustomer();
  } else {
    renderManager();
  }
}

// ---------- CUSTOMER MENU ----------
function renderCustomer() {
  const menu = load(KEYS.menu, []);

  Object.keys(cart).forEach(id => {
    const item = menu.find(menuItem => menuItem.id == id);

    if (!item || !item.available) {
      delete cart[id];
    }
  });

  const categories = [
    "All",
    ...new Set(menu.map(item => item.category))
  ];

  $("catFilters").innerHTML = categories.map(category => `
    <button class="chip ${category === activeCat ? "active" : ""}"
      data-cat="${category}">${category}</button>
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
        <h4>${item.name}</h4>
        <span class="muted">${item.category}</span>
        <div class="row">
          <span class="price">${rupee(item.price)}</span>
          <button class="btn btn-primary btn-sm"
            data-add="${item.id}">Add</button>
        </div>
      </div>
    `).join("")
    : `<p class="empty">No items found.</p>`;

  renderCart(menu);
  renderMyOrders();
}

function renderCart(menu) {
  const lines = Object.entries(cart)
    .map(([id, qty]) => ({
      item: menu.find(menuItem => menuItem.id == id),
      qty
    }))
    .filter(line => line.item);

  const total = lines.reduce(
    (sum, line) => sum + line.item.price * line.qty,
    0
  );

  $("cartItems").innerHTML = lines.length
    ? lines.map(line => `
      <div class="cart-line">
        <span>${line.item.name}</span>
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

// ---------- AWS ORDER SUBMISSION ----------
async function placeOrder() {
  const currentSession = session();

  if (!currentSession) {
    alert("Please sign in before placing an order.");
    return;
  }

  const menu = load(KEYS.menu, []);
  const button = $("placeOrder");

  const selectedItems = Object.entries(cart);

  if (!selectedItems.length) return;

  const items = [];

  for (const [id, qty] of selectedItems) {
    const item = menu.find(menuItem => menuItem.id == id);

    if (!item || !item.available) {
      alert("An item in your cart is unavailable. Please refresh your cart.");
      renderCustomer();
      return;
    }

    items.push({
      name: item.name,
      price: Number(item.price),
      qty: Number(qty)
    });
  }

  const paymentMethod = document.querySelector(
    'input[name="pay"]:checked'
  ).value;

  const token = Number(load(KEYS.token, 100)) + 1;

  const total = items.reduce(
    (sum, item) => sum + item.price * item.qty,
    0
  );

  const orderId = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `SC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const order = {
    id: Date.now(),
    orderId,
    token,
    customer: currentSession.email,
    customerName: currentSession.name,
    items,
    total,
    payment: paymentMethod,
    // Demo only: UPI is not actually processed.
    paid: false,
    status: "Placed",
    createdAt: new Date().toISOString()
  };

  button.disabled = true;
  button.textContent = "Placing Order...";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        orderId: order.orderId,
        token: order.token,
        customer: order.customer,
        customerName: order.customerName,
        items: order.items,
        total: order.total,
        payment: order.payment,
        paid: order.paid,
        status: "PLACED",
        createdAt: order.createdAt
      })
    });

    const responseText = await response.text();
    let result = {};

    if (responseText) {
      try {
        result = JSON.parse(responseText);
      } catch {
        result = { message: responseText };
      }
    }

    if (!response.ok) {
      throw new Error(
        result.message ||
        result.error ||
        `Request failed: HTTP ${response.status}`
      );
    }

    // Save locally only after the API confirms success.
    const orders = load(KEYS.orders, []);
    orders.unshift(order);

    save(KEYS.orders, orders);
    save(KEYS.token, token);

    cart = {};

    $("tokenNo").textContent = token;

    $("tokenInfo").textContent =
      paymentMethod === "UPI"
        ? `Order saved. UPI payment is simulated; no real payment was processed.`
        : `Order saved. Pay ${rupee(total)} at the counter.`;

    $("tokenModal").classList.remove("hidden");
    renderCustomer();

  } catch (error) {
    console.error("AWS order submission failed:", error);

    alert(
      "Order could not be confirmed by AWS.\n\n" +
      error.message +
      "\n\nCheck API Gateway CORS settings, the API URL, " +
      "and your Lambda CloudWatch logs."
    );
  } finally {
    button.textContent = "Place Order";
    button.disabled = Object.keys(cart).length === 0;
  }
}

// ---------- ORDER CARDS ----------
function orderCard(order, managerMode = false) {
  const payTag = order.paid
    ? `<span class="paid">✔ Paid (${order.payment})</span>`
    : `<span class="unpaid">Unpaid (${order.payment})</span>`;

  const time = new Date(order.createdAt).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit"
  });

  let actions = "";

  if (managerMode) {
    const next = NEXT_LABEL[order.status];

    actions = `<div class="actions">
      ${next
        ? `<button class="btn btn-primary btn-sm"
            data-next="${order.id}">${next}</button>`
        : ""}
      ${!order.paid
        ? `<button class="btn btn-ghost btn-sm"
            data-paid="${order.id}">Mark Paid</button>`
        : ""}
    </div>`;
  }

  return `<div class="card order">
    <div class="order-head">
      <span class="order-token">#${order.token}</span>
      <span class="badge s-${order.status}">${order.status}</span>
    </div>
    <div class="order-items">
      ${order.items.map(item => `${item.qty}× ${item.name}`).join(", ")}
    </div>
    ${managerMode
      ? `<div class="muted">${order.customerName} · ${time}</div>`
      : `<div class="muted">${time}</div>`}
    <div class="order-head">
      <strong>${rupee(order.total)}</strong>
      ${payTag}
    </div>
    ${actions}
  </div>`;
}

function renderMyOrders() {
  const currentSession = session();
  if (!currentSession) return;

  const mine = load(KEYS.orders, []).filter(
    order => order.customer === currentSession.email
  );

  $("myOrders").innerHTML = mine.length
    ? mine.map(order => orderCard(order)).join("")
    : `<p class="empty">No orders yet.</p>`;
}

// ---------- MANAGER DASHBOARD ----------
function renderManager() {
  const orders = load(KEYS.orders, []);
  const today = new Date().toDateString();

  const todaysOrders = orders.filter(
    order => new Date(order.createdAt).toDateString() === today
  );

  $("kOrders").textContent = todaysOrders.length;

  $("kRevenue").textContent = rupee(
    todaysOrders
      .filter(order => order.paid)
      .reduce((sum, order) => sum + order.total, 0)
  );

  $("kPending").textContent = orders.filter(
    order =>
      order.status === "Placed" ||
      order.status === "Preparing"
  ).length;

  $("kReady").textContent = orders.filter(
    order => order.status === "Ready"
  ).length;

  $("mBoard").innerHTML = STATUSES.map(status => {
    const list = orders.filter(order =>
      order.status === status &&
      (status !== "Collected" ||
        new Date(order.createdAt).toDateString() === today)
    );

    return `<div class="col">
      <h4>${status} <span class="muted">${list.length}</span></h4>
      ${list.map(order => orderCard(order, true)).join("") ||
        `<p class="empty">—</p>`}
    </div>`;
  }).join("");

  const menu = load(KEYS.menu, []);

  $("menuTable").innerHTML = menu.map(item => `
    <div class="card menu-row">
      <div class="info">
        <strong>${item.name}</strong>
        <span class="muted">· ${item.category}</span>
      </div>
      <span class="price">${rupee(item.price)}</span>
      <button class="btn btn-sm toggle ${item.available ? "on" : "off"}"
        data-toggle="${item.id}">
        ${item.available ? "Available" : "Sold out"}
      </button>
      <button class="btn btn-ghost btn-sm"
        data-edit="${item.id}">Edit</button>
      <button class="btn btn-ghost btn-sm"
        data-del="${item.id}">Delete</button>
    </div>
  `).join("");
}

function updateOrder(id, updateFunction) {
  const orders = load(KEYS.orders, []);
  const order = orders.find(item => item.id == id);

  if (!order) return;

  updateFunction(order);
  save(KEYS.orders, orders);
  renderManager();
}

function saveItem(event) {
  event.preventDefault();

  const menu = load(KEYS.menu, []);
  const id = $("itemId").value;

  const data = {
    name: $("itemName").value.trim(),
    price: Number($("itemPrice").value),
    category: $("itemCat").value.trim()
  };

  if (id) {
    const item = menu.find(menuItem => menuItem.id == id);
    if (item) Object.assign(item, data);
  } else {
    menu.push({
      id: Math.max(0, ...menu.map(item => item.id)) + 1,
      ...data,
      available: true
    });
  }

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

// ---------- TAB SWITCHING ----------
function switchTabs(attribute, value, panels) {
  document.querySelectorAll(`[data-${attribute}]`).forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset[attribute] === value
    );
  });

  Object.entries(panels).forEach(([key, elementId]) => {
    $(elementId).classList.toggle("hidden", key !== value);
  });
}

// ---------- CLICK EVENTS ----------
document.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;

  const data = button.dataset;

  if (data.auth) {
    setAuthMode(data.auth);

  } else if (data.demo) {
    const demoUser = DEMO_USERS.find(
      user => user.role === data.demo
    );

    const storedUser = load(KEYS.users, []).find(
      user => user.email === demoUser.email
    );

    login(storedUser || demoUser);

  } else if (data.ctab) {
    switchTabs("ctab", data.ctab, {
      menu: "cMenu",
      orders: "cOrders"
    });

  } else if (data.mtab) {
    switchTabs("mtab", data.mtab, {
      board: "mBoard",
      menu: "mMenu"
    });

  } else if (data.cat) {
    activeCat = data.cat;
    renderCustomer();

  } else if (data.add || data.inc) {
    const id = data.add || data.inc;
    cart[id] = (cart[id] || 0) + 1;
    renderCustomer();

  } else if (data.dec) {
    cart[data.dec]--;

    if (cart[data.dec] <= 0) {
      delete cart[data.dec];
    }

    renderCustomer();

  } else if (data.next) {
    updateOrder(data.next, order => {
      order.status =
        STATUSES[STATUSES.indexOf(order.status) + 1] ||
        order.status;
    });

  } else if (data.paid) {
    updateOrder(data.paid, order => {
      order.paid = true;
    });

  } else if (data.toggle) {
    const menu = load(KEYS.menu, []);
    const item = menu.find(
      menuItem => menuItem.id == data.toggle
    );

    if (item) {
      item.available = !item.available;
      save(KEYS.menu, menu);
      renderManager();
    }

  } else if (data.edit) {
    const item = load(KEYS.menu, []).find(
      menuItem => menuItem.id == data.edit
    );

    if (!item) return;

    $("itemId").value = item.id;
    $("itemName").value = item.name;
    $("itemPrice").value = item.price;
    $("itemCat").value = item.category;
    $("itemSave").textContent = "Save Changes";
    $("itemCancel").classList.remove("hidden");

  } else if (data.del) {
    if (confirm("Delete this item?")) {
      save(
        KEYS.menu,
        load(KEYS.menu, []).filter(
          item => item.id != data.del
        )
      );

      renderManager();
    }
  }
});

// ---------- EVENT LISTENERS ----------
$("authForm").addEventListener("submit", handleAuth);
$("logoutBtn").addEventListener("click", logout);
$("search").addEventListener("input", renderCustomer);
$("placeOrder").addEventListener("click", placeOrder);

$("closeModal").addEventListener("click", () => {
  $("tokenModal").classList.add("hidden");
});

$("itemForm").addEventListener("submit", saveItem);
$("itemCancel").addEventListener("click", resetItemForm);

// Local browser-tab synchronization only.
// This does not retrieve orders from DynamoDB.
window.addEventListener("storage", render);

setInterval(() => {
  const currentSession = session();

  if (!currentSession) return;

  if (currentSession.role === "manager") {
    renderManager();
  } else {
    renderMyOrders();
  }
}, 2000);

// ---------- START APPLICATION ----------
seed();
render();