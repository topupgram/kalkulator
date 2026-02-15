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
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

// =======================
// FIREBASE CONFIG (gpratetpg)
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
// opsional: paksa pilih akun tiap login (biar tidak nyangkut akun lain)
provider.setCustomParameters({ prompt: "select_account" });

// =======================
// STATE
// =======================
let isAdmin = false;

let gigRate = 95;
let paytaxRate = 75;
let notaxRate = 80;

let mapsCache = [];     // [{id, name}]
let itemsCache = [];    // current selected map items [{id, name, robux}]
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
  showToast._t = setTimeout(()=> toast.style.display = "none", 2400);
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

// =======================
// UI REFS
// =======================
const gpType = document.getElementById("gpType");

const rateEl = document.getElementById("rate");
const rateHint = document.getElementById("rateHint");
const hargaHint = document.getElementById("hargaHint");

const paytaxFields = document.getElementById("paytaxFields");
const notaxFields = document.getElementById("notaxFields");
const gigFields = document.getElementById("gigFields");

const targetNet = document.getElementById("targetNet");
const robuxInput = document.getElementById("robuxInput");

// GIG mode
const gigMode = document.getElementById("gigMode");
const gigListWrap = document.getElementById("gigListWrap");
const gigManualWrap = document.getElementById("gigManualWrap");

const gigMapSelect = document.getElementById("gigMapSelect");
const gigItemSelect = document.getElementById("gigItemSelect");
const gigRobuxReadonly = document.getElementById("gigRobuxReadonly");
const gigRobuxPrice = document.getElementById("gigRobuxPrice");

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
// ADMIN UI LOCK/UNLOCK
// =======================
function setAdminControlsEnabled(canEdit){
  // rates
  if(adminGigRate) adminGigRate.disabled = !canEdit;
  if(adminPaytaxRate) adminPaytaxRate.disabled = !canEdit;
  if(adminNotaxRate) adminNotaxRate.disabled = !canEdit;
  if(btnSaveRates) btnSaveRates.disabled = !canEdit;

  // maps
  if(adminNewMapName) adminNewMapName.disabled = !canEdit;
  if(btnAddMap) btnAddMap.disabled = !canEdit;
  if(adminMapSelect) adminMapSelect.disabled = !canEdit;

  // items
  if(adminNewItemName) adminNewItemName.disabled = !canEdit;
  if(adminNewItemRobux) adminNewItemRobux.disabled = !canEdit;
  if(btnUpsertItem) btnUpsertItem.disabled = !canEdit;
}

function applyAdminUI(user){
  const email = (user?.email || "").toLowerCase();
  isAdmin = !!(user && email === ADMIN_EMAIL.toLowerCase());

  if(!wantAdminPanel) return;

  // tombol login/logout
  if(btnAdminLogin) btnAdminLogin.style.display = user ? "none" : "inline-block";
  if(btnAdminLogout) btnAdminLogout.style.display = user ? "inline-block" : "none";

  if(adminStatus){
    if(!user) adminStatus.textContent = "Belum login.";
    else if(isAdmin) adminStatus.textContent = `Login: ${user.email} (ADMIN ✅)`;
    else adminStatus.textContent = `Login: ${user.email} (BUKAN ADMIN ❌)`;
  }

  // kunci/aktifkan kontrol admin
  setAdminControlsEnabled(isAdmin);

  // kalau login bukan admin -> langsung logout
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
// RATE UI + CALC
// =======================
function getActiveRate(){
  const type = gpType?.value;
  if(type === "paytax") return paytaxRate;
  if(type === "notax") return notaxRate;
  return gigRate;
}

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

function calcPaytax(){
  const target = toPosInt(targetNet?.value);
  if(!target){ clearOutputs(); return; }

  const need = Math.ceil(target / SELLER_GET);
  const harga = need * paytaxRate;

  if(robuxNeedEl) robuxNeedEl.value = `${need} R$`;
  if(netReceiveEl) netReceiveEl.value = `${target} R$`;
  if(hargaEl) hargaEl.value = formatRupiah(harga);

  if(hargaHint) hargaHint.textContent =
    `Rumus: robuxNeed = ceil(target / 0.7), harga = paytaxRate × robuxNeed`;
}

function calcNotax(){
  const robux = toPosInt(robuxInput?.value);
  if(!robux){ clearOutputs(); return; }

  const net = Math.floor(robux * SELLER_GET);
  const harga = robux * notaxRate;

  if(robuxNeedEl) robuxNeedEl.value = `${robux} R$`;
  if(netReceiveEl) netReceiveEl.value = `${net} R$`;
  if(hargaEl) hargaEl.value = formatRupiah(harga);

  if(hargaHint) hargaHint.textContent =
    `Rumus: net = floor(robux × 0.7), harga = notaxRate × robux`;
}

function getGigRobux(){
  const mode = gigMode?.value || "list";
  if(mode === "manual"){
    return toPosInt(gigRobuxPrice?.value);
  }
  const item = itemsCache.find(x => x.id === selectedItemId);
  return item ? toPosInt(item.robux) : 0;
}

function calcGig(){
  const robux = getGigRobux();
  if(!robux){ clearOutputs(); return; }

  const harga = robux * gigRate;

  if(robuxNeedEl) robuxNeedEl.value = `${robux} R$`;
  if(netReceiveEl) netReceiveEl.value = "";
  if(hargaEl) hargaEl.value = formatRupiah(harga);

  if(hargaHint) hargaHint.textContent =
    `Rumus: harga = gigRate × robux`;
}

function recalc(){
  setRateUI();
  const type = gpType?.value;
  if(type === "paytax") return calcPaytax();
  if(type === "notax") return calcNotax();
  return calcGig();
}

// =======================
// TYPE UI (show/hide)
// =======================
function applyGigModeUI(){
  const mode = gigMode?.value || "list";
  if(mode === "manual"){
    gigListWrap?.classList.add("hidden");
    gigManualWrap?.classList.remove("hidden");
  } else {
    gigManualWrap?.classList.add("hidden");
    gigListWrap?.classList.remove("hidden");
  }

  // reset output only
  clearOutputs();
  recalc();
}

function applyTypeUI(){
  const type = gpType?.value;

  paytaxFields?.classList.add("hidden");
  notaxFields?.classList.add("hidden");
  gigFields?.classList.add("hidden");

  // clear inputs each switch biar bersih
  if(targetNet) targetNet.value = "";
  if(robuxInput) robuxInput.value = "";
  if(gigRobuxPrice) gigRobuxPrice.value = "";
  if(gigRobuxReadonly) gigRobuxReadonly.value = "";

  clearOutputs();

  if(type === "paytax"){
    paytaxFields?.classList.remove("hidden");
  } else if(type === "notax"){
    notaxFields?.classList.remove("hidden");
  } else {
    gigFields?.classList.remove("hidden");
    applyGigModeUI();
  }

  setRateUI();
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

    // admin inputs sync
    if(adminGigRate) adminGigRate.value = gigRate;
    if(adminPaytaxRate) adminPaytaxRate.value = paytaxRate;
    if(adminNotaxRate) adminNotaxRate.value = notaxRate;

    recalc();
  }, (e) => {
    console.error(e);
    showToast("Gagal load rate (pakai default).", "error");
    recalc();
  });
}

function bindMaps(){
  const mapsRef = collection(db, "maps");
  const qMaps = query(mapsRef, orderBy("name", "asc"));

  onSnapshot(qMaps, (snap) => {
    mapsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .map(x => ({ id: x.id, name: x.name || x.id }));

    // public select
    setSelectOptions(gigMapSelect, mapsCache, mapsCache.length ? "Pilih maps..." : "Belum ada maps");

    // admin select
    setSelectOptions(adminMapSelect, mapsCache, mapsCache.length ? "Pilih maps..." : "Belum ada maps");

    // auto pick first map for public
    if(mapsCache.length){
      if(!selectedMapId) selectedMapId = mapsCache[0].id;
      if(gigMapSelect && !gigMapSelect.value) gigMapSelect.value = selectedMapId;

      const mapId = gigMapSelect?.value || selectedMapId;
      selectedMapId = mapId;
      bindItemsForMap(mapId);
    } else {
      selectedMapId = "";
      selectedItemId = "";
      itemsCache = [];
      setSelectOptions(gigItemSelect, [], "Belum ada item");
      if(gigRobuxReadonly) gigRobuxReadonly.value = "";
      clearOutputs();
    }

  }, (e) => {
    console.error(e);
    showToast("Gagal load maps.", "error");
  });
}

function bindItemsForMap(mapId){
  if(unsubscribeItems) unsubscribeItems();

  const itemsRef = collection(db, "maps", mapId, "items");
  const qItems = query(itemsRef, orderBy("name", "asc"));

  unsubscribeItems = onSnapshot(qItems, (snap) => {
    itemsCache = snap.docs.map(d => {
      const data = d.data() || {};
      return {
        id: d.id,
        name: data.name || d.id,
        robux: Number(data.robux || 0)
      };
    });

    setSelectOptions(gigItemSelect, itemsCache, itemsCache.length ? "Pilih item..." : "Belum ada item");

    if(itemsCache.length){
      // keep selection if exists
      const stillExists = itemsCache.some(x => x.id === selectedItemId);
      if(!stillExists) selectedItemId = itemsCache[0].id;
      if(gigItemSelect) gigItemSelect.value = selectedItemId;

      const it = itemsCache.find(x => x.id === selectedItemId) || itemsCache[0];
      if(gigRobuxReadonly) gigRobuxReadonly.value = `${toPosInt(it.robux)} R$`;
    } else {
      selectedItemId = "";
      if(gigRobuxReadonly) gigRobuxReadonly.value = "";
    }

    recalc();
  }, (e) => {
    console.error(e);
    showToast("Gagal load items.", "error");
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
    console.error(e);
    showToast("Gagal simpan rate.", "error");
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
    console.error(e);
    showToast("Gagal tambah maps.", "error");
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
    console.error(e);
    showToast("Gagal simpan item.", "error");
  }
}

// =======================
// EVENTS
// =======================
function handleGigMapChange(){
  const mapId = gigMapSelect?.value || "";
  if(!mapId){
    selectedMapId = "";
    itemsCache = [];
    setSelectOptions(gigItemSelect, [], "Belum ada item");
    if(gigRobuxReadonly) gigRobuxReadonly.value = "";
    clearOutputs();
    return;
  }
  selectedMapId = mapId;
  bindItemsForMap(mapId);
}

function handleGigItemChange(){
  selectedItemId = gigItemSelect?.value || "";
  const it = itemsCache.find(x => x.id === selectedItemId);
  if(it){
    if(gigRobuxReadonly) gigRobuxReadonly.value = `${toPosInt(it.robux)} R$`;
  } else {
    if(gigRobuxReadonly) gigRobuxReadonly.value = "";
  }
  recalc();
}

// =======================
// INIT
// =======================
document.addEventListener("DOMContentLoaded", async () => {
  // show admin panel only if admin=1 (NO AUTO LOGIN)
  showAdminPanelIfNeeded();

  // Default state: lock admin controls until admin verified
  if(wantAdminPanel) setAdminControlsEnabled(false);

  // Finish redirect result if we just came back from Google
  // (doesn't redirect again, only resolves result)
  try { await getRedirectResult(auth); } catch(e) {}

  // Auth state listener
  onAuthStateChanged(auth, (user) => {
    applyAdminUI(user);
  });

  // Bind public listeners (works for everyone)
  applyTypeUI();
  bindRates();
  bindMaps();

  // Public calc events
  gpType?.addEventListener("change", () => { applyTypeUI(); recalc(); });

  targetNet?.addEventListener("input", () => { if(gpType?.value === "paytax") calcPaytax(); });
  robuxInput?.addEventListener("input", () => { if(gpType?.value === "notax") calcNotax(); });

  gigMode?.addEventListener("change", applyGigModeUI);
  gigRobuxPrice?.addEventListener("input", () => { if(gpType?.value === "gig") calcGig(); });

  gigMapSelect?.addEventListener("change", handleGigMapChange);
  gigItemSelect?.addEventListener("change", handleGigItemChange);

  // Admin buttons
  btnAdminLogin?.addEventListener("click", async () => {
    try {
      await signInWithRedirect(auth, provider);
    } catch (e) {
      console.error(e);
      showToast("Login gagal/dibatalkan.", "error");
    }
  });

  btnAdminLogout?.addEventListener("click", async () => {
    try {
      await signOut(auth);
      showToast("Logout berhasil.");
    } catch(e) {}
  });

  btnSaveRates?.addEventListener("click", saveRates);
  btnAddMap?.addEventListener("click", addMap);
  btnUpsertItem?.addEventListener("click", upsertItem);
});
