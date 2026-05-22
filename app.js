let currentView = 'home';
let db = null;

let currentSetlist = {
    id: null,
    name: '',
    songs: []
};

let currentPdfZoom = 100;
let currentSongIndex = 0;
let wakeLock = null;
let sortableInstance = null;

const pdfjsLib = window['pdfjs-dist/build/pdf'];

pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

/* =========================
   INIT APP
========================= */

document.addEventListener('DOMContentLoaded', () => {
    initDB();
    setupGlobalListeners();
    setupSortable();
});

/* =========================
   DATABASE
========================= */

function initDB() {
    const request = indexedDB.open('LuckaySetlistDB', 1);

    request.onupgradeneeded = (event) => {
        db = event.target.result;

        if (!db.objectStoreNames.contains('setlists')) {
            db.createObjectStore('setlists', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('pdfs')) {
            db.createObjectStore('pdfs', { keyPath: 'id' });
        }
    };

    request.onsuccess = (event) => {
        db = event.target.result;
        renderHomeSetlists();
        history.replaceState({ view: 'home' }, '', '');
    };

    request.onerror = () => {
        alert('Database error. Please refresh the page.');
        console.error('IndexedDB error:', request.error);
    };
}

function saveCurrentSetlist() {
    if (!db || !currentSetlist.id) return;

    const tx = db.transaction('setlists', 'readwrite');
    tx.objectStore('setlists').put(currentSetlist);
}

function deleteSetlist(setlistId) {
    if (!db || !setlistId) return;

    const tx = db.transaction('setlists', 'readwrite');
    tx.objectStore('setlists').delete(setlistId);

    tx.oncomplete = () => {
        renderHomeSetlists();
    };
}

/* =========================
   LISTENERS
========================= */

function setupGlobalListeners() {
    const btnNewSetlist = document.getElementById('btn-new-setlist');
    const btnImportPdf = document.getElementById('btn-import-pdf');
    const btnBackHome = document.getElementById('btn-back-home');
    const btnPlay = document.getElementById('btn-play');
    const btnExitPlay = document.getElementById('btn-exit-play');
    const btnEmergencyHome = document.getElementById('btn-emergency-home');
    const btnToggleList = document.getElementById('btn-toggle-list');
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const btnFullscreen = document.getElementById('btn-fullscreen');
    const btnInvertPdf = document.getElementById('btn-invert-pdf');

    const tapZoneRight = document.getElementById('tap-zone-right');
    const tapZoneLeft = document.getElementById('tap-zone-left');
    const fileImporter = document.getElementById('file-importer');

    btnNewSetlist.addEventListener('click', createNewSetlist);

    btnImportPdf.addEventListener('click', () => {
        fileImporter.click();
    });

    btnBackHome.addEventListener('click', () => {
        renderHomeSetlists();
        switchView('home');
    });

    btnPlay.addEventListener('click', startPerformance);

    btnExitPlay.addEventListener('click', () => {
        switchView('editor');
    });

    btnEmergencyHome.addEventListener('click', () => {
        renderHomeSetlists();
        switchView('home');
    });

    btnToggleList.addEventListener('click', () => {
        document.getElementById('sidebar-setlist').classList.toggle('open');
    });

    btnZoomIn.addEventListener('click', () => {
        currentPdfZoom += 20;
        applyZoom();
    });

    btnZoomOut.addEventListener('click', () => {
        if (currentPdfZoom > 60) {
            currentPdfZoom -= 20;
            applyZoom();
        }
    });

    btnFullscreen.addEventListener('click', toggleFullscreen);

    btnInvertPdf.addEventListener('click', toggleInvertPdf);

    tapZoneRight.addEventListener('click', goNext);
    tapZoneLeft.addEventListener('click', goPrevious);

    fileImporter.addEventListener('change', importPdfFile);
}

function setupSortable() {
    const songList = document.getElementById('song-list');

    sortableInstance = new Sortable(songList, {
        animation: 150,
        handle: '.li-content',

        onEnd: (event) => {
            if (event.oldIndex === event.newIndex) return;

            const movedSong = currentSetlist.songs.splice(event.oldIndex, 1)[0];
            currentSetlist.songs.splice(event.newIndex, 0, movedSong);

            saveCurrentSetlist();
            renderEditorSongList();
        }
    });
}

/* =========================
   VIEW MANAGEMENT
========================= */

function switchView(viewName) {
    const targetView = document.getElementById(`${viewName}-view`);

    if (!targetView) {
        console.error(`View not found: ${viewName}-view`);
        return;
    }

    document.querySelectorAll('.view').forEach((view) => {
        view.classList.remove('active');
    });

    targetView.classList.add('active');

    currentView = viewName;

    closeSidebar();

    if (viewName !== 'performance') {
        releaseWakeLock();
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar-setlist');

    if (sidebar) {
        sidebar.classList.remove('open');
    }
}

/* =========================
   HOME
========================= */

function renderHomeSetlists() {
    if (!db) return;

    const list = document.getElementById('saved-setlists');
    list.innerHTML = '';

    const tx = db.transaction('setlists', 'readonly');
    const request = tx.objectStore('setlists').getAll();

    request.onsuccess = (event) => {
        const setlists = event.target.result || [];

        if (setlists.length === 0) {
            list.innerHTML = `
                <li class="empty-state">
                    No saved setlists.
                </li>
            `;
            return;
        }

        setlists.forEach((setlist) => {
            const li = document.createElement('li');

            li.innerHTML = `
                <span class="li-content">
                    📁 ${escapeHtml(setlist.name)} (${setlist.songs.length} Songs)
                </span>

                <button class="btn-delete" title="Delete setlist">
                    🗑️
                </button>
            `;

            li.querySelector('.li-content').addEventListener('click', () => {
                currentSetlist = setlist;
                document.getElementById('current-setlist-name').innerText = setlist.name;

                renderEditorSongList();
                switchView('editor');
            });

            li.querySelector('.btn-delete').addEventListener('click', (event) => {
                event.stopPropagation();

                const confirmed = confirm(`Delete setlist "${setlist.name}"?`);

                if (confirmed) {
                    deleteSetlist(setlist.id);
                }
            });

            list.appendChild(li);
        });
    };

    request.onerror = () => {
        console.error('Failed to load setlists:', request.error);
    };
}

function createNewSetlist() {
    const name = prompt('Setlist Name:');

    if (!name || !name.trim()) return;

    currentSetlist = {
        id: Date.now().toString(),
        name: name.trim(),
        songs: []
    };

    document.getElementById('current-setlist-name').innerText = currentSetlist.name;

    saveCurrentSetlist();
    renderEditorSongList();
    switchView('editor');
}

/* =========================
   EDITOR
========================= */

function renderEditorSongList() {
    const songList = document.getElementById('song-list');
    songList.innerHTML = '';

    if (!currentSetlist.songs || currentSetlist.songs.length === 0) {
        songList.innerHTML = `
            <li class="empty-state">
                No songs yet.
            </li>
        `;
        return;
    }

    currentSetlist.songs.forEach((song, index) => {
        const li = document.createElement('li');

        li.innerHTML = `
            <span class="li-content">
                ${index + 1}. ${escapeHtml(song.name)}
            </span>

            <button class="btn-delete" title="Remove song">
                ❌
            </button>
        `;

        li.querySelector('.btn-delete').addEventListener('click', () => {
            currentSetlist.songs.splice(index, 1);

            saveCurrentSetlist();
            renderEditorSongList();
        });

        songList.appendChild(li);
    });
}

function importPdfFile(event) {
    const file = event.target.files[0];

    if (!file) return;

    if (file.type !== 'application/pdf') {
        alert('Please import PDF file only.');
        event.target.value = '';
        return;
    }

    if (!currentSetlist.id) {
        alert('Please create or open a setlist first.');
        event.target.value = '';
        return;
    }

    const reader = new FileReader();

    reader.onload = (readerEvent) => {
        const buffer = readerEvent.target.result;
        const pdfId = `pdf_${Date.now()}`;

        const tx = db.transaction('pdfs', 'readwrite');

        tx.objectStore('pdfs').put({
            id: pdfId,
            buffer: buffer
        });

        tx.oncomplete = () => {
            currentSetlist.songs.push({
                id: pdfId,
                name: file.name
            });

            saveCurrentSetlist();
            renderEditorSongList();

            event.target.value = '';
        };

        tx.onerror = () => {
            alert('Failed to save PDF.');
            console.error('PDF save error:', tx.error);
            event.target.value = '';
        };
    };

    reader.onerror = () => {
        alert('Failed to read PDF file.');
        event.target.value = '';
    };

    reader.readAsArrayBuffer(file);
}

/* =========================
   PERFORMANCE
========================= */

function startPerformance() {
    if (!currentSetlist.songs || currentSetlist.songs.length === 0) {
        alert('Setlist is empty!');
        return;
    }

    currentSongIndex = 0;

    switchView('performance');
    requestWakeLock();
    renderSongInPerformance(currentSongIndex);
}

async function renderSongInPerformance(index) {
    if (!currentSetlist.songs[index]) return;

    currentPdfZoom = 100;
    renderSidebarMenu();

    const songId = currentSetlist.songs[index].id;
    const tx = db.transaction('pdfs', 'readonly');
    const request = tx.objectStore('pdfs').get(songId);

    request.onsuccess = async () => {
        const result = request.result;

        if (!result || !result.buffer) {
            alert('PDF not found.');
            return;
        }

        const container = document.getElementById('pdf-container');

        try {
            container.innerHTML = `
                <div class="pdf-empty-state">
                    Loading PDF...
                </div>
            `;

            const pdf = await pdfjsLib
                .getDocument(new Uint8Array(result.buffer))
                .promise;

            container.innerHTML = '';

            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
                const page = await pdf.getPage(pageNumber);
                const viewport = page.getViewport({ scale: 1.5 });

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');

                canvas.width = viewport.width;
                canvas.height = viewport.height;

                container.appendChild(canvas);

                await page.render({
                    canvasContext: context,
                    viewport: viewport
                }).promise;
            }

            applyZoom();
            container.scrollTo(0, 0);
        } catch (error) {
            console.error('PDF render error:', error);

            container.innerHTML = `
                <div class="pdf-empty-state">
                    Failed to load PDF.
                </div>
            `;
        }
    };

    request.onerror = () => {
        console.error('Failed to get PDF:', request.error);
    };
}

function renderSidebarMenu() {
    const sidebarList = document.getElementById('sidebar-song-list');
    sidebarList.innerHTML = '';

    currentSetlist.songs.forEach((song, index) => {
        const li = document.createElement('li');

        li.innerText = `${index + 1}. ${song.name}`;

        if (index === currentSongIndex) {
            li.classList.add('active-song');
        }

        li.addEventListener('click', () => {
            currentSongIndex = index;
            renderSongInPerformance(index);
            closeSidebar();
        });

        sidebarList.appendChild(li);
    });
}

/* =========================
   NAVIGATION
========================= */

function goNext() {
    const container = document.getElementById('pdf-container');

    const isAtBottom =
        container.scrollTop + container.clientHeight >= container.scrollHeight - 50;

    if (isAtBottom && currentSongIndex < currentSetlist.songs.length - 1) {
        currentSongIndex++;
        renderSongInPerformance(currentSongIndex);
        return;
    }

    container.scrollBy({
        top: window.innerHeight * 0.8,
        behavior: 'smooth'
    });
}

function goPrevious() {
    const container = document.getElementById('pdf-container');

    const isAtTop = container.scrollTop <= 10;

    if (isAtTop && currentSongIndex > 0) {
        currentSongIndex--;
        renderSongInPerformance(currentSongIndex);
        return;
    }

    container.scrollBy({
        top: -window.innerHeight * 0.8,
        behavior: 'smooth'
    });
}

/* =========================
   CONTROLS
========================= */

function applyZoom() {
    const canvases = document.querySelectorAll('#pdf-container canvas');

    canvases.forEach((canvas) => {
        canvas.style.width = `${currentPdfZoom}%`;
    });
}

function toggleInvertPdf() {
    const container = document.getElementById('pdf-container');
    const button = document.getElementById('btn-invert-pdf');

    container.classList.toggle('dark-pdf');

    button.innerText = container.classList.contains('dark-pdf')
        ? '☀️ Normal'
        : '🌙 Invert';
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((error) => {
            console.error('Fullscreen error:', error);
        });
    } else {
        document.exitFullscreen();
    }
}

/* =========================
   WAKE LOCK
========================= */

async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (error) {
        console.warn('Wake lock failed:', error);
    }
}

function releaseWakeLock() {
    if (!wakeLock) return;

    wakeLock.release()
        .then(() => {
            wakeLock = null;
        })
        .catch((error) => {
            console.warn('Wake lock release failed:', error);
        });
}

/* =========================
   HELPER
========================= */

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}