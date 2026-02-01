// 1. CONFIGURATION
const STARTING_LIVES = 3;

// RSS FEEDS (The Stations)
const STATIONS = [
    { name: "BBC TECH", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
    { name: "NYT WORLD", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
    { name: "WIRED", url: "https://www.wired.com/feed/rss" }
];

// 2. GAME STATE
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
    shredderCharge: 0, // 0 to 100
    goalTarget: 5,
    goalReached: false
};

// --- AUDIO ENGINE ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'deal') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    } 
    else if (type === 'thud') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.3);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    }
    else if (type === 'good') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(600, now + 0.1);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    }
    else if (type === 'bad') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.2);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
    }
    else if (type === 'click') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now);
        gainNode.gain.setValueAtTime(0.05, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    }
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

// Helper to make buttons responsive on all devices
function bindInteraction(elementId, callback) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const action = (e) => {
        // Prevent "Ghost Clicks" (where the phone triggers both touch and click)
        if (e.type === 'touchstart') {
            e.preventDefault();
        }
        callback();
    };

    el.addEventListener('click', action);
    el.addEventListener('touchstart', action, { passive: false });
}

function showFeedback(text, color, isPositive = true) {
    playFeedbackSound(isPositive); // Trigger the blip or thud
    
    const feedback = document.createElement('div');
    feedback.innerText = text;
    feedback.className = 'floating-feedback';
    feedback.style.color = color;
    
    const area = document.querySelector('.game-area');
    area.appendChild(feedback);

    setTimeout(() => feedback.remove(), 1000);
}

function playFeedbackSound(isPositive) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    osc.type = 'sine';
    
    if (isPositive) {
        // High-pitched "blip" for XP/Heals
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
    } else {
        // Low "thud" for damage/traps
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
    }

    gainNode.gain.setValueAtTime(0.1, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
}

// 3. INITIALIZATION
async function init() {
    const savedData = localStorage.getItem('gameState');
    const highScoreData = localStorage.getItem('highScore');

    if (savedData) {
        const parsed = JSON.parse(savedData);
        state.xp = parsed.xp || 0;
        state.inventory = parsed.inventory || [];
        state.pinnedArticle = parsed.pinnedArticle || null;
        state.stationIndex = parsed.stationIndex || 0;
        state.shredderCharge = parsed.shredderCharge || 0;
    }

    // Set high score from local storage
    state.highScore = highScoreData ? parseInt(highScoreData) : 0;

    // Standard Reset for new shift
    state.lives = state.inventory.includes('mug') ? STARTING_LIVES + 1 : STARTING_LIVES;
    state.articlesRead = 0;
    state.combo = 0;
    state.isGameOver = false;
    
    // Set Goal Target based on difficulty
    const difficultyMultiplier = Math.floor(state.xp / 2000);
    state.goalTarget = 5 + (difficultyMultiplier * 3);
    state.goalReached = false;
    const goalText = document.getElementById('goal-text');
    if (goalText) goalText.innerText = `READ ${state.goalTarget} ARTICLES`;

    setupShop();
    setupDevTools();
    setupButtons();
    setupRadio();

    // CHECK TUTORIAL (Cleaned up logic)
    checkTutorial();

    await startNewRun();
}

// 4. THE DEALER
async function startNewRun() {
    const currentStation = STATIONS[state.stationIndex];
    const radioLabel = document.getElementById('radio-label');
    if (radioLabel) radioLabel.innerText = currentStation.name;

    try {
        const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(currentStation.url)}`);
        const text = await res.text();
        const xml = new DOMParser().parseFromString(text, "text/xml");
        const items = Array.from(xml.querySelectorAll("item"));
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

            // Safe parsing
            const title = item.querySelector("title") ? item.querySelector("title").textContent : "No Title";
            const desc = item.querySelector("description") ? item.querySelector("description").textContent.replace(/<[^>]*>?/gm, '').substring(0, 150) + "..." : "No Summary";
            const link = item.querySelector("link") ? item.querySelector("link").textContent : "#";

            return {
                title: title,
                summary: desc,
                link: link,
                source: currentStation.name,
                trait: trait,
                traitLabel: traitLabel
            };
        });

        saveState();
        render();
    } catch (e) {
        console.error(e);
        document.getElementById('headline').innerText = "Signal Lost. Check Radio.";
    }
}

// 5. BUTTON & GAMEPLAY LOGIC
function setupButtons() {
    // 1. BANISH (SKIP)
    bindInteraction('btn-skip', () => {
        if (state.deck.length === 0 || state.isGameOver) return;
        
        const card = state.deck[0];
        const isFreeSkip = card.trait === 'clickbait';

        // Visual/Audio Feedback
        if (isFreeSkip) {
            showFeedback("SAFE DISPOSAL!", "#00b894", true);
        } else {
            showFeedback("-1 SANITY ❤️", "#d63031", false);
        }
        
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

    // 2. READ
    bindInteraction('btn-read', () => {
        if (state.deck.length === 0 || state.isGameOver) return;
        
        const card = state.deck[0];
        
        // Feedback logic
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
        
        // Premium Lock logic
        if (card.trait === 'premium') {
            const cost = 50;
            if (state.xp < cost) {
                playSound('bad');
                alert("NOT ENOUGH XP TO UNLOCK!");
                return;
            }
            state.xp -= cost;
        }

        // Standard Rewards
        state.articlesRead++;
        state.combo++;
        state.shredderCharge = Math.min(100, state.shredderCharge + 20);

        let xpGain = 10 * (1 + (state.combo * 0.1)); 
        if (card.trait === 'trending' || card.trait === 'premium') xpGain *= 2; 
        if (state.inventory.includes('pen') && card.trait === 'trending') xpGain += 15;

        state.lives = Math.min(state.lives, 5);
        state.xp += Math.floor(xpGain);

        // Daily Quota Tracking
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

    // 3. PIN (SAVE)
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

    // 4. SHREDDER
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

// 6. RENDER ENGINE (Mobile Optimized)
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
        
        // Game Over Screen Logic
        document.querySelector('.win-title').innerText = state.lives <= 0 ? "BURNOUT" : "DESK CLEAR";
        document.querySelector('#win-screen p').innerHTML = `
            SHIFT ENDED.<br>
            ARTICLES PROCESSED: <b>${state.articlesRead}</b><br>
            TOTAL XP: ${state.xp}
            <br><br>
            <button onclick="location.reload()" style="background:#2c3e50; color:white; padding:10px; cursor:pointer; border:none; font-family:inherit; font-weight:bold;">START NEW SHIFT</button>
        `;
        return;
    } else {
        cardContainer.style.display = 'flex';
        winScreen.style.display = 'none';
    }

    const card = state.deck[0];
    
    // Animation
    cardContainer.className = "card"; 
    void cardContainer.offsetWidth; 
    cardContainer.classList.add('anim-deal'); 
    playSound('deal'); 

    document.getElementById('headline').innerText = card.title;
    document.getElementById('summary').innerText = card.summary;
    document.getElementById('byline').innerText = "SOURCE: " + card.source;

    // Traits
    sourceTag.className = "source-tag"; 
    sourceTag.style = ""; 
    sourceTag.innerText = card.traitLabel; 
    if (card.trait !== 'standard') sourceTag.classList.add('anim-stamp');
    if (card.trait !== 'standard') playSound('thud');

    // --- MOBILE BUTTON TEXT UPDATES ---
    // Banish Button
    if (card.trait === 'clickbait') {
        skipBtn.innerText = "BANISH (SAFE)";
        skipBtn.style.color = "#00b894";
    } else {
        skipBtn.innerText = "BANISH -1 ❤️";
        skipBtn.style.color = "#d63031";
    }

    // Pin Button
    pinBtn.innerText = "PIN (FREE)";

    // Read Button
    readBtn.disabled = false;
    readBtn.style.background = "";
    
    if (card.trait === 'clickbait') {
        readBtn.innerText = "RISK IT? -1 ❤️";
        readBtn.style.background = "#fd79a8";
        sourceTag.classList.add('trait-clickbait');
    }
    else if (card.trait === 'premium') {
        sourceTag.classList.add('trait-premium');
        if (state.xp >= 50) {
            readBtn.innerText = "UNLOCK (-50 XP)";
            readBtn.style.background = "#ffeaa7";
        } else {
            readBtn.innerText = "LOCKED (NEED 50 XP)";
            readBtn.disabled = true;
            readBtn.style.background = "#dfe6e9";
        }
    }
    else if (card.trait === 'breaking') {
        readBtn.innerText = "HEAL +1 ❤️";
        readBtn.style.background = "#fab1a0";
        sourceTag.style.color = "#d63031"; sourceTag.style.borderColor = "#d63031";
    }
    else if (card.trait === 'coffee') {
        readBtn.innerText = "DRINK +2 ❤️";
        readBtn.style.background = "#55efc4";
        sourceTag.style.color = "#6D214F"; sourceTag.style.borderColor = "#6D214F";
    }
    else if (card.trait === 'trending') {
        readBtn.innerText = "READ 2x XP";
        readBtn.style.background = "#f1c40f";
        sourceTag.style.color = "#f39c12"; sourceTag.style.borderColor = "#f1c40f";
    }
    else {
        readBtn.innerText = "READ"; 
        sourceTag.style.color = "#2f3542"; sourceTag.style.borderColor = "#2f3542";
    }

    // Rank Update
    const rankEl = document.getElementById('player-rank');
    if (rankEl) {
        let title = "UNPAID INTERN";
        if (state.xp > 500) title = "JUNIOR BLOGGER";
        if (state.xp > 2000) title = "SENIOR WRITER";
        if (state.xp > 5000) title = "CHIEF EDITOR";
        if (state.xp > 15000) title = "MEDIA MOGUL";
        rankEl.innerText = title;
    }

    // Shredder Update
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

// 7. SHOP & DEV TOOLS
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
            if (confirm("⚠ SYSTEM RESET ⚠\n\nThis will wipe your XP, Inventory, and current Run.\nAre you sure?")) {
                localStorage.clear(); // Clears phone data
                location.reload();
            }
        };
    }
}

// 8. TUTORIAL (ROBUST MOBILE FIX)
function checkTutorial() {
    const tutorialSeen = localStorage.getItem('tutorialSeen');
    const modal = document.getElementById('tutorial-modal');
    const btn = document.getElementById('btn-close-tutorial');

    if (!modal || !btn) return;

    if (!tutorialSeen) {
        // 1. Force Visible (Override CSS)
        modal.classList.remove('hidden');
        modal.style.display = 'flex'; 

        const closeAction = (e) => {
            // Stop the event from bubbling up or firing twice
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }

            console.log("Closing Tutorial..."); 

            // 2. Force Hidden
            modal.style.display = 'none';
            modal.classList.add('hidden');
            
            // 3. Save & Sound
            localStorage.setItem('tutorialSeen', 'true');
            
            // Wrap sound in try/catch to prevent crash
            try { playSound('thud'); } catch(err) { console.log(err); }
        };

        // Remove old listeners to be safe (clone node method)
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        // Attach fresh listeners
        newBtn.addEventListener('click', closeAction);
        newBtn.addEventListener('touchstart', closeAction, { passive: false }); 
        
    } else {
        // Already seen
        modal.style.display = 'none';
        modal.classList.add('hidden');
    }
}

function saveState() {
    localStorage.setItem('gameState', JSON.stringify(state));
}

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

        document.getElementById('restart-shift-btn').onclick = () => {
            resetGameState();
            location.reload(); 
        };
    }
}