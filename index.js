let dataStore = [];
let currentType = 'bar';
let vView = null;
let scene, camera, renderer, controls;
let planets = []; 
let targetIndex = 0;
let lastFilteredData = [];
let targetCameraX = 0;
let mouse = new THREE.Vector2(-1, -1);
let raycaster = new THREE.Raycaster();

// --- ACCORDÉONS ANIMÉS (Stables) ---
class DetailsAnimator {
    constructor(el) {
        this.el = el;
        this.summary = el.querySelector('summary');
        this.isClosing = false;
        this.summary.addEventListener('click', (e) => this.onClick(e));
    }
    onClick(e) {
        e.preventDefault(); 
        if (this.isClosing || !this.el.open) { this.el.open = true; } 
        else {
            this.isClosing = true; this.el.classList.add('collapsing');
            setTimeout(() => { this.el.open = false; this.el.classList.remove('collapsing'); this.isClosing = false; }, 350);
        }
    }
}
document.querySelectorAll('details').forEach(el => new DetailsAnimator(el));

// --- NAVIGATION VOYAGER 3D (Intact) ---
function nextItem() { if(targetIndex < planets.length - 1) { targetIndex++; targetCameraX = planets[targetIndex].x; } }
function prevItem() { if(targetIndex > 0) { targetIndex--; targetCameraX = planets[targetIndex].x; } }

// --- ENGINE REFRESH & LOAD ---

// RÉPARATION : Ajout de l'écouteur pour le bouton d'upload CSV
document.getElementById('f-upload').addEventListener('change', e => {
    const file = e.target.files[0];
    if(!file) return;
    Papa.parse(file, {
        header: true, 
        dynamicTyping: true, 
        skipEmptyLines: true, 
        complete: r => init(r.data, file.name)
    });
});

function loadLocalCSV(f) { Papa.parse(`exemples_csv/${f}`, { download: true, header: true, dynamicTyping: true, complete: r => init(r.data, f) }); }

function init(data, name = null) {
    dataStore = data.map(d => {
        let r = {...d}; for(let k in r) if(!isNaN(r[k]) && r[k] !== "" && r[k] !== null) r[k] = Number(r[k]); return r;
    });
    const h = Object.keys(dataStore[0]);
    const sx = document.getElementById('ax-x'), sy = document.getElementById('ax-y');
    sx.innerHTML = ""; sy.innerHTML = "";
    h.forEach(k => { sx.add(new Option(k,k)); sy.add(new Option(k,k)); });
    const presets = { 'FRvideos.csv': {x:'views', y:'title'}, 'vgsales.csv': {x:'Global_Sales', y:'Name'} };
    const mapping = presets[name] || {x:h.find(k => typeof dataStore[0][k] === 'number') || h[1], y:h[0]};
    sx.value = mapping.x; sy.value = mapping.y;
    refresh();
}

function refresh() {
    if(!dataStore.length) return;
    const xF = document.getElementById('ax-x').value, yF = document.getElementById('ax-y').value;
    const limit = parseInt(document.getElementById('l-num').value);
    const sortMode = document.getElementById('sort-type').value;

    let filtered = dataStore.filter(d => JSON.stringify(d).toLowerCase().includes(document.getElementById('f-search').value.toLowerCase()));
    
    // Tri effectif des données
    filtered.sort((a, b) => {
        if(sortMode === 'desc') return (b[xF]||0) - (a[xF]||0);
        if(sortMode === 'asc') return (a[xF]||0) - (b[xF]||0);
        return String(a[yF]).localeCompare(String(b[yF]));
    });
    
    lastFilteredData = filtered.slice(0, limit);
    document.getElementById('st-count').innerText = lastFilteredData.length;
    document.getElementById('st-max').innerText = lastFilteredData.length ? Math.max(...lastFilteredData.map(d => d[xF]||0)).toLocaleString() : 0;

    const vBox = document.getElementById('vis-box'), vDiv = document.getElementById('vis'), tDiv = document.getElementById('three-canvas'), extra = document.getElementById('extra-output');
    vBox.style.display = "block"; vDiv.style.display = "block"; tDiv.style.display = "none"; extra.innerHTML = "";
    const oldNav = document.querySelector('.voyager-nav'); if(oldNav) oldNav.remove();

    if(currentType === '3d') {
        vDiv.style.display = "none"; tDiv.style.display = "block";
        targetIndex = 0; targetCameraX = 0;
        inject3DNav(); render3DVoyager(lastFilteredData, xF, yF);
    } else if(currentType === 'table') {
        vBox.style.display = "none";
        // RÉPARATION : Structure de tableau HTML standard pour le CSS
        let html = `<table><thead><tr>${Object.keys(lastFilteredData[0]).map(k=>`<th>${k}</th>`).join('')}</tr></thead>`;
        html += `<tbody>${lastFilteredData.map(r=>`<tr>${Object.values(r).map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
        extra.innerHTML = html;
    } else if(currentType === 'gallery') {
        vBox.style.display = "none";
        const imgK = Object.keys(lastFilteredData[0]).find(k => k.toLowerCase().includes('image') || k.toLowerCase().includes('pic') || k.toLowerCase().includes('thumb'));
        extra.innerHTML = `<div class="gallery-grid">${lastFilteredData.map(d=>`<div class="gallery-card"><img src="${d[imgK]||'https://via.placeholder.com/150'}"><h4>${d[yF]}</h4><p>${d[xF]}</p></div>`).join('')}</div>`;
    } else {
        renderVega(lastFilteredData, xF, yF);
    }
}

// --- RENDU VEGA (RÉPARÉ : Tri & Cloud) ---
function renderVega(data, x, y) {
    let spec = {
        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
        "data": { "values": data }, "width": "container", "height": "container",
        "config": { "autosize": {"type": "fit", "contains": "padding"}, "view": {"stroke": "transparent"} }
    };

    if(currentType === 'cloud') {
        // RÉPARATION : Randomisation et opacité pour le nuage de mots
        spec.transform = [
            {"calculate": "random()", "as": "randomX"},
            {"calculate": "random()", "as": "randomY"}
        ];
        spec.mark = {"type": "text", "baseline": "middle"};
        spec.encoding = {
            "text": {"field": y},
            "x": {"field": "randomX", "type": "quantitative", "axis": null},
            "y": {"field": "randomY", "type": "quantitative", "axis": null},
            "size": {"field": x, "type": "quantitative", "scale": {"range": [15, 70]}},
            "color": {"field": x, "type": "quantitative", "scale": {"scheme": "viridis"}},
            "opacity": {"field": x, "type": "quantitative", "scale": {"range": [0.4, 1]}}
        };
    } else {
        // RÉPARATION : Ajout de "sort": null pour Points, Lines et Barres
        spec.mark = { "type": currentType === 'pie' ? 'arc' : (currentType === 'scatter' ? 'point' : (currentType === 'line' ? 'line' : 'bar')), "tooltip": true };
        spec.encoding = {
            [currentType === 'pie' ? 'theta' : 'x']: {"field": x, "type": "quantitative", "aggregate": "max"},
            [currentType === 'pie' ? 'color' : 'y']: {"field": y, "type": "nominal", "sort": null} // RÉPARÉ : sort null respecte le tri JS
        };
        if(currentType === 'scatter') {
            spec.mark.filled = true;
            spec.encoding.size = {"field": x, "type": "quantitative"};
        }
        if(currentType === 'bar' || currentType === 'line') spec.encoding.color = {"value": document.getElementById('c-pick').value};
    }
    vegaEmbed('#vis', spec, {actions:false}).then(res => vView = res.view);
}

// --- MOTEUR VOYAGER 3D (Strictement ton moteur) ---
function render3DVoyager(data, xField, yField) {
    const container = document.getElementById('three-canvas'); container.innerHTML = "";
    const tooltip = document.getElementById('tooltip-3d');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(document.body.classList.contains('dark') ? 0x0a0a0a : 0xf5f6fa);
    camera = new THREE.PerspectiveCamera(60, container.clientWidth/container.clientHeight, 0.1, 2000);
    camera.position.set(0, 3, 25);
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; planets = [];

    const startColor = new THREE.Color("rgb(52, 152, 219)");
    const startHSL = {}; startColor.getHSL(startHSL);
    const maxV = Math.max(...data.map(d => Number(d[xField]) || 0)) || 1;

    data.forEach((d, i) => {
        const radius = ((Number(d[xField]) || 0) / maxV) * 8 + 2;
        const planetColor = new THREE.Color();
        planetColor.setHSL((startHSL.h + (i / data.length)) % 1, 0.7, 0.5); 
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 64), new THREE.MeshPhongMaterial({ color: planetColor, shininess: 80, emissive: planetColor.clone().multiplyScalar(0.2) }));
        mesh.position.set(i * 45, 0, 0);
        mesh.userData = { name: d[yField], value: (Number(d[xField]) || 0).toLocaleString(), index: `${i+1}/${data.length}`, baseColor: planetColor.getHex() };
        scene.add(mesh);
        planets.push({ mesh, x: i * 45, offset: Math.random() * 100 });
    });

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const light = new THREE.DirectionalLight(0xffffff, 1); light.position.set(10, 10, 20); scene.add(light);

    container.onmousemove = (e) => {
        const rect = container.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;
    };

    function checkIntersections() {
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(planets.map(p => p.mesh));
        if (intersects.length > 0) {
            const p = intersects[0].object;
            tooltip.style.display = "block";
            const cRect = container.getBoundingClientRect();
            tooltip.style.left = ((mouse.x + 1) / 2 * container.clientWidth + cRect.left + 20) + 'px';
            tooltip.style.top = ((-mouse.y + 1) / 2 * container.clientHeight + cRect.top + 20) + 'px';
            tooltip.innerHTML = `<strong>${p.userData.name}</strong><br>Valeur : ${p.userData.value}<br><small>${p.userData.index}</small>`;
            p.material.emissive.setHex(0x666666);
        } else { tooltip.style.display = "none"; planets.forEach(pl => pl.mesh.material.emissive.setHex(pl.mesh.userData.baseColor * 0.2)); }
    }

    window.onkeydown = (e) => { if(e.key === "ArrowRight") nextItem(); if(e.key === "ArrowLeft") prevItem(); };
    function animate() {
        if(currentType !== '3d') return;
        requestAnimationFrame(animate);
        const time = Date.now() * 0.001;
        controls.target.x += (targetCameraX - controls.target.x) * 0.08;
        camera.position.x += (targetCameraX - camera.position.x) * 0.08;
        planets.forEach(p => { p.mesh.rotation.y += 0.006; p.mesh.position.y = Math.sin(time + p.offset) * 1.2; });
        checkIntersections(); controls.update(); renderer.render(scene, camera);
    }
    animate();
}

function inject3DNav() {
    const vBox = document.getElementById('vis-box');
    const nav = document.createElement('div'); nav.className = 'voyager-nav';
    nav.innerHTML = `<button class="v-nav-btn" onclick="prevItem()">❮</button><button class="v-nav-btn" onclick="nextItem()">❯</button>`;
    vBox.appendChild(nav);
}

function toggleHelp() { document.getElementById('helpModal').style.display = (document.getElementById('helpModal').style.display === 'block') ? 'none' : 'block'; }
function toggleIn(v) { document.getElementById('zone-f').style.display = v === 'sparql' ? 'none' : 'block'; document.getElementById('zone-s').style.display = v === 'sparql' ? 'block' : 'none'; }
document.querySelectorAll('.c-btn').forEach(b => b.onclick = () => { document.querySelectorAll('.c-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); currentType = b.dataset.type; refresh(); });

async function runSparql() {
    const q = document.getElementById('q-sparql').value;
    const resp = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q));
    const res = await resp.json();
    const clean = res.results.bindings.map(b => {
        let o = {}; for(let k in b) { let v = b[k].value; o[k] = isNaN(v) || v==="" ? v : Number(v); } return o;
    });
    init(clean, "sparql_query");
}

async function exportPNG() { let url = currentType === '3d' ? renderer.domElement.toDataURL("image/png") : await vView.toImageURL('png'); const l = document.createElement('a'); l.href = url; l.download = 'viz.png'; l.click(); }
async function exportSVG() { if(currentType === '3d') return; const svg = await vView.toSVG(); const blob = new Blob([svg], {type: 'image/svg+xml'}); const url = URL.createObjectURL(blob); const l = document.createElement('a'); l.href = url; l.download = 'viz.svg'; l.click(); }
function exportCSVFiltered() { const csv = Papa.unparse(lastFilteredData); const blob = new Blob([csv], {type: 'text/csv'}); const url = URL.createObjectURL(blob); let l = document.createElement('a'); l.href = url; l.download = 'data.csv'; l.click(); }
