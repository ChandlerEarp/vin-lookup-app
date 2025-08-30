// ===== Config =====
const BUILD_VERSION = "v13-NO-CAMERA"; // bump when you replace data.csv
console.log('App.js loaded at:', new Date().toISOString());

// Auto-update mechanism
function checkForUpdates() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(registration => {
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[App] New version available! Auto-refreshing...');
            // Show a brief message then refresh
            const statusEl = document.getElementById('loadStatus');
            if (statusEl) {
              statusEl.textContent = 'New version detected - updating...';
              statusEl.style.color = '#007AFF';
            }
            setTimeout(() => window.location.reload(), 1000);
          }
        });
      });
    });
  }
}

// Check for updates every 30 seconds when app is active
setInterval(() => {
  if (document.visibilityState === 'visible' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg) reg.update();
    });
  }
}, 30000);

// ===== Helpers =====
const $ = id => document.getElementById(id);
const clean = s => (s||"").toString().toUpperCase().replace(/[^A-Z0-9]/g, "");
let IDX = new Map(); // last8 -> [{vin, unit}]
let COUNT = 0;

// ===== CSV parser (handles quotes) =====
function parseCSV(text){
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const rows = [];
  for(const line of lines){
    if(line.trim()==="") continue;
    const out = []; let cur = ""; let q=false;
    for(let i=0;i<line.length;i++){
      const ch = line[i];
      if(q){
        if(ch === '"'){ if(line[i+1] === '"'){ cur += '"'; i++; } else { q = false; } }
        else cur += ch;
      } else {
        if(ch === ','){ out.push(cur); cur = ""; }
        else if(ch === '"'){ q = true; }
        else cur += ch;
      }
    }
    out.push(cur);
    rows.push(out);
  }
  const headers = rows.shift() || [];
  return { headers, rows };
}

function detectCols(headers){
  const low = headers.map(h => h.toLowerCase());
  let vin  = headers[ low.findIndex(h => /(^|\b)vin(\b|$)/.test(h)) ];
  let unit = headers[ low.findIndex(h => /(unit|asset|vehicle[_\s-]?number)/.test(h)) ];
  if(!vin)  vin  = headers[0];
  if(!unit) unit = headers[1] || headers[0];
  return { vin, unit };
}

function buildIndex(objs, vinKey, unitKey){
  IDX = new Map(); COUNT = 0;
  for(const o of objs){
    const vinRaw = (o[vinKey]||"").toString();
    const unit   = (o[unitKey]||"").toString().trim();
    const v = clean(vinRaw);
    if(v.length < 8) continue;
    const k = v.slice(-8);
    const rec = { vin: v, unit };
    if(!IDX.has(k)) IDX.set(k, []);
    IDX.get(k).push(rec);
    COUNT++;
  }
}

// ===== Load bundled dataset =====
async function loadBundledCSV(){
  console.log('Starting to load CSV data...');
  
  // Check if we're running from file:// protocol
  if (location.protocol === 'file:') {
    console.log('Running from file://, loading from localStorage or embedded data');
    const cached = localStorage.getItem('vin_unit_csv');
    if(cached) {
      console.log('Found cached CSV data');
      const { headers, rows } = parseCSV(cached);
      const cols = detectCols(headers);
      const objs = rows.map(r => Object.fromEntries(headers.map((h,i)=>[h, r[i]||""])));
      buildIndex(objs, cols.vin, cols.unit);
      const verEl = document.getElementById('ver');
      const statusEl = document.getElementById('loadStatus');
      if (verEl) verEl.textContent = localStorage.getItem('vin_unit_version') || BUILD_VERSION;
      if (statusEl) statusEl.textContent = `Loaded ${COUNT.toLocaleString()} rows from device storage`;
      return;
    } else {
      // Load embedded fallback data for offline use
      console.log('No cached data, loading embedded fallback data');
      const embeddedCSV = `VIN,Unit
1FDDF6P84MKA55412,503006
JHHRDM2H1LK008183,700030
JHHRDM2H3LK008962,700093
JHHRDM2H4LK008162,700116
JHHRDM2H4LK008954,700121
JHHRDM2H6LK008972,700171
JHHRDM2H7LK008964,700196
1FDDF6P86MKA45383,503143
JALE5W160N7303550,820077`;
      
      const { headers, rows } = parseCSV(embeddedCSV);
      const cols = detectCols(headers);
      const objs = rows.map(r => Object.fromEntries(headers.map((h,i)=>[h, r[i]||""])));
      buildIndex(objs, cols.vin, cols.unit);
      const verEl = document.getElementById('ver');
      const statusEl = document.getElementById('loadStatus');
      if (verEl) verEl.textContent = 'Demo Data';
      if (statusEl) statusEl.textContent = `Demo: ${COUNT.toLocaleString()} sample rows loaded offline`;
      return;
    }
  }

  // Normal HTTP/HTTPS loading
  try{
    console.log('Fetching data.csv...');
    const res = await fetch('data.csv?v=' + encodeURIComponent (BUILD_VERSION), { cache: 'no-cache' });
    console.log('Fetch response:', res.status, res.statusText);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log('Reading response text...');
    const text = await res.text();
    console.log('CSV text length:', text.length);

    localStorage.setItem('vin_unit_csv', text);
    localStorage.setItem('vin_unit_version', `${BUILD_VERSION} • ${new Date().toISOString()}`);

    console.log('Parsing CSV...');
    const { headers, rows } = parseCSV(text);
    console.log('Headers:', headers);
    console.log('Number of rows:', rows.length);
    const cols = detectCols(headers);
    console.log('Detected columns:', cols);
    const objs = rows.map(r => Object.fromEntries(headers.map((h,i)=>[h, r[i]||""])));
    console.log('Building index...');
    buildIndex(objs, cols.vin, cols.unit);
    console.log('Index built, COUNT:', COUNT, 'IDX size:', IDX.size);

    const verEl = document.getElementById('ver');
    const statusEl = document.getElementById('loadStatus');
    if (verEl) verEl.textContent = localStorage.getItem('vin_unit_version');
    if (statusEl) statusEl.textContent = `Loaded ${COUNT.toLocaleString()} rows · ${IDX.size.toLocaleString()} keys`;
    console.log('CSV loading completed successfully');
  }catch(e){
    console.error('Error loading CSV:', e);
    const cached = localStorage.getItem('vin_unit_csv');
    if(cached){
      const { headers, rows } = parseCSV(cached);
      const cols = detectCols(headers);
      const objs = rows.map(r => Object.fromEntries(headers.map((h,i)=>[h, r[i]||""])));
      buildIndex(objs, cols.vin, cols.unit);
      const verEl = document.getElementById('ver');
      const statusEl = document.getElementById('loadStatus');
      if (verEl) verEl.textContent = localStorage.getItem('vin_unit_version') || BUILD_VERSION;
      if (statusEl) statusEl.textContent = `Loaded ${COUNT.toLocaleString()} rows from device storage`;
    }else{
      const verEl = document.getElementById('ver');
      const statusEl = document.getElementById('loadStatus');
      if (verEl) verEl.textContent = 'No dataset';
      if (statusEl) statusEl.textContent = 'Could not load data.csv (check it exists at site root).';
    }
  }
}

// ===== Type Mode =====
function showResults(k){
  console.log('showResults called with:', k);
  console.log('Current mode - typeMode visible?', !document.getElementById('typeMode')?.classList.contains('hide'));
  const box = $('results'); 
  console.log('results box element:', box);
  if (!box) {
    console.error('Results element #results not found!');
    return;
  }
  box.innerHTML = '';
  if(!k) {
    console.log('No key provided, returning');
    return;
  }
  const list = IDX.get(k) || [];
  console.log('Found', list.length, 'results for key:', k);
  if(list.length === 0){
    const div = document.createElement('div');
    div.className='result';
    div.innerHTML = `<div><div class="sub">Results for <b>${k}</b></div><div>No match, do not install.</div></div>`;
    box.appendChild(div); return;
  }
  const head = document.createElement('div'); head.className='sub';
  head.textContent = `${list.length} match${list.length>1?'es':''} for ${k}`; box.appendChild(head);
  list.forEach(r=>{
    const row = document.createElement('div'); row.className='result';
    row.innerHTML = `<div><div class="sub" style="margin:0 0 2px 0">VIN: <span style="font-family:ui-monospace">${r.vin}</span></div>
                     <div class="big">Unit: ${r.unit||'(blank)'} </div></div>`;
    const btn = document.createElement('button'); btn.textContent='Copy Unit';
    btn.onclick=()=>navigator.clipboard.writeText(r.unit||'');
    row.appendChild(btn); box.appendChild(row);
  });
}
function buildSearchButton(){
  const kbd = document.getElementById('kbd'); 
  if (!kbd) {
    console.log('kbd element not found in buildSearchButton');
    return;
  }
  kbd.innerHTML='';
  
  // Just add a search/enter button
  const searchBtn = document.createElement('button');
  searchBtn.textContent = '🔍 Search';
  searchBtn.className = 'primary';
  searchBtn.style.width = '100%';
  searchBtn.style.padding = '16px';
  searchBtn.style.fontSize = '18px';
  searchBtn.style.fontWeight = '700';
  searchBtn.onclick = () => { 
    console.log('Search button clicked');
    const q = document.getElementById('q'); 
    if (q && q.value.trim()) { 
      console.log('Input found, value:', q.value);
      inputChanged(); 
    } else {
      console.log('Input empty, focusing input field');
      if (q) q.focus();
    }
  }; 
  kbd.appendChild(searchBtn);
}
function inputChanged(){ 
  const q = document.getElementById('q');
  if (!q) {
    console.error('Input element #q not found!');
    return;
  }
  const v = clean(q.value).slice(0,8); 
  q.value = v; 
  console.log('inputChanged called with:', v, 'IDX has key:', IDX.has(v), 'IDX size:', IDX.size);
  showResults(v); 
}

// ===== Scan Mode (Disabled) =====
/*
let stream;
async function initScan(){
  const status = $('#scanStatus');
  if(!('BarcodeDetector' in window)){
    status.textContent = 'Barcode scanning not supported on this device. Use Type mode.'; return;
  }
  const detector = new BarcodeDetector({
    formats: ['code_39','code_128','ean_13','ean_8','upc_a','upc_e','itf','pdf417','qr_code']
  });
  try{
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio:false });
  }catch{ status.textContent = 'Camera permission denied.'; return; }
  const video = $('#video'); video.srcObject = stream; await video.play();
  status.textContent = 'Point camera at VIN barcode…';
  const loop = async()=>{
    if(video.readyState >= 2){
      try{
        const codes = await detector.detect(video);
        if(codes.length){
          const txt = (codes[0].rawValue||codes[0].value||'').toString().toUpperCase();
          const vin17 = txt.match(/[A-HJ-NPR-Z0-9]{17}/);
          const key = vin17 ? vin17[0].slice(-8) : clean(txt).slice(-8);
          renderScanResults(key, vin17 ? vin17[0] : txt);
        }
      }catch{}
    }
    if(!video.paused) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
function renderScanResults(k, scanned){
  $('#scanStatus').textContent = `Scanned: ${scanned}`;
  const box = $('#scanResults'); box.innerHTML='';
  const head = document.createElement('div'); head.className='sub'; head.textContent=`Results for ${k}`; box.appendChild(head);
  const list = IDX.get(k)||[];
  if(list.length===0){ const d=document.createElement('div'); d.className='result'; d.innerHTML='<div>No match. Check digits. If still no match, follow SOP card C-2.</div>'; box.appendChild(d); return; }
  list.forEach(r=>{
    const row = document.createElement('div'); row.className='result';
    row.innerHTML = `<div><div class="sub" style="margin:0 0 2px 0">VIN: <span style="font-family:ui-monospace">${r.vin}</span></div>
                     <div class="big">Unit: ${r.unit||'(blank)'} </div></div>`;
    const btn = document.createElement('button'); btn.textContent='Copy Unit'; btn.onclick=()=>navigator.clipboard.writeText(r.unit||'');
    row.appendChild(btn); box.appendChild(row);
  });
}
function stopScan(){ try{ const v=$('#video'); v.pause(); if(stream){ stream.getTracks().forEach(t=>t.stop()); } }catch{} $('#scanResults').innerHTML=''; $('#scanStatus').textContent=''; }
*/

// ===== QR screen =====
function showQR(){
  const url = location.href.split('#')[0];
  $('#qrUrl').textContent = url;
  QRCode.toCanvas($('#qrCanvas'), url);
}

// ===== Nav & Boot =====
function initApp() {
  console.log('initApp called');
  
  // Simple direct assignment approach
  const goType = document.getElementById('goType');
  const backHome1 = document.getElementById('backHome1');
  const goQR = document.getElementById('goQR');
  const backHome3 = document.getElementById('backHome3');

  console.log('goType element:', goType);
  console.log('home element:', document.getElementById('home'));

  if (goType) {
    goType.addEventListener('click', () => {
      document.getElementById('home').classList.add('hide');
      document.getElementById('typeMode').classList.remove('hide');
    });
  }
  
  if (backHome1) {
    backHome1.addEventListener('click', () => {
      document.getElementById('typeMode').classList.add('hide');
      document.getElementById('home').classList.remove('hide');
    });
  }
  
  if (goQR) {
    goQR.addEventListener('click', () => {
      document.getElementById('home').classList.add('hide');
      document.getElementById('qrMode').classList.remove('hide');
      showQR();
    });
  }
  
  if (backHome3) {
    backHome3.addEventListener('click', () => {
      document.getElementById('qrMode').classList.add('hide');
      document.getElementById('home').classList.remove('hide');
    });
  }

  // Build the search button if element exists
  if (document.getElementById('kbd')) {
    buildSearchButton();
  }
  
  // Setup the input field to trigger searches as you type
  const qInput = document.getElementById('q');
  if (qInput) {
    qInput.addEventListener('input', inputChanged);
    qInput.addEventListener('keyup', (e) => {
      // Trigger search on Enter key
      if (e.key === 'Enter') {
        console.log('Enter key pressed');
        inputChanged();
      } else {
        inputChanged();
      }
    });
    qInput.addEventListener('paste', () => {
      // Small delay to let paste complete
      setTimeout(inputChanged, 10);
    });
  }
  
  // Load the CSV data
  loadBundledCSV();
  
  // Set up auto-update mechanism
  checkForUpdates();
}

// Simple DOM ready check
document.addEventListener('DOMContentLoaded', initApp);

// PWA SW
if ('serviceWorker' in navigator && location.protocol !== 'file:') { 
  navigator.serviceWorker.register('sw.js'); 
}