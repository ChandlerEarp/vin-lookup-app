// ===== Config =====
const BUILD_VERSION = "v21-MOBILE-CAMERA-OCR-DEBUG"; // bump when you replace data.csv
console.log('App.js loaded at:', new Date().toISOString());

// Mobile detection
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
         (navigator.maxTouchPoints > 0 && window.innerWidth < 768);
}

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
  let ds   = headers[ low.findIndex(h => /(^|\b)ds(\b|$)/.test(h)) ];
  let dsp  = headers[ low.findIndex(h => /(^|\b)dsp(\b|$)/.test(h)) ];
  
  if(!vin)  vin  = headers[0];
  if(!unit) unit = headers[1] || headers[0];
  if(!ds)   ds   = headers[2];
  if(!dsp)  dsp  = headers[3];
  
  return { vin, unit, ds, dsp };
}

function buildIndex(objs, vinKey, unitKey, dsKey, dspKey){
  IDX = new Map(); COUNT = 0;
  for(const o of objs){
    const vinRaw = (o[vinKey]||"").toString();
    const unit   = (o[unitKey]||"").toString().trim();
    const ds     = (o[dsKey]||"").toString().trim();
    const dsp    = (o[dspKey]||"").toString().trim();
    const v = clean(vinRaw);
    if(v.length < 8) continue;
    const k = v.slice(-8);
    const rec = { vin: v, unit, ds, dsp };
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
      buildIndex(objs, cols.vin, cols.unit, cols.ds, cols.dsp);
      const verEl = document.getElementById('ver');
      const statusEl = document.getElementById('loadStatus');
      if (verEl) verEl.textContent = localStorage.getItem('vin_unit_version') || BUILD_VERSION;
      if (statusEl) statusEl.textContent = `Loaded ${COUNT.toLocaleString()} rows from device storage`;
      return;
    } else {
      // Load embedded fallback data for offline use
      console.log('No cached data, loading embedded fallback data');
      const embeddedCSV = `VIN,Unit,DS,DSP
1FDDF6P84MKA55412,503006,TEST1,DEMO1
JHHRDM2H1LK008183,700030,TEST2,DEMO2
JHHRDM2H3LK008962,700093,TEST3,DEMO3
JHHRDM2H4LK008162,700116,TEST4,DEMO4
JHHRDM2H4LK008954,700121,TEST5,DEMO5
JHHRDM2H6LK008972,700171,TEST6,DEMO6
JHHRDM2H7LK008964,700196,TEST7,DEMO7
1FDDF6P86MKA45383,503143,TEST8,DEMO8
JALE5W160N7303550,820077,TEST9,DEMO9`;
      
      const { headers, rows } = parseCSV(embeddedCSV);
      const cols = detectCols(headers);
      const objs = rows.map(r => Object.fromEntries(headers.map((h,i)=>[h, r[i]||""])));
      buildIndex(objs, cols.vin, cols.unit, cols.ds, cols.dsp);
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
    buildIndex(objs, cols.vin, cols.unit, cols.ds, cols.dsp);
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
      buildIndex(objs, cols.vin, cols.unit, cols.ds, cols.dsp);
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
    row.innerHTML = `<div>
      <div class="sub" style="margin:0 0 2px 0">VIN: <span style="font-family:ui-monospace">${r.vin}</span></div>
      <div class="big">Unit: ${r.unit||'(blank)'}</div>
      <div class="sub" style="margin:2px 0 0 0">DS: <b>${r.ds||'(blank)'}</b> | DSP: <b>${r.dsp||'(blank)'}</b></div>
    </div>`;
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

// ===== OCR Scan Mode =====
let stream;
let ocrWorker;

async function initOCR() {
  if (!ocrWorker) {
    console.log('Initializing Tesseract OCR worker...');
    ocrWorker = await Tesseract.createWorker('eng');
    await ocrWorker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789', // VIN characters only
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE, // Treat as single text line
    });
    console.log('OCR worker initialized');
  }
  return ocrWorker;
}

async function startCamera() {
  const video = document.getElementById('video');
  const status = document.getElementById('scanStatus');
  const captureBtn = document.getElementById('captureBtn');
  const stopBtn = document.getElementById('stopScanBtn');
  
  try {
    status.textContent = 'Starting camera...';
    
    // Request camera access with preference for rear camera
    const constraints = {
      video: {
        facingMode: { ideal: 'environment' }, // Prefer rear camera
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };
    
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    
    video.onloadedmetadata = () => {
      status.textContent = 'Point camera at VIN text and tap Capture';
      captureBtn.style.display = 'inline-block';
      stopBtn.style.display = 'inline-block';
    };
    
  } catch (error) {
    console.error('Camera error:', error);
    status.textContent = 'Camera access denied or unavailable. Please allow camera permission and try again.';
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  const video = document.getElementById('video');
  const captureBtn = document.getElementById('captureBtn');
  const stopBtn = document.getElementById('stopScanBtn');
  const status = document.getElementById('scanStatus');
  
  if (video) video.srcObject = null;
  captureBtn.style.display = 'none';
  stopBtn.style.display = 'none';
  status.textContent = 'Camera stopped';
  document.getElementById('scanResults').innerHTML = '';
}

async function captureAndProcessVIN() {
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const status = document.getElementById('scanStatus');
  const captureBtn = document.getElementById('captureBtn');
  
  if (!video || !canvas || video.readyState !== 4) {
    status.textContent = 'Video not ready. Please wait...';
    return;
  }
  
  try {
    // Disable capture button during processing
    captureBtn.disabled = true;
    captureBtn.textContent = '🔄 Processing...';
    status.textContent = 'Capturing and reading VIN text...';
    
    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw current video frame to canvas
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    // Convert canvas to image data for OCR
    const imageData = canvas.toDataURL('image/png');
    
    // Initialize OCR worker if needed
    await initOCR();
    
    status.textContent = 'Reading text with OCR...';
    
    // Process with Tesseract
    const { data: { text } } = await ocrWorker.recognize(imageData);
    console.log('Raw OCR result:', text);
    
    // Show what was actually read
    const rawText = text.trim();
    status.textContent = `📖 Read: "${rawText}"`;
    
    // Extract VIN from OCR text
    const vinText = text.replace(/\s+/g, '').toUpperCase();
    console.log('Cleaned OCR text:', vinText);
    
    // Look for 17-character VIN pattern
    const vinMatch = vinText.match(/[A-HJ-NPR-Z0-9]{17}/);
    let foundVin = null;
    let last8 = '';
    let longest = '';
    
    if (vinMatch) {
      foundVin = vinMatch[0];
      last8 = foundVin.slice(-8);
      status.textContent = `📖 Read: "${rawText}" ➜ Found VIN: ${foundVin}`;
    } else {
      // If no 17-char VIN found, try to extract any alphanumeric sequence that might be the last 8
      const sequences = vinText.match(/[A-HJ-NPR-Z0-9]{6,}/g) || [];
      console.log('Found sequences:', sequences);
      
      if (sequences.length > 0) {
        // Take the longest sequence and use its last 8 characters
        longest = sequences.reduce((a, b) => a.length > b.length ? a : b);
        last8 = longest.slice(-8);
        status.textContent = `📖 Read: "${rawText}" ➜ Using: ${longest} (last 8: ${last8})`;
      } else {
        status.textContent = `📖 Read: "${rawText}" ➜ ❌ No valid VIN text found. Try repositioning camera.`;
        captureBtn.disabled = false;
        captureBtn.textContent = '📸 Capture VIN';
        return;
      }
    }
    
    if (last8.length >= 8) {
      renderScanResults(last8, foundVin || vinText, rawText);
    } else {
      status.textContent = `📖 Read: "${rawText}" ➜ ❌ Could not extract valid VIN sequence.`;
    }
    
  } catch (error) {
    console.error('OCR processing error:', error);
    status.textContent = 'Error processing image. Please try again.';
  } finally {
    // Re-enable capture button
    captureBtn.disabled = false;
    captureBtn.textContent = '📸 Capture VIN';
  }
}

function renderScanResults(last8, scannedText, rawText) {
  const status = document.getElementById('scanStatus');
  const box = document.getElementById('scanResults');
  
  // Show what was read and what we're searching for
  status.textContent = `📖 Read: "${rawText}" ➜ Searching for: ${last8}`;
  box.innerHTML = '';
  
  if (!last8) return;
  
  const list = IDX.get(last8) || [];
  console.log('Found', list.length, 'results for key:', last8);
  
  if (list.length === 0) {
    const div = document.createElement('div');
    div.className = 'result';
    div.innerHTML = `<div>
      <div class="sub">Searched for <b>${last8}</b></div>
      <div>❌ Couldn't find "${last8}" in database.</div>
      <div class="sub" style="margin-top:8px;">Raw text read: "${rawText}"</div>
      <div class="sub">Try repositioning camera for clearer text.</div>
    </div>`;
    box.appendChild(div);
    return;
  }
  
  const head = document.createElement('div');
  head.className = 'sub';
  head.textContent = `✅ ${list.length} match${list.length > 1 ? 'es' : ''} found for ${last8}`;
  box.appendChild(head);
  
  list.forEach(r => {
    const row = document.createElement('div');
    row.className = 'result';
    row.innerHTML = `<div>
      <div class="sub" style="margin:0 0 2px 0">VIN: <span style="font-family:ui-monospace">${r.vin}</span></div>
      <div class="big">Unit: ${r.unit || '(blank)'}</div>
      <div class="sub" style="margin:2px 0 0 0">DS: <b>${r.ds || '(blank)'}</b> | DSP: <b>${r.dsp || '(blank)'}</b></div>
    </div>`;
    
    const btn = document.createElement('button');
    btn.textContent = 'Copy Unit';
    btn.onclick = () => navigator.clipboard.writeText(r.unit || '');
    row.appendChild(btn);
    box.appendChild(row);
  });
}

// ===== QR screen (Disabled) =====
/*
function showQR(){
  const url = location.href.split('#')[0];
  $('#qrUrl').textContent = url;
  QRCode.toCanvas($('#qrCanvas'), url);
}
*/

// ===== Nav & Boot =====
function initApp() {
  console.log('initApp called');
  
  // Show/hide scan button based on mobile detection
  const goScanBtn = document.getElementById('goScan');
  if (goScanBtn) {
    if (isMobileDevice() && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      goScanBtn.style.display = 'inline-block';
      console.log('Mobile device detected, showing scan button');
    } else {
      goScanBtn.style.display = 'none';
      console.log('Desktop device or no camera, hiding scan button');
    }
  }
  
  // Navigation event listeners
  const goType = document.getElementById('goType');
  const goScan = document.getElementById('goScan');
  const backHome1 = document.getElementById('backHome1');
  const backHome2 = document.getElementById('backHome2');
  const captureBtn = document.getElementById('captureBtn');
  const stopScanBtn = document.getElementById('stopScanBtn');

  console.log('goType element:', goType);
  console.log('goScan element:', goScan);
  console.log('home element:', document.getElementById('home'));

  // Type mode navigation
  if (goType) {
    goType.addEventListener('click', () => {
      document.getElementById('home').classList.add('hide');
      document.getElementById('typeMode').classList.remove('hide');
      document.getElementById('scanMode').classList.add('hide');
    });
  }
  
  // Scan mode navigation
  if (goScan) {
    goScan.addEventListener('click', () => {
      document.getElementById('home').classList.add('hide');
      document.getElementById('typeMode').classList.add('hide');
      document.getElementById('scanMode').classList.remove('hide');
      // Start camera when entering scan mode
      startCamera();
    });
  }
  
  // Back to home buttons
  if (backHome1) {
    backHome1.addEventListener('click', () => {
      document.getElementById('typeMode').classList.add('hide');
      document.getElementById('scanMode').classList.add('hide');
      document.getElementById('home').classList.remove('hide');
      // Stop camera if going back from scan mode
      stopCamera();
    });
  }
  
  if (backHome2) {
    backHome2.addEventListener('click', () => {
      document.getElementById('typeMode').classList.add('hide');
      document.getElementById('scanMode').classList.add('hide');
      document.getElementById('home').classList.remove('hide');
      // Stop camera when going back from scan mode
      stopCamera();
    });
  }
  
  // Scan mode controls
  if (captureBtn) {
    captureBtn.addEventListener('click', captureAndProcessVIN);
  }
  
  if (stopScanBtn) {
    stopScanBtn.addEventListener('click', stopCamera);
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
  
  // Clean up camera on page unload
  window.addEventListener('beforeunload', stopCamera);
}

// Simple DOM ready check
document.addEventListener('DOMContentLoaded', initApp);

// PWA SW
if ('serviceWorker' in navigator && location.protocol !== 'file:') { 
  navigator.serviceWorker.register('sw.js'); 
}