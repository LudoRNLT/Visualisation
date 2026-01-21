let dataStore = [];
let currentType = 'bar';
let vView = null;
let scene, camera, renderer, controls;
let lastFilteredData = [];

// --- UI & MODAL ---
function toggleHelp() {
    const modal = document.getElementById('helpModal');
    modal.style.display = (modal.style.display === 'block') ? 'none' : 'block';
}

function toggleIn(v) {
    document.getElementById('zone-f').style.display = v === 'sparql' ? 'none' : 'block';
    document.getElementById('zone-s').style.display = v === 'sparql' ? 'block' : 'none';
}

// --- CHARGEMENT ---
function loadLocalCSV(filename) {
    const path = `exemples_csv/${filename}`;
    Papa.parse(path, {
        download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
        complete: r => init(r.data, filename),
        error: e => alert(`Fichier introuvable dans exemples_csv/`)
    });
}

document.getElementById('f-upload').addEventListener('change', e => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
        Papa.parse(evt.target.result, {header:true, dynamicTyping:true, skipEmptyLines:true, complete: r => init(r.data, file.name)});
    };
    reader.readAsText(file);
});

async function runSparql() {
    const q = document.getElementById('q-sparql').value;
    const resp = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q));
    const res = await resp.json();
    const clean = res.results.bindings.map(b => {
        let o = {}; for(let k in b) { let v = b[k].value; o[k] = isNaN(v) || v==="" ? v : Number(v); } return o;
    });
    init(clean, "sparql_query");
}

function getBestMapping(headers, filename) {
    const presets = {
        'FRvideos.csv': { x: 'views', y: 'title' },
        'netflix_titles.csv': { x: 'release_year', y: 'title' },
        'StudentsPerformance.csv': { x: 'math score', y: 'parental level of education' },
        'vgsales.csv': { x: 'Global_Sales', y: 'Name' }
    };
    if (presets[filename]) return presets[filename];
    const xKeywords = ['sales', 'views', 'count', 'score', 'price', 'valeur', 'total', 'rating'];
    const bestX = headers.find(h => xKeywords.some(k => h.toLowerCase().includes(k))) || 
                  headers.find(h => typeof dataStore[0][h] === 'number') || headers[1];
    const yKeywords = ['title', 'name', 'nom', 'label', 'category', 'genre', 'type'];
    const bestY = headers.find(h => yKeywords.some(k => h.toLowerCase().includes(k))) || headers[0];
    return { x: bestX, y: bestY };
}

function init(data, originName = null) {
    if(!data || data.length === 0) return;
    dataStore = data.map(d => {
        let row = {...d};
        for(let k in row) if(!isNaN(row[k]) && row[k] !== "" && row[k] !== null) row[k] = Number(row[k]);
        return row;
    });
    const h = Object.keys(dataStore[0]);
    const sx = document.getElementById('ax-x'), sy = document.getElementById('ax-y');
    sx.innerHTML = ""; sy.innerHTML = "";
    h.forEach(k => { sx.add(new Option(k, k)); sy.add(new Option(k, k)); });
    const mapping = getBestMapping(h, originName);
    sx.value = mapping.x;
    sy.value = mapping.y;
    refresh();
}

document.querySelectorAll('.c-btn').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.c-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); currentType = b.dataset.type; refresh();
}));

function truncate(str, n) {
    let s = String(str);
    return (s.length > n) ? s.substr(0, n-1) + '...' : s;
}

function refresh() {
    if(!dataStore.length) return;
    const xF = document.getElementById('ax-x').value, yF = document.getElementById('ax-y').value;
    const search = document.getElementById('f-search').value.toLowerCase();
    const limit = document.getElementById('l-num').value;
    const sortMode = document.getElementById('sort-type').value;
    const scheme = document.getElementById('c-scheme').value;
    const color = document.getElementById('c-pick').value;

    let filtered = dataStore.filter(d => JSON.stringify(d).toLowerCase().includes(search));
    filtered.sort((a, b) => {
        if(sortMode === 'desc') return (Number(b[xF])||0) - (Number(a[xF])||0);
        if(sortMode === 'asc') return (Number(a[xF])||0) - (Number(b[xF])||0);
        if(sortMode === 'name-asc') return String(a[yF]).localeCompare(String(b[yF]));
        return 0;
    });
    
    lastFilteredData = filtered.slice(0, limit).map(d => ({
        ...d,
        displayLabel: truncate(d[yF], 20) 
    }));

    document.getElementById('st-count').innerText = lastFilteredData.length;
    document.getElementById('st-max').innerText = lastFilteredData.length ? Math.max(...lastFilteredData.map(d => Number(d[xF])||0)) : 0;

    const visBox = document.getElementById('vis-box'), visDiv = document.getElementById('vis'), 
          threeDiv = document.getElementById('three-canvas'), extra = document.getElementById('extra-output');
    
    extra.innerHTML = ""; visBox.style.display = "block"; visDiv.style.display = "block"; threeDiv.style.display = "none";

    if(currentType === 'table') {
        visBox.style.display = "none";
        extra.innerHTML = `<table><thead><tr>${Object.keys(dataStore[0]).map(k=>`<th>${k}</th>`).join('')}</tr></thead><tbody>${lastFilteredData.map(r=>`<tr>${Object.values(r).map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    } else if(currentType === 'gallery') {
        visBox.style.display = "none";
        const imgK = Object.keys(dataStore[0]).find(k => k.toLowerCase().includes('image') || k.toLowerCase().includes('pic'));
        extra.innerHTML = `<div class="gallery">${lastFilteredData.filter(d=>d[imgK]).map(d=>`<div class="card"><img src="${d[imgK]}"><p style="font-size:9px;">${d['displayLabel']}</p></div>`).join('')}</div>`;
    } else if(currentType === '3d') {
        visDiv.style.display = "none"; threeDiv.style.display = "block";
        render3D(lastFilteredData, xF, 'displayLabel', color);
    } else {
        renderVega(lastFilteredData, xF, 'displayLabel', color, scheme, sortMode);
    }
}

function renderVega(data, xField, yField, color, scheme, sortMode) {
    let sortAxis = (sortMode === 'desc') ? "-x" : (sortMode === 'asc' ? "x" : "y");
    let spec = {
        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
        "data": { "values": data }, "width": "container", "height": 450,
        "params": [{ "name": "highlight", "select": {"type": "point", "on": "mouseover"} }],
        "transform": [{"calculate": `datum['${xField}'] * 1`, "as": "valeur_num"}],
        "config": { "view": {"stroke": "transparent"}, "transition": { "duration": 500 } }
    };

    if(currentType === 'bar') {
        spec.mark = { "type": "bar", "tooltip": true, "cornerRadiusEnd": 5 };
        if(scheme === 'single') spec.mark.color = color;
        spec.encoding = { 
            "x": {"field": "valeur_num", "type": "quantitative"}, 
            "y": {"field": yField, "type": "nominal", "sort": sortAxis},
            "color": scheme !== 'single' ? {"field": "valeur_num", "type": "quantitative", "scale": {"scheme": scheme}} : null 
        };
    } else if(currentType === 'pie') {
        spec.mark = { "type": "arc", "tooltip": true, "outerRadius": 180 };
        spec.encoding = { 
            "theta": {"field": "valeur_num", "type": "quantitative"}, 
            "color": {"field": yField, "type": "nominal", "scale": {"scheme": scheme==='single'?'tableau10':scheme}} 
        };
    } else if(currentType === 'cloud') {
        spec.transform.push(
            {"calculate": "0.15 + random() * 0.7", "as": "rx"},
            {"calculate": "0.15 + random() * 0.7", "as": "ry"},
            {"calculate": "random() > 0.7 ? 90 : 0", "as": "angle"}
        );
        spec.mark = { "type": "text", "baseline": "middle", "tooltip": true };
        spec.encoding = { 
            "x": {"field": "rx", "type": "quantitative", "axis": null, "scale": {"domain": [0, 1]}},
            "y": {"field": "ry", "type": "quantitative", "axis": null, "scale": {"domain": [0, 1]}},
            "angle": {"field": "angle", "type": "quantitative"},
            "text": {"field": yField}, 
            "size": {"field": "valeur_num", "type": "quantitative", "scale": {"range": [10, 32]}}, 
            "color": {"field": "valeur_num", "scale": {"scheme": scheme==='single'?'viridis':scheme}},
            // --- OPACITÉ LIÉE À LA VALEUR (Uniquement ici) ---
            "opacity": {
                "field": "valeur_num", 
                "type": "quantitative", 
                "scale": {"range": [0.2, 1.0]} // Les petits sont très transparents, les gros sont opaques
            }
        };
    } else if(currentType === 'scatter') {
        spec.mark = { "type": "point", "filled": true, "size": 150, "tooltip": true };
        spec.encoding = { 
            "x": {"field": "valeur_num", "type": "quantitative"}, 
            "y": {"field": yField, "type": "nominal", "sort": sortAxis}, 
            "color": {"field": "valeur_num", "scale": {"scheme": scheme==='single'?'viridis':scheme}} 
        };
    } else {
        spec.mark = { "type": "line", "point": true, "tooltip": true, "color": color };
        spec.encoding = { "x": {"field": yField, "type": "nominal", "sort": sortAxis}, "y": {"field": "valeur_num", "type": "quantitative"} };
    }
    vegaEmbed('#vis', spec, {actions:false, renderer: 'svg'}).then(r => vView = r.view);
}

function render3D(data, xField, yField, color) {
    const container = document.getElementById('three-canvas'); container.innerHTML = "";
    scene = new THREE.Scene(); scene.background = new THREE.Color(document.body.classList.contains('dark') ? 0x121212 : 0xf0f2f5);
    camera = new THREE.PerspectiveCamera(75, container.clientWidth/container.clientHeight, 0.1, 1000); camera.position.set(0, 15, 25);
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight); container.appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    const light = new THREE.DirectionalLight(0xffffff, 1); light.position.set(10, 20, 10); scene.add(light);
    scene.add(new THREE.AmbientLight(0x404040, 2));
    const maxV = Math.max(...data.map(d => Number(d[xField]) || 0)) || 1;
    data.forEach((d, i) => {
        const h = ((Number(d[xField]) || 0) / maxV) * 15 + 0.1;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, h, 0.8), new THREE.MeshPhongMaterial({ color: color }));
        bar.position.set(i * 1.5 - (data.length * 0.75), h/2, 0); scene.add(bar);
    });
    function animate() { if(currentType === '3d') { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); } }
    animate();
}

async function exportPNG() {
    let url = currentType === '3d' ? renderer.domElement.toDataURL("image/png") : await vView.toImageURL('png');
    const l = document.createElement('a'); l.href = url; l.download = 'viz.png'; l.click();
}

async function exportSVG() {
    if(currentType === '3d') return;
    const svg = await vView.toSVG();
    const blob = new Blob([svg], {type: 'image/svg+xml'});
    const url = URL.createObjectURL(blob);
    const l = document.createElement('a'); l.href = url; l.download = 'viz.svg'; l.click();
}

function exportCSVFiltered() {
    const csv = Papa.unparse(lastFilteredData);
    const blob = new Blob([csv], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const l = document.createElement('a'); l.href = url; l.download = 'data_filtree.csv'; l.click();
}