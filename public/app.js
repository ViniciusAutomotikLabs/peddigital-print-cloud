const MENU = [
  { id: "linguica", name: "Linguiça na chapa com pão", price: 31.99, station: "COZINHA", cat: "comida" },
  { id: "carne", name: "Carne de sol com queijo", price: 43.99, station: "COZINHA", cat: "comida" },
  { id: "pastel", name: "Cestinha com 8 pastéis", price: 27.98, station: "COZINHA", cat: "comida" },
  { id: "calabresa", name: "Calabresa acebolada", price: 13.99, station: "COZINHA", cat: "comida" },
  { id: "chopp", name: "Chopp geladinho", price: 5.99, station: "BAR", cat: "bebida" },
  { id: "drinks", name: "Drinks", price: 21.99, station: "BAR", cat: "bebida" },
];

const state = { filter: "all", cart: [] };
const slug = location.pathname.startsWith("/m/")
  ? location.pathname.split("/")[2] || "demo"
  : "demo";

const q = new URLSearchParams(location.search);
if (q.get("mesa")) document.getElementById("mesa").value = q.get("mesa");
if (q.get("comanda")) document.getElementById("comanda").value = q.get("comanda");

function money(n) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function setStatus(msg, kind = "") {
  const el = document.getElementById("status");
  el.textContent = msg || "";
  el.className = `status ${kind}`.trim();
}

function renderMenu() {
  const items = MENU.filter((i) => state.filter === "all" || i.cat === state.filter);
  document.getElementById("menu").innerHTML = items
    .map(
      (item) => `<article class="card">
      <span class="badge ${item.station === "BAR" ? "bar" : ""}">${item.station === "BAR" ? "Bar" : "Cozinha"}</span>
      <h3>${item.name}</h3>
      <div class="price">${money(item.price)}</div>
      <button type="button" data-add="${item.id}">Adicionar</button>
    </article>`
    )
    .join("");
}

function renderCart() {
  const list = document.getElementById("cart-list");
  const count = state.cart.reduce((n, i) => n + i.qty, 0);
  document.getElementById("cart-count").textContent = String(count);
  document.getElementById("btn-send").disabled = !state.cart.length;
  if (!state.cart.length) {
    list.innerHTML = `<li style="color:var(--muted)">Nenhum item ainda.</li>`;
    return;
  }
  list.innerHTML = state.cart
    .map(
      (item) => `<li><span>${item.qty}x ${item.name}</span>
      <button type="button" class="rm" data-rm="${item.id}">remover</button></li>`
    )
    .join("");
}

function splitTickets() {
  const groups = { COZINHA: [], BAR: [] };
  for (const item of state.cart) {
    groups[item.station].push({ qty: item.qty, name: item.name });
  }
  return Object.entries(groups)
    .filter(([, items]) => items.length)
    .map(([station, items]) => ({ station, items }));
}

async function refreshHealth() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    document.getElementById("mode-label").textContent = data.agentOnline
      ? "Salão online · pode pedir pelo 4G/5G"
      : "Salão offline · aguarde o Android conectar";
  } catch {
    document.getElementById("mode-label").textContent = "Sem conexão com o servidor";
  }
}

async function sendOrder() {
  const tickets = splitTickets();
  if (!tickets.length) return;
  setStatus("Enviando...");
  document.getElementById("btn-send").disabled = true;
  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        mesa: document.getElementById("mesa").value.trim() || "12",
        comanda: document.getElementById("comanda").value.trim() || "T",
        note: document.getElementById("note").value.trim(),
        tickets,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Falha ao enviar");
    setStatus("Pedido enviado! Já vai para a impressora.", "ok");
    state.cart = [];
    document.getElementById("note").value = "";
    renderCart();
  } catch (err) {
    setStatus(err.message || String(err), "err");
    document.getElementById("btn-send").disabled = state.cart.length === 0;
  }
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.filter = btn.dataset.cat;
    renderMenu();
  });
});

document.getElementById("menu").addEventListener("click", (e) => {
  const id = e.target.closest("[data-add]")?.dataset.add;
  if (!id) return;
  const product = MENU.find((p) => p.id === id);
  const existing = state.cart.find((c) => c.id === id);
  if (existing) existing.qty += 1;
  else state.cart.push({ ...product, qty: 1 });
  renderCart();
});

document.getElementById("cart-list").addEventListener("click", (e) => {
  const id = e.target.closest("[data-rm]")?.dataset.rm;
  if (!id) return;
  state.cart = state.cart.filter((c) => c.id !== id);
  renderCart();
});

document.getElementById("btn-send").addEventListener("click", sendOrder);
renderMenu();
renderCart();
refreshHealth();
setInterval(refreshHealth, 10000);
