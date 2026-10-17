/**
 * Myanmar Seismotectonic Web Map
 * Event: Mandalay M4.2 Earthquake (2026-10-17 08:25:52 MMT)
 * Tectonic Dataset: Myanmar_Tectonic_Map_2011.geojson
 */

// Earthquake Event Data
const QUAKE_EVENT = {
  magnitude: 4.2,
  region: "Mandalay, Myanmar",
  mmt_time: "2026-10-17 08:25:52",
  utc_time: "2026-10-17 01:55:52 UTC",
  lat_dms: "21°59'49.2\"N",
  lon_dms: "96°10'26.4\"E",
  lat: 21.997000,
  lon: 96.174000,
  depth_km: 10.0,
  source_name: "Thai Meteorological Department (TMD)",
  source_url: "https://earthquake.tmd.go.th/"
};

// Key Settlements & Distances
const SETTLEMENTS = [
  { name: "Patheingyi Township", lat: 21.9880, lon: 96.1620, desc: "Immediate epicenter vicinity" },
  { name: "Mandalay Royal Palace", lat: 21.9926, lon: 96.0964, desc: "Historic citadel & moat" },
  { name: "Mandalay Downtown (Zegyo)", lat: 21.9750, lon: 96.0830, desc: "Commercial urban core" },
  { name: "Amarapura (U Bein Bridge)", lat: 21.9050, lon: 96.0460, desc: "Taungthaman Lake area" },
  { name: "Madaya", lat: 22.2030, lon: 96.1150, desc: "North of Mandalay" },
  { name: "Sagaing City", lat: 21.8780, lon: 95.9790, desc: "West of Irrawaddy River, near Sagaing Fault" },
  { name: "Pyin Oo Lwin (Maymyo)", lat: 22.0350, lon: 96.4670, desc: "Shan Plateau Highland" },
  { name: "Kyaukse", lat: 21.6040, lon: 96.1330, desc: "South Mandalay agricultural basin" }
];

// Utility: Haversine distance in km
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371.0;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Utility: Distance from point (pLon, pLat) to line segment (v, w)
function distPointToSegment(pLon, pLat, v, w) {
  const cosLat = Math.cos(((v[1] + w[1]) / 2) * Math.PI / 180);
  const vx = (v[0] - pLon) * 111.0 * cosLat;
  const vy = (v[1] - pLat) * 111.0;
  const wx = (w[0] - pLon) * 111.0 * cosLat;
  const wy = (w[1] - pLat) * 111.0;

  const dx = wx - vx;
  const dy = wy - vy;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) {
    return Math.sqrt(vx * vx + vy * vy);
  }

  const t = Math.max(0, Math.min(1, -(vx * dx + vy * dy) / l2));
  const projX = vx + t * dx;
  const projY = vy + t * dy;
  return Math.sqrt(projX * projX + projY * projY);
}

// Utility: Calculate minimum distance to a GeoJSON line or multiline
function getFeatureMinDistance(feature, pLat, pLon) {
  const geom = feature.geometry;
  if (!geom || !geom.coordinates) return 999999;
  const lines = geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates;
  let minD = 999999;
  let closestCoord = null;

  lines.forEach(line => {
    for (let i = 0; i < line.length - 1; i++) {
      const v = line[i];
      const w = line[i + 1];
      const d = distPointToSegment(pLon, pLat, v, w);
      if (d < minD) {
        minD = d;
        closestCoord = [v[1], v[0]];
      }
    }
  });

  return { minDistance: minD, closestCoord: closestCoord };
}

// Utility: Calculate total line length in km
function calculateFeatureLength(feature) {
  const geom = feature.geometry;
  if (!geom || !geom.coordinates) return 0;
  const lines = geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates;
  let totalLength = 0;

  lines.forEach(line => {
    for (let i = 0; i < line.length - 1; i++) {
      totalLength += haversineDistance(line[i][1], line[i][0], line[i + 1][1], line[i + 1][0]);
    }
  });

  return totalLength;
}

// Utility: Compass Bearing
function getCompassBearing(lat1, lon1, lat2, lon2) {
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) -
            Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  let theta = Math.atan2(y, x) * 180 / Math.PI;
  theta = (theta + 360) % 360;

  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                      "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const idx = Math.round(theta / 22.5) % 16;
  return { degree: Math.round(theta), text: directions[idx] };
}

// Global Application Controller
class SeismicMapApp {
  constructor() {
    this.map = null;
    this.baseLayers = {};
    this.layers = {
      faults: null,
      epicenter: null,
      rings: null,
      settlements: null,
      measureLine: null
    };
    this.isMeasureMode = false;
    this.nearestFaultInfo = null;

    this.init();
  }

  init() {
    this.initMap();
    this.initBaseMaps();
    this.renderEpicenter();
    this.renderImpactRings();
    this.renderSettlements();
    this.loadTectonicGeoJSON();
    this.initUIControls();
    this.populateSettlementTable();
  }

  initMap() {
    this.map = L.map('map', {
      center: [QUAKE_EVENT.lat, QUAKE_EVENT.lon],
      zoom: 10,
      zoomControl: false,
      attributionControl: true
    });

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    L.control.scale({ imperial: true, metric: true, position: 'bottomright' }).addTo(this.map);

    // Mouse coordinates display
    this.map.on('mousemove', (e) => {
      const coordEl = document.getElementById('mouse-coord');
      if (coordEl) {
        coordEl.textContent = `${e.latlng.lat.toFixed(4)}°N, ${e.latlng.lng.toFixed(4)}°E`;
      }
    });

    // Map click handler for measurement
    this.map.on('click', (e) => {
      if (this.isMeasureMode) {
        this.measureToPoint(e.latlng.lat, e.latlng.lng);
      }
    });
  }

  initBaseMaps() {
    // Esri Dark Gray Canvas (Zero API key required)
    const darkGrayBase = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
      maxZoom: 16
    });

    const darkGrayRef = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
      attribution: '',
      maxZoom: 16
    });

    const darkCanvas = L.layerGroup([darkGrayBase, darkGrayRef]);

    // Esri World Imagery Satellite (Zero API key required)
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      maxZoom: 18
    });

    // Esri World Topographic Map (Zero API key required)
    const topoMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; National Geographic, DeLorme, NAVTEQ',
      maxZoom: 18
    });

    // OpenStreetMap Standard (Zero API key required)
    const osmStandard = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    });

    // Esri World Street Map (Zero API key required)
    const streetMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 18
    });

    this.baseLayers = {
      "Dark Canvas": darkCanvas,
      "Satellite Imagery": satellite,
      "Topographic Terrain": topoMap,
      "OpenStreetMap": osmStandard,
      "World Street": streetMap
    };

    // Default layer is dark canvas (free, zero API key)
    darkCanvas.addTo(this.map);

    // Basemap selector dropdown listener
    const baseSelector = document.getElementById('basemap-select');
    if (baseSelector) {
      baseSelector.addEventListener('change', (e) => {
        const selected = e.target.value;
        Object.values(this.baseLayers).forEach(layer => this.map.removeLayer(layer));
        if (this.baseLayers[selected]) {
          this.baseLayers[selected].addTo(this.map);
        }
      });
    }
  }

  renderEpicenter() {
    const epicenterIcon = L.divIcon({
      className: 'custom-epicenter-div',
      html: `
        <div class="epicenter-marker-container">
          <div class="epicenter-wave"></div>
          <div class="epicenter-wave delay-1"></div>
          <div class="epicenter-wave delay-2"></div>
          <div class="epicenter-core" title="M4.2 Epicenter"></div>
        </div>
      `,
      iconSize: [50, 50],
      iconAnchor: [25, 25]
    });

    const popupContent = `
      <div class="custom-popup">
        <h3>
          <span>${QUAKE_EVENT.region}</span>
          <span class="badge">M ${QUAKE_EVENT.magnitude}</span>
        </h3>
        <p><strong>Focal Depth:</strong> ${QUAKE_EVENT.depth_km} km (Shallow Crustal)</p>
        <p style="margin-top: 4px; color: #ff8597; font-weight: 500;">
          Patheingyi Township outskirts, ~8 km NE of Mandalay Royal Palace
        </p>

        <div class="popup-specs">
          <div class="popup-spec-item">
            <span>Date & Time (MMT)</span>
            <span>${QUAKE_EVENT.mmt_time}</span>
          </div>
          <div class="popup-spec-item">
            <span>UTC Time</span>
            <span>${QUAKE_EVENT.utc_time}</span>
          </div>
          <div class="popup-spec-item">
            <span>Latitude</span>
            <span>${QUAKE_EVENT.lat_dms} (${QUAKE_EVENT.lat.toFixed(4)}°)</span>
          </div>
          <div class="popup-spec-item">
            <span>Longitude</span>
            <span>${QUAKE_EVENT.lon_dms} (${QUAKE_EVENT.lon.toFixed(4)}°)</span>
          </div>
        </div>

        <p style="font-size: 10px; color: #94a3b8; margin-top: 6px;">
          Tectonic Setting: Central Myanmar Basin / Shan Scarp Frontal Zone adjacent to the active Sagaing Fault system.
        </p>
        <a class="popup-link" href="${QUAKE_EVENT.source_url}" target="_blank" rel="noopener noreferrer">
          Source: ${QUAKE_EVENT.source_name} &rarr;
        </a>
      </div>
    `;

    const marker = L.marker([QUAKE_EVENT.lat, QUAKE_EVENT.lon], { icon: epicenterIcon, zIndexOffset: 1000 })
      .bindPopup(popupContent, { maxWidth: 320 });

    this.layers.epicenter = L.layerGroup([marker]).addTo(this.map);

    // Open popup after brief moment
    setTimeout(() => {
      marker.openPopup();
    }, 600);
  }

  renderImpactRings() {
    const rings = [];

    // 10 km ring: Near-field / Strongest felt motion (MMI IV)
    const ring10 = L.circle([QUAKE_EVENT.lat, QUAKE_EVENT.lon], {
      radius: 10000,
      color: '#ff4757',
      weight: 2,
      opacity: 0.8,
      fillColor: '#ff4757',
      fillOpacity: 0.12,
      dashArray: '4, 4'
    }).bindTooltip("<strong>10 km Zone</strong><br>Epicentral Area (Light-Moderate Shaking)", { sticky: true });

    // 25 km ring: Felt tremor zone (MMI III)
    const ring25 = L.circle([QUAKE_EVENT.lat, QUAKE_EVENT.lon], {
      radius: 25000,
      color: '#ffa502',
      weight: 1.5,
      opacity: 0.65,
      fillColor: '#ffa502',
      fillOpacity: 0.05,
      dashArray: '6, 6'
    }).bindTooltip("<strong>25 km Zone</strong><br>Noticeable Shaking (Mandalay Metro & Amarapura)", { sticky: true });

    // 50 km ring: Perceptible limit (MMI II)
    const ring50 = L.circle([QUAKE_EVENT.lat, QUAKE_EVENT.lon], {
      radius: 50000,
      color: '#38bdf8',
      weight: 1.2,
      opacity: 0.45,
      fillColor: '#38bdf8',
      fillOpacity: 0.02,
      dashArray: '8, 8'
    }).bindTooltip("<strong>50 km Zone</strong><br>Perceptible Outer Limit (Pyin Oo Lwin, Sagaing, Kyaukse)", { sticky: true });

    rings.push(ring10, ring25, ring50);
    this.layers.rings = L.layerGroup(rings).addTo(this.map);
  }

  renderSettlements() {
    const markers = [];

    SETTLEMENTS.forEach(city => {
      const dist = haversineDistance(QUAKE_EVENT.lat, QUAKE_EVENT.lon, city.lat, city.lon);
      const bearing = getCompassBearing(QUAKE_EVENT.lat, QUAKE_EVENT.lon, city.lat, city.lon);

      const cityIcon = L.divIcon({
        className: 'city-icon-container',
        html: `
          <div class="city-marker-div" title="${city.name}">
            <span class="city-dot"></span>
            <span>${city.name.split(' ')[0]}</span>
          </div>
        `,
        iconSize: [80, 20],
        iconAnchor: [6, 10]
      });

      const popupHtml = `
        <div class="custom-popup">
          <h3 style="font-size: 13px;">${city.name}</h3>
          <p>${city.desc}</p>
          <div class="popup-specs" style="margin-top: 6px;">
            <div class="popup-spec-item">
              <span>Distance to Epicenter</span>
              <span style="color: #38bdf8;">${dist.toFixed(1)} km (${(dist * 0.621371).toFixed(1)} mi)</span>
            </div>
            <div class="popup-spec-item">
              <span>Bearing from Epicenter</span>
              <span>${bearing.degree}° (${bearing.text})</span>
            </div>
          </div>
        </div>
      `;

      const m = L.marker([city.lat, city.lon], { icon: cityIcon }).bindPopup(popupHtml);
      markers.push(m);
    });

    this.layers.settlements = L.layerGroup(markers).addTo(this.map);
  }

  populateSettlementTable() {
    const tbody = document.getElementById('settlement-tbody');
    if (!tbody) return;

    // Sort settlements by distance
    const sorted = [...SETTLEMENTS].map(s => {
      const dist = haversineDistance(QUAKE_EVENT.lat, QUAKE_EVENT.lon, s.lat, s.lon);
      const bearing = getCompassBearing(QUAKE_EVENT.lat, QUAKE_EVENT.lon, s.lat, s.lon);
      return { ...s, dist, bearing };
    }).sort((a, b) => a.dist - b.dist);

    tbody.innerHTML = '';
    sorted.forEach(s => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${s.name}</strong></td>
        <td><span class="dist-badge">${s.dist.toFixed(1)} km</span></td>
        <td style="color: #94a3b8;">${s.bearing.text}</td>
      `;
      row.addEventListener('click', () => {
        this.map.flyTo([s.lat, s.lon], 12, { duration: 1 });
        this.measureToPoint(s.lat, s.lon);
      });
      tbody.appendChild(row);
    });
  }

  loadTectonicGeoJSON() {
    // If window.myanmarTectonicData is available (from tectonic_data.js), use it directly
    if (window.myanmarTectonicData) {
      this.processGeoJSON(window.myanmarTectonicData);
    } else {
      // Fallback: fetch GeoJSON via HTTP
      fetch('Myanmar_Tectonic_Map_2011.geojson')
        .then(res => {
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          return res.json();
        })
        .then(data => {
          this.processGeoJSON(data);
        })
        .catch(err => {
          console.error("Failed to fetch Myanmar_Tectonic_Map_2011.geojson:", err);
          const notice = document.getElementById('data-notice');
          if (notice) {
            notice.style.display = 'block';
            notice.innerHTML = '⚠️ Note: Please open via local server or ensure tectonic_data.js is loaded.';
          }
        });
    }
  }

  processGeoJSON(geojson) {
    let closestFault = null;
    let minDistance = 999999;

    // Analyze lineaments and find closest to epicenter
    geojson.features.forEach((feature, index) => {
      feature.id = index;
      const { minDistance: d, closestCoord } = getFeatureMinDistance(feature, QUAKE_EVENT.lat, QUAKE_EVENT.lon);
      feature.properties._minDistanceToQuake = d;
      feature.properties._closestCoord = closestCoord;
      feature.properties._lengthKm = calculateFeatureLength(feature);

      if (d < minDistance) {
        minDistance = d;
        closestFault = feature;
      }
    });

    this.nearestFaultInfo = {
      feature: closestFault,
      distance: minDistance
    };

    // Update nearest lineament in UI
    const nearestEl = document.getElementById('nearest-fault-dist');
    if (nearestEl) {
      nearestEl.textContent = `${minDistance.toFixed(2)} km`;
    }
    const nearestDescEl = document.getElementById('nearest-fault-desc');
    if (nearestDescEl && closestFault) {
      const p = closestFault.properties;
      const label = p.NAME ? ` (${p.NAME})` : '';
      nearestDescEl.innerHTML = `<strong>Tectonic Lineament #${closestFault.id}${label}</strong>, passing ~${minDistance.toFixed(2)} km from the epicenter.`;
    }

    // Uniform styling for all lineaments (unclassified baseline dataset)
    const lineamentStyle = {
      color: '#ff4757',
      weight: 2.0,
      opacity: 0.75,
      lineCap: 'round',
      lineJoin: 'round'
    };

    const highlightStyle = {
      color: '#ffffff',
      weight: 3.8,
      opacity: 1
    };

    this.layers.faults = L.geoJSON(geojson, {
      style: lineamentStyle,
      onEachFeature: (feature, layer) => {
        const p = feature.properties;
        const lineTitle = p.NAME ? `Tectonic Lineament #${feature.id} (${p.NAME})` : `Tectonic Lineament #${feature.id}`;
        const distKm = p._minDistanceToQuake ? p._minDistanceToQuake.toFixed(1) : 'N/A';
        const lenKm = p._lengthKm ? p._lengthKm.toFixed(1) : 'N/A';

        // Tooltip
        layer.bindTooltip(`
          <strong>${lineTitle}</strong><br>
          ${p.SEGMENT ? `Segment: ${p.SEGMENT}<br>` : ''}
          Dist to Epicenter: <strong>${distKm} km</strong>
        `, { sticky: true });

        // Popup
        layer.bindPopup(`
          <div class="custom-popup">
            <h3>
              <span>Tectonic Lineament #${feature.id}</span>
            </h3>
            ${p.NAME ? `<p><strong>Label:</strong> ${p.NAME}</p>` : ''}
            ${p.SEGMENT ? `<p><strong>Segment:</strong> ${p.SEGMENT}</p>` : ''}
            ${p.CODE ? `<p><strong>Code:</strong> ${p.CODE}</p>` : ''}
            ${p.TYPE_DESCR ? `<p><strong>Description:</strong> ${p.TYPE_DESCR}</p>` : ''}

            <div class="popup-specs">
              <div class="popup-spec-item">
                <span>Dist to Epicenter</span>
                <span style="color: #ff6b81;">${distKm} km</span>
              </div>
              <div class="popup-spec-item">
                <span>Mapped Length</span>
                <span>${lenKm} km</span>
              </div>
            </div>

            <p style="font-size: 10px; color: #94a3b8; margin-top: 4px;">
              Source: Myanmar Tectonic Map 2011 (MGS) &bull; Unclassified Lineaments
            </p>
          </div>
        `, { maxWidth: 280 });

        // Hover events
        layer.on('mouseover', () => {
          layer.setStyle(highlightStyle);
          layer.bringToFront();
        });

        layer.on('mouseout', () => {
          this.layers.faults.resetStyle(layer);
        });
      }
    }).addTo(this.map);
  }

  initUIControls() {
    // Sidebar Collapse / Expand
    const sidebar = document.getElementById('sidebar');
    const closeSidebarBtn = document.getElementById('close-sidebar');
    const openSidebarBtn = document.getElementById('open-sidebar-btn');

    if (closeSidebarBtn && sidebar) {
      closeSidebarBtn.addEventListener('click', () => {
        sidebar.classList.add('collapsed');
      });
    }

    if (openSidebarBtn && sidebar) {
      openSidebarBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
      });
    }

    const floatToggleBtn = document.getElementById('sidebar-toggle-btn');
    if (floatToggleBtn && sidebar) {
      floatToggleBtn.addEventListener('click', () => {
        sidebar.classList.remove('collapsed');
      });
    }

    // Click on Nearest Fault box to fly to that fault
    const faultBox = document.querySelector('.fault-proximity-box');
    if (faultBox) {
      faultBox.style.cursor = 'pointer';
      faultBox.title = 'Click to fly to this nearest fault trace';
      faultBox.addEventListener('click', () => {
        if (this.nearestFaultInfo && this.nearestFaultInfo.feature) {
          const bounds = L.geoJSON(this.nearestFaultInfo.feature).getBounds();
          this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
        }
      });
    }

    // Layer Toggles
    const toggleFaults = document.getElementById('toggle-faults');
    if (toggleFaults) {
      toggleFaults.addEventListener('change', (e) => {
        if (e.target.checked) {
          if (this.layers.faults) this.map.addLayer(this.layers.faults);
        } else {
          if (this.layers.faults) this.map.removeLayer(this.layers.faults);
        }
      });
    }

    const toggleEpicenter = document.getElementById('toggle-epicenter');
    if (toggleEpicenter) {
      toggleEpicenter.addEventListener('change', (e) => {
        if (e.target.checked) {
          if (this.layers.epicenter) this.map.addLayer(this.layers.epicenter);
        } else {
          if (this.layers.epicenter) this.map.removeLayer(this.layers.epicenter);
        }
      });
    }

    const toggleRings = document.getElementById('toggle-rings');
    if (toggleRings) {
      toggleRings.addEventListener('change', (e) => {
        if (e.target.checked) {
          if (this.layers.rings) this.map.addLayer(this.layers.rings);
        } else {
          if (this.layers.rings) this.map.removeLayer(this.layers.rings);
        }
      });
    }

    const toggleCities = document.getElementById('toggle-cities');
    if (toggleCities) {
      toggleCities.addEventListener('change', (e) => {
        if (e.target.checked) {
          if (this.layers.settlements) this.map.addLayer(this.layers.settlements);
        } else {
          if (this.layers.settlements) this.map.removeLayer(this.layers.settlements);
        }
      });
    }

    // Preset View Buttons
    document.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-preset');
        this.applyPreset(preset);
      });
    });

    // Measurement Tool Toggle Button
    const measureBtn = document.getElementById('measure-btn');
    const measureBanner = document.getElementById('measure-banner');
    const closeMeasureBtn = document.getElementById('close-measure');

    if (measureBtn) {
      measureBtn.addEventListener('click', () => {
        this.isMeasureMode = !this.isMeasureMode;
        this.toggleMeasureMode(this.isMeasureMode);
      });
    }

    if (closeMeasureBtn) {
      closeMeasureBtn.addEventListener('click', () => {
        this.isMeasureMode = false;
        this.toggleMeasureMode(false);
      });
    }
  }

  toggleMeasureMode(active) {
    const banner = document.getElementById('measure-banner');
    const mapDiv = document.getElementById('map');
    const measureBtn = document.getElementById('measure-btn');

    if (active) {
      banner.classList.add('active');
      mapDiv.style.cursor = 'crosshair';
      if (measureBtn) measureBtn.classList.add('btn-primary');
    } else {
      banner.classList.remove('active');
      mapDiv.style.cursor = '';
      if (measureBtn) measureBtn.classList.remove('btn-primary');
      if (this.layers.measureLine) {
        this.map.removeLayer(this.layers.measureLine);
        this.layers.measureLine = null;
      }
    }
  }

  measureToPoint(lat, lon) {
    if (this.layers.measureLine) {
      this.map.removeLayer(this.layers.measureLine);
    }

    const dist = haversineDistance(QUAKE_EVENT.lat, QUAKE_EVENT.lon, lat, lon);
    const bearing = getCompassBearing(QUAKE_EVENT.lat, QUAKE_EVENT.lon, lat, lon);

    // Estimated Seismic Arrivals
    const pWaveSec = (dist / 6.0).toFixed(1); // avg P-wave ~6 km/s
    const sWaveSec = (dist / 3.5).toFixed(1); // avg S-wave ~3.5 km/s

    const line = L.polyline([
      [QUAKE_EVENT.lat, QUAKE_EVENT.lon],
      [lat, lon]
    ], {
      color: '#38bdf8',
      weight: 3,
      dashArray: '6, 6',
      opacity: 0.9
    });

    const targetMarker = L.circleMarker([lat, lon], {
      radius: 6,
      color: '#38bdf8',
      fillColor: '#ffffff',
      fillOpacity: 1,
      weight: 2
    });

    const popupHtml = `
      <div class="custom-popup" style="min-width: 220px;">
        <h3 style="color: #38bdf8;">Measured Distance</h3>
        <p><strong>To Epicenter:</strong> <span style="font-size:14px; color:#ff4757; font-weight:700;">${dist.toFixed(2)} km</span> (${(dist * 0.621371).toFixed(2)} mi)</p>
        <p><strong>Bearing:</strong> ${bearing.degree}° (${bearing.text})</p>
        <div class="popup-specs">
          <div class="popup-spec-item">
            <span>Est. P-Wave Arrival</span>
            <span>~${pWaveSec} sec</span>
          </div>
          <div class="popup-spec-item">
            <span>Est. S-Wave Arrival</span>
            <span>~${sWaveSec} sec</span>
          </div>
        </div>
      </div>
    `;

    targetMarker.bindPopup(popupHtml).openPopup();

    this.layers.measureLine = L.layerGroup([line, targetMarker]).addTo(this.map);
  }

  applyPreset(preset) {
    switch (preset) {
      case 'epicenter':
        this.map.flyTo([QUAKE_EVENT.lat, QUAKE_EVENT.lon], 11, { duration: 1.2 });
        break;
      case 'mandalay':
        this.map.flyTo([21.98, 96.12], 10, { duration: 1.2 });
        break;
      case 'belt':
        this.map.flyTo([21.9, 96.1], 8, { duration: 1.5 });
        break;
      case 'country':
        if (this.layers.faults) {
          this.map.flyToBounds(this.layers.faults.getBounds(), { padding: [30, 30], duration: 1.5 });
        } else {
          this.map.flyTo([21.5, 96.0], 6, { duration: 1.5 });
        }
        break;
    }
  }
}

// Instantiate on DOM content loaded
document.addEventListener('DOMContentLoaded', () => {
  window.seismicMap = new SeismicMapApp();
});
