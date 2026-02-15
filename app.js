// app.js (ESM) - Firebase CDN v9 (modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// =======================
// FIREBASE CONFIG (punyamu: gpratetpg)
// =======================
const firebaseConfig = {
  apiKey: "AIzaSyBdForzpHb7Z0ZKcpbtQUYkhkSgrvNxqOk",
  authDomain: "gpratetpg.firebaseapp.com",
  projectId: "gpratetpg",
  storageBucket: "gpratetpg.firebasestorage.app",
  messagingSenderId: "537787271478",
  appId: "1:537787271478:web:2e1d8f734f9a4020c60b97"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Firestore doc: settings/rates
// Fields: { gigRate, paytaxRate, notaxRate, updatedAt }
const RATES_DOC = ["settings", "rates"];

// tax sesuai kalkulator
const SELLER_GET = 0.7;

// =======================
// STATE
// =======================
let gigRate = 95;
let paytaxRate = 75;
let notaxRate = 80;

// admin mode hanya dari query param
const wantAdminPanel = new URLSearchParams(window.location.search).get("admin") === "1";

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

const gigMap = document.getElementById("gigMap");
const gigItem = document.getElementById("gigItem");
const gigRobuxPrice = document.getElementById("gigRobuxPrice");

const robuxNeedEl = document.getElementById("robuxNeed");
const netReceiveEl = document.getElementById("netReceive");
const hargaEl = document.getElementById("harga");

// admin
const adminBadge = document.getElementById("adminBadge");
const adminPanel = document.getElementById("adminPanel");
const adminGigRate = document.getElementById("adminGigRate");
const adminPaytaxRate = document.getElementById("adminPaytaxRate");
const adminNotaxRate = document.getElementById("adminNotaxRate");
const btnSaveRates = document.getElementById("btnSaveRates");

// =======================
// LOGIC: RATE DISPLAY
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

// =======================
// LOGIC: CALC
// =======================
function clearOutputs(){
  if(robuxNeedEl) robuxNeedEl.value = "";
  if(netReceiveEl) netReceiveEl.value = "";
  if(hargaEl) hargaEl.value = "";
  if(hargaHint) hargaHint.textContent = "";
}

function calcPaytax(){
  const target = toPosInt(targetNet?.value);
  if(!target){
    clearOutputs();
    return;
  }

  const need = Math.ceil(target / SELLER_GET);
  const harga = need * paytaxRate;

  if(robuxNeedEl) robuxNeedEl.value = `${need} R$`;
  if(netReceiveEl) netReceiveEl.value = `${target} R$`;
  if(hargaEl) hargaEl.value = formatRupiah(harga);

  if(hargaHint) hargaHint.textContent = `Rumus: robuxNeed = ceil(target / 0.7), harga = paytaxRate × robuxNeed`;
}

function calcNotax(){
  const robux = toPosInt(robuxInput?.value);
  if(!robux){
    clearOutputs();
    return;
  }

  const net = Math.floor(robux * SELLER_GET);
  const harga = robux * notaxRate;

  if(robuxNeedEl) robuxNeedEl.value = `${robux} R$`;
  if(netReceiveEl) netReceiveEl.value = `${net} R$`;
  if(hargaEl) hargaEl.value = formatRupiah(harga);

  if(hargaHint) hargaHint.textContent = `Rumus: net = floor(robux × 0.7), harga = notaxRate × robux`;
}

function calcGig(){
  const robux = toPosInt(gigRobuxPrice?.value);
  if(!robux){
    clearOutputs();
    return;
  }

  const harga = robux * gigRate;

  // untuk GIG, field robuxNeed/netReceive ga wajib, tapi biar informatif:
  if(robuxNeedEl) robuxNeedEl.value = `${robux} R$`;
  if(netReceiveEl) netReceiveEl.value = "";
  if(hargaEl) hargaEl.value = formatRupiah(harga);

  if(hargaHint) hargaHint.textContent = `Rumus: harga = gigRate × robuxItem`;
}

function recalc(){
  const type = gpType?.value;
  setRateUI();

  if(type === "paytax") return calcPaytax();
  if(type === "notax") return calcNotax();
  return calcGig();
}

// =======================
// TYPE UI (show/hide)
// =======================
function applyTypeUI(){
  const type = gpType?.value;

  paytaxFields?.classList.add("hidden");
  notaxFields?.classList.add("hidden");
  gigFields?.classList.add("hidden");

  // reset required
  if(targetNet) targetNet.required = false;
  if(robuxInput) robuxInput.required = false;
  if(gigMap) gigMap.required = false;
  if(gigItem) gigItem.required = false;
  if(gigRobuxPrice) gigRobuxPrice.required = false;

  // reset values biar bersih pas ganti tipe
  if(targetNet) targetNet.value = "";
  if(robuxInput) robuxInput.value = "";
  if(gigMap) gigMap.value = "";
  if(gigItem) gigItem.value = "";
  if(gigRobuxPrice) gigRobuxPrice.value = "";
  clearOutputs();

  if(type === "paytax"){
    paytaxFields?.classList.remove("hidden");
    if(targetNet) targetNet.required = true;
  } else if(type === "notax"){
    notaxFields?.classList.remove("hidden");
    if(robuxInput) robuxInput.required = true;
  } else {
    gigFields?.classList.remove("hidden");
    if(gigMap) gigMap.required = true;
    if(gigItem) gigItem.required = true;
    if(gigRobuxPrice) gigRobuxPrice.required = true;
  }

  setRateUI();
}

// =======================
// FIRESTORE: realtime rates
// =======================
function bindRates(){
  const ref = doc(db, RATES_DOC[0], RATES_DOC[1]);

  onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      const d = snap.data() || {};
      const g = Number(d.gigRate);
      const p = Number(d.paytaxRate);
      const n = Number(d.notaxRate);

      // fallback kalau invalid
      gigRate = (Number.isFinite(g) && g > 0) ? Math.round(g) : gigRate;
      paytaxRate = (Number.isFinite(p) && p > 0) ? Math.round(p) : paytaxRate;
      notaxRate = (Number.isFinite(n) && n > 0) ? Math.round(n) : notaxRate;
    }

    // set admin inputs
    if(adminGigRate) adminGigRate.value = gigRate;
    if(adminPaytaxRate) adminPaytaxRate.value = paytaxRate;
    if(adminNotaxRate) adminNotaxRate.value = notaxRate;

    recalc();
  }, (err) => {
    console.error(err);
    showToast("Gagal mengambil rate dari Firebase (pakai default).", "error");
    // tetap bisa kalkulasi pakai default
    if(adminGigRate) adminGigRate.value = gigRate;
    if(adminPaytaxRate) adminPaytaxRate.value = paytaxRate;
    if(adminNotaxRate) adminNotaxRate.value = notaxRate;
    recalc();
  });
}

async function saveRates(){
  if(!wantAdminPanel){
    showToast("Akses admin tidak aktif.", "error");
    return;
  }

  const g = toPosInt(adminGigRate?.value);
  const p = toPosInt(adminPaytaxRate?.value);
  const n = toPosInt(adminNotaxRate?.value);

  if(!g || !p || !n){
    showToast("Semua rate harus angka > 0.", "error");
    return;
  }

  const ref = doc(db, RATES_DOC[0], RATES_DOC[1]);
  try{
    await setDoc(ref, {
      gigRate: g,
      paytaxRate: p,
      notaxRate: n,
      updatedAt: serverTimestamp()
    }, { merge: true });

    showToast("Rate berhasil disimpan ✅");
  } catch(e){
    console.error(e);
    showToast("Gagal menyimpan rate ke Firebase.", "error");
  }
}

// =======================
// INIT
// =======================
document.addEventListener("DOMContentLoaded", () => {
  // admin UI
  if(adminPanel) adminPanel.classList.toggle("hidden", !wantAdminPanel);
  if(adminBadge) adminBadge.classList.toggle("hidden", !wantAdminPanel);

  // default show: gig
  applyTypeUI();
  bindRates();

  gpType?.addEventListener("change", () => {
    applyTypeUI();
    recalc();
  });

  targetNet?.addEventListener("input", () => {
    if(gpType?.value === "paytax") calcPaytax();
  });

  robuxInput?.addEventListener("input", () => {
    if(gpType?.value === "notax") calcNotax();
  });

  gigRobuxPrice?.addEventListener("input", () => {
    if(gpType?.value === "gig") calcGig();
  });

  // optional: kalau mau auto-calc walaupun map/item kosong, tetap jalan (sesuai request: pure perhitungan)
  // map/item hanya informasi, bukan pengaruh harga.

  btnSaveRates?.addEventListener("click", saveRates);
});
