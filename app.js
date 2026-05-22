let currentView = 'home-view';
let db;
let currentSetlist = { id: null, name: '', songs: [] };

// --- FITUR BARU: WAKE LOCK (Layar Anti-Mati) ---
let wakeLock = null;
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock ACTIVE!');
        }
    } catch (err) {
        console.log(`Wake Lock error: ${err.message}`);
    }
}
function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release().then(() => {
            wakeLock = null;
            console.log('Wake Lock INACTIVE');
        });
    }
}

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
    history.replaceState({ view: 'home-view' }, '', '');
};

function switchView(viewName) {
    Object.values(views).forEach(view => view.classList.remove('active'));
    views[viewName].classList.add('active');
    currentView = viewName;
    document.getElementById('sidebar-setlist').classList.remove('open');
    history.pushState({ view: viewName }, '', '');
    
    // Matikan Wake Lock kalau keluar dari area Panggung
    if(viewName !== 'performance') releaseWakeLock();
}

window.addEventListener('popstate', (e) => {
    if (e.state && e.state.view) {
        Object.values(views).forEach(view => view.classList.remove('active'));
        views[e.state.view].classList.add('active');
        currentView = e.state.view;
        document.getElementById('sidebar-setlist').classList.remove('open');
        if(currentView !== 'performance') releaseWakeLock();
    }
});

const songListUl = document.getElementById('song-list');
new Sortable(songListUl, {
    animation: 150,
    ghostClass: 'sortable-ghost',
    handle: '.li-content', 
    onEnd: function (evt) {
        const movedItem = currentSetlist.songs.splice(evt.oldIndex, 1)[0];
        currentSetlist.songs.splice(evt.newIndex, 0, movedItem);
        const txSet = db.transaction('setlists', 'readwrite');
        txSet.objectStore('setlists').put(currentSetlist);
        renderEditorSongList();
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
            listContainer.innerHTML = '<li class="empty-state">No saved setlists</li>';
            return;
        }
        setlists.forEach(set => {
            const li = document.createElement('li');
            
            // Nama Setlist (Bisa diklik)
            const textSpan = document.createElement('span');
            textSpan.className = 'li-content';
            textSpan.innerText = `📁 ${set.name} (${set.songs.length} Songs)`;
            textSpan.addEventListener('click', () => {
                currentSetlist = set;
                document.getElementById('current-setlist-name').innerText = set.name;
                renderEditorSongList();
                switchView('editor');
            });

            // FITUR BARU: Tombol Hapus Setlist
            const delBtn = document.createElement('button');
            delBtn.className = 'btn-delete';
            delBtn.innerText = '🗑️';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Biar klik hapus nggak sengaja masuk ke editor
                if(confirm(`Permanently delete "${set.name}"?`)) {
                    const txDel = db.transaction('setlists', 'readwrite');
                    txDel.objectStore('setlists').delete(set.id);
                    renderHomeSetlists();
                }
            });

            li.appendChild(textSpan);
            li.appendChild(delBtn);
            listContainer.appendChild(li);
        });
    };
}

document.getElementById('btn-new-setlist').addEventListener('click', () => {
    let setName = prompt("Enter Setlist Name (Ex: Saturday Night Gig):");
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
        
        // Judul Lagu
        const textSpan = document.createElement('span');
        textSpan.className = 'li-content';
        textSpan.innerText = `${index + 1}. ${song.name}`;
        
        // FITUR BARU: Tombol Hapus Lagu dari Setlist
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-delete';
        delBtn.innerText = '❌';
        delBtn.addEventListener('click', () => {
            if(confirm(`Remove "${song.name}" from this setlist?`)) {
                currentSetlist.songs.splice(index, 1);
                const txSet = db.transaction('setlists', 'readwrite');
                txSet.objectStore('setlists').put(currentSetlist);
                renderEditorSongList();
            }
        });

        li.appendChild(textSpan);
        li.appendChild(delBtn);
        songListUl.appendChild(li);
    });
}

document.getElementById('file-importer').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file && file.type === "application/pdf") {
        const reader = new FileReader();
        reader.onload = async function(event) {
            const fileBuffer = event.target.result;
            const typedarray = new Uint8Array(fileBuffer);
            const pdfId = 'pdf_' + Date.now().toString(); 
            let detectedName = file.name.replace('.pdf', '');

            try {
                const pdfDoc = await pdfjsLib.getDocument(typedarray).promise;
                const page1 = await pdfDoc.getPage(1);
                const textContent = await page1.getTextContent();
                const fullText = textContent.items.map(item => item.str).join(' ');
                
                const doMatch = fullText.match(/do\s*=\s*([A-G][#b]?m?)/i);
                if (doMatch) {
                    detectedName = `[${doMatch[1].toUpperCase()}] ${detectedName}`;
                }
            } catch (err) {
                console.log("Auto-detect skipped", err);
            }

            const txPdf = db.transaction('pdfs', 'readwrite');
            txPdf.objectStore('pdfs').put({ id: pdfId, buffer: fileBuffer });

            currentSetlist.songs.push({ id: pdfId, name: detectedName });
            const txSet = db.transaction('setlists', 'readwrite');
            txSet.objectStore('setlists').put(currentSetlist);

            renderEditorSongList();
        };
        reader.readAsArrayBuffer(file);
    }
});

let currentSongIndex = 0;

document.getElementById('btn-play').addEventListener('click', () => {
    if (currentSetlist.songs.length === 0) return alert("Setlist is empty!");
    switchView('performance');
    requestWakeLock(); // PANGGIL WAKE LOCK SAAT MANGGUNG!
    currentSongIndex = 0; 
    renderSongInPerformance(currentSongIndex);
});

document.getElementById('btn-exit-play').addEventListener('click', () => {
    switchView('editor');
});

// --- FITUR BARU: TOMBOL INVERT PDF (DARK MODE) ---
document.getElementById('btn-invert-pdf').addEventListener('click', () => {
    const container = document.getElementById('pdf-container');
    container.classList.toggle('dark-pdf');
    
    const btn = document.getElementById('btn-invert-pdf');
    if (container.classList.contains('dark-pdf')) {
        btn.innerText = "☀️ Normal";
    } else {
        btn.innerText = "🌙 Invert";
    }
});

document.getElementById('btn-fullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log(`Fullscreen failed: ${err.message}`);
        });
        document.getElementById('btn-fullscreen').innerText = "📺 Exit Fullscreen";
    } else {
        document.exitFullscreen();
        document.getElementById('btn-fullscreen').innerText = "📺 Fullscreen";
    }
});

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