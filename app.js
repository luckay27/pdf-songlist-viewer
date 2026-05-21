// --- STATE & DATABASE MANAGEMENT ---
let currentView = 'home-view';
let db;
let currentSetlist = { id: null, name: '', songs: [] }; // State setlist yang lagi aktif

const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

const views = {
    home: document.getElementById('home-view'),
    editor: document.getElementById('editor-view'),
    performance: document.getElementById('performance-view')
};

// --- 1. INISIALISASI INDEXEDDB ---
const request = indexedDB.open("LuckaySetlistDB", 1);

request.onupgradeneeded = (e) => {
    db = e.target.result;
    // Bikin 2 "Tabel": satu buat nyimpen nama setlist, satu buat nyimpen file PDF-nya
    if (!db.objectStoreNames.contains('setlists')) db.createObjectStore('setlists', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('pdfs')) db.createObjectStore('pdfs', { keyPath: 'id' });
};

request.onsuccess = (e) => {
    db = e.target.result;
    console.log("Database Lokal Siap!");
    renderHomeSetlists(); // Tampilkan setlist yang udah disimpen saat aplikasi dibuka
};

// --- VIEW CONTROLLER LOGIC ---
function switchView(viewName) {
    Object.values(views).forEach(view => view.classList.remove('active'));
    views[viewName].classList.add('active');
    currentView = viewName;
}

// --- 2. LOGIKA PENYIMPANAN DI HOME ---
function renderHomeSetlists() {
    const listContainer = document.getElementById('saved-setlists');
    listContainer.innerHTML = ''; // Bersihin list lama

    const tx = db.transaction('setlists', 'readonly');
    const store = tx.objectStore('setlists');
    const getAll = store.getAll();

    getAll.onsuccess = () => {
        const setlists = getAll.result;
        if (setlists.length === 0) {
            listContainer.innerHTML = '<li class="empty-state">Belum ada setlist.</li>';
            return;
        }

        // Looping data dari database untuk ditampilin di layar depan
        setlists.forEach(set => {
            const li = document.createElement('li');
            li.innerText = `📁 ${set.name} (${set.songs.length} Lagu)`;
            li.style.cursor = 'pointer';
            li.style.padding = '10px 0';
            li.style.borderBottom = '1px solid #333';
            
            // Kalau setlist di-klik, buka halaman editornya
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

// --- 3. EVENT LISTENERS & SETLIST EDITOR ---
document.getElementById('btn-new-setlist').addEventListener('click', () => {
    let setName = prompt("Masukkan Nama Setlist (Misal: Gigs TVRI):");
    if (setName) {
        // Bikin ID unik pakai waktu saat ini (Timestamp)
        currentSetlist = { id: Date.now().toString(), name: setName, songs: [] };
        
        // Simpan ke Database
        const tx = db.transaction('setlists', 'readwrite');
        tx.objectStore('setlists').put(currentSetlist);

        document.getElementById('current-setlist-name').innerText = setName;
        renderEditorSongList();
        renderHomeSetlists(); // Update layar depan
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
    const ul = document.getElementById('song-list');
    ul.innerHTML = '';
    currentSetlist.songs.forEach((song, index) => {
        const li = document.createElement('li');
        li.innerText = `${index + 1}. ${song.name}`;
        ul.appendChild(li);
    });
}

// --- 4. HANDLE PDF IMPORT (SIMPAN KE DB LOKAL) ---
document.getElementById('file-importer').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file && file.type === "application/pdf") {
        
        const reader = new FileReader();
        reader.onload = function(event) {
            const fileBuffer = event.target.result;
            const pdfId = 'pdf_' + Date.now().toString(); // ID unik buat file ini

            // Simpan File mentah ke tabel 'pdfs'
            const txPdf = db.transaction('pdfs', 'readwrite');
            txPdf.objectStore('pdfs').put({ id: pdfId, buffer: fileBuffer });

            // Tambahkan referensi lagunya ke Setlist yang lagi aktif
            currentSetlist.songs.push({ id: pdfId, name: file.name });
            
            // Update tabel 'setlists'
            const txSet = db.transaction('setlists', 'readwrite');
            txSet.objectStore('setlists').put(currentSetlist);

            renderEditorSongList(); // Refresh tampilan list lagu
        };
        reader.readAsArrayBuffer(file);
    }
});

// --- 5. MASUK MODE PANGGUNG & SIDEBAR LOGIC ---
let currentSongIndex = 0;

document.getElementById('btn-play').addEventListener('click', () => {
    if (currentSetlist.songs.length === 0) {
        alert("Setlist masih kosong! Import lagu dulu.");
        return;
    }
    switchView('performance');
    currentSongIndex = 0; 
    renderSongInPerformance(currentSongIndex);
});

document.getElementById('btn-exit-play').addEventListener('click', () => {
    document.getElementById('sidebar-setlist').classList.remove('open'); // Tutup sidebar kalo lg buka
    switchView('editor');
});

// Tombol Buka/Tutup Sidebar Menu
document.getElementById('btn-toggle-list').addEventListener('click', () => {
    document.getElementById('sidebar-setlist').classList.toggle('open');
});

// Fungsi me-render list lagu di Sidebar
function renderSidebarMenu() {
    const ul = document.getElementById('sidebar-song-list');
    ul.innerHTML = '';
    
    currentSetlist.songs.forEach((song, index) => {
        const li = document.createElement('li');
        // Buang tulisan ".pdf" biar rapi dilihat di menu
        const cleanName = song.name.replace('.pdf', ''); 
        li.innerText = `${index + 1}. ${cleanName}`;
        
        // Kasih warna hijau buat lagu yang lagi dimainin
        if (index === currentSongIndex) li.classList.add('active-song');
        
        // Kalau lagu di-tap, langsung lompat ke lagu itu!
        li.addEventListener('click', () => {
            currentSongIndex = index;
            renderSongInPerformance(currentSongIndex);
            document.getElementById('sidebar-setlist').classList.remove('open'); // Otomatis tutup laci
        });
        
        ul.appendChild(li);
    });
}

function renderSongInPerformance(index) {
    renderSidebarMenu(); // Selalu update warna hijau di sidebar tiap pindah lagu
    
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

// --- 6. NAVIGATION (SMART TAP ZONES) ---
document.getElementById('tap-zone-right').addEventListener('click', () => {
    const container = document.getElementById('pdf-container');
    
    // Cek apakah scroll sudah mentok di bawah (toleransi 50px)
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 50) {
        // Kalau sudah mentok bawah, cek apakah ada lagu selanjutnya
        if (currentSongIndex < currentSetlist.songs.length - 1) {
            currentSongIndex++;
            renderSongInPerformance(currentSongIndex); // Pindah lagu!
        } else {
            console.log("Ini lagu terakhir di setlist!");
        }
    } else {
        // Kalau belum mentok, scroll ke bawah
        container.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
    }
});

document.getElementById('tap-zone-left').addEventListener('click', () => {
    const container = document.getElementById('pdf-container');
    
    // Cek apakah scroll ada di posisi paling atas
    if (container.scrollTop <= 10) {
        // Kalau sudah mentok atas, cek apakah ada lagu sebelumnya
        if (currentSongIndex > 0) {
            currentSongIndex--;
            renderSongInPerformance(currentSongIndex); // Mundur lagu!
        } else {
            console.log("Ini lagu pertama!");
        }
    } else {
        // Kalau belum mentok, scroll ke atas
        container.scrollBy({ top: -(window.innerHeight * 0.8), behavior: 'smooth' });
    }
});

document.getElementById('tap-zone-left').addEventListener('click', () => {
    document.getElementById('pdf-container').scrollBy({ top: -(window.innerHeight * 0.8), behavior: 'smooth' });
});