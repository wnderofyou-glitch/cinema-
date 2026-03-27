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

const dom = {
  filmsList: $("#filmsList"),
  sessionsList: $("#sessionsList"),

  addFilmBtn: $("#addFilmBtn"),
  reloadFilmsBtn: $("#reloadFilmsBtn"),
  addSessionBtn: $("#addSessionBtn"),
  reloadSessionsBtn: $("#reloadSessionsBtn"),

  filmFormTitle: $("#filmFormTitle"),
  filmForm: $("#filmForm"),
  cancelFilmEdit: $("#cancelFilmEdit"),

  sessionFormTitle: $("#sessionFormTitle"),
  sessionForm: $("#sessionForm"),
  cancelSessionEdit: $("#cancelSessionEdit"),

  sessionFilmSelect: $("#sessionForm select[name='filmId']"),

  posterPreview: $("#posterPreview"),
  removePosterBtn: $("#removePosterBtn"),

  toast: $("#toast"),
};

let films = [];
let sessions = [];

let posterDataDraft = "";
let removePosterFlag = false;

init();

async function init() {
  await ensureSeedData();

  films = readJSON(LS.FILMS, []);
  sessions = readJSON(LS.SESSIONS, []);

  bindUI();
  renderAll();
}

async function ensureSeedData() {
  const hasFilms = !!localStorage.getItem(LS.FILMS);
  const hasSessions = !!localStorage.getItem(LS.SESSIONS);

  if (hasFilms && hasSessions) {
    if (!localStorage.getItem(LS.FAVS)) writeJSON(LS.FAVS, []);
    if (!localStorage.getItem(LS.CART)) writeJSON(LS.CART, []);
    if (!localStorage.getItem(LS.ORDERS)) writeJSON(LS.ORDERS, []);
    return;
  }

  // Подтянуть JSON (чтобы админка работала даже если сайт не открывали)
  const [seedFilms, seedSessions] = await Promise.all([
    fetch("./data/films.json").then(r => r.json()),
    fetch("./data/sessions.json").then(r => r.json()),
  ]);

  if (!hasFilms) writeJSON(LS.FILMS, seedFilms);
  if (!hasSessions) writeJSON(LS.SESSIONS, seedSessions);

  if (!localStorage.getItem(LS.FAVS)) writeJSON(LS.FAVS, []);
  if (!localStorage.getItem(LS.CART)) writeJSON(LS.CART, []);
  if (!localStorage.getItem(LS.ORDERS)) writeJSON(LS.ORDERS, []);
}

/** =========================
 *  UI bindings
 *  ========================= */
function bindUI() {
  dom.addFilmBtn.addEventListener("click", () => {
    resetFilmForm();
    toast("Заполни форму и нажми «Сохранить фильм»");
  });

  dom.reloadFilmsBtn.addEventListener("click", () => {
    films = readJSON(LS.FILMS, []);
    renderFilms();
    fillFilmSelect();
    toast("Список фильмов обновлён");
  });

  dom.addSessionBtn.addEventListener("click", () => {
    resetSessionForm();
    toast("Заполни форму и нажми «Сохранить сеанс»");
  });

  dom.reloadSessionsBtn.addEventListener("click", () => {
    sessions = readJSON(LS.SESSIONS, []);
    renderSessions();
    toast("Список сеансов обновлён");
  });

  dom.cancelFilmEdit.addEventListener("click", () => resetFilmForm());
  dom.cancelSessionEdit.addEventListener("click", () => resetSessionForm());

  dom.filmForm.addEventListener("submit", (e) => {
    e.preventDefault();
    saveFilmFromForm();
  });

  dom.sessionForm.addEventListener("submit", (e) => {
    e.preventDefault();
    saveSessionFromForm();
  });

  // Постер фильма: загрузка в base64 (localStorage)
  const posterInput = dom.filmForm.elements.posterFile;
  posterInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxMB = 1.5;
    if (file.size > maxMB * 1024 * 1024) {
      toast(`Файл слишком большой. Используй до ${maxMB}MB`);
      e.target.value = "";
      return;
    }

    try {
      posterDataDraft = await fileToDataURL(file);
      removePosterFlag = false;
      if (dom.posterPreview) dom.posterPreview.src = posterDataDraft;
      toast("Постер загружен (сохранится после сохранения фильма)");
    } catch {
      toast("Не удалось прочитать файл постера");
    }
  });

  dom.removePosterBtn?.addEventListener("click", () => {
    posterDataDraft = "";
    removePosterFlag = true;
    if (dom.posterPreview) dom.posterPreview.src = "";
    if (dom.filmForm.elements.posterFile) dom.filmForm.elements.posterFile.value = "";
    toast("Постер будет удалён после сохранения фильма");
  });
}

/** =========================
 *  Render
 *  ========================= */
function renderAll() {
  renderFilms();
  renderSessions();
  fillFilmSelect();
  resetFilmForm();
  resetSessionForm();
}

function renderFilms() {
  films = readJSON(LS.FILMS, []).slice().sort((a, b) => a.id - b.id);

  if (!films.length) {
    dom.filmsList.innerHTML = `<div style="color:rgba(255,255,255,.65)">Фильмов нет.</div>`;
    return;
  }

  dom.filmsList.innerHTML = films.map(f => {
    const g = Array.isArray(f.genre) ? f.genre.join(", ") : (f.genre || "");
    return `
      <div class="admin-item">
        <div style="min-width:0;">
          <strong>${escapeHTML(f.title)}</strong><br/>
          <small>${escapeHTML(g)} • ${escapeHTML(f.age || "")} • ${escapeHTML(f.duration || "")}</small>
        </div>
        <div class="actions">
          <button class="small-btn" data-edit-film="${f.id}">Редактировать</button>
          <button class="small-btn" data-del-film="${f.id}">Удалить</button>
        </div>
      </div>
    `;
  }).join("");

  $$("[data-edit-film]", dom.filmsList).forEach(btn => {
    btn.addEventListener("click", () => editFilm(Number(btn.dataset.editFilm)));
  });

  $$("[data-del-film]", dom.filmsList).forEach(btn => {
    btn.addEventListener("click", () => deleteFilm(Number(btn.dataset.delFilm)));
  });
}

function renderSessions() {
  sessions = readJSON(LS.SESSIONS, []).slice().sort((a, b) => {
    const ad = `${a.date} ${a.time}`;
    const bd = `${b.date} ${b.time}`;
    return ad.localeCompare(bd);
  });

  if (!sessions.length) {
    dom.sessionsList.innerHTML = `<div style="color:rgba(255,255,255,.65)">Сеансов нет.</div>`;
    return;
  }

  dom.sessionsList.innerHTML = sessions.map(s => {
    const film = films.find(f => f.id === s.filmId);
    const title = film ? film.title : `filmId=${s.filmId}`;
    return `
      <div class="admin-item">
        <div style="min-width:0;">
          <strong>${escapeHTML(title)}</strong><br/>
          <small>${escapeHTML(formatDateRu(s.date))} • ${escapeHTML(s.time)} • Зал ${escapeHTML(String(s.hall))} • ${money(s.price)}</small>
        </div>
        <div class="actions">
          <button class="small-btn" data-edit-session="${s.id}">Редактировать</button>
          <button class="small-btn" data-del-session="${s.id}">Удалить</button>
        </div>
      </div>
    `;
  }).join("");

  $$("[data-edit-session]", dom.sessionsList).forEach(btn => {
    btn.addEventListener("click", () => editSession(Number(btn.dataset.editSession)));
  });

  $$("[data-del-session]", dom.sessionsList).forEach(btn => {
    btn.addEventListener("click", () => deleteSession(Number(btn.dataset.delSession)));
  });
}

function fillFilmSelect() {
  films = readJSON(LS.FILMS, []);
  const current = dom.sessionFilmSelect.value;

  dom.sessionFilmSelect.innerHTML = films
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title, "ru"))
    .map(f => `<option value="${f.id}">${escapeHTML(f.title)}</option>`)
    .join("");

  // восстановить выбранное, если есть
  if (current && films.some(f => String(f.id) === String(current))) {
    dom.sessionFilmSelect.value = current;
  }
}

/** =========================
 *  CRUD: Films
 *  ========================= */
function resetFilmForm() {
  dom.filmFormTitle.textContent = "Добавление фильма";
  dom.filmForm.reset();
  dom.filmForm.elements.id.value = "";
}
  posterDataDraft = "";
  removePosterFlag = false;
  if (dom.posterPreview) dom.posterPreview.src = "";
  if (dom.filmForm.elements.posterFile) dom.filmForm.elements.posterFile.value = "";


function editFilm(id) {
  const film = films.find(f => f.id === id);
  if (!film) return toast("Фильм не найден");

  dom.filmFormTitle.textContent = `Редактирование фильма #${id}`;
  dom.filmForm.elements.id.value = film.id;
  dom.filmForm.elements.title.value = film.title || "";
  dom.filmForm.elements.genre.value = Array.isArray(film.genre) ? film.genre.join(", ") : (film.genre || "");
  dom.filmForm.elements.age.value = film.age || "";
  dom.filmForm.elements.duration.value = film.duration || "";
  dom.filmForm.elements.description.value = film.description || "";
  dom.filmForm.elements.rating.value = film.rating ?? "";
  dom.filmForm.elements.isPremiere.value = String(!!film.isPremiere);

  

  posterDataDraft = film.posterData || "";
  removePosterFlag = false;
  if (dom.posterPreview) dom.posterPreview.src = posterDataDraft || "";
  if (dom.filmForm.elements.posterFile) dom.filmForm.elements.posterFile.value = "";
toast("Измени поля и нажми «Сохранить фильм»");
}

function saveFilmFromForm() {
  const fd = new FormData(dom.filmForm);

  const idRaw = String(fd.get("id") || "").trim();
  const isEdit = !!idRaw;

  const title = String(fd.get("title") || "").trim();
  const genreStr = String(fd.get("genre") || "").trim();
  const age = String(fd.get("age") || "").trim();
  const duration = String(fd.get("duration") || "").trim();
  const description = String(fd.get("description") || "").trim();
  const rating = fd.get("rating") === "" ? null : Number(fd.get("rating"));
  const isPremiere = String(fd.get("isPremiere")) === "true";

  if (!title) return toast("Название обязательно");

  const genre = genreStr
    ? genreStr.split(",").map(s => s.trim()).filter(Boolean)
    : [];

  let list = readJSON(LS.FILMS, []);

  if (isEdit) {
    const id = Number(idRaw);
    const idx = list.findIndex(f => f.id === id);
    if (idx < 0) return toast("Фильм для редактирования не найден");

    // сохраняем остальные поля, которые могли быть в исходном JSON (actors/trailer/poster/country/originalTitle)
    const prev = list[idx];

    const posterDataFinal = removePosterFlag ? "" : (posterDataDraft || prev.posterData || "");

    list[idx] = {
      ...prev,
      title,
      genre,
      age,
      duration,
      description,
      rating,
      isPremiere,
      posterData: posterDataFinal,
    };

    writeJSON(LS.FILMS, list);
    films = list;
    renderFilms();
    fillFilmSelect();
    renderSessions();
    resetFilmForm();
    toast("Фильм обновлён");
    return;
  }

  // create
  const nextId = makeNextId(list.map(f => f.id), 1);
  const newFilm = {
    id: nextId,
    title,
    originalTitle: "",
    country: "Россия",
    genre,
    age: age || "12+",
    duration: duration || "2 ч 00 мин",
    rating: rating ?? 7.0,
    description: description || "Описание фильма...",
    actors: [],
    poster: "custom",
    trailer: "",
    isPremiere,
  };

  list.push(newFilm);
  writeJSON(LS.FILMS, list);
  films = list;

  renderFilms();
  fillFilmSelect();
  resetFilmForm();
  toast("Фильм добавлен");
}

function deleteFilm(id) {
  const film = films.find(f => f.id === id);
  if (!film) return toast("Фильм не найден");

  const ok = confirm(`Удалить фильм "${film.title}"?\nТакже будут удалены все сеансы этого фильма.`);
  if (!ok) return;

  // удалить фильм
  let list = readJSON(LS.FILMS, []).filter(f => f.id !== id);
  writeJSON(LS.FILMS, list);
  films = list;

  // удалить связанные сеансы
  let ses = readJSON(LS.SESSIONS, []).filter(s => s.filmId !== id);
  writeJSON(LS.SESSIONS, ses);
  sessions = ses;

  // удалить из избранного
  let favs = readJSON(LS.FAVS, []).filter(fid => fid !== id);
  writeJSON(LS.FAVS, favs);

  // удалить из корзины
  let cart = readJSON(LS.CART, []).filter(c => c.filmId !== id && c.filmTitle !== film.title);
  writeJSON(LS.CART, cart);

  renderAll();
  toast("Фильм и его сеансы удалены");
}

/** =========================
 *  CRUD: Sessions
 *  ========================= */
function resetSessionForm() {
  dom.sessionFormTitle.textContent = "Добавление сеанса";
  dom.sessionForm.reset();
  dom.sessionForm.elements.id.value = "";
  // выставим зал и цену по умолчанию
  dom.sessionForm.elements.hall.value = 1;
  dom.sessionForm.elements.price.value = 450;

  // дата по умолчанию сегодня
  dom.sessionForm.elements.date.value = isoToday();
  dom.sessionForm.elements.time.value = "18:00";
}

function editSession(id) {
  const s = sessions.find(x => x.id === id);
  if (!s) return toast("Сеанс не найден");

  dom.sessionFormTitle.textContent = `Редактирование сеанса #${id}`;
  dom.sessionForm.elements.id.value = s.id;
  dom.sessionForm.elements.filmId.value = String(s.filmId);
  dom.sessionForm.elements.date.value = s.date;
  dom.sessionForm.elements.time.value = s.time;
  dom.sessionForm.elements.hall.value = s.hall;
  dom.sessionForm.elements.price.value = s.price;

  toast("Измени поля и нажми «Сохранить сеанс»");
}

function saveSessionFromForm() {
  const fd = new FormData(dom.sessionForm);

  const idRaw = String(fd.get("id") || "").trim();
  const isEdit = !!idRaw;

  const filmId = Number(fd.get("filmId"));
  const date = String(fd.get("date") || "").trim();
  const time = String(fd.get("time") || "").trim();
  const hall = Number(fd.get("hall"));
  const price = Number(fd.get("price"));

  if (!filmId || !date || !time || !hall || !price) return toast("Заполни все поля сеанса");

  let list = readJSON(LS.SESSIONS, []);

  if (isEdit) {
    const id = Number(idRaw);
    const idx = list.findIndex(s => s.id === id);
    if (idx < 0) return toast("Сеанс для редактирования не найден");

    list[idx] = { ...list[idx], filmId, date, time, hall, price };
    writeJSON(LS.SESSIONS, list);
    sessions = list;

    renderSessions();
    resetSessionForm();
    toast("Сеанс обновлён");
    return;
  }

  // create
  const nextId = makeNextId(list.map(s => s.id), 100);
  const newSession = { id: nextId, filmId, date, time, hall, price };
  list.push(newSession);

  writeJSON(LS.SESSIONS, list);
  sessions = list;

  renderSessions();
  resetSessionForm();
  toast("Сеанс добавлен");
}

function deleteSession(id) {
  const s = sessions.find(x => x.id === id);
  if (!s) return toast("Сеанс не найден");

  const ok = confirm(`Удалить сеанс #${id} (${formatDateRu(s.date)} ${s.time})?\nТакже будут очищены “занятые места” этого сеанса.`);
  if (!ok) return;

  // удалить сеанс
  let list = readJSON(LS.SESSIONS, []).filter(x => x.id !== id);
  writeJSON(LS.SESSIONS, list);
  sessions = list;

  // удалить занятые места для сеанса
  localStorage.removeItem(LS.TAKEN_PREFIX + id);

  renderSessions();
  resetSessionForm();
  toast("Сеанс удалён");
}

/** =========================
 *  Helpers
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

function toast(msg) {
  dom.toast.textContent = msg;
  dom.toast.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (dom.toast.hidden = true), 2200);
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

function isoToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function makeNextId(ids, floor) {
  const max = ids.length ? Math.max(...ids.map(n => Number(n) || 0)) : floor;
  return Math.max(max + 1, floor);
}

function escapeHTML(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
