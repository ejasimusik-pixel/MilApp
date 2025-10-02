// =================================================================================
// --- APP INITIALIZATION & CORE LOGIC ---
// =================================================================================

// --- Entry Point ---
window.addEventListener('load', main);
window.addEventListener('unhandledrejection', e => console.error('[UNHANDLEDREJECTION]', e.reason));

// --- IndexedDB Database Wrapper ---
const DB_NAME = "MilaUniversoDeSueños_v5";
const DB_VERSION = 1;
const STORES = ["dreams", "profiles", "settings", "journalEntries", "books", "audio", "conversations", "abundanceTransactions"];
// API key to use with the Gemini endpoints.  This can be injected into requests if needed
// to authenticate calls to the language and image generation services.  The key is stored
// here so the rest of the code can access it easily when constructing API requests.
const GEMINI_API_KEY = 'AIzaSyC0d7Sw_32UJeQer_OAjgX_GuEOaoWt0yg';
let db;

function getDB() {
  if (db) return Promise.resolve(db);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = e => {
      const dbInstance = e.target.result;
      STORES.forEach(name => {
        if (!dbInstance.objectStoreNames.contains(name)) {
          const store = dbInstance.createObjectStore(name, { keyPath: "id", autoIncrement: true });
          if (name === 'profiles') store.createIndex('nickname', 'nickname', { unique: true });
          if (name === 'conversations') store.createIndex('profileId', 'profileId', { unique: false });
        }
      });
    };
    request.onsuccess = e => { db = e.target.result; resolve(db); };
    request.onerror = e => { console.error("DB error:", e.target.error); reject(e.target.error); };
  });
}
async function get(storeName, id) { const db = await getDB(); return new Promise((resolve, reject) => { const req = db.transaction(storeName, "readonly").objectStore(storeName).get(id); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function getAll(storeName) { const db = await getDB(); return new Promise((resolve, reject) => { const req = db.transaction(storeName, "readonly").objectStore(storeName).getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function add(storeName, item) { const db = await getDB(); return new Promise((resolve, reject) => { const req = db.transaction(storeName, "readwrite").objectStore(storeName).add(item); req.onsuccess = (e) => resolve(e.target.result); req.onerror = () => reject(req.error); }); }
async function update(storeName, item) { const db = await getDB(); return new Promise((resolve, reject) => { const tx = db.transaction(storeName, "readwrite"); tx.objectStore(storeName).put(item); tx.oncomplete = () => resolve(); tx.onerror = e => reject(e.target.error); }); }
async function remove(storeName, id) { const db = await getDB(); return new Promise((resolve, reject) => { const tx = db.transaction(storeName, "readwrite"); tx.objectStore(storeName).delete(id); tx.oncomplete = () => resolve(); tx.onerror = e => reject(e.target.error); }); }
async function clearStore(storeName) { const db = await getDB(); return new Promise((resolve, reject) => { const tx = db.transaction(storeName, "readwrite"); tx.objectStore(storeName).clear(); tx.oncomplete = () => resolve(); tx.onerror = e => reject(e.target.error); }); }
async function getByIndex(storeName, indexName, key) { const db = await getDB(); return new Promise((resolve, reject) => { const req = db.transaction(storeName, "readonly").objectStore(storeName).index(indexName).getAll(key); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }


// --- Application State ---
let dreams = [], profiles = [], settings = {}, journalEntries = [], books = [], audioFiles = [], conversations = [], abundanceTransactions = [];
let currentDream = null, currentProfile = null, currentSongIndex = 0, currentConversation = [];
const VIEWS = {}, NAV_BUTTONS = {};
const VIEW_IDS = { 
  main: "main-view", 
  dream: "dream-view", 
  'perfil-de-luz': "perfil-de-luz-view", 
  journal: "journal-view", 
  library: "library-view",
  ajustes: "ajustes-view",
  cycles: "cycles-view",
  abundance: "abundance-view"
};
const VIEW_ORDER = ['main', 'perfil-de-luz', 'abundance', 'cycles', 'journal', 'library', 'ajustes'];
let currentViewIndex = 0;
let touchStartX = 0;
let touchEndX = 0;

// Nombres sugeridos para sueños predeterminados sin nombre.  Estos valores se muestran cuando se edita un sueño vacío.
const DEFAULT_NAME_SUGGESTIONS = [
  "La casa de mis sueños",
  "Nuestro Viaje"
];

let audioPlayer, currentSongEl, loopBtn, volumeSlider;
let isLooping = false;

// --- Main Application Flow ---
async function main() {
  await initSplashScreen();
  await getDB();

  [dreams, profiles, settings, journalEntries, books, audioFiles, conversations, abundanceTransactions] = await Promise.all([
    getAll('dreams'),
    getAll('profiles'),
    get('settings', 1).then(s => s || { id: 1, slideshowDuration: 5 }),
    getAll('journalEntries'),
    getAll('books'),
    getAll('audio'),
    getAll('conversations'),
    getAll('abundanceTransactions')
  ]);

  await setupInitialData();
  
  initUI();
  initSwipeNavigation();
  initMediaViewer();
  initAudioPlayer();
  initSubliminalMessages();
  initJournal();
  initLibrary();
  initSettings();
  initProfiles();
  initCycles();
  initAbundance();
  renderCosmos();
  startShootingStars();
  checkFirstVisit();
  
  initAutoBackup();
}

// --- Splash Screen Logic ---
async function initSplashScreen() {
  const greeting = document.getElementById('splash-greeting');
  const welcome  = document.getElementById('splash-welcome');
  const startBtn = document.getElementById('splash-start-btn');
  const splash   = document.getElementById('splash-screen');
  const appContainer = document.getElementById('app-container');

  setTimeout(() => greeting.style.opacity = 1, 100);
  setTimeout(() => welcome.style.opacity = 1, 600);
  setTimeout(() => startBtn.style.opacity = 1, 900);

  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      splash.classList.add('fade-out');
      appContainer.style.opacity = 1;
      splash.addEventListener('animationend', () => { splash.remove(); resolve(); }, { once: true });
    };

    startBtn.addEventListener('click', async () => {
      window.__shouldAutoplayOnInit = true;
      await unlockAudioAndMedia();
      finish();
    }, { once: true });
  });
}

// --- Initial Data Seeding ---
async function setupInitialData() {
  if (profiles.length === 0) {
    const defaultProfiles = [
      { fullName: "Emily Gricell Dimas Vicent", nickname: "Mila", birthDate: "1992-12-06", birthTime: "20:30", iaDescription: "Una mujer venezolana de unos 30 años, alta (1.73 m), esbelta y con una figura elegante. Su piel es de tono cálido, sus ojos almendrados, sus labios son carnosos y tiene una sonrisa hermosa y magnética. Lleva el cabello largo y negro con flequillo, y a veces lo peina con una cinta negra como toque distintivo. Su estilo es refinado y elegante, inspirado en la moda 'old money', vistiendo blusas de seda, pantalones palazzo de pierna ancha o vestidos discretos pero sofisticados. Tiene un aura cautivadora y una conexión natural con los animales, irradiando dulzura y una energía magnética.", photos: [], avatarBlob: null },
      { fullName: "Miguelangel Pulido Perez", nickname: "Miguelo", birthDate: "1994-05-19", birthTime: "14:05", iaDescription: "Un hombre venezolano de unos 30 años, alto (1.80 m), delgado y con un porte elegante. Tiene la piel morena clara, el pelo corto y rizado con raíces oscuras y puntas rubio platino, y lleva solo perilla (sin bigote). Su estilo diario es casual y relajado, con camisetas o camisas oversize sin logos, pero cuando se viste de etiqueta encarna el look 'old money' con camisas de lino, blazers discretos y pantalones de vestir a medida. Su presencia transmite confianza, frescura y una mezcla de encanto moderno y clásico.", photos: [], avatarBlob: null }
    ];
    for (const p of defaultProfiles) await add('profiles', p);
    profiles = await getAll('profiles');
  }
  if (dreams.length === 0) {
    // Sueños predeterminados sin nombre para que Mila pueda personalizarlos.  Se incluyen propiedades spec para el módulo S.P.E.C.
    const defaultDreams = [
      {
        name: "",
        color: "#FFFFFF",
        size: 80,
        position: { x: 70, y: 30 },
        steps: [],
        completed: false,
        spec: {
          select: { notes: '', images: [] },
          project: { notes: '', images: [] },
          expect: { notes: '', images: [] },
          collect: { notes: '', images: [] }
        }
      },
      {
        name: "",
        color: "#87CEEB",
        size: 95,
        position: { x: 25, y: 55 },
        steps: [],
        completed: false,
        spec: {
          select: { notes: '', images: [] },
          project: { notes: '', images: [] },
          expect: { notes: '', images: [] },
          collect: { notes: '', images: [] }
        }
      }
    ];
    for (const d of defaultDreams) await add('dreams', d);
    dreams = await getAll('dreams');
  }

  // Asegurar que los sueños existentes tengan nombres en blanco si eran los predeterminados y añadir la estructura spec
  for (const d of dreams) {
    if (d.name === 'Nuestro Viaje a Europa' || d.name === 'Nuestra Casa') {
      d.name = '';
    }
    if (!d.spec) {
      d.spec = {
        select: { notes: '', images: [] },
        project: { notes: '', images: [] },
        expect: { notes: '', images: [] },
        collect: { notes: '', images: [] }
      };
    }
    await update('dreams', d);
  }

  // Inicializar la estructura de gamificación si no existe en ajustes
  if (!settings.gamification) {
    settings.gamification = {
      streak: 0,
      lastGratitudeDate: null,
      achievements: []
    };
    await update('settings', settings);
  }
  
}

// =================================================================================
// --- UI & VIEW MANAGEMENT ---
// =================================================================================

function initUI() {
  for (const key in VIEW_IDS) VIEWS[key] = document.getElementById(VIEW_IDS[key]);
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const viewKey = btn.dataset.view;
    NAV_BUTTONS[viewKey] = btn;
    btn.addEventListener('click', () => showView(viewKey));
  });
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabId = e.target.dataset.tab;
      const tabContainer = e.target.parentElement;
      const contentContainer = tabContainer.closest('.view-container, .max-w-3xl, .max-w-2xl');
      tabContainer.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      contentContainer.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      document.getElementById(`${tabId}-tab-content`).classList.remove('hidden');
    });
  });

  document.getElementById('add-dream-btn').addEventListener('click', () => showDreamModal());
  document.getElementById('cancel-dream-modal').addEventListener('click', () => document.getElementById('dream-modal').classList.add('hidden'));
  document.getElementById('dream-form').addEventListener('submit', handleAddOrUpdateDream);
  document.getElementById('close-dream-view-btn').addEventListener('click', () => showView('main'));
  document.getElementById('new-step-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') handleAddStep(); });
  document.getElementById('gemini-steps-btn').addEventListener('click', generateDreamStepsWithGemini);
  document.getElementById('fulfill-dream-btn').addEventListener('click', fulfillCurrentDream);
  document.getElementById('close-instructions-btn').addEventListener('click', async () => {
    document.getElementById('instructions-modal').classList.add('hidden');
    settings.firstVisitDone = true;
    await update('settings', settings);
  });
  document.getElementById('quick-add-music-btn').addEventListener('click', () => showView('ajustes'));
  document.getElementById('close-fallback-modal').addEventListener('click', () => {
    const modal = document.getElementById('fallback-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  });

  // Permitir editar el nombre del sueño desde la vista del sueño con un botón de lápiz
  const editNameBtn = document.getElementById('edit-dream-name-btn');
  if (editNameBtn) {
    editNameBtn.addEventListener('click', async () => {
      if (!currentDream) return;
      const nuevoNombre = prompt('Introduce un nuevo nombre para el sueño:', currentDream.name || '');
      if (nuevoNombre !== null) {
        currentDream.name = nuevoNombre.trim();
        await update('dreams', currentDream);
        // Actualiza el título en la vista y en el cosmos
        const titleEl = document.getElementById('dream-view-title');
        if (titleEl) titleEl.textContent = currentDream.name && currentDream.name.trim() !== '' ? currentDream.name : 'Sueño sin nombre';
        renderCosmos();
      }
    });
  }

  // Ayuda IA: abrir/cerrar panel y enviar preguntas
  const helpBtn = document.getElementById('help-ai-button');
  if (helpBtn) helpBtn.addEventListener('click', () => toggleHelpPanel());
  const helpCloseBtn = document.getElementById('help-ai-close');
  if (helpCloseBtn) helpCloseBtn.addEventListener('click', () => toggleHelpPanel());
  const helpSendBtn = document.getElementById('help-ai-send');
  if (helpSendBtn) helpSendBtn.addEventListener('click', () => handleHelpAISend());
  const helpInput = document.getElementById('help-ai-input');
  if (helpInput) helpInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleHelpAISend(); }
  });

  // Tutorial externo: copiar prompt, copiar imagen y cerrar
  const closeExt = document.getElementById('close-external-tutorial');
  if (closeExt) closeExt.addEventListener('click', () => closeExternalTutorial());
  const copyPromptBtn = document.getElementById('copy-prompt-btn');
  if (copyPromptBtn) copyPromptBtn.addEventListener('click', () => {
    const t = document.getElementById('ext-tutorial-prompt');
    if (t) navigator.clipboard.writeText(t.value).then(() => showNotification('Prompt copiado al portapapeles.'));
  });
  const copyImageBtn = document.getElementById('copy-image-btn');
  if (copyImageBtn) copyImageBtn.addEventListener('click', () => {
    if (lastTutorialImageBlob) copyBlobToClipboard(lastTutorialImageBlob);
    else showNotification('No hay imagen para copiar.', 'err');
  });

// Lámpara mágica: abrir y cerrar modal de mensaje
const cosmosWishBtn = document.getElementById('cosmos-wish-btn');
if (cosmosWishBtn) cosmosWishBtn.addEventListener('click', () => {
  const modal = document.getElementById('cosmos-wish-modal');
  if (modal) modal.classList.remove('hidden');
});
const closeWishModalBtn = document.getElementById('close-wish-modal');
if (closeWishModalBtn) closeWishModalBtn.addEventListener('click', () => {
  const modal = document.getElementById('cosmos-wish-modal');
  if (modal) modal.classList.add('hidden');
});


  showView('main');
}

function showView(viewKey) {
  if (!VIEW_IDS[viewKey]) return;

  Object.values(VIEWS).forEach(v => v.classList.add('hidden'));
  VIEWS[viewKey].classList.remove('hidden');
  
  requestAnimationFrame(() => {
      VIEWS[viewKey].style.opacity = 1;
      VIEWS[viewKey].style.transform = 'translateY(0)';
  });
  
  Object.values(NAV_BUTTONS).forEach(b => b.classList.remove('active'));
  if (NAV_BUTTONS[viewKey]) NAV_BUTTONS[viewKey].classList.add('active');

  currentViewIndex = VIEW_ORDER.indexOf(viewKey);
}

function initSwipeNavigation() {
    const appContainer = document.getElementById('app-container');
    appContainer.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    appContainer.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        handleViewSwipe(e);
    }, { passive: true });
}

function handleViewSwipe(e) {
    if (e.target.closest('textarea, input, #cosmos, #player-footer, .gallery-grid, .tab-content')) {
        return;
    }
    if (document.querySelector('#dream-view:not(.hidden), #dream-modal:not(.hidden), #media-viewer-modal:not(.hidden)')) {
        return;
    }

    const swipeThreshold = 100;
    if (touchEndX < touchStartX - swipeThreshold) {
        const nextIndex = (currentViewIndex + 1) % VIEW_ORDER.length;
        showView(VIEW_ORDER[nextIndex]);
    }
    if (touchEndX > touchStartX + swipeThreshold) {
        const prevIndex = (currentViewIndex - 1 + VIEW_ORDER.length) % VIEW_ORDER.length;
        showView(VIEW_ORDER[prevIndex]);
    }
}

function checkFirstVisit() {
  get('settings', 1).then(s => {
    if (!s || !s.firstVisitDone) {
      document.getElementById('instructions-modal').classList.remove('hidden');
    }
  });
}

function showNotification(message, type = 'ok') {
    const notification = document.getElementById('message-notification');
    notification.textContent = message;
    notification.className = 'fixed top-[-100px] left-1/2 -translate-x-1/2 bg-purple-500 text-white px-6 py-3 rounded-lg shadow-lg opacity-0 transition-all duration-500 z-[101]';
    if (type === 'err') notification.classList.replace('bg-purple-500', 'bg-red-500');
    
    notification.style.top = '20px';
    notification.style.opacity = '1';
    
    clearTimeout(notification._t);
    notification._t = setTimeout(() => {
        notification.style.top = '-100px';
        notification.style.opacity = '0';
    }, 4000);
}

function startShootingStars() {
  setInterval(() => {
    const star = document.createElement('div');
    star.className = 'shooting-star';
    star.style.top = `${Math.random() * 100}%`;
    star.style.left = `${Math.random() * 100}%`;
    document.body.appendChild(star);
    setTimeout(() => star.remove(), 3000);
  }, 5000);
}

// =================================================================================
// --- COSMOS & DREAMS ---
// =================================================================================

function renderCosmos() {
  const cosmosEl = document.getElementById('cosmos');
  cosmosEl.innerHTML = '';
  dreams.forEach(dream => {
    const el = document.createElement('div');
    el.className = dream.completed ? 'sun' : 'planet';
    el.style.background = dream.completed
      ? `radial-gradient(circle at center, ${dream.color || '#fef08a'}, #facc15)`
      : `radial-gradient(circle at 30% 30%, ${dream.color || '#facc15'}, #333)`;
    el.style.width  = `${dream.size}px`;
    el.style.height = `${dream.size}px`;
    el.style.top  = `${dream.position.y}%`;
    el.style.left = `${dream.position.x}%`;
    el.dataset.id = dream.id;
    el.title = dream.name;
    makeDraggable(el, dream.id);
    cosmosEl.appendChild(el);
  });
}

function showDreamModal(dream = null) {
  const modal = document.getElementById('dream-modal');
  const form = document.getElementById('dream-form');
  form.reset();
  form.dataset.id = dream ? dream.id : '';
  // Rellenar campos si se está editando un sueño
  if (dream) {
    form.elements.name.value = dream.name || '';
    form.elements.color.value = dream.color;
    form.elements.size.value = dream.size;
  }
  // Mostrar sugerencias de nombre si el sueño actual no tiene nombre
  const suggestionsContainer = document.getElementById('dream-name-suggestions');
  suggestionsContainer.innerHTML = '';
  if (dream && (!dream.name || dream.name.trim() === '')) {
    DEFAULT_NAME_SUGGESTIONS.forEach(sugg => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'text-xs bg-gray-700 hover:bg-yellow-600 text-white py-1 px-2 rounded';
      btn.textContent = sugg;
      btn.addEventListener('click', () => { form.elements.name.value = sugg; });
      suggestionsContainer.appendChild(btn);
    });
    suggestionsContainer.classList.remove('hidden');
  } else {
    suggestionsContainer.classList.add('hidden');
  }
  modal.classList.remove('hidden');
}

async function handleAddOrUpdateDream(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const id = e.target.dataset.id ? parseInt(e.target.dataset.id) : null;

  if (id) {
    const dream = dreams.find(d => d.id === id);
    dream.name  = formData.get('name');
    dream.color = formData.get('color');
    dream.size  = parseInt(formData.get('size'));
    await update('dreams', dream);
    showNotification("Sueño actualizado.");
  } else {
    const newDream = {
      name: formData.get('name'),
      color: formData.get('color'),
      size: parseInt(formData.get('size')),
      position: { x: Math.random() * 80 + 10, y: Math.random() * 70 + 15 },
      steps: [], completed: false, images: [], visionBoardData: []
    };
    if (!newDream.name) { showNotification("El sueño debe tener un nombre."); return; }
    const newId = await add('dreams', newDream);
    newDream.id = newId;
    dreams.push(newDream);
    showNotification("¡Sueño añadido al cosmos!");
  }
  renderCosmos();
  document.getElementById('dream-modal').classList.add('hidden');
}

function handleDreamClick(id) {
  currentDream = dreams.find(d => d.id === id);
  if (currentDream) {
    renderDreamView();
    showView('dream');
  }
}

function renderDreamView() {
  if (!currentDream) return;
  // Si el sueño no tiene nombre, mostrar un marcador genérico
  document.getElementById('dream-view-title').textContent = currentDream.name && currentDream.name.trim() !== '' ? currentDream.name : 'Sueño sin nombre';
  renderImagePortalForDream();
  renderSteps();
  renderSpecModule();
}

function renderSteps() {
  const stepsEl = document.getElementById('dream-view-steps');
  stepsEl.innerHTML = '';
  const steps = currentDream.steps || [];
  steps.forEach((step, index) => {
    const li = document.createElement('li');
    li.className = `flex items-center justify-between p-2 rounded ${step.completed ? 'bg-green-900/50' : 'bg-gray-700/50'}`;
    li.innerHTML = `<span class="${step.completed ? 'line-through' : ''}">${step.text}</span><input type="checkbox" ${step.completed ? 'checked' : ''} class="form-checkbox h-5 w-5 text-yellow-300 bg-gray-800 border-gray-600 rounded focus:ring-yellow-400">`;
    li.querySelector('input').onchange = () => toggleStep(index);
    stepsEl.appendChild(li);
  });
  const allStepsCompleted = steps.length > 0 && steps.every(s => s.completed);
  document.getElementById('fulfill-dream-container').classList.toggle('hidden', !allStepsCompleted);
}

async function handleAddStep() {
  const input = document.getElementById('new-step-input');
  if (!input.value.trim()) return;
  currentDream.steps = [...(currentDream.steps || []), { text: input.value, completed: false }];
  await update('dreams', currentDream);
  input.value = '';
  renderSteps();
}

async function toggleStep(index) {
  currentDream.steps[index].completed = !currentDream.steps[index].completed;
  await update('dreams', currentDream);
  renderSteps();
}

async function fulfillCurrentDream() {
  if (!currentDream) return;
  currentDream.completed = true;
  await update('dreams', currentDream);
  
  const planetEl = document.querySelector(`#cosmos .planet[data-id="${currentDream.id}"]`);
  showCelebration();

  if (planetEl) {
    planetEl.classList.remove('planet');
    planetEl.classList.add('sun');
    planetEl.style.background = `radial-gradient(circle at center, ${currentDream.color || '#fef08a'}, #facc15)`;
  }

  setTimeout(() => { 
    showView('main');
  }, 4000);
}

// =================================================================================
// --- MÓDULO S.P.E.C. Y GAMIFICACIÓN ---
// =================================================================================

/**
 * Renderiza el módulo S.P.E.C. dentro de la vista del sueño actual.  Cada etapa
 * (Seleccionar, Proyectar, Esperar, Coleccionar) ofrece un textarea para
 * registrar notas y un botón para guardarlas.  La estructura de datos se
 * almacena en currentDream.spec.
 */
function renderSpecModule() {
  if (!currentDream) return;
  const container = document.getElementById('spec-module');
  if (!container) return;
  // Asegura que exista la estructura spec
  if (!currentDream.spec) {
    currentDream.spec = {
      select: { notes: '', images: [] },
      project: { notes: '', images: [] },
      expect: { notes: '', images: [] },
      collect: { notes: '', images: [] }
    };
  }
  container.innerHTML = '';
  const stages = ['select', 'project', 'expect', 'collect'];
  const titles = {
    select: 'Seleccionar',
    project: 'Proyectar',
    expect: 'Esperar',
    collect: 'Coleccionar'
  };
  stages.forEach(stage => {
    const stageData = currentDream.spec[stage] || { notes: '', images: [] };
    const wrapper = document.createElement('div');
    wrapper.className = 'bg-gray-900/50 p-3 rounded space-y-2';
    // Título
    const h4 = document.createElement('h4');
    h4.className = 'font-cinzel text-yellow-200';
    h4.textContent = titles[stage];
    wrapper.appendChild(h4);
    // Contenedor de imágenes adjuntas
    const imgContainer = document.createElement('div');
    imgContainer.id = `spec-${stage}-images`;
    imgContainer.className = 'flex flex-wrap gap-2';
    (stageData.images || []).forEach((imgObj, idx) => {
      const item = document.createElement('div');
      item.className = 'relative';
      const url = getMediaURL(imgObj.blob || imgObj.data || imgObj);
      const imgEl = document.createElement('img');
      imgEl.src = url;
      imgEl.className = 'w-14 h-14 object-cover rounded';
      imgEl.onload = () => { if (isBlobURL(url)) URL.revokeObjectURL(url); };
      const delBtn = document.createElement('button');
      delBtn.className = 'absolute top-0 right-0 bg-red-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center';
      delBtn.innerHTML = '&times;';
      delBtn.addEventListener('click', async () => {
        // Remove this image from stageData.images
        currentDream.spec[stage].images.splice(idx, 1);
        await update('dreams', currentDream);
        renderSpecModule();
      });
      item.appendChild(imgEl);
      item.appendChild(delBtn);
      imgContainer.appendChild(item);
    });
    wrapper.appendChild(imgContainer);
    // Controles: añadir imagen, número de variaciones y generar
    const controls = document.createElement('div');
    controls.className = 'flex items-center flex-wrap gap-2 text-xs mt-1';
    const addBtn = document.createElement('button');
    addBtn.className = 'bg-blue-500 hover:bg-blue-600 text-white font-bold py-1 px-2 rounded';
    addBtn.textContent = 'Añadir Foto';
    // File input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.multiple = true;
    fileInput.className = 'hidden';
    fileInput.id = `spec-${stage}-file-input`;
    addBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => {
      if (e.target.files && e.target.files.length) {
        handleSpecImageUpload(stage, e.target.files);
      }
    });
    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.min = '1';
    numInput.max = '8';
    numInput.value = '1';
    numInput.id = `spec-${stage}-variations`;
    numInput.className = 'w-14 bg-gray-700 text-center rounded';
    const genBtn = document.createElement('button');
    genBtn.className = 'gemini-btn text-gray-900 font-bold py-1 px-3 rounded';
    genBtn.textContent = 'Generar';
    genBtn.addEventListener('click', () => generateSpecStepImages(stage));
    controls.appendChild(addBtn);
    controls.appendChild(fileInput);
    controls.appendChild(numInput);
    controls.appendChild(genBtn);
    wrapper.appendChild(controls);
    // Área de notas
    const textarea = document.createElement('textarea');
    textarea.id = `spec-${stage}-notes`;
    textarea.className = 'w-full bg-gray-700 p-2 rounded text-sm';
    textarea.rows = 2;
    textarea.placeholder = `Escribe tus notas para ${titles[stage].toLowerCase()}...`;
    textarea.value = stageData.notes || '';
    wrapper.appendChild(textarea);
    // Botón para guardar notas
    const saveBtn = document.createElement('button');
    saveBtn.className = 'bg-yellow-400 text-gray-900 font-bold py-1 px-3 rounded text-xs hover:bg-yellow-500';
    saveBtn.textContent = 'Guardar';
    saveBtn.addEventListener('click', () => saveSpecStage(stage));
    wrapper.appendChild(saveBtn);
    container.appendChild(wrapper);
  });
}

/**
 * Guarda las notas para una etapa específica del módulo S.P.E.C.  Actualiza
 * el objeto del sueño actual y lo persiste en IndexedDB.
 * @param {string} stage - Una de las claves: 'select', 'project', 'expect' o 'collect'
 */
async function saveSpecStage(stage) {
  if (!currentDream) return;
  const textarea = document.getElementById(`spec-${stage}-notes`);
  if (!textarea) return;
  if (!currentDream.spec) {
    currentDream.spec = {
      select: { notes: '', images: [] },
      project: { notes: '', images: [] },
      expect: { notes: '', images: [] },
      collect: { notes: '', images: [] }
    };
  }
  if (!currentDream.spec[stage]) {
    currentDream.spec[stage] = { notes: '', images: [] };
  }
  currentDream.spec[stage].notes = textarea.value.trim();
  await update('dreams', currentDream);
  showNotification('Notas guardadas.');
}

/**
 * Maneja la subida de imágenes para una etapa específica del módulo S.P.E.C.  Convierte los
 * archivos seleccionados en blobs y los agrega al array de imágenes de la etapa.  Una vez
 * añadidas las imágenes, actualiza el sueño y vuelve a renderizar el módulo.
 * @param {string} stage - Clave de etapa (select, project, expect, collect)
 * @param {FileList} files - Lista de archivos seleccionados
 */
async function handleSpecImageUpload(stage, files) {
  if (!currentDream || !files || !files.length) return;
  // Asegurar que la estructura spec existe
  if (!currentDream.spec) {
    currentDream.spec = { select: { notes: '', images: [] }, project: { notes: '', images: [] }, expect: { notes: '', images: [] }, collect: { notes: '', images: [] } };
  }
  if (!currentDream.spec[stage]) {
    currentDream.spec[stage] = { notes: '', images: [] };
  }
  const arr = Array.from(files);
  for (const file of arr) {
    try {
      const buffer = await file.arrayBuffer();
      const blob = new Blob([buffer], { type: file.type });
      currentDream.spec[stage].images.push({ blob });
    } catch (e) {
      console.error('Error al leer imagen para S.P.E.C.:', e);
    }
  }
  await update('dreams', currentDream);
  renderSpecModule();
}

/**
 * Genera imágenes para una etapa del módulo S.P.E.C. utilizando la API de Gemini.  Se lee
 * el número de variaciones solicitado, se construye el prompt final a partir del sueño actual
 * y se realizan múltiples llamadas a la API de generación de imágenes.  Las imágenes
 * generadas se guardan en la etapa correspondiente.  Si la API falla, se invoca el
 * tutorial externo para guiar al usuario en generadores alternativos.
 * @param {string} stage - Clave de etapa (select, project, expect, collect)
 */
async function generateSpecStepImages(stage) {
  if (!currentDream) return;
  const numInput = document.getElementById(`spec-${stage}-variations`);
  const count = parseInt(numInput && numInput.value ? numInput.value : '1', 10) || 1;
  // buildFinalPrompt() devuelve una promesa; espera su valor para usar el texto final
  const prompt = typeof buildFinalPrompt === 'function' ? await buildFinalPrompt() : '';
  // Asegurar que la estructura existe
  if (!currentDream.spec) {
    currentDream.spec = { select: { notes: '', images: [] }, project: { notes: '', images: [] }, expect: { notes: '', images: [] }, collect: { notes: '', images: [] } };
  }
  if (!currentDream.spec[stage]) {
    currentDream.spec[stage] = { notes: '', images: [] };
  }
  let generatedCount = 0;
  const variations = Math.min(Math.max(count, 1), 8);
  try {
    for (let i = 0; i < variations; i++) {
      const imageDataUrl = await generateImageWithGemini(prompt);
      const response = await fetch(imageDataUrl);
      const blob = await response.blob();
      currentDream.spec[stage].images.push({ blob });
      generatedCount++;
    }
    await update('dreams', currentDream);
    renderSpecModule();
    showNotification(`Se generaron ${generatedCount} imagen${generatedCount === 1 ? '' : 'es'} para ${stage}.`);
  } catch (error) {
    console.error('Error generando imágenes S.P.E.C.:', error);
    // Si falla la generación, mostrar el tutorial externo
    openExternalMiniTutorial(stage);
  }
}

// Variable global para guardar la última imagen utilizada en el tutorial externo
let lastTutorialImageBlob = null;

/**
 * Selecciona la mejor foto disponible para el tutorial externo: toma la primera imagen
 * adjunta en la etapa, o en su defecto el avatar del perfil activo, si existe.  Si no hay
 * ninguna imagen disponible, devuelve null.
 * @param {string} stage - Clave de etapa
 * @returns {Blob|null}
 */
function pickBestPhotoForStage(stage) {
  if (currentDream && currentDream.spec && currentDream.spec[stage] && currentDream.spec[stage].images && currentDream.spec[stage].images.length > 0) {
    const imgObj = currentDream.spec[stage].images[0];
    return imgObj.blob || imgObj.data || null;
  }
  // Utilizar avatar del perfil actual si existe
  if (currentProfile && currentProfile.avatarBlob) return currentProfile.avatarBlob;
  return null;
}

/**
 * Abre el modal del tutorial externo para indicar cómo generar imágenes fuera de la app.
 * Se muestra una imagen de referencia y el prompt final para que el usuario lo copie y
 * utilice en generadores externos como Gemini.  También prepara los manejadores de
 * eventos para copiar la imagen y el prompt al portapapeles.
 * @param {string} stage - Clave de etapa
 */
async function openExternalMiniTutorial(stage) {
  const modal = document.getElementById('external-tutorial-modal');
  if (!modal) return;
  const imgEl = document.getElementById('ext-tutorial-img');
  const promptTextarea = document.getElementById('ext-tutorial-prompt');
  // Seleccionar imagen y guardarla en variable global
  const blob = pickBestPhotoForStage(stage);
  lastTutorialImageBlob = blob;
  if (blob) {
    const url = URL.createObjectURL(blob);
    imgEl.src = url;
    imgEl.onload = () => { URL.revokeObjectURL(url); };
  } else {
    imgEl.src = '';
  }
  // Construir y colocar el prompt final.
  // buildFinalPrompt() es asíncrona, por lo que debemos esperar su resolución.
  const prompt = typeof buildFinalPrompt === 'function' ? await buildFinalPrompt() : '';
  promptTextarea.value = prompt;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

/**
 * Cierra el modal del tutorial externo.
 */
function closeExternalTutorial() {
  const modal = document.getElementById('external-tutorial-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

/**
 * Abre el tutorial externo para generación de imágenes basado en el prompt final del Constructor.
 * Copia la primera imagen de los perfiles seleccionados (si existe) y muestra el prompt completo.
 * Esta función se usa como fallback cuando la generación interna falla o cuando el usuario desea
 * utilizar herramientas externas.  Utiliza el mismo modal que el S.P.E.C.
 * @param {string} prompt El prompt final a mostrar en el tutorial externo
 */
async function openExternalPromptTutorial(prompt) {
  const modal = document.getElementById('external-tutorial-modal');
  if (!modal) return;
  const imgEl = document.getElementById('ext-tutorial-img');
  const promptTextarea = document.getElementById('ext-tutorial-prompt');

  // Seleccionar la primera imagen de referencia de los personajes marcados
  let selectedBlob = null;
  try {
    const selectedCheckboxes = document.querySelectorAll('#image-character-selection input:checked');
    for (const checkbox of selectedCheckboxes) {
      const profile = await get('profiles', parseInt(checkbox.value));
      if (profile && profile.avatarBlob) {
        selectedBlob = profile.avatarBlob;
        break;
      }
    }
  } catch (err) {
    console.warn('No se pudieron obtener los perfiles seleccionados para el tutorial externo:', err);
  }

  lastTutorialImageBlob = null;
  if (selectedBlob) {
    lastTutorialImageBlob = selectedBlob;
    const url = URL.createObjectURL(selectedBlob);
    imgEl.src = url;
    imgEl.onload = () => { URL.revokeObjectURL(url); };
  } else {
    imgEl.src = '';
  }
  // Colocar el prompt recibido
  promptTextarea.value = prompt;
  // Actualizar enlace a Gemini como recomendado
  const geminiLink = document.getElementById('open-gemini');
  if (geminiLink) geminiLink.href = 'https://gemini.google.com/app';
  // Mostrar modal
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

/**
 * Copia un blob de imagen al portapapeles.  Utiliza la API Clipboard si está
 * disponible.  Si falla, muestra una notificación de error.
 * @param {Blob} blob - El blob de imagen a copiar
 */
async function copyBlobToClipboard(blob) {
  if (!blob) {
    showNotification('No hay imagen para copiar.', 'err');
    return;
  }
  try {
    const item = new ClipboardItem({ [blob.type]: blob });
    await navigator.clipboard.write([item]);
    showNotification('Imagen copiada al portapapeles.');
  } catch (err) {
    console.error('No se pudo copiar la imagen:', err);
    showNotification('No se pudo copiar la imagen.', 'err');
  }
}

/**
 * Activa una animación de destello en el botón del genio para dar feedback visual
 * de que una operación de IA ha concluido.
 */
function sparkleGenieButton() {
    const genieBtn = document.getElementById('cosmos-wish-btn');
    if (genieBtn) {
        genieBtn.classList.add('genie-sparkle');
        genieBtn.addEventListener('animationend', () => genieBtn.classList.remove('genie-sparkle'), { once: true });
    }
}

/**
 * Alterna la visibilidad del panel de ayuda IA.  Agrega o elimina la clase
 * `translate-x-full` para mostrar u ocultar el panel desde el lado derecho.
 */
function toggleHelpPanel() {
  const panel = document.getElementById('help-ai-panel');
  if (!panel) return;
  // Alternar clase hidden en lugar de translate-x-full para mostrar/ocultar
  panel.classList.toggle('hidden');
}

/**
 * Abre la ayuda IA (guIA) con un mensaje predefinido para generar afirmaciones positivas.
 * Se utiliza cuando el usuario pulsa "Continuar" en el mensaje de la lámpara mágica.
 */
function openAffirmationFromWish() {
  const modal = document.getElementById('cosmos-wish-modal');
  if (modal) modal.classList.add('hidden');
  // Mostrar el panel de ayuda si está oculto
  const helpPanel = document.getElementById('help-ai-panel');
  if (helpPanel && helpPanel.classList.contains('hidden')) {
    toggleHelpPanel();
  }
  // Prefijar el input con la petición de afirmaciones y enviarla automáticamente
  const helpInput = document.getElementById('help-ai-input');
  if (helpInput) {
    helpInput.value = 'Genera afirmaciones positivas para convertirme en mis deseos. ¿Cómo puedo ser la persona que atrae lo que desea?';
    handleHelpAISend();
  }
}

/**
 * Agrega un mensaje al hilo de conversación de la ayuda IA.
 * @param {string} role - 'user' o 'assistant'
 * @param {string} text - El texto a mostrar
 */
function pushHelpMessage(role, text) {
  const thread = document.getElementById('help-ai-thread');
  if (!thread) return;
  const bubble = document.createElement('div');
  bubble.className = role === 'user' ? 'bg-blue-600/70 p-2 rounded text-sm self-end max-w-[90%]' : 'bg-gray-700/70 p-2 rounded text-sm self-start max-w-[90%]';
  bubble.innerHTML = text.replace(/\n/g, '<br>');
  thread.appendChild(bubble);
  thread.scrollTop = thread.scrollHeight;
}

/**
 * Envía la consulta del usuario a la IA a través de la API de Gemini.  Prepara un
 * prompt que actúa como sistema, definiendo que la IA es la guía oficial de la
 * aplicación.  Maneja el flujo de mensajes, mostrando el mensaje del usuario y la
 * respuesta del asistente.  En caso de error, informa al usuario.
 */
async function handleHelpAISend() {
  const inputEl = document.getElementById('help-ai-input');
  if (!inputEl) return;
  const question = inputEl.value.trim();
  if (!question) return;
  pushHelpMessage('user', question);
  inputEl.value = '';
  // Construir prompt de sistema y de usuario
  let systemPrompt = `Eres la Guía oficial de \"Mila – Mapa de Sueños\". Conoces todas las pantallas y flujos de la aplicación: Mapa de Sueños (planetas), Constructor de Sueños, S.P.E.C., Diario, Perfil (fotos), Abundancia, Biblioteca, Ciclos y Ajustes. Debes dar instrucciones claras, breves y mágicas en español, utilizando bullets o pasos numerados cuando sea apropiado. Habla de manera cálida y práctica. Si la tarea implica generar una imagen fuera de la app, sugiere abrir el tutorial externo. Responde en texto plano (sin JSON) con saltos de línea. Contexto: `;
  const context = {
    vista: VIEW_ORDER[currentViewIndex],
    nombreSueño: currentDream ? (currentDream.name || 'sueño sin nombre') : null,
    perfiles: profiles.length,
    tieneAvatar: currentProfile && currentProfile.avatarBlob ? true : false
  };
  const fullPrompt = `${systemPrompt}\nUsuario pregunta: ${question}\nContexto adicional: ${JSON.stringify(context)}`;
  try {
    const aiResponse = await callGeminiAPI(fullPrompt);
    const cleaned = cleanAIText(aiResponse);
    pushHelpMessage('assistant', cleaned);
    sparkleGenieButton(); // Feedback de IA
  } catch (e) {
    console.error('Error en ayuda IA:', e);
    pushHelpMessage('assistant', 'Lo siento, no pude procesar tu pregunta en este momento.');