/**
 * AuraSmart Home - Final Professional Integration
 * Updated with exact Switch 2.doc blueprint prompts & topics
 */

const MQTT_BROKER = 'wss://broker.hivemq.com:8000/mqtt';
const TOPIC_BASE = 'home';

let state = {
    masterAcousticControl: true,
    devices: []
};

let mqttClient = null;
let heartbeatInterval = null;

function init() {
    loadState();
    connectMQTT();
    startHeartbeatMonitor();
    render();
}

function loadState() {
    const savedData = localStorage.getItem('auraSmartData');
    if (savedData) {
        state = JSON.parse(savedData);
    } else {
        state = {
            masterAcousticControl: true,
            devices: [
                {
                    id: 'dev_1',
                    deviceName: 'Living Room Hub',
                    deviceUid: '8821-X',
                    online: true,
                    lastSeen: Date.now(),
                    acousticEnabled: true,
                    switches: [
                        { id: 'sw_1', name: 'Main Light', status: true, acousticEnabled: true },
                        { id: 'sw_2', name: 'AC Unit', status: false, acousticEnabled: false }
                    ]
                }
            ]
        };
        saveState();
    }
}

function saveState() {
    localStorage.setItem('auraSmartData', JSON.stringify(state));
}

function isAcousticActive(dIdx, sIdx) {
    if (!state.masterAcousticControl) return false;
    const device = state.devices[dIdx];
    if (!device.acousticEnabled) return false;
    if (!device.switches[sIdx].acousticEnabled) return false;
    return true;
}

function registerOrUpdateDevice(config) {
    let device = state.devices.find(d => d.deviceUid === config.deviceUid);

    if (!device) {
        device = {
            id: 'dev_' + Date.now(),
            deviceName: config.deviceName || 'Smart Device',
            deviceUid: config.deviceUid,
            online: true,
            lastSeen: Date.now(),
            acousticEnabled: config.acousticEnabled ?? true,
            switches: config.switches || []
        };
        state.devices.push(device);
        showToast(`✨ Auto-discovered ${device.deviceName}!`);
    } else {
        const cameOnline = !device.online;
        device.online = true;
        device.lastSeen = Date.now();
        device.switches = config.switches;
        if (cameOnline) {
            showToast(`Device ${device.deviceUid} is back online. ✅`);
        }
    }

    saveState();
    render();
}

// --- MQTT Logic ---

function connectMQTT() {
    mqttClient = mqtt.connect(MQTT_BROKER);

    mqttClient.on('connect', () => {
        updateConnLed(true);
        mqttClient.subscribe(`${TOPIC_BASE}/+/config`);
        mqttClient.subscribe(`${TOPIC_BASE}/+/+/status`);
        mqttClient.subscribe(`${TOPIC_BASE}/+/heartbeat`);
        
        // Additional Blueprint Sound Event Subscriptions
        mqttClient.subscribe(`${TOPIC_BASE}/+/+/clap_event`);
        mqttClient.subscribe(`${TOPIC_BASE}/+/+/failsafe`);
    });

    mqttClient.on('error', () => updateConnLed(false));
    mqttClient.on('close', () => updateConnLed(false));

    mqttClient.on('message', (topic, message) => {
        const parts = topic.split('/');

        if (parts[2] === 'config') {
            try {
                const config = JSON.parse(message.toString());
                registerOrUpdateDevice(config);
            } catch (e) {
                console.error('Invalid JSON configuration received', e);
            }
            return;
        }

        if (topic.endsWith('/heartbeat')) {
            const uid = parts[1];
            updateHeartbeat(uid);
            return;
        }

        // Handle Clap Pattern Event Notification
        if (parts[3] === 'clap_event') {
            const uid = parts[1];
            const switchIdx = parseInt(parts[2]);
            const device = state.devices.find(d => d.deviceUid === uid);
            const swName = device && device.switches[switchIdx] ? device.switches[switchIdx].name : `Switch ${switchIdx}`;
            showToast(`Clap pattern detected! Turning ${swName} ON.`);
            return;
        }

        // Handle Fail-Safe Event Notification
        if (parts[3] === 'failsafe') {
            showToast("Too many claps detected. Command ignored for safety.");
            return;
        }

        if (topic.endsWith('/status')) {
            const uid = parts[1];
            const switchIdx = parseInt(parts[2]);
            const payload = message.toString().toUpperCase();
            updateDeviceStatus(uid, switchIdx, payload);
        }
    });
}

function updateHeartbeat(uid) {
    const device = state.devices.find(d => d.deviceUid === uid);
    if (device) {
        if (!device.online) {
            showToast(`Device ${device.deviceUid} is back online. ✅`);
        }
        device.online = true;
        device.lastSeen = Date.now();
        render();
    }
}

function startHeartbeatMonitor() {
    heartbeatInterval = setInterval(() => {
        let changed = false;
        const now = Date.now();
        state.devices.forEach(device => {
            if (device.online && (now - device.lastSeen > 60000)) {
                device.online = false;
                changed = true;
                showToast(`Device ${device.deviceUid} is unresponsive. Please check battery/WiFi.`);
            }
        });
        if (changed) render();
    }, 5000);
}

function updateDeviceStatus(uid, switchIdx, statusStr) {
    const device = state.devices.find(d => d.deviceUid === uid);
    if (device && device.switches[switchIdx]) {
        const sw = device.switches[switchIdx];
        const newStatus = (statusStr === 'ON');
        if (sw.status !== newStatus) {
            sw.status = newStatus;
            saveState();
            render();
            showToast(`Manual flip detected! Syncing ${sw.name} to ${newStatus ? 'ON' : 'OFF'}.`);
        }
    }
}

function updateConnLed(isConnected) {
    const led = document.getElementById('mqtt-led');
    if (led) led.className = isConnected ? 'status-led online' : 'status-led offline';
}

function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

// --- MODAL CORE LOGIC ---

function requestInput(title, placeholder, callback) {
    const overlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalInput = document.getElementById('modal-input');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    modalTitle.innerText = title;
    modalInput.placeholder = placeholder;
    modalInput.value = '';
    overlay.classList.add('active');
    modalInput.focus();

    cancelBtn.onclick = () => {
        overlay.classList.remove('active');
    };

    confirmBtn.onclick = () => {
        const val = modalInput.value;
        overlay.classList.remove('active');
        if (val) callback(val);
    };
}

function requestConfirm(title, message, callback) {
    const overlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.querySelector('.modal-body');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    const originalInputHTML = `<input type="text" id="modal-input" placeholder="Enter name...">`;

    modalTitle.innerText = title;
    modalBody.innerHTML = `<p style="color: var(--text-dim); font-size: 0.9rem;">${message}</p>`;
    overlay.classList.add('active');

    const closeModal = () => {
        overlay.classList.remove('active');
        modalBody.innerHTML = originalInputHTML;
    };

    confirmBtn.onclick = () => {
        closeModal();
        callback();
    };
    cancelBtn.onclick = () => {
        closeModal();
    };
}

// --- UI Rendering ---

function render() {
    const container = document.getElementById('dashboard-container');
    const masterToggle = document.getElementById('master-toggle');
    
    if (masterToggle) {
        masterToggle.checked = state.masterAcousticControl;
        
        const headerLabel = document.querySelector('.master-control .label');
        const statusText = state.masterAcousticControl ? 'ENABLED' : 'DISABLED';
        const statusClass = state.masterAcousticControl ? 'active' : 'inactive';
        headerLabel.innerHTML = `Acoustic Master <span class="status-label ${statusClass}">${statusText}</span>`;
    }

    container.innerHTML = '';

    state.devices.forEach((device, dIdx) => {
        const card = document.createElement('section');
        card.className = `device-card ${device.online ? '' : 'offline'}`;
        
        card.innerHTML = `
            <div class="card-header">
                <div class="device-info">
                    <span class="status-led ${device.online ? 'online' : 'offline'}"></span>
                    <div class="device-id-group">
                        <span class="device-id">${device.deviceName} <small>ID: ${device.deviceUid}</small></span>
                        <small class="timestamp">Last Seen: ${device.lastSeen ? new Date(device.lastSeen).toLocaleTimeString() : 'Never'}</small>
                    </div>
                </div>
                
                <div class="device-acoustic-control">
                    <span class="status-label ${device.acousticEnabled ? 'active' : 'inactive'}">
                        ${device.acousticEnabled ? 'DEVICE ON' : 'DEVICE OFF'}
                    </span>
                    <label class="glass-switch-mini">
                        <input type="checkbox" ${device.acousticEnabled ? 'checked' : ''} 
                            ${!state.masterAcousticControl ? 'disabled' : ''}   
                            onchange="toggleDeviceAcoustic(${dIdx})">
                        <span class="slider"></span>
                    </label>
                </div>

                <button class="btn-remove" onclick="removeDevice(${dIdx})">
                    <i class="ph ph-trash"></i>
                </button>
            </div>

            <div class="switch-grid">
                ${device.switches.map((sw, sIdx) => {
                    const isGloballyOn = state.masterAcousticControl;
                    const isDeviceOn = device.acousticEnabled;
                    const isSwitchOn = sw.acousticEnabled;
                    
                    const isActive = isGloballyOn && isDeviceOn && isSwitchOn;
                    const isParentDisabled = !isGloballyOn || !isDeviceOn;
                    const acousticText = isActive ? 'SENSING' : 'BLOCKED';
                    const acousticClass = isActive ? 'active' : 'inactive';

                    return `
                    <div class="switch-tile">
                        <div class="tile-top">
                            <label class="glass-switch">
                                <input type="checkbox" ${sw.status ? 'checked' : ''} 
                                    onchange="handleToggle(${dIdx}, ${sIdx})">
                                <span class="slider"></span>
                            </label>

                            <div class="acoustic-group ${isParentDisabled ? 'disabled-group' : ''}">
                                <i class="ph ph-microphone mic-icon"></i>
                                <label class="glass-switch-mini">
                                    <input type="checkbox" ${sw.acousticEnabled ? 'checked' : ''} 
                                        ${isParentDisabled ? 'disabled' : ''}
                                        onchange="toggleAcoustic(${dIdx}, ${sIdx})">
                                    <span class="slider"></span>
                                </label>
                                <span class="status-label ${acousticClass}">${acousticText}</span>
                            </div>
                        </div>
                        <div class="tile-bottom">
                            <span class="switch-name">${sw.name}</span>
                            <div class="switch-actions">
                                <button class="btn-edit" onclick="renameSwitch(${dIdx}, ${sIdx})">
                                    <i class="ph ph-pencil-simple"></i>
                                </button>
                                <button class="btn-delete" onclick="deleteSwitch(${dIdx}, ${sIdx})">
                                    <i class="ph ph-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `}).join('')}
            </div>

            <div class="card-footer">
                <button class="btn-add-switch" onclick="addSwitch(${dIdx})">
                    <i class="ph ph-plus-circle"></i> Add Switch
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

// --- HIERARCHICAL ACTIONS ---

window.toggleAcoustic = function(dIdx, sIdx) {
    const device = state.devices[dIdx];
    const sw = device.switches[sIdx];

    if (!state.masterAcousticControl) {
        showToast("⛔ Blocked: Global Acoustic is OFF");
        render();
        return;
    }
    if (!device.acousticEnabled) {
        showToast("⛔ Blocked: Device Acoustic is OFF");
        render();
        return;
    }

    sw.acousticEnabled = !sw.acousticEnabled;
    saveState();

    if (sw.acousticEnabled) {
        showToast(`Switch ${sw.name} is now set to respond to sound.`);
    }

    const payload = sw.acousticEnabled ? 'SENSING' : 'SILENT';
    const topic = `${TOPIC_BASE}/${device.deviceUid}/${sIdx}/sound_ctrl`;
    if (mqttClient && mqttClient.connected) {
        mqttClient.publish(topic, payload, { qos: 1 });
    }
    render();
};

window.toggleDeviceAcoustic = function(dIdx) {
    const device = state.devices[dIdx];

    if (!state.masterAcousticControl) {
        showToast("⛔ Blocked: Global Acoustic is OFF");
        render();
        return;
    }

    device.acousticEnabled = !device.acousticEnabled;

    if (!device.acousticEnabled) {
        device.switches.forEach(sw => {
            sw.acousticEnabled = false;
        });
    }

    saveState();

    const payload = device.acousticEnabled ? 'ENABLED' : 'DISABLED';
    const topic = `${TOPIC_BASE}/${device.deviceUid}/sound_device`;
    if (mqttClient && mqttClient.connected) {
        mqttClient.publish(topic, payload, { qos: 1 });
    }
    render();
};

// --- Logic Actions ---

window.handleToggle = function(dIdx, sIdx) {
    const device = state.devices[dIdx];
    const sw = device.switches[sIdx];
    sw.status = !sw.status;
    saveState();

    const payload = sw.status ? 'ON' : 'OFF';
    const topic = `${TOPIC_BASE}/${device.deviceUid}/${sIdx}/cmd`;
    if (mqttClient && mqttClient.connected) {
        mqttClient.publish(topic, payload, { qos: 1 });
    }
};

window.addSwitch = function(dIdx) {
    requestInput("Add New Switch", "e.g. Ceiling Fan", (name) => {
        state.devices[dIdx].switches.push({
            id: 'sw_' + Date.now(),
            name: name,
            status: false,
            acousticEnabled: true
        });
        saveState();
        render();
        showToast(`✅ Switch "${name}" added successfully!`);
    });
};

window.renameSwitch = function(dIdx, sIdx) {
    requestInput("Rename Switch", "Enter new name...", (newName) => {
        state.devices[dIdx].switches[sIdx].name = newName;
        saveState();
        render();
        showToast(`📝 Updated to "${newName}"`);
    });
}

window.deleteSwitch = function(dIdx, sIdx) {
    const device = state.devices[dIdx];
    const switchName = device.switches[sIdx].name;
    requestConfirm("Delete Switch", `Are you sure you want to delete "${switchName}"?`, () => {
        device.switches.splice(sIdx, 1);
        saveState();
        render();
        showToast(`🗑️ Switch "${switchName}" deleted`);
    });
};

window.removeDevice = function(dIdx) {
    const deviceName = state.devices[dIdx].deviceName;
    requestConfirm("Remove Device", `Are you sure you want to delete ${deviceName}?`, () => {
        state.devices.splice(dIdx, 1);
        saveState();
        render();
        showToast(`🗑️ Device "${deviceName}" removed`);
    });
};

document.addEventListener('DOMContentLoaded', () => {
    init();

    document.getElementById('fab-add-device').addEventListener('click', () => {
        requestInput("Add Device", "Enter Device Name...", (name) => {
            requestInput("Device ID", "Must match ESP32 UID (e.g. 1234-X)", (uid) => {
                state.devices.push({
                    id: 'dev_' + Date.now(),
                    deviceName: name,
                    deviceUid: uid || 'XXXX-X',
                    online: true,
                    lastSeen: Date.now(),
                    switches: []
                });
                saveState();
                render();
                showToast(`🚀 ${name} connected successfully!`);
            });
        });
    });

    document.getElementById('master-toggle').addEventListener('change', (e) => {
        state.masterAcousticControl = e.target.checked;
        
        if (!state.masterAcousticControl) {
            state.devices.forEach(device => {
                device.acousticEnabled = false;
                device.switches.forEach(sw => {
                    sw.acousticEnabled = false;
                });
            });
            showToast("⛔ Global Acoustic OFF: All devices muted");
        } else {
            showToast("👂 Acoustic Mode Active. Your devices are now listening for claps.");
        }

        saveState();
        
        const payload = state.masterAcousticControl ? 'ENABLED' : 'DISABLED';
        const topic = `${TOPIC_BASE}/all/sound_master`;
        if (mqttClient && mqttClient.connected) {
            mqttClient.publish(topic, payload, { qos: 1 });
        }
        render();
    });
});