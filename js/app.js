import { openSeatPicker } from "./seats.js";

/** =========================
 *  Константы localStorage
 *  ========================= */
const LS = {
  FILMS: "cs_films_v1",
  SESSIONS: "cs_sessions_v1",
  FAVS: "cs_favs_v1",
  CART: "cs_cart_v1",
  ORDERS: "cs_orders_v1",
  TAKEN_PREFIX: "cs_takenSeats_session_", // + sessionId
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** =========================
 *  Глобальное состояние
 *  ========================= */
const state = {
  films: [],
  sessions: [],
  activeView: "schedule",
  activeDate: null, // "YYYY-MM-DD"
  filters: {
    q: "",
    genre: "",
    age: "",
    date: "",
  },
};

/** =========================
 *  DOM
 *  ========================= */
const dom = {
  cartBadge: $("#cartBadge"),
  heroFilmTitle: $("#heroFilmTitle"),
  heroPoster: $("#heroPoster"),
  heroGoBtn: $("#heroGoBtn"),

  navLinks: $$(".nav__link[data-nav]"),
  tabs: $$(".tab"),
  views: $$(".view"),

  dateTabs: $("#dateTabs"),
  scheduleList: $("#scheduleList"),

  posterGrid: $("#posterGrid"),
  searchInput: $("#searchInput"),
  genreSelect: $("#genreSelect"),
  ageSelect: $("#ageSelect"),
  dateInput: $("#dateInput"),
  resetFilters: $("#resetFilters"),

  filmPage: $("#filmPage"),

  checkoutRoot: $("#checkoutRoot"),
  accountRoot: $("#accountRoot"),

  toast: $("#toast"),
};

/** =========================
 *  Инициализация
 *  ========================= */
init();

async function init() {
  await ensureSeedData();

  state.films = readJSON(LS.FILMS, []);
  state.sessions = readJSON(LS.SESSIONS, []);

  // активная дата: сегодня, если есть сеансы, иначе ближайшая
  const availableDates = getAvailableDates(state.sessions);
  state.activeDate = pickDefaultDate(availableDates);

  // UI wiring
  bindNavigation();
  bindFilters();

  // Hero
  renderHero();

  // First render
  renderDateTabs();
  renderSchedule();
  renderPoster();
  renderCheckout();
  renderAccount();
  setView("schedule");

  // Hash (необязательно, но удобно)
  applyHashRoute();
  window.addEventListener("hashchange", applyHashRoute);

  updateCartBadge();
}

/** =========================
 *  Seed JSON -> localStorage
 *  ========================= */
async function ensureSeedData() {
  const hasFilms = !!localStorage.getItem(LS.FILMS);
  const hasSessions = !!localStorage.getItem(LS.SESSIONS);

  // если уже есть — не трогаем (админка будет менять localStorage)
  if (hasFilms && hasSessions) return;

  const [films, sessions] = await Promise.all([
    fetch("./data/films.json").then(r => r.json()),
    fetch("./data/sessions.json").then(r => r.json()),
  ]);

  // сохраняем только при первом запуске
  if (!hasFilms) writeJSON(LS.FILMS, films);
  if (!hasSessions) writeJSON(LS.SESSIONS, sessions);

  // инициализируем базовые сущности
  if (!localStorage.getItem(LS.FAVS)) writeJSON(LS.FAVS, []);
  if (!localStorage.getItem(LS.CART)) writeJSON(LS.CART, []);
  if (!localStorage.getItem(LS.ORDERS)) writeJSON(LS.ORDERS, []);
}

/** =========================
 *  Навигация / Views
 *  ========================= */
function bindNavigation() {
  // Header nav
  dom.navLinks.forEach(btn => {
    btn.addEventListener("click", () => {
      const v = btn.dataset.nav;
      if (!v) return;
      go(v);
    });
  });

  // Tabs
  dom.tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const v = tab.dataset.view;
      if (!v) return;
      go(v);
    });
  });

  // Hero buttons
  $$("[data-nav]").forEach(el => {
    el.addEventListener("click", (e) => {
      const v = el.dataset.nav;
      if (!v) return;
      // не перехватываем ссылку админки
      if (el.tagName === "A") return;
      e.preventDefault();
      go(v);
    });
  });
}

function go(view) {
  // support: open film page via current selected film if any in hash
  if (view === "home") view = "schedule";
  setHash(view);
  setView(view);
}

function setView(view) {
  state.activeView = view;

  // hide/show
  dom.views.forEach(v => v.classList.toggle("is-active", v.dataset.view === view));

  // tabs active
  dom.tabs.forEach(t => t.classList.toggle("is-active", t.dataset.view === view));

  // header nav active
  dom.navLinks.forEach(n => n.classList.toggle("is-active", n.dataset.nav === view));

  // on enter some views, refresh from localStorage (после админки)
  if (view === "schedule" || view === "poster" || view === "film") {
    state.films = readJSON(LS.FILMS, []);
    state.sessions = readJSON(LS.SESSIONS, []);
    renderDateTabs();
    renderSchedule();
    renderPoster();
  }
  if (view === "checkout") renderCheckout();
  if (view === "account") renderAccount();

  // scroll to top a bit
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setHash(view) {
  // не ломаем film?id=, поэтому film пишем отдельно
  if (view === "film") return;
  if (location.hash.replace("#", "") !== view) location.hash = view;
}

function applyHashRoute() {
  const raw = location.hash.replace("#", "").trim();

  // film route: #film-<id>
  if (raw.startsWith("film-")) {
    const id = Number(raw.split("-")[1]);
    if (id) openFilm(id);
    return;
  }

  // basic route
  const allowed = new Set(["schedule", "poster", "checkout", "account"]);
  if (allowed.has(raw)) setView(raw);
}

/** =========================
 *  Filters (Афиша)
 *  ========================= */
function bindFilters() {
  if (!dom.searchInput) return;

  dom.searchInput.addEventListener("input", () => {
    state.filters.q = dom.searchInput.value.trim().toLowerCase();
    renderPoster();
  });
  dom.genreSelect.addEventListener("change", () => {
    state.filters.genre = dom.genreSelect.value;
    renderPoster();
  });
  dom.ageSelect.addEventListener("change", () => {
    state.filters.age = dom.ageSelect.value;
    renderPoster();
  });
  dom.dateInput.addEventListener("change", () => {
    state.filters.date = dom.dateInput.value;
    renderPoster();
  });

  dom.resetFilters.addEventListener("click", () => {
    state.filters = { q: "", genre: "", age: "", date: "" };
    dom.searchInput.value = "";
    dom.genreSelect.value = "";
    dom.ageSelect.value = "";
    dom.dateInput.value = "";
    renderPoster();
    toast("Фильтры сброшены");
  });
}

/** =========================
 *  Hero
 *  ========================= */
function renderHero() {
  const films = state.films;
  const premiere = films.find(f => f.isPremiere) || films[0];

  if (!premiere) return;

  dom.heroFilmTitle.textContent = premiere.title;

  if (premiere.posterData) {
    dom.heroPoster.innerHTML = `<div class="hero-poster-img" style="width:100%;height:100%;background-image:url('${escapeAttr(premiere.posterData)}');background-size:cover;background-position:center;border-radius:20px;"></div>`;
  } else {
    dom.heroPoster.innerHTML = posterPlaceholderHTML(premiere.title, premiere.genre?.[0] || "Фильм");
  }
  dom.heroGoBtn.onclick = () => {
    // перейти в расписание и подсветить дату первого сеанса фильма
    const dates = getFilmDates(premiere.id);
    if (dates.length) state.activeDate = dates[0];
    renderDateTabs();
    renderSchedule();
    go("schedule");
  };
}

/** =========================
 *  Date Tabs (Schedule)
 *  ========================= */
function renderDateTabs() {
  const dates = getAvailableDates(state.sessions);
  if (!dates.length) {
    dom.dateTabs.innerHTML = `<div class="panel">Сеансов нет.</div>`;
    return;
  }

  if (!state.activeDate || !dates.includes(state.activeDate)) {
    state.activeDate = pickDefaultDate(dates);
  }

  const today = isoToday();

  dom.dateTabs.innerHTML = dates.slice(0, 7).map(d => {
    const label = makeDateLabel(d, today);
    const active = d === state.activeDate ? "is-active" : "";
    return `
      <button class="date-tab ${active}" data-date="${d}">
        <strong>${label.title}</strong>
        <span>${label.sub}</span>
      </button>
    `;
  }).join("");

  $$(".date-tab", dom.dateTabs).forEach(btn => {
    btn.addEventListener("click", () => {
      state.activeDate = btn.dataset.date;
      renderDateTabs();
      renderSchedule();
    });
  });
}

/** =========================
 *  Schedule (по дате)
 *  ========================= */
function renderSchedule() {
  const date = state.activeDate;
  const sessions = state.sessions.filter(s => s.date === date);
  const filmIds = [...new Set(sessions.map(s => s.filmId))];

  if (!filmIds.length) {
    dom.scheduleList.innerHTML = `
      <div class="panel">
        На выбранную дату сеансов нет. Выбери другую дату выше.
      </div>
    `;
    return;
  }

  const favs = getFavsSet();

  dom.scheduleList.innerHTML = filmIds.map(fid => {
    const film = state.films.find(f => f.id === fid);
    if (!film) return "";

    const filmSessions = sessions
      .filter(s => s.filmId === fid)
      .sort((a,b) => a.time.localeCompare(b.time));

    const meta = [
      film.country ? film.country : null,
      Array.isArray(film.genre) ? film.genre.join(", ") : film.genre,
      film.duration ? film.duration : null
    ].filter(Boolean).join(" • ");

    const chips = filmSessions.map(s => `
      <button class="chip" data-session="${s.id}">
        <strong>${s.time}</strong>
        <span>${money(s.price)}</span>
      </button>
    `).join("");

    const favActive = favs.has(film.id) ? "is-active" : "";

    return `
      <article class="s-card">
        <div class="s-poster" role="img" aria-label="Постер: ${escapeHTML(film.title)}" style="${film.posterData ? `background-image:url('${escapeAttr(film.posterData)}')` : ''}">
          <div class="play">▶</div>
        </div>

        <div class="s-body">
          <div class="s-meta">${escapeHTML(meta)}</div>

          <div class="s-title-row">
            <h3 class="s-title">${escapeHTML(film.title)}</h3>

            <div class="s-badges">
              <div class="badge" title="Возрастное ограничение">${escapeHTML(film.age || "0+")}</div>
              <button class="fav ${favActive}" data-fav="${film.id}" title="В избранное">
                <span>❤</span>
              </button>
            </div>
          </div>

          <div class="session-chips">
            ${chips}
            <button class="chip is-dim" data-open-film="${film.id}">
              <strong>Подробнее</strong>
              <span>о фильме</span>
            </button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  // handlers: chips
  $$("[data-session]", dom.scheduleList).forEach(btn => {
    btn.addEventListener("click", () => {
      const sessionId = Number(btn.dataset.session);
      openSessionModal(sessionId);
    });
  });

  // handlers: fav
  $$("[data-fav]", dom.scheduleList).forEach(btn => {
    btn.addEventListener("click", () => {
      const filmId = Number(btn.dataset.fav);
      toggleFav(filmId);
      renderSchedule();
      renderPoster();
      renderAccount();
    });
  });

  // handlers: open film
  $$("[data-open-film]", dom.scheduleList).forEach(btn => {
    btn.addEventListener("click", () => {
      const filmId = Number(btn.dataset.openFilm);
      openFilm(filmId);
    });
  });
}

/** =========================
 *  Poster (Афиша)
 *  ========================= */
function renderPoster() {
  const films = state.films.slice();
  const sessions = state.sessions.slice();

  // fill genre select once (or refresh safely)
  fillGenreSelect(films);

  const { q, genre, age, date } = state.filters;

  const filtered = films.filter(f => {
    const titleOk = !q || f.title.toLowerCase().includes(q);
    const genreOk = !genre || (Array.isArray(f.genre) ? f.genre.includes(genre) : f.genre === genre);
    const ageOk = !age || (f.age === age);
    const dateOk = !date || sessions.some(s => s.filmId === f.id && s.date === date);
    return titleOk && genreOk && ageOk && dateOk;
  });

  const favs = getFavsSet();

  if (!filtered.length) {
    dom.posterGrid.innerHTML = `<div class="panel">Ничего не найдено по фильтрам.</div>`;
    return;
  }

  dom.posterGrid.innerHTML = filtered.map(f => {
    const meta = [
      Array.isArray(f.genre) ? f.genre.join(", ") : f.genre,
      f.duration || "",
      f.age || ""
    ].filter(Boolean).join(" • ");

    const favActive = favs.has(f.id) ? "is-active" : "";

    return `
      <article class="card">
        <div class="card__poster" role="img" aria-label="Постер: ${escapeHTML(f.title)}" style="${f.posterData ? `background-image:url('${escapeAttr(f.posterData)}')` : ''}"></div>
        <div class="card__content">
          <h3 class="card__title">${escapeHTML(f.title)}</h3>
          <div class="card__line">${escapeHTML(meta)}</div>

          <div class="card__actions">
            <button class="card__btn" data-open-film="${f.id}">Открыть</button>
            <button class="card__fav ${favActive}" data-fav="${f.id}" title="В избранное">❤</button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  $$("[data-open-film]", dom.posterGrid).forEach(btn => {
    btn.addEventListener("click", () => openFilm(Number(btn.dataset.openFilm)));
  });

  $$("[data-fav]", dom.posterGrid).forEach(btn => {
    btn.addEventListener("click", () => {
      toggleFav(Number(btn.dataset.fav));
      renderPoster();
      renderSchedule();
      renderAccount();
    });
  });
}

function fillGenreSelect(films) {
  const all = new Set();
  films.forEach(f => {
    if (Array.isArray(f.genre)) f.genre.forEach(g => all.add(g));
    else if (f.genre) all.add(f.genre);
  });

  const current = dom.genreSelect.value;
  const options = ["", ...Array.from(all).sort((a,b) => a.localeCompare(b, "ru"))];

  dom.genreSelect.innerHTML = options.map(v => {
    const label = v ? `Жанр: ${v}` : "Жанр: все";
    return `<option value="${escapeAttr(v)}">${escapeHTML(label)}</option>`;
  }).join("");

  dom.genreSelect.value = current || "";
}

/** =========================
 *  Film Page
 *  ========================= */
function openFilm(filmId) {
  const film = state.films.find(f => f.id === filmId);
  if (!film) {
    toast("Фильм не найден");
    return;
  }

  const favs = getFavsSet();
  const favActive = favs.has(film.id) ? "is-active" : "";

  const meta = [
    film.country || "",
    Array.isArray(film.genre) ? film.genre.join(", ") : (film.genre || ""),
    film.duration || "",
    film.age || ""
  ].filter(Boolean).join(" • ");

  const dates = getFilmDates(film.id); // уникальные даты
  const firstDate = dates[0] || state.activeDate;

  const sessionsForDate = state.sessions
    .filter(s => s.filmId === film.id && s.date === firstDate)
    .sort((a,b) => a.time.localeCompare(b.time));

  const chips = sessionsForDate.map(s => `
    <button class="chip" data-session="${s.id}">
      <strong>${s.time}</strong>
      <span>${money(s.price)}</span>
    </button>
  `).join("");

  dom.filmPage.innerHTML = `
    <div class="film__top">
      <div class="film__poster" role="img" aria-label="Постер: ${escapeHTML(film.title)}" style="${film.posterData ? `background-image:url('${escapeAttr(film.posterData)}')` : ''}"></div>

      <div>
        <div class="film__titleRow">
          <div>
            <h2 class="film__title">${escapeHTML(film.title)}</h2>
            <div class="film__meta">${escapeHTML(meta)}</div>
          </div>

          <button class="fav ${favActive}" data-fav="${film.id}" title="В избранное">
            <span>❤</span>
          </button>
        </div>

        <p class="film__desc">${escapeHTML(film.description || "")}</p>

        <div class="film__actions">
          <button class="btn btn--soft trailer-btn" id="toggleTrailerBtn">Трейлер</button>
          <button class="btn btn--soft" id="backToPoster">В афишу</button>
          <button class="btn btn--primary" id="goScheduleForFilm">Сеансы</button>
        </div>

        <div id="trailerBox" class="panel" style="display:none; padding:12px;">
          <div style="position:relative; padding-top:56.25%; border-radius:16px; overflow:hidden; border:1px solid rgba(255,255,255,.10);">
            <iframe
              src="${escapeAttr(film.trailer || "")}"
              title="Трейлер"
              style="position:absolute; inset:0; width:100%; height:100%; border:0;"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
            ></iframe>
          </div>
        </div>

        <div class="film__sessions">
          <div class="section-label">Сеансы (первый доступный день: ${escapeHTML(formatDateRu(firstDate))})</div>
          <div class="session-chips">
            ${chips || `<div style="color:rgba(255,255,255,.62)">Нет сеансов</div>`}
          </div>
        </div>

        <div class="section-label">Актёры</div>
        <div style="color:rgba(255,255,255,.72); line-height:1.55;">
          ${(film.actors || []).map(a => `• ${escapeHTML(a)}`).join("<br>") || "—"}
        </div>

        <div class="section-label">Рейтинг</div>
        <div style="color:rgba(255,255,255,.72);">${film.rating ? `${film.rating} / 10` : "—"}</div>
      </div>
    </div>
  `;

  // handlers
  $("#toggleTrailerBtn")?.addEventListener("click", () => {
    const box = $("#trailerBox");
    if (!box) return;
    const show = box.style.display === "none";
    box.style.display = show ? "block" : "none";
  });

  $("#backToPoster")?.addEventListener("click", () => go("poster"));

  $("#goScheduleForFilm")?.addEventListener("click", () => {
    const d = getFilmDates(film.id)[0];
    if (d) state.activeDate = d;
    renderDateTabs();
    renderSchedule();
    go("schedule");
  });

  $$("[data-session]", dom.filmPage).forEach(btn => {
    btn.addEventListener("click", () => openSessionModal(Number(btn.dataset.session)));
  });

  $$("[data-fav]", dom.filmPage).forEach(btn => {
    btn.addEventListener("click", () => {
      toggleFav(Number(btn.dataset.fav));
      openFilm(film.id); // rerender
      renderPoster();
      renderSchedule();
      renderAccount();
    });
  });

  location.hash = `film-${film.id}`;
  setView("film");
}

/** =========================
 *  Seats modal (open)
 *  ========================= */
function openSessionModal(sessionId) {
  const session = state.sessions.find(s => s.id === sessionId);
  if (!session) return toast("Сеанс не найден");

  const film = state.films.find(f => f.id === session.filmId);
  if (!film) return toast("Фильм сеанса не найден");

  openSeatPicker({
    sessionId,
    filmTitle: film.title,
    date: session.date,
    time: session.time,
    hall: session.hall,
    price: session.price,
    onAddToCart: (payload) => {
      addToCart(payload);
      updateCartBadge();
      toast("Добавлено в корзину");
      // можно сразу открыть корзину:
      // go("checkout");
    },
    getTakenSeats: () => getTakenSeats(sessionId),
  });
}

/** =========================
 *  Cart / Checkout
 *  ========================= */
function addToCart(item) {
  const cart = readJSON(LS.CART, []);
  // один сеанс = одна позиция (перезаписываем)
  const filtered = cart.filter(c => c.sessionId !== item.sessionId);
  filtered.push(item);
  writeJSON(LS.CART, filtered);
}

function removeFromCart(sessionId) {
  const cart = readJSON(LS.CART, []);
  writeJSON(LS.CART, cart.filter(c => c.sessionId !== sessionId));
  updateCartBadge();
}

function clearCart() {
  writeJSON(LS.CART, []);
  updateCartBadge();
}

function updateCartBadge() {
  const cart = readJSON(LS.CART, []);
  const count = cart.reduce((acc, it) => acc + (it.seats?.length || 0), 0);
  dom.cartBadge.textContent = String(count);
}

function renderCheckout() {
  const cart = readJSON(LS.CART, []);
  if (!cart.length) {
    dom.checkoutRoot.innerHTML = `
      <div class="panel">
        <h3>Корзина пуста</h3>
        <div style="color:rgba(255,255,255,.65); margin-bottom:10px;">
          Выбери сеанс и места — затем вернись сюда для оформления.
        </div>
        <button class="btn btn--primary" data-nav="schedule">Перейти к расписанию</button>
      </div>
    `;
    $$("[data-nav]", dom.checkoutRoot).forEach(b => b.addEventListener("click", () => go(b.dataset.nav)));
    return;
  }

  const total = cart.reduce((sum, it) => sum + (it.total || 0), 0);

  dom.checkoutRoot.innerHTML = `
    <div class="panel">
      <h3>Выбранные билеты</h3>
      <div id="cartList"></div>
      <div class="total">
        <span style="color:rgba(255,255,255,.65)">Итого</span>
        <strong>${money(total)}</strong>
      </div>

      <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap;">
        <button class="small-btn" id="clearCartBtn">Очистить корзину</button>
        <button class="small-btn" data-nav="schedule">Добавить ещё</button>
      </div>
    </div>

    <div class="panel">
      <h3>Оформление (имитация оплаты)</h3>
      <form class="form" id="checkoutForm">
        <label>Имя
          <input class="input" name="name" required placeholder="Иван" />
        </label>
        <label>Телефон
          <input class="input" name="phone" required placeholder="+7 999 000-00-00" />
        </label>
        <label>Email
          <input class="input" name="email" type="email" required placeholder="mail@example.com" />
        </label>

        <button class="btn btn--primary" type="submit">Оплатить (демо)</button>
        <button class="btn btn--soft" type="button" id="backBtn">Назад</button>

        <div style="margin-top:10px; color:rgba(255,255,255,.65); font-size:13px;">
          Оплата — имитация. После “оплаты” заказ сохраняется в localStorage и появится в “Моих билетах”.
        </div>
      </form>
    </div>
  `;

  // render cart list
  const cartList = $("#cartList", dom.checkoutRoot);
  cartList.innerHTML = cart.map(it => {
    return `
      <div class="cart-item">
        <div class="cart-item__left">
          <p class="cart-item__title">${escapeHTML(it.filmTitle)}</p>
          <div class="cart-item__meta">
            ${escapeHTML(formatDateRu(it.date))} • ${escapeHTML(it.time)} • Зал ${escapeHTML(String(it.hall))}
            <br/>
            Места: ${escapeHTML(it.seats.join(", "))}
          </div>
        </div>
        <div class="cart-item__right">
          <strong>${money(it.total)}</strong>
          <button class="small-btn" data-remove="${it.sessionId}">Удалить</button>
        </div>
      </div>
    `;
  }).join("");

  $$("[data-remove]", dom.checkoutRoot).forEach(btn => {
    btn.addEventListener("click", () => {
      removeFromCart(Number(btn.dataset.remove));
      renderCheckout();
    });
  });

  $("#clearCartBtn", dom.checkoutRoot)?.addEventListener("click", () => {
    clearCart();
    renderCheckout();
    toast("Корзина очищена");
  });

  $$("[data-nav]", dom.checkoutRoot).forEach(b => b.addEventListener("click", () => go(b.dataset.nav)));

  $("#backBtn", dom.checkoutRoot)?.addEventListener("click", () => go("schedule"));

  $("#checkoutForm", dom.checkoutRoot)?.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const customer = {
      name: String(fd.get("name") || "").trim(),
      phone: String(fd.get("phone") || "").trim(),
      email: String(fd.get("email") || "").trim(),
    };

    if (!customer.name || !customer.phone || !customer.email) {
      toast("Заполни все поля");
      return;
    }

    // оформляем все позиции корзины одним заказом
    const orders = readJSON(LS.ORDERS, []);
    const orderId = makeOrderId();
    const createdAt = new Date().toISOString();

    const order = {
      id: orderId,
      createdAt,
      customer,
      items: cart,
      total,
    };

    // делаем места занятыми
    cart.forEach(it => {
      markSeatsTaken(it.sessionId, it.seats);
    });

    orders.unshift(order);
    writeJSON(LS.ORDERS, orders);

    clearCart();
    renderCheckout();
    renderAccount();

    toast(`Оплата прошла (демо). Заказ №${orderId}`);
    go("account");
  });
}

/** =========================
 *  Account (orders + favs)
 *  ========================= */
function renderAccount() {
  const orders = readJSON(LS.ORDERS, []);
  const favs = readJSON(LS.FAVS, []);
  const favFilms = favs.map(id => state.films.find(f => f.id === id)).filter(Boolean);

  dom.accountRoot.innerHTML = `
    <div class="panel">
      <h3>Мои билеты</h3>
      <div id="ordersBox">
        ${orders.length ? "" : `<div style="color:rgba(255,255,255,.65)">Пока нет покупок. Оформи заказ в корзине.</div>`}
      </div>
    </div>

    <div class="panel">
      <h3>Избранное</h3>
      <div id="favsBox">
        ${favFilms.length ? "" : `<div style="color:rgba(255,255,255,.65)">Пока пусто. Добавь фильм в избранное ❤</div>`}
      </div>
    </div>
  `;

  const ordersBox = $("#ordersBox", dom.accountRoot);
  if (orders.length) {
    ordersBox.innerHTML = orders.map(o => {
      const first = o.items?.[0];
      const meta = first
        ? `${formatDateRu(first.date)} • ${first.time} • ${first.filmTitle}`
        : "Заказ";

      const qrText = makeQrText(o);

      return `
        <div class="ticket">
          <p class="ticket__title">Заказ №${escapeHTML(o.id)}</p>
          <div class="ticket__meta">${escapeHTML(meta)} • ${money(o.total)}</div>

          <button class="small-btn" data-qr="${escapeAttr(o.id)}" style="margin-top:10px;">Показать QR</button>
          <div class="qr" id="qr-${escapeAttr(o.id)}" style="display:none;">${escapeHTML(qrText)}</div>
        </div>
      `;
    }).join("");

    $$("[data-qr]", ordersBox).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.qr;
        const el = $(`#qr-${cssIdEscape(id)}`, ordersBox);
        if (!el) return;
        const show = el.style.display === "none";
        el.style.display = show ? "block" : "none";
        btn.textContent = show ? "Скрыть QR" : "Показать QR";
      });
    });
  }

  const favsBox = $("#favsBox", dom.accountRoot);
  if (favFilms.length) {
    favsBox.innerHTML = favFilms.map(f => `
      <div class="ticket">
        <p class="ticket__title">${escapeHTML(f.title)}</p>
        <div class="ticket__meta">${escapeHTML((Array.isArray(f.genre) ? f.genre.join(", ") : f.genre) || "")} • ${escapeHTML(f.age || "")}</div>
        <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">
          <button class="small-btn" data-open-film="${f.id}">Открыть</button>
          <button class="small-btn" data-fav="${f.id}">Убрать ❤</button>
        </div>
      </div>
    `).join("");

    $$("[data-open-film]", favsBox).forEach(btn => btn.addEventListener("click", () => openFilm(Number(btn.dataset.openFilm))));
    $$("[data-fav]", favsBox).forEach(btn => btn.addEventListener("click", () => {
      toggleFav(Number(btn.dataset.fav));
      renderAccount();
      renderPoster();
      renderSchedule();
    }));
  }
}

/** =========================
 *  Favorites
 *  ========================= */
function getFavsSet() {
  const favs = readJSON(LS.FAVS, []);
  return new Set(favs);
}

function toggleFav(filmId) {
  const favs = readJSON(LS.FAVS, []);
  const idx = favs.indexOf(filmId);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.unshift(filmId);
  writeJSON(LS.FAVS, favs);
}

/** =========================
 *  Seats (taken)
 *  ========================= */
function getTakenSeats(sessionId) {
  return readJSON(LS.TAKEN_PREFIX + sessionId, []);
}

function markSeatsTaken(sessionId, seats) {
  const key = LS.TAKEN_PREFIX + sessionId;
  const taken = new Set(readJSON(key, []));
  (seats || []).forEach(s => taken.add(s));
  writeJSON(key, Array.from(taken));
}

/** =========================
 *  Helpers (dates)
 *  ========================= */
function getAvailableDates(sessions) {
  const dates = [...new Set(sessions.map(s => s.date))].sort((a,b) => a.localeCompare(b));
  return dates;
}

function pickDefaultDate(dates) {
  const today = isoToday();
  if (dates.includes(today)) return today;
  // ближайшая будущая, иначе первая
  const future = dates.find(d => d >= today);
  return future || dates[0];
}

function getFilmDates(filmId) {
  return [...new Set(state.sessions.filter(s => s.filmId === filmId).map(s => s.date))].sort((a,b)=>a.localeCompare(b));
}

function isoToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function makeDateLabel(iso, todayIso) {
  const d = new Date(iso + "T00:00:00");
  const dow = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"][d.getDay()];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth()+1).padStart(2, "0");

  if (iso === todayIso) return { title: "Сегодня", sub: `${dow}, ${dd}.${mm}` };

  const tomorrow = addDaysISO(todayIso, 1);
  if (iso === tomorrow) return { title: "Завтра", sub: `${dow}, ${dd}.${mm}` };

  return { title: `${dow}, ${dd}.${mm}`, sub: "Сеансы" };
}

function addDaysISO(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateRu(iso) {
  const d = new Date(iso + "T00:00:00");
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth()+1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

/** =========================
 *  Helpers (storage)
 *  ========================= */
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/** =========================
 *  Helpers (UI)
 *  ========================= */
function toast(msg) {
  dom.toast.textContent = msg;
  dom.toast.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    dom.toast.hidden = true;
  }, 2200);
}

function money(n) {
  const num = Number(n) || 0;
  return `${num.toLocaleString("ru-RU")} ₽`;
}

function posterPlaceholderHTML(title, sub) {
  return `
    <div class="poster-placeholder" aria-hidden="true">
      <div class="poster-placeholder__inner">
        <strong>${escapeHTML(title)}</strong>
        <span>${escapeHTML(sub)}</span>
      </div>
    </div>
  `;
}

/** =========================
 *  Helpers (order/qr)
 *  ========================= */
function makeOrderId() {
  // компактный номер заказа
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${t}-${r}`;
}

function makeQrText(order) {
  // псевдо-QR: моноширинный блок с ключевыми данными
  const lines = [];
  lines.push("████ ████ ████ ████");
  lines.push("██ ███ ██ ███ ██ ███");
  lines.push("████ ████ ████ ████");
  lines.push("");
  lines.push(`ORDER: ${order.id}`);
  lines.push(`SUM:   ${order.total} RUB`);
  const item = order.items?.[0];
  if (item) {
    lines.push(`FILM:  ${item.filmTitle}`);
    lines.push(`WHEN:  ${item.date} ${item.time}`);
    lines.push(`HALL:  ${item.hall}`);
    lines.push(`SEATS: ${(item.seats || []).join(",")}`);
  }
  return lines.join("\n");
}

/** =========================
 *  Helpers (escape)
 *  ========================= */
function escapeHTML(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttr(s) {
  return escapeHTML(s).replaceAll("`", "&#096;");
}
function cssIdEscape(id) {
  // для querySelector по id со спецсимволами
  return CSS && CSS.escape ? CSS.escape(id) : String(id).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}