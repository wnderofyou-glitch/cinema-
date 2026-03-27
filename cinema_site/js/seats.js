/**
 * Seat picker modal (no dependencies)
 * Работает с разметкой модалки из index.html:
 * #modalOverlay, #modalClose, #modalMeta, #seatGrid, #seatSummary, #addToCartBtn, #zoomIn, #zoomOut
 */

const $ = (sel, root = document) => root.querySelector(sel);

function getDom() {
  return {
    overlay: $("#modalOverlay"),
    close: $("#modalClose"),
    meta: $("#modalMeta"),
    seatGrid: $("#seatGrid"),
    seatSummary: $("#seatSummary"),
    addBtn: $("#addToCartBtn"),
    zoomIn: $("#zoomIn"),
    zoomOut: $("#zoomOut"),
  };
}

let current = null;
let zoom = 1;

export function openSeatPicker(opts) {
  const dom = getDom();
  if (!dom.overlay) return;

  const taken = new Set((opts.getTakenSeats && opts.getTakenSeats()) || []);

  current = {
    sessionId: Number(opts.sessionId),
    filmTitle: String(opts.filmTitle || ""),
    date: String(opts.date || ""),
    time: String(opts.time || ""),
    hall: Number(opts.hall || 1),
    price: Number(opts.price || 0),
    taken,
    selected: new Set(),
    onAddToCart: opts.onAddToCart,
  };

  zoom = 1;
  dom.seatGrid.style.transform = `scale(${zoom})`;

  dom.meta.textContent = `${formatDateRu(current.date)} • ${current.time} • Зал ${current.hall}`;
  renderHall(dom, current.hall);
  updateSummary(dom);

  // ВАЖНО: навешиваем обработчики каждый раз (самый надёжный вариант)
  bindHandlers(dom);

  openModal(dom);
}

function bindHandlers(dom) {
  // ✕
  dom.close.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeModal(dom);
  };

  // клик по фону
  dom.overlay.onclick = (e) => {
    if (e.target === dom.overlay) closeModal(dom);
  };

  // ESC
  window.onkeydown = (e) => {
    if (e.key === "Escape" && !dom.overlay.hasAttribute("hidden")) {
      closeModal(dom);
    }
  };

  // zoom
  dom.zoomIn.onclick = () => {
    zoom = Math.min(1.5, +(zoom + 0.1).toFixed(2));
    dom.seatGrid.style.transform = `scale(${zoom})`;
  };

  dom.zoomOut.onclick = () => {
    zoom = Math.max(0.7, +(zoom - 0.1).toFixed(2));
    dom.seatGrid.style.transform = `scale(${zoom})`;
  };
}

function openModal(dom) {
  dom.overlay.hidden = false;
  dom.overlay.removeAttribute("hidden");
  document.body.style.overflow = "hidden";
  dom.close?.focus();
}

function closeModal(dom) {
  dom.overlay.hidden = true;
  dom.overlay.setAttribute("hidden", "");
  document.body.style.overflow = "";
  current = null;
}

function getHallLayout(hall) {
  switch (Number(hall)) {
    case 1: return [10, 10, 10, 10, 10, 10];
    case 2: return [8, 10, 10, 10, 8];
    case 3: return [12, 12, 12, 12, 12, 12, 12];
    case 4: return [8, 8, 10, 10, 10, 8, 8];
    default: return [10, 10, 10, 10, 10];
  }
}

function renderHall(dom, hall) {
  const layout = getHallLayout(hall);

  dom.seatGrid.innerHTML = "";
  layout.forEach((seatsInRow, rowIndex) => {
    const rowNum = rowIndex + 1;
    const row = document.createElement("div");
    row.className = "seat-row";

    for (let i = 1; i <= seatsInRow; i++) {
      const seatLabel = `${rowNum}-${i}`;
      const btn = document.createElement("button");
      btn.className = "seat";
      btn.type = "button";
      btn.textContent = String(i);
      btn.setAttribute("data-seat", seatLabel);
      btn.setAttribute("aria-label", `Ряд ${rowNum}, место ${i}`);

      if (current.taken.has(seatLabel)) {
        btn.classList.add("is-taken");
        btn.disabled = true;
      }

      btn.addEventListener("click", () => toggleSeat(dom, seatLabel, btn));
      row.appendChild(btn);
    }

    dom.seatGrid.appendChild(row);
  });
}

function toggleSeat(dom, seatLabel, btn) {
  if (!current) return;
  if (current.taken.has(seatLabel)) return;

  if (current.selected.has(seatLabel)) {
    current.selected.delete(seatLabel);
    btn.classList.remove("is-selected");
  } else {
    if (current.selected.size >= 8) return;
    current.selected.add(seatLabel);
    btn.classList.add("is-selected");
  }

  updateSummary(dom);
}

function updateSummary(dom) {
  if (!current) return;

  const count = current.selected.size;
  const total = count * current.price;

  dom.seatSummary.textContent = `${count} мест • ${money(total)}`;

  dom.addBtn.disabled = count === 0;
  dom.addBtn.onclick = () => {
    if (!current || current.selected.size === 0) return;

    const seats = Array.from(current.selected).sort((a, b) => {
      const [ra, sa] = a.split("-").map(Number);
      const [rb, sb] = b.split("-").map(Number);
      return ra - rb || sa - sb;
    });

    const payload = {
      sessionId: current.sessionId,
      filmTitle: current.filmTitle,
      date: current.date,
      time: current.time,
      hall: current.hall,
      price: current.price,
      seats,
      total: seats.length * current.price,
    };

    if (typeof current.onAddToCart === "function") current.onAddToCart(payload);

    closeModal(dom);
  };
}

function money(n) {
  const num = Number(n) || 0;
  return `${num.toLocaleString("ru-RU")} ₽`;
}

function formatDateRu(iso) {
  const d = new Date(iso + "T00:00:00");
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}