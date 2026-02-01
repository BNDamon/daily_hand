// ==========================================
// 1. CONFIGURATION & STATE
// ==========================================
const STARTING_LIVES = 3;

const STATIONS = [
    { name: "BBC TECH", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
    { name: "NYT WORLD", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
    { name: "WIRED", url: "https://www.wired.com/feed/rss" }
];

let state = {
    deck: [],
    lives: STARTING_LIVES,
    articlesRead: 0,
    xp: 0,
    combo: 0,
    inventory: [],
    pinnedArticle: null,
    isGameOver: false,
    stationIndex: 0,
    shredderCharge: 0,
    goalTarget: 5,
    goalReached: false,
    highScore: 0
};

// ==========================================
// 2. AUDIO ENGINE
// ==========================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'deal') {
        osc.type = 'triangle'; osc.frequency.setValueAtTime(800, now); osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gainNode.gain.setValueAtTime(0.1, now); gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'thud') {
        osc.type = 'square'; osc.frequency.setValueAtTime(100, now); osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.3);
        gainNode.gain.setValueAtTime(0.2, now); gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    } else if (type === 'good') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(400, now); osc.frequency.linearRampToValueAtTime(600, now + 0.1);
        gainNode.gain.setValueAtTime(0.1, now); gainNode.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    } else if (type === 'bad') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, now); osc.frequency.linearRampToValueAtTime(100, now + 0.2);
        gainNode.gain.setValueAtTime(0.2, now); gainNode.gain.linearRampToValueAtTime(0, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
    } else if (type === 'click') {
        osc.type = 'square'; osc.frequency.setValueAtTime(800, now);
        gainNode.gain.setValueAtTime(0.05, now); gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
    }
}

function playFeedbackSound(isPositive) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    
    if (isPositive) {
        osc.type = 'sine'; osc.frequency.setValueAtTime(800, now); osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
    } else {
        osc.type = 'triangle'; osc.frequency.setValueAtTime(200, now); osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
    }
    gainNode.gain.setValueAtTime(0.1, now); gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now); osc.stop(now + 0.1);
}

// ==========================================
// 3. UI HELPERS
// ==========================================
function showFeedback(text, color, isPositive = true) {
    playFeedbackSound(isPositive);
    const feedback = document.createElement('div');
    feedback.innerText = text;
    feedback.className = 'floating-feedback';
    feedback.style.color = color;
    const area = document.querySelector('.game-area');
    if (area) area.appendChild(feedback);
    setTimeout(() => feedback.remove(), 1000);
}

// Helper: Makes buttons respond instantly on touch screens
function bindInteraction(elementId, callback) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const action = (e) => {
        if (e.type === 'touchstart') e.preventDefault(); // Stop double-firing
        callback();
    };
    el.addEventListener('click', action);
    el.addEventListener('touchstart', action, { passive: false });
}

// ==========================================
// 4. STORAGE & INITIALIZATION
// ==========================================
function saveState() {
    localStorage.setItem('gameState', JSON.stringify(state));
}

function resetGameState() {
    state.lives = state.inventory.includes('mug') ? STARTING_LIVES + 1 : STARTING_LIVES;
    state.articlesRead = 0;
    state.xp = 0;
    state.combo = 0;
    state.shredderCharge = 0;
    state.isGameOver = false;
    saveState();
}

async function init() {
    try {
        // 1. Mobile Safe Load
        const savedData = localStorage.getItem('gameState');
        const highScoreData = localStorage.getItem('highScore');

        if (savedData) {
            const parsed = JSON.parse(savedData);
            state.xp = parsed.xp || 0;
            state.inventory = parsed.inventory || [];
            state.stationIndex = parsed.stationIndex || 0;
        }
        state.highScore = highScoreData ? parseInt(highScoreData) : 0;
        
        // 2. Setup UI
        setupShop();
        setupDevTools();
        setupButtons();
        setupRadio();
        
        // 3. Trigger Tutorial (Crucial: Run before network fetch)
        checkTutorial(); 

        // 4. Update Goal
        const difficultyMultiplier = Math.floor(state.xp / 2000);
        state.goalTarget = 5 + (difficultyMultiplier * 3);
        const goalText = document.getElementById('goal-text');
        if (goalText) goalText.innerText = `READ ${state.goalTarget} ARTICLES`;

        // 5. Start Game
        await startNewRun();

    } catch (err) {
        console.error(err);
        document.getElementById('headline').innerText = "SYSTEM ERROR";
        document.getElementById('summary').innerText = "App Crash: " + err.message;
    }
}

// ==========================================
// 5. NETWORK & DECK LOGIC
// ==========================================
async function startNewRun() {
    const currentStation = STATIONS[state.stationIndex];
    const radioLabel = document.getElementById('radio-label');
    if (radioLabel) radioLabel.innerText = currentStation.name;

    try {
        // CORS Proxy for Mobile Web
        const proxyUrl = "https://api.allorigins.win/raw?url=";
        const res = await fetch(proxyUrl + encodeURIComponent(currentStation.url));
        
        if (!res.ok) throw new Error("Network Error");
        
        const text = await res.text();
        const xml = new DOMParser().parseFromString(text, "text/xml");
        const items = Array.from(xml.querySelectorAll("item"));
        
        if (items.length === 0) throw new Error("Feed Empty");

        const rawItems = items.sort(() => 0.5 - Math.random()).slice(0, 30); 

        state.deck = rawItems.map(item => {
            const rand = Math.random();
            let trait = 'standard';
            let traitLabel = 'MORNING REPORT';
            
            if (rand < 0.05) { trait = 'coffee'; traitLabel = 'FRESH BREW'; }
            else if (rand < 0.20) { trait = 'breaking'; traitLabel = 'BREAKING'; }
            else if (rand < 0.40) { trait = 'trending'; traitLabel = 'TRENDING'; }
            else if (rand < 0.50) { trait = 'clickbait'; traitLabel = 'CLICKBAIT'; }
            else if (rand < 0.60) { trait = 'premium'; traitLabel = 'PREMIUM'; }

            const titleNode = item.querySelector("title");
            const descNode = item.querySelector("description");
            const linkNode = item.querySelector("link");

            return {
                title: titleNode ? titleNode.textContent : "Unknown Title",
                summary: descNode ? descNode.textContent.replace(/<[^>]*>?/gm, '').substring(0, 150) + "..." : "No summary.",
                link: linkNode ? linkNode.textContent : "#",
                source: currentStation.name,
                trait, traitLabel
            };
        });

        saveState();
        render(); // Clear "Initializing..."

    } catch (e) {
        console.error(e);
        document.getElementById('headline').innerText = "SIGNAL LOST";
        document.getElementById('summary').innerText = "Could not fetch news. Check internet connection.";
    }
}

// ==========================================
// 6. GAMEPLAY INTERACTIONS
// ==========================================
function setupButtons() {
    // BANISH
    bindInteraction('btn-skip', () => {
        if (state.deck.length === 0 || state.isGameOver) return;
        
        const card = state.deck[0];
        const isFreeSkip = card.trait === 'clickbait';

        if (isFreeSkip) showFeedback("SAFE DISPOSAL!", "#00b894", true);
        else showFeedback("-1 SANITY ❤️", "#d63031", false);
        
        playSound(isFreeSkip ? 'deal' : 'bad'); 
        
        const cardEl = document.getElementById('card-container');
        cardEl.classList.add('anim-banish');

        setTimeout(() => {
            if (!isFreeSkip) state.lives--; 
            state.combo = 0; 
            state.deck.shift();
            if (state.lives <= 0) gameOver();
            else render();
        }, 500);
    });

    // READ
    bindInteraction('btn-read', () => {
        if (state.deck.length === 0 || state.isGameOver) return;
        const card = state.deck[0];
        
        // Feedbacks
        if (card.trait === 'clickbait') {
            showFeedback("TRAPPED! -1 ❤️", "#d63031", false);
            state.lives--;
            if (state.lives <= 0) { gameOver(); return; }
        } else if (card.trait === 'coffee') {
            showFeedback("+2 HEARTS ❤️❤️", "#00b894", true);
            state.lives += 2;
            playSound('good');
        } else if (card.trait === 'breaking') {
            showFeedback("+1 HEART ❤️", "#00b894", true);
            state.lives++;
            playSound('good');
        } else {
            showFeedback("+XP & COMBO!", "#0984e3", true);
        }
        
        // Premium Lock
        if (card.trait === 'premium') {
            const cost = 50;
            if (state.xp < cost) {
                playSound('bad');
                alert("NOT ENOUGH XP TO UNLOCK!");
                return;
            }
            state.xp -= cost;
        }

        // Logic
        state.articlesRead++;
        state.combo++;
        state.shredderCharge = Math.min(100, state.shredderCharge + 20);

        let xpGain = 10 * (1 + (state.combo * 0.1)); 
        if (card.trait === 'trending' || card.trait === 'premium') xpGain *= 2; 
        if (state.inventory.includes('pen') && card.trait === 'trending') xpGain += 15;

        state.lives = Math.min(state.lives, 5);
        state.xp += Math.floor(xpGain);

        // Daily Quota
        if (!state.goalReached) {
            const progress = (state.articlesRead / state.goalTarget) * 100;
            const progressBar = document.getElementById('goal-progress-bar');
            if (progressBar) progressBar.style.width = `${Math.min(100, progress)}%`;

            if (state.articlesRead >= state.goalTarget) {
                state.goalReached = true;
                const bonus = 500 + (Math.floor(state.xp / 2000) * 250);
                state.xp += bonus;
                showFeedback(`QUOTA MET! +${bonus} XP`, "#2980b9", true);
                playSound('good');
                
                const note = document.getElementById('daily-goal-note');
                if (note) note.style.background = "#55efc4";
                const txt = document.getElementById('goal-text');
                if (txt) txt.innerText = "QUOTA COMPLETE ✓";
            }
        }

        playSound('deal'); 
        const link = card.link;
        state.deck.shift();
        saveState();
        render();
        window.open(link, '_blank'); 
    });

    // PIN
    bindInteraction('btn-pin', () => {
        if (state.deck.length === 0 || state.isGameOver) return;
        playSound('deal');
        const cardEl = document.getElementById('card-container');
        cardEl.classList.add('anim-pin');
        setTimeout(() => {
            state.pinnedArticle = state.deck[0];
            state.deck.shift();
            saveState();
            render();
        }, 500);
    });

    // SHREDDER
    bindInteraction('btn-shred', () => {
        if (state.deck.length === 0 || state.shredderCharge < 100) return;
        playSound('deal'); 
        const cardEl = document.getElementById('card-container');
        cardEl.classList.add('anim-shred');
        setTimeout(() => {
            state.shredderCharge = 0; 
            state.deck.shift(); 
            saveState();
            render();
        }, 500);
    });
}

function setupRadio() {
    const knob = document.getElementById('radio-knob');
    if (knob) {
        knob.onclick = () => {
            // Stop if empty
            if (state.deck.length === 0 || state.isGameOver) {
                playSound('bad');
                const label = document.getElementById('radio-label');
                label.innerText = "SIGNAL DEAD";
                label.style.color = "#d63031";
                return; 
            }

            const cost = 25;
            if (state.xp < cost) {
                playSound('bad');
                const label = document.getElementById('radio-label');
                const originalText = label.innerText;
                label.innerText = "LOCKED (NEED 25 XP)";
                label.style.color = "#d63031";
                setTimeout(() => {
                    label.innerText = originalText;
                    label.style.color = "";
                }, 1000);
                return;
            }

            state.xp -= cost;
            state.combo = 0; 
            state.shredderCharge = 0; 
            playSound('click');

            state.stationIndex = (state.stationIndex + 1) % STATIONS.length;
            knob.style.transform = `rotate(${state.stationIndex * 45}deg)`;
            
            const label = document.getElementById('radio-label');
            label.innerText = `TUNING... (-${cost} XP)`;
            label.style.color = "#d63031"; 

            setTimeout(() => {
                label.innerText = STATIONS[state.stationIndex].name;
                label.style.color = ""; 
            }, 1000);

            startNewRun();
        };
    }
}

// ==========================================
// 7. SHOP & DEV TOOLS
// ==========================================
function setupShop() {
    const catalog = document.getElementById('shop-catalog');
    const modal = document.getElementById('shop-modal');
    const closeBtn = document.getElementById('close-shop');
    const xpDisplay = document.getElementById('shop-xp');

    if(catalog) catalog.onclick = () => {
        playSound('click');
        modal.classList.remove('hidden');
        if(xpDisplay) xpDisplay.innerText = state.xp;
        updateShopButtons();
    };

    if(closeBtn) closeBtn.onclick = () => {
        modal.classList.add('hidden');
        render(); 
    };

    document.querySelectorAll('.buy-btn').forEach(btn => {
        btn.onclick = (e) => {
            const cost = parseInt(e.target.dataset.cost);
            const id = e.target.dataset.id;
            if (state.xp >= cost && !state.inventory.includes(id)) {
                playSound('good');
                state.xp -= cost;
                state.inventory.push(id);
                saveState();
                updateShopButtons();
                if(xpDisplay) xpDisplay.innerText = state.xp;
                alert("ITEM ACQUIRED! Effect active on next run.");
            } else if (state.xp < cost) {
                playSound('bad');
            }
        };
    });
}

function updateShopButtons() {
    document.querySelectorAll('.buy-btn').forEach(btn => {
        const id = btn.dataset.id;
        const cost = parseInt(btn.dataset.cost);
        if (state.inventory.includes(id)) {
            btn.innerText = "OWNED";
            btn.disabled = true;
            btn.style.background = "#333";
        } else if (state.xp < cost) {
            btn.disabled = true;
            btn.style.opacity = "0.5";
        } else {
            btn.disabled = false;
            btn.style.opacity = "1";
        }
    });
}

function setupDevTools() {
    const devBtn = document.getElementById('dev-reset-btn');
    if (devBtn) {
        devBtn.onclick = () => {
            playSound('bad');
            if (confirm("⚠ SYSTEM RESET ⚠\n\nWipe all data?")) {
                localStorage.clear();
                location.reload();
            }
        };
    }
}

// ==========================================
// 8. TUTORIAL (ROBUST FIX)
// ==========================================
function checkTutorial() {
    const tutorialSeen = localStorage.getItem('tutorialSeen');
    const modal = document.getElementById('tutorial-modal');
    const btn = document.getElementById('btn-close-tutorial');

    if (!modal || !btn) return;

    if (!tutorialSeen) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex'; // Force visible

        const closeAction = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            modal.style.display = 'none';
            modal.classList.add('hidden');
            localStorage.setItem('tutorialSeen', 'true');
            try { playSound('thud'); } catch(err) {}
        };

        // Replace button to clear old listeners
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', closeAction);
        newBtn.addEventListener('touchstart', closeAction, { passive: false }); 
        
    } else {
        modal.style.display = 'none';
        modal.classList.add('hidden');
    }
}

// ==========================================
// 9. GAME OVER & RENDER
// ==========================================
async function gameOver() {
    state.isGameOver = true;
    playSound('bad');
    
    const previousBest = parseInt(localStorage.getItem('highScore')) || 0;
    const isNewRecord = state.xp > previousBest;

    if (isNewRecord) {
        localStorage.setItem('highScore', state.xp.toString());
    }

    const winScreen = document.getElementById('win-screen');
    const cardContainer = document.getElementById('card-container');
    
    if (cardContainer) cardContainer.style.display = 'none';
    if (winScreen) {
        winScreen.style.display = 'block';

        const title = state.lives <= 0 ? "⚠️ TERMINATED" : "🏁 SHIFT COMPLETE";
        const rankEl = document.getElementById('player-rank');
        const currentRank = rankEl ? rankEl.innerText : "INTERN";

        winScreen.innerHTML = `
            <div class="summary-paper">
                <h1 class="win-title">${title}</h1>
                ${isNewRecord ? '<div style="color:#27ae60; font-weight:bold; margin-bottom:10px;">⭐ NEW PERSONAL BEST! ⭐</div>' : ''}
                <div class="summary-line">RANK: <b>${currentRank}</b></div>
                <div class="summary-stats">
                    <div class="stat">XP EARNED: <b>${state.xp}</b></div>
                    <div class="stat">PERSONAL BEST: <b>${isNewRecord ? state.xp : previousBest}</b></div>
                    <div class="stat">ARTICLES READ: <b>${state.articlesRead}</b></div>
                </div>
                <button id="restart-shift-btn" class="stamp-button" style="margin-top:20px;">START NEW SHIFT</button>
            </div>
        `;

        // Bind reset button
        const resetBtn = document.getElementById('restart-shift-btn');
        const resetAction = (e) => {
             if(e) e.preventDefault();
             resetGameState();
             location.reload(); 
        };
        resetBtn.addEventListener('click', resetAction);
        resetBtn.addEventListener('touchstart', resetAction);
    }
}

function render() {
    const cardContainer = document.getElementById('card-container');
    const winScreen = document.getElementById('win-screen');
    const sourceTag = document.getElementById('source');
    
    // UI Elements
    const skipBtn = document.getElementById('btn-skip');
    const readBtn = document.getElementById('btn-read');
    const pinBtn = document.getElementById('btn-pin');
    const shredBtn = document.getElementById('btn-shred');
    const shredBar = document.getElementById('shredder-bar');

    // Atmosphere
    document.body.className = `sanity-${Math.max(1, Math.min(3, state.lives))}`;

    // HUD
    let lifeStr = "";
    for(let i=0; i<state.lives; i++) lifeStr += "❤️ ";
    document.getElementById('skip-tokens').innerText = lifeStr || "DEAD";
    document.getElementById('xp-count').innerHTML = `${state.xp} XP <br> READ: ${state.articlesRead}`;

    if (state.isGameOver || state.deck.length === 0) {
        cardContainer.style.display = 'none';
        winScreen.style.display = 'block';
        if (!state.isGameOver) gameOver(); // Handle empty deck finish
        return;
    } else {
        cardContainer.style.display = 'flex';
        winScreen.style.display = 'none';
    }

    const card = state.deck[0];
    cardContainer.className = "card"; 
    void cardContainer.offsetWidth; // Trigger reflow
    cardContainer.classList.add('anim-deal'); 
    
    document.getElementById('headline').innerText = card.title;
    document.getElementById('summary').innerText = card.summary;
    document.getElementById('byline').innerText = "SOURCE: " + card.source;

    // Traits
    sourceTag.className = "source-tag"; 
    sourceTag.style = ""; 
    sourceTag.innerText = card.traitLabel; 
    if (card.trait !== 'standard') sourceTag.classList.add('anim-stamp');

    // Mobile Text Updates
    if (card.trait === 'clickbait') {
        skipBtn.innerText = "BANISH (SAFE)";
        skipBtn.style.color = "#00b894";
        readBtn.innerText = "RISK IT? -1 ❤️";
        readBtn.style.background = "#fd79a8";
        sourceTag.classList.add('trait-clickbait');
    } else {
        skipBtn.innerText = "BANISH -1 ❤️";
        skipBtn.style.color = "#d63031";
        
        if (card.trait === 'premium') {
            sourceTag.classList.add('trait-premium');
            if (state.xp >= 50) {
                readBtn.innerText = "UNLOCK (-50 XP)";
                readBtn.style.background = "#ffeaa7";
                readBtn.disabled = false;
            } else {
                readBtn.innerText = "LOCKED (NEED 50 XP)";
                readBtn.disabled = true;
                readBtn.style.background = "#dfe6e9";
            }
        } else if (card.trait === 'breaking') {
            readBtn.innerText = "HEAL +1 ❤️";
            readBtn.style.background = "#fab1a0";
            readBtn.disabled = false;
            sourceTag.style.color = "#d63031"; sourceTag.style.borderColor = "#d63031";
        } else if (card.trait === 'coffee') {
            readBtn.innerText = "DRINK +2 ❤️";
            readBtn.style.background = "#55efc4";
            readBtn.disabled = false;
            sourceTag.style.color = "#6D214F"; sourceTag.style.borderColor = "#6D214F";
        } else if (card.trait === 'trending') {
            readBtn.innerText = "READ 2x XP";
            readBtn.style.background = "#f1c40f";
            readBtn.disabled = false;
            sourceTag.style.color = "#f39c12"; sourceTag.style.borderColor = "#f1c40f";
        } else {
            readBtn.innerText = "READ"; 
            readBtn.style.background = "";
            readBtn.disabled = false;
            sourceTag.style.color = "#2f3542"; sourceTag.style.borderColor = "#2f3542";
        }
    }
    pinBtn.innerText = "PIN (FREE)";

    // Rank
    const rankEl = document.getElementById('player-rank');
    if (rankEl) {
        let title = "UNPAID INTERN";
        if (state.xp > 500) title = "JUNIOR BLOGGER";
        if (state.xp > 2000) title = "SENIOR WRITER";
        if (state.xp > 5000) title = "CHIEF EDITOR";
        if (state.xp > 15000) title = "MEDIA MOGUL";
        rankEl.innerText = title;
    }

    // Shredder
    if (shredBar && shredBtn) {
        shredBar.style.width = `${state.shredderCharge}%`;
        if (state.shredderCharge >= 100) {
            shredBar.classList.add('charge-ready');
            shredBtn.disabled = false;
            shredBtn.innerText = "SHRED IT!";
            shredBtn.style.background = "#d63031"; 
        } else {
            shredBar.classList.remove('charge-ready');
            shredBtn.disabled = true;
            shredBtn.innerText = `CHARGING (${state.shredderCharge}%)`;
            shredBtn.style.background = "#636e72"; 
        }
    }

    // Notepad & Folder
    document.getElementById('deck-count').innerText = state.deck.length;
    document.getElementById('combo-display').innerText = "x" + (1 + (state.combo*0.1)).toFixed(1);

    const pinnedContainer = document.getElementById('pinned-container');
    if (pinnedContainer) {
        pinnedContainer.style.display = 'block'; 
        if (state.pinnedArticle) {
            pinnedContainer.innerHTML = `SAVED: <span id="saved-link" style="cursor:pointer; border-bottom:1px solid #333;">${state.pinnedArticle.title}</span>`;
            document.getElementById('saved-link').onclick = () => window.open(state.pinnedArticle.link, '_blank');
        } else {
            pinnedContainer.innerHTML = `<span style="opacity: 0.4; font-style: italic;">(FOLDER EMPTY)</span>`;
        }
    }
}

// 10. LAUNCH
init();