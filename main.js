import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import regionTimeseries from './timeseries.json';
import roiLabels from './brain_regions.json'



// =======================
// Scene setup
// =======================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeeeeee);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minPolarAngle = 0; 
controls.maxPolarAngle = Math.PI;
controls.rotateSpeed = 1.0; 
controls.panSpeed = 0.8;
controls.zoomSpeed = 1.2;

// Brain center
controls.target.set(0, 0, 0);

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5,5,5);
scene.add(dirLight);
const rim = new THREE.DirectionalLight(0xffffff, 0.3);
rim.position.set(-5,-5,-5);
scene.add(rim);

// =======================
// Brain + data containers
// =======================
const regionMeshes = {};
let currentTime = 0;
let threshold = 0; // 0 = show all
let playing = false;

const functionalGroups = {
    "Motor": ["Precentral", "Motor", "SMA"],
    "Visual": ["Occipital", "Cuneus", "Lingual", "V1", "V2"],
    "Auditory": ["Superior Temporal", "TE1", "Heschl"],
    "Frontal": ["Frontal", "Prefrontal", "Orbital"]
};

// =======================
// Helpers
// =======================
function normalize(value, min, max){
    if(max===min) return 0.5;
    return Math.max(0, Math.min(1, (value-min)/(max-min)));
}

function activationColor(v){
    const color = new THREE.Color();
    if(v < 0.5){
        color.lerpColors(new THREE.Color(0x0000ff), new THREE.Color(0xaaaaaa), v*2);
    } else {
        color.lerpColors(new THREE.Color(0xaaaaaa), new THREE.Color(0xff0000), (v-0.5)*2);
    }
    return color;
}
function getGlobalSignal() {
    const regionIds = Object.keys(regionTimeseries);
    const T = regionTimeseries[regionIds[0]].length;
    const globalSignal = [];

    for (let t = 0; t < T; t++) {
        let sum = 0;
        regionIds.forEach(id => {
            sum += regionTimeseries[id][t];
        });
        globalSignal.push({ time: t, value: sum / regionIds.length });
    }
    return globalSignal;
}
function calculateCorrelation(seriesA, seriesB) {
    if (seriesA.length !== seriesB.length) return 0;
    
    const n = seriesA.length;
    const meanA = seriesA.reduce((a, b) => a + b) / n;
    const meanB = seriesB.reduce((a, b) => a + b) / n;

    let num = 0;
    let denA = 0;
    let denB = 0;

    for (let i = 0; i < n; i++) {
        const diffA = seriesA[i] - meanA;
        const diffB = seriesB[i] - meanB;
        num += (diffA * diffB);
        denA += (diffA * diffA);
        denB += (diffB * diffB);
    }

    const den = Math.sqrt(denA * denB);
    return den === 0 ? 0 : num / den;
}
function getInterpolatedValue(regionId, preciseTime) {
    const ts = regionTimeseries[regionId];
    if (!ts) return 0;

    const t1 = Math.floor(preciseTime);
    const t2 = Math.min(t1 + 1, ts.length - 1);
    const fraction = preciseTime - t1;

    const v1 = ts[t1];
    const v2 = ts[t2];

    // Linear interpolation formula: v = v1 + (v2 - v1) * fraction
    return v1 + (v2 - v1) * fraction;
}
// =======================
// Load Brain
// =======================
function loadBrain(){
    const loader = new GLTFLoader();
    const meshPath = new URL('all_regions.glb', import.meta.url).href;

    loader.load(meshPath, (gltf)=>{
        const brain = gltf.scene;
        let regionIndex = 1;

        brain.traverse((child)=>{
            if(child.isMesh){
                const id = String(regionIndex);
                child.userData.regionId = id;
                regionMeshes[id] = child;

                child.material = new THREE.MeshStandardMaterial({
                    color: new THREE.Color().setHSL(regionIndex/246,0.6,0.5),
                    roughness:0.5,
                    metalness:0.1,
                    side: THREE.DoubleSide
                });
                child.userData.fmriColor = child.material.color.clone();
                child.castShadow = true;
                child.receiveShadow = true;

                regionIndex++;
            }
        });

        scene.add(brain);
        setupTimeSlider();
        setupThresholdSlider();
        updateBrainAtTime(0);
        console.log('Brain loaded:', Object.keys(regionMeshes).length,'regions');
    }, undefined, (err)=>console.error('GLB load error:', err));
}

function renderScentedSlider() {
    const data = getGlobalSignal();
    
    const spec = {
        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
        "width": "container", 
        "height": 40,
        "padding": 0,
        "data": { "values": data },
        "config": {
            "view": { "stroke": null },
            "background": "transparent"
        },
        "mark": {
            "type": "area",
            "color": "#00d2ff",
            "opacity": 0.3,
            "interpolate": "monotone" // Creates a smooth "biological" look
        },
        "encoding": {
            "x": { "field": "time", "type": "quantitative", "axis": null },
            "y": { "field": "value", "type": "quantitative", "axis": null, "scale": { "zero": false } }
        }
    };

    vegaEmbed('#slider-scent', spec, { actions: false });
}

// =======================
// Update brain colors
// =======================
function updateBrainAtTime(preciseTime) {
    // 1. Pre-calculate min/max for normalization
    const values = Object.values(regionTimeseries).map(ts => ts[Math.floor(preciseTime)]);
    const min = Math.min(...values);
    const max = Math.max(...values);

    for (const regionId in regionMeshes) {
        const mesh = regionMeshes[regionId];
        const geometry = mesh.geometry;
        
        // Ensure geometry has 'color' attribute
        if (!geometry.attributes.color) {
            const count = geometry.attributes.position.count;
            geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        }

        const colors = geometry.attributes.color;
        const v = getInterpolatedValue(regionId, preciseTime);
        const norm = normalize(v, min, max);
        //Active threshold
         let targetColor;
        if (norm < threshold) {
            targetColor = new THREE.Color(0x222222); 
        } else {
            targetColor = activationColor(norm);
        }

        // Fill vertex colors
        for (let i = 0; i < colors.count; i++) {
            colors.setXYZ(i, targetColor.r, targetColor.g, targetColor.b);
        }
        
        colors.needsUpdate = true;
        mesh.material.vertexColors = true; 
        mesh.userData.fmriColor = targetColor.clone();
    }
}

// =======================
// Time slider
// =======================
function setupTimeSlider(){
    const slider = document.getElementById('timeSlider');
    const label = document.getElementById('timeLabel');
    const T = Object.values(regionTimeseries)[0].length;
    slider.max = T-1;

    slider.addEventListener('input', (e)=>{
        currentTime = parseInt(e.target.value);
        label.textContent = currentTime;
        updateBrainAtTime(currentTime);
        updateChart();
    });
}

// =======================
// Threshold slider
// =======================
function setupThresholdSlider(){
    const slider = document.getElementById('thresholdSlider');
    const label = document.getElementById('thresholdLabel');

    slider.addEventListener('input', (e)=>{
        threshold = parseInt(e.target.value)/100;
        label.textContent = e.target.value;
        updateBrainAtTime(currentTime);
    });
}

// =======================
// Hover + click
// =======================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let mousePx = { x: 0, y: 0 };

window.addEventListener('mousemove', (event)=>{
    mouse.x = (event.clientX / window.innerWidth)*2-1;
    mouse.y = -(event.clientY / window.innerHeight)*2+1;
    mousePx.x = event.clientX;
    mousePx.y = event.clientY;
});

// =======================
// Legend
// =======================
function showLegend(){
    const spec = {
        "$schema":"https://vega.github.io/schema/vega-lite/v5.json",
        "width":150,"height":20,
        "data":{"values":[{"z":-3},{"z":0},{"z":3}]},
        "mark":"rect",
        "encoding":{
            "x":{"field":"z","type":"quantitative","scale":{"domain":[-3,3]},"axis":{"values":[-3,0,3]}},
            "color":{"field":"z","type":"quantitative","scale":{"domain":[-3,0,3],"range":["#0000ff","#aaaaaa","#ff0000"]},"legend":null}
        },
        "config":{"view":{"stroke":null},"axis":{"grid":false}}
    };
    vegaEmbed('#legend-chart',spec,{actions:false});
}
showLegend();

// =======================
// Auto-play
// =======================
document.getElementById('playButton').addEventListener('click', ()=>{
    playing = !playing;
});

function autoPlay(){
    if(playing){
        const T = Object.values(regionTimeseries)[0].length;
        currentTime = (currentTime+1)%T;
        document.getElementById('timeSlider').value = currentTime;
        document.getElementById('timeLabel').textContent = currentTime;
        updateBrainAtTime(currentTime);
        updateChart();
    }
    requestAnimationFrame(autoPlay);
}
// =======================
// New state
// =======================
const selectedRegions = new Set();
let isSelectionMode = false;

document.getElementById('selectionMode').addEventListener('change', (e) => {
    isSelectionMode = e.target.checked;
});


document.getElementById('clearSelection').addEventListener('click', () => {
    selectedRegions.clear();
    const infoBox = document.getElementById('region-info1');
    infoBox.innerHTML = "<em>Select a brain region to initialize BOLD tracking...</em>";
    updateChart();
});
// Handle Clicks for Selection and Info Display
window.addEventListener('click', () => {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(Object.values(regionMeshes));

    if (intersects.length > 0) {
        const mesh = intersects[0].object;
        const id = mesh.userData.regionId;
        const ts = regionTimeseries[id];
        const regionFullName = roiLabels[id] || `ROI ${id}`;
        
        // 1. Get the specific BOLD value at current time
        const boldValue = ts ? ts[currentTime] : "N/A";
        
        const infoBox = document.getElementById('region-info1');
        infoBox.innerHTML = `
            <div><strong>Region name:</strong> ${regionFullName}</div>
            <strong>Region ID:</strong> ${id}<br>
            <strong>Time:</strong> ${currentTime}<br>
            <strong>BOLD Value:</strong> ${boldValue !== "N/A" ? boldValue.toFixed(4) : "N/A"}
        `;
    }
});

window.addEventListener('click', () => {
    if (!isSelectionMode) return;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(Object.values(regionMeshes));

    if (intersects.length > 0) {
        const id = intersects[0].object.userData.regionId;
        if (selectedRegions.has(id)) {
            selectedRegions.delete(id);
        } else {
            selectedRegions.add(id);
        }
        updateChart();
    }
});

document.getElementById('snapshotBtn').addEventListener('click', () => {
    renderer.render(scene, camera);
    
    const dataURL = renderer.domElement.toDataURL("image/png");

    const container = document.getElementById('snapshot-sidebar');
    const card = document.createElement('div');
    card.className = 'snapshot-card';
    card.style.marginBottom = "15px";
    let connectivityText = "N/A";
    if (selectedRegions.size === 2) {
        const ids = Array.from(selectedRegions);
        const rValue = calculateCorrelation(regionTimeseries[ids[0]], regionTimeseries[ids[1]]);
        connectivityText = rValue.toFixed(3);
    }
    
    card.innerHTML = `
        <img src="${dataURL}" style="width:100%; border-radius:4px;"/>
        <div style="font-family: sans-serif; font-size: 12px;">
            <strong>Time:</strong> ${currentTime.toFixed(1)} <br>
            <strong>Connectivity:</strong> ${connectivityText}
        </div>
        <button class="remove-snap" style="width:100%; margin-top:5px;">Delete</button>
    `;

    const savedTime = currentTime;
    card.querySelector('img').addEventListener('click', () => {
        currentTime = savedTime;
        document.getElementById('timeSlider').value = savedTime;
        updateBrainAtTime(savedTime);
    });

    card.querySelector('.remove-snap').addEventListener('click', () => card.remove());
    container.prepend(card);
});



document.getElementById('atlas-filter').addEventListener('change', (e) => {
    const selectedGroup = e.target.value;
    
    for (const id in regionMeshes) {
        const mesh = regionMeshes[id];
        const regionName = roiLabels[id] || "";
        
        if (selectedGroup === "all") {
            mesh.visible = true;
        } else {
            const keywords = functionalGroups[selectedGroup];
            const isMatch = keywords.some(k => regionName.includes(k));
            mesh.visible = isMatch;
        }
    }
});

// =======================
// Chart
// =======================
function updateChart(hoverId = null) {
    const data = [];
    const regionsToShow = isSelectionMode ? Array.from(selectedRegions) : (hoverId ? [hoverId] : []);

    regionsToShow.forEach(id => {
        const ts = regionTimeseries[id];
        if (ts) {
            ts.forEach((v, i) => {
                data.push({ t: i, value: v, region: `ROI ${id}` });
            });
        }
    });
    if (selectedRegions.size === 2) {
    const ids = Array.from(selectedRegions);
    const seriesA = regionTimeseries[ids[0]];
    const seriesB = regionTimeseries[ids[1]];
    
    const rValue = calculateCorrelation(seriesA, seriesB);

    const infoBox = document.getElementById('region-info1');
    console.log(rValue)
    infoBox.innerHTML += `
        <div style="margin-top:10px; border-top:1px solid #ccc; pt-5">
            <strong>Connectivity:</strong><br>
            <span style="color: ${rValue > 0.5 ? '#ff0000' : '#0000ff'}">
                 ${rValue.toFixed(3)}
            </span>
        </div>
    `;
    }

    if (data.length === 0) {
        document.getElementById('chart').innerHTML = "Hover or select regions to see BOLD curves";
        return;
    }

    const spec = {
        "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
        "width": "container",
        "height": 150,
       "layer": [
            {
                // LAYER 1: The BOLD Lines
                "data": { "values": data },
                "mark": { "type": "line", "interpolate": "monotone" },
                "encoding": {
                    "x": { "field": "t", "type": "quantitative", "title": "Time" },
                    "y": { "field": "value", "type": "quantitative", "title": "BOLD" },
                    "color": { "field": "region", "type": "nominal", "legend": { "orient": "bottom" } }
                }
            },
            {
                // LAYER 2: The Vertical Time Indicator
                "data": { "values": [{ "current": currentTime }] },
                "mark": { "type": "rule", "color": "red", "size": 2, "strokeDash": [4, 4] },
                "encoding": {
                    "x": { "field": "current", "type": "quantitative" }
                }
            }
            ]
    };
    vegaEmbed('#chart', spec, { actions: false });
}

// =======================
// Animate
// =======================
function animate() {
    requestAnimationFrame(animate);
    controls.update();

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(Object.values(regionMeshes));
    const hoveredObj = intersects.length > 0 ? intersects[0].object : null;
    const hoverBox = document.getElementById('region-hover');
    const coordBox = document.getElementById('coords-display');

    if (hoveredObj) {
        const id = hoveredObj.userData.regionId;
        const name = roiLabels[id] || `ROI ${id}`;

        hoverBox.style.display = 'block';
        hoverBox.innerHTML = name;

        // Directly use the pixel coordinates
        let posX = mousePx.x + 15; 
        let posY = mousePx.y + 15; 

        const boxWidth = hoverBox.offsetWidth;
        if (posX + boxWidth > window.innerWidth) {
            posX = mousePx.x - boxWidth - 15; // Flip to the left if near edge
        }

        hoverBox.style.left = posX + 'px';
        hoverBox.style.top = posY + 'px';
        const point = intersects[0].point;
        if (coordBox) {
            coordBox.style.display = 'block';
            coordBox.innerHTML = `MNI: x=${point.x.toFixed(1)}, y=${point.y.toFixed(1)}, z=${point.z.toFixed(1)}`;
        }

        if (window.crosshair) {
            window.crosshair.position.copy(point);
            window.crosshair.visible = true;
        }
    } else {
        hoverBox.style.display = 'none';
        if (coordBox) coordBox.style.display = 'none';
        if (window.crosshair) window.crosshair.visible = false;
    }

    for (const id in regionMeshes) {
        const mesh = regionMeshes[id];

        mesh.material.color.copy(mesh.userData.fmriColor);
       // Hover over regions
        if (selectedRegions.has(id)) {
            mesh.material.emissive.set(0x444444); 
        } else if (mesh === hoveredObj) {
            mesh.material.color.set(0xffffff);
            if (!isSelectionMode) updateChart(id);
        } else {
            mesh.material.emissive.set(0x000000);
        }
    }

    renderer.render(scene, camera);
}

// =======================
// Start
// =======================
loadBrain();
animate();
autoPlay();
renderScentedSlider();
