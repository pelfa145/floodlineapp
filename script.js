import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

document.addEventListener("DOMContentLoaded", () => {
    try {
        // Register Service Worker for PWA
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js')
                    .then(registration => {
                        console.log('SW registered: ', registration);
                    })
                    .catch(registrationError => {
                        console.log('SW registration failed: ', registrationError);
                    });
            });
        }

        // --- Device Detection ---
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
                       || window.innerWidth < 768;

        // Update UI for mobile devices
        if (isMobile) {
            // Change button text for hotline buttons
            document.querySelectorAll('.copy-phone-btn').forEach(btn => {
                const label = btn.dataset.label;
                if (label) {
                    // Remove "Copy" prefix and use just the label
                    btn.innerHTML = label;
                    btn.title = 'Tap to call';
                }
            });

            // Hide the "Copy MDRRMO #" button in the hero section
            const heroCopyBtn = document.querySelector('.hero .copy-phone-btn');
            if (heroCopyBtn) {
                heroCopyBtn.style.display = 'none';
            }
        }
        const firebaseConfig = {
            apiKey: "AIzaSyCc4VecYAifaF9XyQizHRNdXfC3bLdBCl8",
            authDomain: "floodline-capstone.firebaseapp.com",
            databaseURL: "https://floodline-capstone-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "floodline-capstone",
            storageBucket: "floodline-capstone.firebasestorage.app",
            messagingSenderId: "473220525408",
            appId: "1:473220525408:web:2eef4d8aafc962298dc205"
        };

        const app = initializeApp(firebaseConfig);
        const db = getDatabase(app);

        // --- UI Elements ---
        const statusCard = document.getElementById('live-status-card');
        const levelText = document.getElementById('level-text');
        const levelDesc = document.getElementById('level-desc');
        const gaugeFill = document.getElementById('gauge-fill');
        const lastUpdated = document.getElementById('last-updated');
        const waterTrend = document.getElementById('water-trend');
        const pulseDot = document.querySelector('.pulse-dot');
        const shareBtn = document.getElementById('shareBtn');
        const statusLog = document.getElementById('status-log');
        const clearHistoryBtn = document.getElementById('clear-history');
        const copyPhoneButtons = document.querySelectorAll('.copy-phone-btn');

        // --- Audio Elements ---
        const level1Alert = document.getElementById('level1-alert');
        const level2Alert = document.getElementById('level2-alert');
        const level3Alert = document.getElementById('level3-alert');
        const alertAudioByLevel = {
            1: level1Alert,
            2: level2Alert,
            3: level3Alert
        };

        // --- Modal Elements ---
        const modal = document.getElementById("myModal");
        const img = document.getElementById("zoomable-map");
        const modalImg = document.getElementById("img01");
        const backButton = document.getElementById("back-to-map");

        let gaugeInitialized = false;
        let gaugeRadius, gaugeCircumference;
        let previousLevel = null;
        let audioUnlocked = false;
        let pendingAlertLevel = null;

        // --- Logging ---
        const MAX_LOG_ENTRIES = 5;
        let statusHistory = JSON.parse(localStorage.getItem('statusHistory')) || [];

        function updateLogUI() {
            if (!statusLog) return;
            statusLog.innerHTML = '';
            statusHistory.slice().reverse().forEach(entry => {
                const li = document.createElement('li');
                li.textContent = `[${entry.time}] Level ${entry.level}: ${entry.description}`;
                statusLog.appendChild(li);
            });
        }

        function addLogEntry(level, description, timestamp) {
            const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            statusHistory.push({ time, level, description });
            if (statusHistory.length > MAX_LOG_ENTRIES) {
                statusHistory.shift();
            }
            localStorage.setItem('statusHistory', JSON.stringify(statusHistory));
            updateLogUI();
        }

        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', () => {
                statusHistory = [];
                localStorage.removeItem('statusHistory');
                updateLogUI();
            });
        }

        // --- Initial State & Offline Handling ---
        function setOfflineState() {
            if (statusCard) {
                statusCard.className = 'status-card status-offline';
                levelText.innerText = "Offline";
                levelDesc.innerText = "Waiting for connection...";
            }
            if(pulseDot) pulseDot.style.display = 'none';
            if(lastUpdated) lastUpdated.innerText = "--:--";
            if(waterTrend) waterTrend.innerText = "--";
            const rainfallStatus = document.getElementById('rainfall-status');
            if(rainfallStatus) rainfallStatus.innerText = "---";
            setGaugeProgress(0);
        }

        // --- Rainfall Logic (OpenWeather) ---
        async function updateRainfall() {
            const rainfallStatus = document.getElementById('rainfall-status');
            const apiKey = "9209d11b074454d588833b6af0281a44";
            const lat = 8.155;
            const lon = 123.345;
            const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;

            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error('Weather data unavailable');
                const data = await response.json();
                
                let rainText = "No rain";
                if (data.rain && data.rain['1h']) {
                    rainText = `${data.rain['1h']} mm/h`;
                } else if (data.weather && data.weather[0]) {
                    rainText = data.weather[0].main; // e.g., "Clear", "Clouds"
                }

                if (rainfallStatus) {
                    rainfallStatus.innerText = rainText;
                }
            } catch (error) {
                console.error("Rainfall Fetch Error:", error);
                if (rainfallStatus) rainfallStatus.innerText = "Unavailable";
            }
        }

        // --- Gauge Logic ---
        function initGauge() {
            if (gaugeInitialized || !gaugeFill) return;
            try {
                gaugeRadius = gaugeFill.r.baseVal.value;
                gaugeCircumference = 2 * Math.PI * gaugeRadius;
                if (gaugeCircumference > 0) {
                    gaugeFill.style.strokeDasharray = `${gaugeCircumference} ${gaugeCircumference}`;
                    gaugeFill.style.strokeDashoffset = gaugeCircumference;
                    gaugeInitialized = true;
                }
            } catch (e) { console.error("Could not initialize gauge:", e); }
        }

        function setGaugeProgress(level) {
            if (!gaugeInitialized) initGauge();
            if (!gaugeInitialized) return;
            const safeLevel = Math.min(Math.max(level, 0), 3);
            const offset = gaugeCircumference - (safeLevel / 3) * gaugeCircumference;
            gaugeFill.style.strokeDashoffset = offset;
        }

        setOfflineState();
        updateLogUI();
        updateRainfall();
        setInterval(updateRainfall, 600000); // Update every 10 minutes

        // --- Audio Unlock Logic ---
        function getAlertAudio(level) {
            return alertAudioByLevel[Math.min(Math.max(level, 1), 3)] || null;
        }

        async function primeAudioElement(audioElement) {
            if (!audioElement) return;
            try {
                audioElement.muted = true;
                await audioElement.play();
                audioElement.pause();
                audioElement.currentTime = 0;
            } catch (error) {
                // Ignore; we retry after another user gesture.
            } finally {
                audioElement.muted = false;
            }
        }

        async function playAlertForLevel(level) {
            if (level <= 0) return;
            const audioElement = getAlertAudio(level);
            if (!audioElement) return;

            stopAllAlerts();
            try {
                await audioElement.play();
                pendingAlertLevel = null;
            } catch (error) {
                pendingAlertLevel = level;
                console.error("Audio Error", error);
            }
        }

        async function unlockAudio() {
            if (audioUnlocked) return;
            await Promise.all([
                primeAudioElement(level1Alert),
                primeAudioElement(level2Alert),
                primeAudioElement(level3Alert)
            ]);
            audioUnlocked = true;

            if (pendingAlertLevel !== null) {
                const queuedLevel = pendingAlertLevel;
                pendingAlertLevel = null;
                playAlertForLevel(queuedLevel);
            }
        }

        function setupAudioUnlock() {
            const unlockHandler = () => {
                unlockAudio();
            };
            document.addEventListener('pointerdown', unlockHandler, { once: true, passive: true });
            document.addEventListener('touchstart', unlockHandler, { once: true, passive: true });
            document.addEventListener('keydown', unlockHandler, { once: true });
        }

        setupAudioUnlock();

        // --- Hotline Button Logic ---
        copyPhoneButtons.forEach((button) => {
            button.addEventListener('click', async (e) => {
                const phoneNumber = button.dataset.phone;
                if (!phoneNumber) return;

                if (isMobile) {
                    // On mobile: initiate direct phone call
                    window.location.href = `tel:${phoneNumber}`;
                } else {
                    // On desktop: copy to clipboard
                    e.preventDefault();
                    try {
                        await copyPhoneNumber(phoneNumber);
                        const label = button.dataset.label || 'Hotline';
                        alert(`${label} copied: ${phoneNumber}`);
                    } catch (error) {
                        console.error('Failed to copy hotline number:', error);
                        alert('Unable to copy number. Please copy it manually.');
                    }
                }
            });
        });

        // --- Phone Number Copy Function (for desktop fallback) ---
        async function copyPhoneNumber(phoneNumber) {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(phoneNumber);
                return;
            }
            const textArea = document.createElement('textarea');
            textArea.value = phoneNumber;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
        }

        // --- Share Button Logic ---
        if (shareBtn) {
            shareBtn.addEventListener('click', async () => {
                const shareData = {
                    title: 'Dumingag Flood Safety Guide',
                    text: 'Stay prepared with the official Dumingag flood safety guide.',
                    url: 'https://floodline-capstone.web.app'
                };
                try {
                    if (navigator.share) {
                        await navigator.share(shareData);
                    } else {
                        console.error('Sharing is not supported on this device.');
                    }
                } catch (err) {
                    console.error('Error sharing:', err);
                }
            });
        }

        // --- Modal Logic ---
        if (img) {
            img.onclick = function(){
                if (modal && modalImg && backButton) {
                    modal.style.display = "block";
                    modalImg.src = this.src;
                    backButton.style.display = "inline-flex";
                }
            }
        }
        if (backButton) {
            backButton.onclick = function() {
                if (modal && backButton) {
                    modal.style.display = "none";
                    backButton.style.display = "none";
                }
            }
        }

        function stopAllAlerts() {
            if (level1Alert) { level1Alert.pause(); level1Alert.currentTime = 0; }
            if (level2Alert) { level2Alert.pause(); level2Alert.currentTime = 0; }
            if (level3Alert) { level3Alert.pause(); level3Alert.currentTime = 0; }
        }

        // --- Firebase Realtime Listener ---
        const floodStatusRef = ref(db, 'flood_status');
        onValue(floodStatusRef, (snapshot) => {
            if (!snapshot.exists()) {
                setOfflineState();
                return;
            }

            const data = snapshot.val();
            const level = data.current_level;
            const timestamp = new Date();
            let levelDescription = "";
            let notificationTitle = "";

            if(pulseDot) pulseDot.style.display = 'block';
            if(statusCard) statusCard.className = 'status-card';

            setGaugeProgress(level);

            if (level == 0) {
                statusCard.classList.add('status-safe');
                levelText.innerText = "Level 0";
                levelDescription = "No Flooding Detected";
            } else if (level == 1) {
                statusCard.classList.add('status-warning');
                levelText.innerText = "Level 1";
                levelDescription = "Water is rising";
                notificationTitle = "Flood Alert: Level 1";
            } else if (level == 2) {
                statusCard.classList.add('status-critical');
                levelText.innerText = "Level 2";
                levelDescription = "EVACUATE WHILE YOU STILL CAN";
                notificationTitle = "Flood Alert: Level 2";
            } else if (level >= 3) {
                statusCard.classList.add('status-emergency');
                levelText.innerText = "Level 3";
                levelDescription = "EXTREME DANGER: SEEK HIGHER GROUND IMMEDIATELY";
                notificationTitle = "Flood Alert: Level 3";
            }
            if(levelDesc) levelDesc.innerText = levelDescription;

            if (lastUpdated) {
                lastUpdated.innerText = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            if (waterTrend) {
                if (previousLevel === null) { waterTrend.innerText = "Stable";
                } else if (level > previousLevel) { waterTrend.innerText = "Rising";
                } else if (level < previousLevel) { waterTrend.innerText = "Falling";
                } else { waterTrend.innerText = "Stable"; }
            }

            const isInitialSnapshot = previousLevel === null;
            if (!isInitialSnapshot && previousLevel !== level) {
                addLogEntry(level, levelDescription, timestamp);
                if (level === 0) stopAllAlerts();
                playAlertForLevel(level);
                // --- Trigger Notification ---
                if (level > 0 && window.Android) {
                    window.Android.showNotification(notificationTitle, levelDescription);
                }
            } else if (isInitialSnapshot && level > 0) {
                // Log non-zero startup states, but skip default Level 0 page-load noise.
                addLogEntry(level, levelDescription, timestamp);
                playAlertForLevel(level);
            }

            previousLevel = level;

        }, (error) => {
            console.error("Firebase Error:", error);
            setOfflineState();
        });

    } catch (e) {
        console.error("App Error:", e);
        setOfflineState();
    }
});
