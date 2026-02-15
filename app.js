import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getFirestore,
  doc,
  collection,
  onSnapshot,
  setDoc,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

// =======================
// FIREBASE CONFIG
// =======================
const firebaseConfig = {
  apiKey: "AIzaSyBdForzpHb7Z0ZKcpbtQUYkhkSgrvNxqOk",
  authDomain: "gpratetpg.firebaseapp.com",
  projectId: "gpratetpg",
  storageBucket: "gpratetpg.firebasestorage.app",
  messagingSenderId: "537787271478",
  appId: "1:537787271478:web:2e1d8f734f9a4020c60b97"
};

const ADMIN_EMAIL = "dinijanuari23@gmail.com";
const SELLER_GET = 0.7;
const wantAdminPanel = new URLSearchParams(window.location.search).get("admin") === "1";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

// =======================
// STATE
// =======================
let isAdmin = false;
let currentType = null; // "gig" | "paytax" | "notax" | null

let gigRate = 95;
let paytaxRate = 75;
let notaxRate = 80;

let mapsCache = [];   // [{id, name}]
let itemsCache = [];  // [{id, name, robux}]
let selectedMapId = "";
let selectedItemId = "";

let unsubscribeItems = null;

// =======================
// HELPERS
// =======================
function formatRupiah(num){
  const n = Number(num || 0);
  return "Rp" + new Intl.NumberFormat('id-ID').format(isNaN(n) ? 0 : n);
}
function toInt(v){
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}
function toPosInt(v){
  const n = toInt(v);
  return n > 0 ? n : 0;
}
function showToast(message, type = "ok"){
  const toast = document.getElementById("toast");
  if(!toast) return;
  toast.classList.remove("error");
  if(type === "error") toast.classList.add("error");
  toast.textContent = message;
  toast.style.display = "block";
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=> toast.style.display = "none", 2600);
}
function slugify(s){
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}
function setSelectOptions(selectEl, options, placeholder){
  if(!selectEl) return;
  selectEl.innerHTML = "";

  if(placeholder){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = placeholder;
    selectEl.appendChild(opt);
  }

  for(const o of options){
    const opt = document.createElement("option");
    opt.value = o.id;
    opt.textContent = o.name;
    selectEl.appendChild(opt);
  }
}

function getActiveRate(){
  if(currentType === "paytax") return paytaxRate;
  if(currentType === "notax") return notaxRate;
  return gigRate;
}

// =======================
// UI REFS
// =======================
const typeGrid = document.getElementById("typeGrid");
const typeButtons = Array.from(document.querySelectorAll(".type-btn"));

const rateEl = document.getElementById("rate");
const rateHint = document.getElementById("rateHint");
const hargaHint = document.getElementById("hargaHint");

const fieldsWrap = document.getElementById("fieldsWrap");
const extraOutputWrap = document.getElementById("extraOutputWrap");

const paytaxFields = document.getElementById("paytaxFields");
const notaxFields = document.getElementById("notaxFields");
const gigFields = document.getElementById("gigFields");

const targetNet = document.getElementById("targetNet");
const robuxInput = document.getElementById("robuxInput");

// GIG
const gigMapSelect = document.getElementById("gigMapSelect");
const gigItemButtons = document.getElementById("gigItemButtons");
const gigItemHint = document.getElementById("gigItemHint");
const gigRobuxReadonly = document.getElementById("gigRobuxReadonly");

// output
const robuxNeedEl = document.getElementById("robuxNeed");
const netReceiveEl = document.getElementById("netReceive");
const hargaEl = document.getElementById("harga");

// admin
const adminBadge = document.getElementById("adminBadge");
const adminPanel = document.getElementById("adminPanel");

const btnAdminLogin = document.getElementById("btnAdminLogin");
const btnAdminLogout = document.getElementById("btnAdminLogout");
const adminStatus = document.getElementById("adminStatus");

const adminGigRate = document.getElementById("adminGigRate");
const adminPaytaxRate = document.getElementById("adminPaytaxRate");
const adminNotaxRate = document.getElementById("adminNotaxRate");
const btnSaveRates = document.getElementById("btnSaveRates");

const adminNewMapName = document.getElementById("adminNewMapName");
const btnAddMap = document.getElementById("btnAddMap");
const adminMapSelect = document.getElementById("adminMapSelect");

const adminNewItemName = document.getElementById("adminNewItemName");
const adminNewItemRobux = document.getElementById("adminNewItemRobux");
const btnUpsertItem = document.getElementById("btnUpsertItem");

// =======================
// ADMIN UI
// =======================
function setAdminControlsEnabled(canEdit){
  if(adminGigRate) adminGigRate.disabled = !canEdit;
  if(adminPaytaxRate) adminPaytaxRate.disabled = !canEdit;
  if(adminNotaxRate) adminNotaxRate.disabled = !canEdit;
  if(btnSaveRates) btnSaveRates.disabled = !canEdit;

  if(adminNewMapName) adminNewMapName.disabled = !canEdit;
  if(btnAddMap) btnAddMap.disabled = !canEdit;
  if(adminMapSelect) adminMapSelect.disabled = !canEdit;

  if(adminNewItemName) adminNewItemName.disabled = !canEdit;
  if(adminNewItemRobux) adminNewItemRobux.disabled = !canEdit;
  if(btnUpsertItem) btnUpsertItem.disabled = !canEdit;
}

function applyAdminUI(user){
  const email = (user?.email || "").toLowerCase();
  isAdmin = !!(user && email === ADMIN_EMAIL.toLowerCase());

  if(!wantAdminPanel) return;

  if(btnAdminLogin) btnAdminLogin.style.display = user ? "none" : "inline-block";
  if(btnAdminLogout) btnAdminLogout.style.display = user ? "inline-block" : "none";

  if(adminStatus){
    if(!user) adminStatus.textContent = "Belum login.";
    else if(isAdmin) adminStatus.textContent = `Login: ${user.email} (ADMIN ✅)`;
    else adminStatus.textContent = `Login: ${user.email} (BUKAN ADMIN ❌)`;
  }

  setAdminControlsEnabled(isAdmin);

  if(user && !isAdmin){
    signOut(auth).catch(()=>{});
    showToast("Email ini bukan admin. Logout otomatis.", "error");
  }
}

function showAdminPanelIfNeeded(){
  if(adminPanel) adminPanel.classList.toggle("hidden", !wantAdminPanel);
  if(adminBadge) adminBadge.classList.toggle("hidden", !wantAdminPanel);
}

// =======================
// UI: RATE + OUTPUT
// =======================
function setRateUI(){
  const r = getActiveRate();
  if(rateEl) rateEl.value = `${formatRupiah(r)} / Robux`;
  if(rateHint) rateHint.textContent = `Rp${new Intl.NumberFormat('id-ID').format(r)} / Robux`;
}

function clearOutputs(){
  if(robuxNeedEl) robuxNeedEl.value = "";
  if(netReceiveEl) netReceiveEl.value = "";
  if(hargaEl) hargaEl.value = "";
  if(hargaHint) hargaHint.textContent = "";
}

// =======================
// CALC
// =======================
function calcPaytax(){
  const target = toPosInt(targetNet?.value);
  if(!target){ clearOutputs(); return; }

  const need = Math.ceil(target / SELLER_GET);
  const harga = need * paytaxRate;

  if(robuxNeedEl) robuxNeedEl.value = `${need} R$`;
  if(netReceiveEl) netReceiveEl.value = `${target} R$`;
  if(hargaEl) hargaEl.value = formatRupiah(harga);
}

function calcNotax(){
  const robux = toPosInt(robuxInput?.value);
  if(!robux){ clearOutputs(); return; }

  const net = Math.floor(robux * SELLER_GET);
  const harga = robux * notaxRate;

  if(robuxNeedEl) robuxNeedEl.value = `${robux} R$`;
  if(netReceiveEl) netReceiveEl.value = `${net} R$`;
  if(hargaEl) hargaEl.value = formatRupiah(harga);
}

function getGigRobux(){
  const it = itemsCache.find(x => x.id === selectedItemId);
  return it ? toPosInt(it.robux) : 0;
}

function calcGig(){
  const robux = getGigRobux();
  if(!robux){ clearOutputs(); return; }

  const harga = robux * gigRate;

  if(robuxNeedEl) robuxNeedEl.value = `${robux} R$`;
  if(netReceiveEl) netReceiveEl.value = "";
  if(hargaEl) hargaEl.value = formatRupiah(harga);
}

function recalc(){
  setRateUI();
  if(currentType === "paytax") return calcPaytax();
  if(currentType === "notax") return calcNotax();
  if(currentType === "gig") return calcGig();
  // belum pilih tipe
  clearOutputs();
}

// =======================
// UI: TYPE BUTTONS
// =======================
function setActiveType(type){
  currentType = type;

  // active button UI
  for(const b of typeButtons){
    b.classList.toggle("active", b.dataset.type === type);
  }

  // show needed sections
  fieldsWrap?.classList.remove("hidden");

  paytaxFields?.classList.add("hidden");
  notaxFields?.classList.add("hidden");
  gigFields?.classList.add("hidden");

  // default: extra output tampil hanya setelah pilih tipe
  extraOutputWrap?.classList.remove("hidden");

  // clear inputs
  if(targetNet) targetNet.value = "";
  if(robuxInput) robuxInput.value = "";
  if(gigRobuxReadonly) gigRobuxReadonly.value = "";
  selectedItemId = "";

  clearOutputs();
  setRateUI();

  if(type === "paytax"){
    paytaxFields?.classList.remove("hidden");
  } else if(type === "notax"){
    notaxFields?.classList.remove("hidden");
  } else if(type === "gig"){
    gigFields?.classList.remove("hidden");
  }

  // hitung ulang jika ada data existing
  recalc();
}

function setInitialUI(){
  // belum pilih tipe => hide all fields
  currentType = null;
  for(const b of typeButtons) b.classList.remove("active");

  fieldsWrap?.classList.add("hidden");
  extraOutputWrap?.classList.add("hidden");

  // tetap tampil Rate + Harga
  setRateUI();
  clearOutputs();
}

// =======================
// GIG: render item buttons
// =======================
function renderGigItemButtons(){
  if(!gigItemButtons) return;
  gigItemButtons.innerHTML = "";

  if(!itemsCache.length){
    if(gigItemHint) gigItemHint.textContent = "Belum ada item di maps ini.";
    return;
  }

  if(gigItemHint) gigItemHint.textContent = "Pilih item:";

  for(const it of itemsCache){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "item-btn";
    btn.dataset.itemId = it.id;
    btn.innerHTML = `${it.name}<small>${toPosInt(it.robux)} R$</small>`;

    btn.addEventListener("click", () => {
      selectedItemId = it.id;

      // active state
      const all = gigItemButtons.querySelectorAll(".item-btn");
      all.forEach(x => x.classList.toggle("active", x.dataset.itemId === it.id));

      if(gigRobuxReadonly) gigRobuxReadonly.value = `${toPosInt(it.robux)} R$`;
      recalc();
    });

    gigItemButtons.appendChild(btn);
  }
}

// =======================
// FIRESTORE LISTENERS
// =======================
function bindRates(){
  const ref = doc(db, "settings", "rates");
  onSnapshot(ref, (snap) => {
    if(snap.exists()){
      const d = snap.data() || {};
      const g = Number(d.gigRate);
      const p = Number(d.paytaxRate);
      const n = Number(d.notaxRate);

      if(Number.isFinite(g) && g > 0) gigRate = Math.round(g);
      if(Number.isFinite(p) && p > 0) paytaxRate = Math.round(p);
      if(Number.isFinite(n) && n > 0) notaxRate = Math.round(n);
    }

    // sync admin inputs
    if(adminGigRate) adminGigRate.value = gigRate;
    if(adminPaytaxRate) adminPaytaxRate.value = paytaxRate;
    if(adminNotaxRate) adminNotaxRate.value = notaxRate;

    setRateUI();
    recalc();
  }, () => {
    setRateUI();
    recalc();
  });
}

function bindMaps(){
  const mapsRef = collection(db, "maps");
  const qMaps = query(mapsRef, orderBy("name", "asc"));

  onSnapshot(qMaps, (snap) => {
    mapsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .map(x => ({ id: x.id, name: x.name || x.id }));

    setSelectOptions(gigMapSelect, mapsCache, mapsCache.length ? "Pilih maps..." : "Belum ada maps");
    setSelectOptions(adminMapSelect, mapsCache, mapsCache.length ? "Pilih maps..." : "Belum ada maps");

    // auto select first map (for gig usage)
    if(mapsCache.length){
      if(!selectedMapId) selectedMapId = mapsCache[0].id;
      if(gigMapSelect && !gigMapSelect.value) gigMapSelect.value = selectedMapId;

      selectedMapId = gigMapSelect?.value || selectedMapId;
      bindItemsForMap(selectedMapId);
    } else {
      selectedMapId = "";
      itemsCache = [];
      renderGigItemButtons();
      if(gigRobuxReadonly) gigRobuxReadonly.value = "";
    }
  });
}

function bindItemsForMap(mapId){
  if(unsubscribeItems) unsubscribeItems();

  const itemsRef = collection(db, "maps", mapId, "items");
  const qItems = query(itemsRef, orderBy("name", "asc"));

  unsubscribeItems = onSnapshot(qItems, (snap) => {
    itemsCache = snap.docs.map(d => {
      const data = d.data() || {};
      return { id: d.id, name: data.name || d.id, robux: Number(data.robux || 0) };
    });

    // reset selection if item gone
    if(itemsCache.length){
      selectedItemId = itemsCache[0].id;
      if(gigRobuxReadonly) gigRobuxReadonly.value = `${toPosInt(itemsCache[0].robux)} R$`;
    } else {
      selectedItemId = "";
      if(gigRobuxReadonly) gigRobuxReadonly.value = "";
    }

    renderGigItemButtons();

    // set active first button UI if exist
    if(gigItemButtons && selectedItemId){
      const all = gigItemButtons.querySelectorAll(".item-btn");
      all.forEach(x => x.classList.toggle("active", x.dataset.itemId === selectedItemId));
    }

    if(currentType === "gig") recalc();
  });
}

// =======================
// ADMIN ACTIONS
// =======================
async function saveRates(){
  if(!wantAdminPanel || !isAdmin){
    showToast("Akses ditolak. Login admin dulu.", "error");
    return;
  }

  const g = toPosInt(adminGigRate?.value);
  const p = toPosInt(adminPaytaxRate?.value);
  const n = toPosInt(adminNotaxRate?.value);

  if(!g || !p || !n){
    showToast("Semua rate harus angka > 0.", "error");
    return;
  }

  try{
    await setDoc(doc(db, "settings", "rates"), {
      gigRate: g,
      paytaxRate: p,
      notaxRate: n,
      updatedAt: serverTimestamp()
    }, { merge: true });

    showToast("Rate berhasil disimpan ✅");
  }catch(e){
    showToast(`Gagal simpan rate: ${e?.code || "unknown"}`, "error");
  }
}

async function addMap(){
  if(!isAdmin) return showToast("Login admin dulu.", "error");

  const name = String(adminNewMapName?.value || "").trim();
  if(!name) return showToast("Nama maps tidak boleh kosong.", "error");

  const mapId = slugify(name);
  if(!mapId) return showToast("Nama maps tidak valid.", "error");

  try{
    await setDoc(doc(db, "maps", mapId), {
      name,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp()
    }, { merge: true });

    if(adminNewMapName) adminNewMapName.value = "";
    showToast("Maps tersimpan ✅");
  }catch(e){
    showToast(`Gagal tambah maps: ${e?.code || "unknown"}`, "error");
  }
}

async function upsertItem(){
  if(!isAdmin) return showToast("Login admin dulu.", "error");

  const mapId = adminMapSelect?.value || "";
  if(!mapId) return showToast("Pilih maps dulu.", "error");

  const itemName = String(adminNewItemName?.value || "").trim();
  const robux = toPosInt(adminNewItemRobux?.value);

  if(!itemName) return showToast("Nama item tidak boleh kosong.", "error");
  if(!robux) return showToast("Robux item harus > 0.", "error");

  const itemId = slugify(itemName);
  if(!itemId) return showToast("Nama item tidak valid.", "error");

  try{
    await setDoc(doc(db, "maps", mapId, "items", itemId), {
      name: itemName,
      robux,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp()
    }, { merge: true });

    if(adminNewItemName) adminNewItemName.value = "";
    if(adminNewItemRobux) adminNewItemRobux.value = "";

    showToast("Item tersimpan ✅");
  }catch(e){
    showToast(`Gagal simpan item: ${e?.code || "unknown"}`, "error");
  }
}

// =======================
// INIT
// =======================
document.addEventListener("DOMContentLoaded", () => {
  // admin panel only if admin=1
  showAdminPanelIfNeeded();
  if(wantAdminPanel) setAdminControlsEnabled(false);

  // auth
  onAuthStateChanged(auth, (user) => applyAdminUI(user));

  btnAdminLogin?.addEventListener("click", async () => {
    try {
      const res = await signInWithPopup(auth, provider);
      const email = (res.user?.email || "").toLowerCase();
      if(email !== ADMIN_EMAIL.toLowerCase()){
        await signOut(auth);
        showToast("Email ini bukan admin. Logout otomatis.", "error");
        return;
      }
      showToast("Login admin berhasil ✅");
    } catch (e) {
      showToast(`Login gagal: ${e?.code || "unknown"}`, "error");
    }
  });

  btnAdminLogout?.addEventListener("click", async () => {
    try { await signOut(auth); showToast("Logout berhasil."); } catch(e){}
  });

  btnSaveRates?.addEventListener("click", saveRates);
  btnAddMap?.addEventListener("click", addMap);
  btnUpsertItem?.addEventListener("click", upsertItem);

  // initial UI state: belum pilih tipe
  setInitialUI();

  // type button click
  typeGrid?.addEventListener("click", (e) => {
    const btn = e.target.closest(".type-btn");
    if(!btn) return;
    setActiveType(btn.dataset.type);
  });

  // inputs calc
  targetNet?.addEventListener("input", () => {
    if(currentType === "paytax") calcPaytax();
  });

  robuxInput?.addEventListener("input", () => {
    if(currentType === "notax") calcNotax();
  });

  // gig map change
  gigMapSelect?.addEventListener("change", () => {
    const mapId = gigMapSelect.value || "";
    selectedMapId = mapId;
    selectedItemId = "";
    itemsCache = [];
    if(gigRobuxReadonly) gigRobuxReadonly.value = "";
    renderGigItemButtons();
    clearOutputs();

    if(mapId) bindItemsForMap(mapId);
    if(gigItemHint) gigItemHint.textContent = mapId ? "Loading item..." : "Pilih maps dulu.";
  });

  // firestore
  bindRates();
  bindMaps();
});
