let currentView = 'home-view';
let db;
let currentSetlist = { id: null, name: '', songs: [] };

const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

const views = {
    home: document.getElementById('home-view'),
    editor: document.getElementById('editor-view'),
    performance: document.getElementById('performance-view')
};

// --- INIT DATABASE ---
const request = indexedDB.open("LuckaySetlistDB", 1);
request.onupgradeneeded = (e) => {
    db = e.target.result;
    if (!db.objectStoreNames.contains('setlists')) db.createObjectStore('setlists', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('pdfs')) db.createObjectStore('pdfs', { keyPath: 'id' });
};
request.onsuccess = (e) => {
    db = e.target.result;
    renderHomeSetlists();
    // Taruh history awal pas buka app
    history.replaceState({ view: 'home-view' }, '', '');
};

// --- VIEW & HISTORY CONTROLLER ---
function switchView(viewName) {
    Object.values(views).forEach(view => view.classList.remove('active'));
    views[viewName].classList.add('active');
    currentView = viewName;
    document.getElementById('sidebar-setlist').classList.remove('open');
    // Titip pesan ke History HP
    history.pushState({ view: viewName }, '', '');
}

// Bikin tombol back HP gak keluar dari aplikasi
window.addEventListener('popstate', (e) => {
    if (e.state && e.state.view) {
        Object.values(views).forEach(view => view.classList.remove('active'));
        views[e.state.view].classList.add('active');
        currentView = e.state.view;
        document.getElementById('sidebar-setlist').classList.remove('open');
    }
});

// --- INIT SORTABLE (DRAG & DROP) ---
const songListUl = document.getElementById('song-list');
new Sortable(songListUl, {
    animation: 150,
    ghostClass: 'sortable-ghost',
    onEnd: function (evt) {
        // Geser posisi data lagu di dalam array setlist
        const movedItem = currentSetlist.songs.splice(evt.oldIndex, 1)[0];
        currentSetlist.songs.splice(evt.newIndex, 0, movedItem);
        // Save otomatis ke DB
        const txSet = db.transaction('setlists', 'readwrite');
        txSet.objectStore('setlists').put(currentSetlist);
        renderEditorSongList(); // Refresh nomor urut
    }
});

function renderHomeSetlists() {
    const listContainer = document.getElementById('saved-setlists');
    listContainer.innerHTML = '';
    const tx = db.transaction('setlists', 'readonly');
    const getAll = tx.objectStore('setlists').getAll();

    getAll.onsuccess = () => {
        const setlists = getAll.result;
        if (setlists.length === 0) {
            listContainer.innerHTML = '<li class="empty-state">Belum ada setlist.</li>';
            return;
        }
        setlists.forEach(set => {
            const li = document.createElement('li');
            li.innerText = `📁 ${set.name} (${set.songs.length} Lagu)`;
            li.style.cursor = 'pointer';
            li.addEventListener('click', () => {
                currentSetlist = set;
                document.getElementById('current-setlist-name').innerText = set.name;
                renderEditorSongList();
                switchView('editor');
            });
            listContainer.appendChild(li);
        });
    };
}

document.getElementById('btn-new-setlist').addEventListener('click', () => {
    let setName = prompt("Masukkan Nama Setlist (Misal: Gigs TVRI):");
    if (setName) {
        currentSetlist = { id: Date.now().toString(), name: setName, songs: [] };
        const tx = db.transaction('setlists', 'readwrite');
        tx.objectStore('setlists').put(currentSetlist);
        document.getElementById('current-setlist-name').innerText = setName;
        renderEditorSongList();
        renderHomeSetlists();
        switchView('editor');
    }
});

document.getElementById('btn-back-home').addEventListener('click', () => {
    renderHomeSetlists();
    switchView('home');
});

document.getElementById('btn-import-pdf').addEventListener('click', () => {
    document.getElementById('file-importer').click();
});

function renderEditorSongList() {
    songListUl.innerHTML = '';
    currentSetlist.songs.forEach((song, index) => {
        const li = document.createElement('li');
        li.innerText = `${index + 1}. ${song.name}`;
        songListUl.appendChild(li);
    });
}

// --- HANDLE PDF & AUTO-DETECT TEKS ---
document.getElementById('file-importer').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file && file.type === "application/pdf") {
        
        const reader = new FileReader();
        reader.onload = async function(event) {
            const fileBuffer = event.target.result;
            const typedarray = new Uint8Array(fileBuffer);
            const pdfId = 'pdf_' + Date.now().toString(); 
            
            let detectedName = file.name.replace('.pdf', '');

            // PROSES AUTO-DETECT (Cari Do=...)
            try {
                const pdfDoc = await pdfjsLib.getDocument(typedarray).promise;
                const page1 = await pdfDoc.getPage(1);
                const textContent = await page1.getTextContent();
                const fullText = textContent.items.map(item => item.str).join(' ');
                
                // Regex nyari tulisan do= (spasi) nada
                const doMatch = fullText.match(/do\s*=\s*([A-G][#b]?m?)/i);
                if (doMatch) {
                    detectedName = `[${doMatch[1].toUpperCase()}] ${detectedName}`;
                }
            } catch (err) {
                console.log("Auto-detect dilewati", err);
            }

            // Simpan PDF mentah
            const txPdf = db.transaction('pdfs', 'readwrite');
            txPdf.objectStore('pdfs').put({ id: pdfId, buffer: fileBuffer });

            // Simpan nama yang udah di auto-detect
            currentSetlist.songs.push({ id: pdfId, name: detectedName });
            const txSet = db.transaction('setlists', 'readwrite');
            txSet.objectStore('setlists').put(currentSetlist);

            renderEditorSongList();
        };
        reader.readAsArrayBuffer(file);
    }
});

// --- PERFORMANCE MODE LOGIC ---
let currentSongIndex = 0;

document.getElementById('btn-play').addEventListener('click', () => {
    if (currentSetlist.songs.length === 0) return alert("Setlist kosong!");
    switchView('performance');
    currentSongIndex = 0; 
    renderSongInPerformance(currentSongIndex);
});

document.getElementById('btn-exit-play').addEventListener('click', () => {
    switchView('editor');
});

// Tombol Darurat ke Home
document.getElementById('btn-emergency-home').addEventListener('click', () => {
    renderHomeSetlists();
    switchView('home');
});

document.getElementById('btn-toggle-list').addEventListener('click', () => {
    document.getElementById('sidebar-setlist').classList.toggle('open');
});

function renderSidebarMenu() {
    const ul = document.getElementById('sidebar-song-list');
    ul.innerHTML = '';
    currentSetlist.songs.forEach((song, index) => {
        const li = document.createElement('li');
        li.innerText = `${index + 1}. ${song.name}`;
        if (index === currentSongIndex) li.classList.add('active-song');
        
        li.addEventListener('click', () => {
            currentSongIndex = index;
            renderSongInPerformance(currentSongIndex);
            document.getElementById('sidebar-setlist').classList.remove('open');
        });
        ul.appendChild(li);
    });
}

function renderSongInPerformance(index) {
    renderSidebarMenu(); 
    const songId = currentSetlist.songs[index].id;
    const tx = db.transaction('pdfs', 'readonly');
    const request = tx.objectStore('pdfs').get(songId);
    
    request.onsuccess = async () => {
        const pdfData = request.result.buffer;
        const typedarray = new Uint8Array(pdfData);
        
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        const container = document.getElementById('pdf-container');
        container.innerHTML = ''; 
        
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            canvas.style.width = '100%';
            canvas.style.height = 'auto';
            container.appendChild(canvas);
            await page.render({ canvasContext: context, viewport: viewport }).promise;
        }
        container.scrollTo(0, 0); 
    };
}

// TAP ZONES LOGIC
document.getElementById('tap-zone-right').addEventListener('click', () => {
    const container = document.getElementById('pdf-container');
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 50) {
        if (currentSongIndex < currentSetlist.songs.length - 1) {
            currentSongIndex++;
            renderSongInPerformance(currentSongIndex);
        }
    } else {
        container.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
    }
});

document.getElementById('tap-zone-left').addEventListener('click', () => {
    const container = document.getElementById('pdf-container');
    if (container.scrollTop <= 10) {
        if (currentSongIndex > 0) {
            currentSongIndex--;
            renderSongInPerformance(currentSongIndex);
        }
    } else {
        container.scrollBy({ top: -(window.innerHeight * 0.8), behavior: 'smooth' });
    }
});