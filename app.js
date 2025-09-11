// ===== Config =====
const BUILD_VERSION = "v31-PLATE-UNIT-SHOWALL"; // bump when you replace data.csv or code
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
    if (verEl) {
      // Always show current BUILD_VERSION if localStorage version is missing or outdated
      const storedVersion = localStorage.getItem('vin_unit_version');
      if (!storedVersion || !storedVersion.includes(BUILD_VERSION)) {
        verEl.textContent = BUILD_VERSION;
      } else {
        verEl.textContent = storedVersion;
      }
    }
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
    let unitDisplay = r.unit && r.unit.trim() ? r.unit : '<span style="color:#d32f2f;font-weight:bold">No unit, do not install.</span>';
    row.innerHTML = `<div>
      <div class="sub" style="margin:0 0 2px 0">VIN: <span style="font-family:ui-monospace">${r.vin}</span></div>
      <div class="big">Unit: ${unitDisplay}</div>
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
    console.log('Initializing simplified Tesseract OCR worker...');
    ocrWorker = await Tesseract.createWorker('eng');
    await ocrWorker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789', // Include all chars for better recognition
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE, // Back to simple single line
      tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY,
      preserve_interword_spaces: '0'
    });
    console.log('Simplified OCR worker initialized');
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
  const scanResults = document.getElementById('scanResults');
  
  if (video) video.srcObject = null;
  if (captureBtn) captureBtn.style.display = 'none';
  if (stopBtn) stopBtn.style.display = 'none';
  if (status) status.textContent = 'Camera stopped';
  if (scanResults) scanResults.innerHTML = '';
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
    captureBtn.disabled = true;
    captureBtn.textContent = '🔄 Processing...';
    status.textContent = 'Capturing image...';
    
    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw current video frame to canvas
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    // Simple preprocessing - just convert to high contrast black and white
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const bw = gray > 120 ? 255 : 0;
      data[i] = bw;
      data[i + 1] = bw; 
      data[i + 2] = bw;
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    // Make canvas visible so user can see what was captured
    canvas.style.display = 'block';
    canvas.style.maxWidth = '100%';
    canvas.style.border = '2px solid #ffffff';
    canvas.style.borderRadius = '8px';
    canvas.style.marginTop = '8px';
    
    // Try OCR but with simple approach
    status.textContent = 'Trying OCR... (see captured image below)';
    
    await initOCR();
    
    const imageDataUrl = canvas.toDataURL('image/png');
    
    try {
      const { data: { text, confidence } } = await ocrWorker.recognize(imageDataUrl);
      const rawText = text.trim();
      
      console.log('OCR result:', rawText, 'confidence:', confidence);
      
      // Clean the text
      const cleanedText = rawText.replace(/\s+/g, '').toUpperCase()
        .replace(/[IO]/g, '') // Remove I and O
        .replace(/[^A-HJ-NPR-Z0-9]/g, ''); // Keep only valid VIN chars
      
      if (cleanedText.length >= 6) {
        const last8 = cleanedText.slice(-8);
        status.textContent = `📖 OCR found: "${cleanedText}" → Last 8: ${last8}`;
        renderScanResults(last8, cleanedText, rawText);
      } else {
        // OCR didn't work well - show manual input option
        showManualInputOption(rawText);
      }
      
    } catch (error) {
      console.error('OCR failed:', error);
      showManualInputOption('');
    }
    
  } catch (error) {
    console.error('Capture error:', error);
    status.textContent = 'Error capturing image. Please try again.';
  } finally {
    captureBtn.disabled = false;
    captureBtn.textContent = '📸 Capture VIN';
  }
}

function showManualInputOption(ocrResult) {
  const status = document.getElementById('scanStatus');
  const box = document.getElementById('scanResults');
  
  status.textContent = `OCR read: "${ocrResult}" - Please type what you see in the captured image:`;
  
  box.innerHTML = `
    <div style="margin-top: 12px;">
      <div class="sub">Can't read the text clearly? Type the VIN characters you see:</div>
      <input 
        id="manualVinInput" 
        class="input" 
        maxlength="17" 
        placeholder="Type VIN characters from image above"
        autocomplete="off" 
        autocorrect="off" 
        spellcheck="false" 
        style="margin-top: 8px;"
      />
      <button 
        class="primary" 
        onclick="processManualVinInput()" 
        style="width: 100%; margin-top: 8px; padding: 14px;"
      >
        🔍 Search Manual Input
      </button>
      <button 
        onclick="retryCapture()" 
        style="width: 100%; margin-top: 8px; padding: 14px;"
      >
        📸 Try Capture Again
      </button>
    </div>
  `;
  
  // Focus the input field
  setTimeout(() => {
    const input = document.getElementById('manualVinInput');
    if (input) input.focus();
  }, 100);
}

function processManualVinInput() {
  const input = document.getElementById('manualVinInput');
  if (!input) return;
  
  const manualText = input.value.trim().toUpperCase()
    .replace(/[IO]/g, '') // Remove I and O
    .replace(/[^A-HJ-NPR-Z0-9]/g, ''); // Keep only valid VIN chars
    
  if (manualText.length >= 6) {
    const last8 = manualText.slice(-8);
    const status = document.getElementById('scanStatus');
    status.textContent = `✏️ Manual input: "${manualText}" → Last 8: ${last8}`;
    renderScanResults(last8, manualText, `Manual: ${input.value}`);
  } else {
    alert('Please enter at least 6 characters');
  }
}

function retryCapture() {
  const canvas = document.getElementById('canvas');
  const box = document.getElementById('scanResults');
  const status = document.getElementById('scanStatus');
  
  // Hide canvas and clear results
  canvas.style.display = 'none';
  box.innerHTML = '';
  status.textContent = 'Ready to capture. Point camera at VIN and tap Capture.';
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
    let unitDisplay = r.unit && r.unit.trim() ? r.unit : '<span style="color:#d32f2f;font-weight:bold">No unit, do not install.</span>';
    row.innerHTML = `<div>
      <div class="sub" style="margin:0 0 2px 0">VIN: <span style="font-family:ui-monospace">${r.vin}</span></div>
      <div class="big">Unit: ${unitDisplay}</div>
      <div class="sub" style="margin:2px 0 0 0">DS: <b>${r.ds || '(blank)'}</b> | DSP: <b>${r.dsp || '(blank)'}</b></div>
    </div>`;
    const btn = document.createElement('button');
    btn.textContent = 'Copy Unit';
    btn.onclick = () => navigator.clipboard.writeText(r.unit || '');
    row.appendChild(btn);
    box.appendChild(row);
  });
}

// ===== Unit/Plate Lookup (data2.csv) =====
let IDX2_UNIT = new Map(); // unit -> [row]
let IDX2_PLATE = new Map(); // plate -> [row]
let COUNT2 = 0;

async function loadData2CSV() {
  try {
    const res = await fetch('data2.csv?v=' + encodeURIComponent(BUILD_VERSION), { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const { headers, rows } = parseCSV(text);
    // Detect columns
    const low = headers.map(h => h.toLowerCase());
    const vinIdx = low.findIndex(h => /vin/.test(h));
    const unitIdx = low.findIndex(h => /unit/.test(h));
    const plateIdx = low.findIndex(h => /plate/.test(h));
    const dsIdx = low.findIndex(h => /ds$/.test(h));
    const dspIdx = low.findIndex(h => /dsp/.test(h));
    IDX2_UNIT = new Map();
    IDX2_PLATE = new Map();
    COUNT2 = 0;
    for (const r of rows) {
      const vin = (r[vinIdx]||"").toString().trim();
      const unit = (r[unitIdx]||"").toString().trim();
      const plate = (r[plateIdx]||"").toString().trim();
      const ds = (r[dsIdx]||"").toString().trim();
      const dsp = (r[dspIdx]||"").toString().trim();
      const rec = { vin, unit, plate, ds, dsp };
      if (unit) {
        if (!IDX2_UNIT.has(unit)) IDX2_UNIT.set(unit, []);
        IDX2_UNIT.get(unit).push(rec);
      }
      if (plate) {
        if (!IDX2_PLATE.has(plate)) IDX2_PLATE.set(plate, []);
        IDX2_PLATE.get(plate).push(rec);
      }
      COUNT2++;
    }
    console.log('Loaded data2.csv:', COUNT2, 'rows');
  } catch (e) {
    console.error('Error loading data2.csv:', e);
  }
}

function showUnitPlateResults(unit, plate) {
  const box = document.getElementById('unitPlateResults');
  box.innerHTML = '';
  let results = [];
  if (unit) {
    results = IDX2_UNIT.get(unit) || [];
  } else if (plate) {
    results = IDX2_PLATE.get(plate) || [];
  }
  if (results.length === 0) {
    box.innerHTML = `<div class="result"><div>No match found for ${unit ? 'Unit: <b>'+unit+'</b>' : 'Plate: <b>'+plate+'</b>'}.</div></div>`;
    return;
  }
  const head = document.createElement('div');
  head.className = 'sub';
  head.textContent = `${results.length} match${results.length>1?'es':''} for ${unit ? 'Unit '+unit : 'Plate '+plate}`;
  box.appendChild(head);
  results.forEach(r => {
    const row = document.createElement('div');
    row.className = 'result';
    row.innerHTML = `<div>
      <div class="sub">VIN: <span style="font-family:ui-monospace">${r.vin}</span></div>
      <div class="big">Unit: <b>${r.unit||'(blank)'}</b> | Plate: <b>${r.plate||'(blank)'}</b></div>
      <div class="sub">DS: <b>${r.ds||'(blank)'}</b> | DSP: <b>${r.dsp||'(blank)'}</b></div>
    </div>`;
    box.appendChild(row);
  });
}

// ===== Nav & Boot =====
function initApp() {
  console.log('initApp called');
  
  // Show/hide scan button based on mobile detection
  const goScanBtn = document.getElementById('goScan');
  if (goScanBtn) {
    // Temporarily disable camera scanning - hide button for everyone
    goScanBtn.style.display = 'none';
    console.log('Camera scanning disabled - button hidden');
    
    /* Original mobile detection code - commented out
    if (isMobileDevice() && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      goScanBtn.style.display = 'inline-block';
      console.log('Mobile device detected, showing scan button');
    } else {
      goScanBtn.style.display = 'none';
      console.log('Desktop device or no camera, hiding scan button');
    }
    */
  }
  
  // Navigation event listeners
  const goType = document.getElementById('goType');
  const goScan = document.getElementById('goScan');
  const goUnitPlate = document.getElementById('goUnitPlate');
  const backHome1 = document.getElementById('backHome1');
  const backHome2 = document.getElementById('backHome2'); // This might be null if scan mode is commented out
  const backHome3 = document.getElementById('backHome3');
  const captureBtn = document.getElementById('captureBtn');
  const stopScanBtn = document.getElementById('stopScanBtn');
  const unitPlateMode = document.getElementById('unitPlateMode');

  console.log('goType element:', goType);
  console.log('goScan element:', goScan);
  console.log('goUnitPlate element:', goUnitPlate);
  console.log('backHome1 element:', backHome1);
  console.log('backHome2 element:', backHome2);
  console.log('backHome3 element:', backHome3);
  console.log('home element:', document.getElementById('home'));

  // Type mode navigation
  if (goType) {
    goType.addEventListener('click', () => {
      console.log('goType clicked - switching to type mode');
      document.getElementById('home').classList.add('hide');
      document.getElementById('typeMode').classList.remove('hide');
      // Only hide scan mode if it exists
      const scanMode = document.getElementById('scanMode');
      if (scanMode) scanMode.classList.add('hide');
      if (unitPlateMode) unitPlateMode.classList.add('hide');
    });
  }
  
  // Scan mode navigation (only if scan button exists)
  if (goScan) {
    goScan.addEventListener('click', () => {
      console.log('goScan clicked - switching to scan mode');
      document.getElementById('home').classList.add('hide');
      document.getElementById('typeMode').classList.add('hide');
      const scanMode = document.getElementById('scanMode');
      if (scanMode) {
        scanMode.classList.remove('hide');
        // Start camera when entering scan mode
        startCamera();
      }
      if (unitPlateMode) unitPlateMode.classList.add('hide');
    });
  }
  
  // Unit/Plate Lookup navigation
  if (goUnitPlate) {
    goUnitPlate.addEventListener('click', () => {
      document.getElementById('home').classList.add('hide');
      if (document.getElementById('typeMode')) document.getElementById('typeMode').classList.add('hide');
      if (unitPlateMode) unitPlateMode.classList.remove('hide');
    });
  }
  
  // Back to home from type mode
  if (backHome1) {
    backHome1.addEventListener('click', () => {
      console.log('backHome1 clicked - returning to home');
      document.getElementById('typeMode').classList.add('hide');
      // Only hide scan mode if it exists
      const scanMode = document.getElementById('scanMode');
      if (scanMode) scanMode.classList.add('hide');
      document.getElementById('home').classList.remove('hide');
      // Clear any results when going back
      const results = document.getElementById('results');
      if (results) results.innerHTML = '';
      // Clear input
      const q = document.getElementById('q');
      if (q) q.value = '';
    });
  }
  
  // Back to home from scan mode (only if button exists)
  if (backHome2) {
    backHome2.addEventListener('click', () => {
      console.log('backHome2 clicked - returning to home');
      document.getElementById('typeMode').classList.add('hide');
      const scanMode = document.getElementById('scanMode');
      if (scanMode) scanMode.classList.add('hide');
      document.getElementById('home').classList.remove('hide');
      // Stop camera when going back from scan mode
      stopCamera();
    });
  }
  
  // Back to home from unit/plate mode (only if button exists)
  if (backHome3) {
    backHome3.addEventListener('click', () => {
      console.log('backHome3 clicked - returning to home');
      const scanMode = document.getElementById('scanMode');
      if (scanMode) scanMode.classList.add('hide');
      const unitPlateMode = document.getElementById('unitPlateMode');
      if (unitPlateMode) unitPlateMode.classList.add('hide');
      document.getElementById('home').classList.remove('hide');
      // Clear input
      const unitInput = document.getElementById('unitInput');
      const plateInput = document.getElementById('plateInput');
      if (unitInput) unitInput.value = '';
      if (plateInput) plateInput.value = '';
      const box = document.getElementById('unitPlateResults');
      if (box) box.innerHTML = '';
    });
  }
  
  // Scan mode controls (only if they exist)
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
  
  // Unit/Plate Lookup controls
  const unitInput = document.getElementById('unitInput');
  const plateInput = document.getElementById('plateInput');
  const unitPlateSearchBtn = document.getElementById('unitPlateSearchBtn');
  if (unitPlateSearchBtn && unitInput && plateInput) {
    // Auto-search as you type, no button needed
    function autoUnitPlateSearch() {
      const unit = unitInput.value.trim().toUpperCase();
      const plate = plateInput.value.trim().toUpperCase();
      if (!unit && !plate) {
        const box = document.getElementById('unitPlateResults');
        box.innerHTML = '';
        return;
      }
      showUnitPlateResults(unit, plate);
    }
    unitInput.addEventListener('input', autoUnitPlateSearch);
    plateInput.addEventListener('input', autoUnitPlateSearch);
    unitInput.addEventListener('keyup', e => { if (e.key === 'Enter') autoUnitPlateSearch(); });
    plateInput.addEventListener('keyup', e => { if (e.key === 'Enter') autoUnitPlateSearch(); });
    // Hide the search button (optional, since it's not needed)
    unitPlateSearchBtn.style.display = 'none';
  }
  
  // Load the CSV data
  loadBundledCSV();
  loadData2CSV();
  
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