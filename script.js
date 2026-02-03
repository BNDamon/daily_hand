// ==========================================
// 1. CONFIGURATION & STATE
// ==========================================
import { StatusBar } from '@capacitor/status-bar';
const STARTING_LIVES = 3;

const STATIONS = [
    { name: "BBC TECH", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
    { name: "NYT WORLD", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
    { name: "WIRED", url: "https://www.wired.com/feed/rss" }
];

const OFFLINE_NEWS = [
    { title: "AI Writes Best-Selling Novel", desc: "Critics are outraged as a chatbot wins the Pulitzer Prize for its novel 'The Electric Sheep'." },
    { title: "Coffee Prices Skyrocket", desc: "A global bean shortage has driven the price of a latte to $15. Office productivity plummets." },
    { title: "Mars Colony Delays", desc: "The first manned mission to Mars has been postponed due to a shortage of freeze-dried ice cream." },
    { title: "Retro Tech is Back", desc: "Gen Z is ditching smartphones for pagers and fax machines in a new 'unplugged' trend." },
    { title: "Flying Cars? Not Yet.", desc: "The highly anticipated flying car prototype crashed into a billboard during its debut flight." },
    { title: "Cat Elected Mayor", desc: "A small town in Alaska has re-elected 'Mr. Whiskers' for a third term. Approval ratings are high." },
    { title: "The End of Passwords", desc: "Biometric security is taking over. Soon you will need a retinal scan to open your fridge." },
    { title: "Virtual Reality Vacations", desc: "Why travel? New VR headsets offer 4K smells and weather simulation for a fraction of the cost." },
    { title: "Crypto Crash", desc: "The latest meme coin has lost 99% of its value overnight. Investors are baffled." },
    { title: "Smart Fridges Attack", desc: "A firmware update caused smart fridges to lock their doors, refusing to open until users diet." }
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

function bindInteraction(elementId, callback) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const action = (e) => {
        if (e.type === 'touchstart') e.preventDefault();
        callback();
    };
    el.addEventListener('click', action);
    el.addEventListener('touchstart', action, { passive: false });
}

// ==========================================
// 4. STORAGE & LIFECYCLE (THE FIX)
// ==========================================
function saveState() {
    localStorage.setItem('gameState', JSON.stringify(state));
}

// Called when player Dies (0 Hearts)
function triggerDeath() {
    // Keep High Score, Wipe everything else
    const highScore = localStorage.getItem('highScore');
    localStorage.clear();
    if(highScore) localStorage.setItem('highScore', highScore);
    location.reload();
}

// Called when player finishes the deck (Success)
function triggerNextDay() {
    // Reset Fatigue (Lives) and Counters, Keep XP and Items
    state.lives = state.inventory.includes('mug') ? STARTING_LIVES + 1 : STARTING_LIVES;
    state.articlesRead = 0;
    state.combo = 0;
    state.shredderCharge = 0;
    state.isGameOver = false;
    state.deck = []; // Clear deck to force reload
    state.goalReached = false;
    
    saveState();
    location.reload();
}

async function hideStatusBar() {
  await StatusBar.hide();
};

async function init() {
    await hideStatusBar();
    try {
        const savedData = localStorage.getItem('gameState');
        const highScoreData = localStorage.getItem('highScore');

        if (savedData) {
            const parsed = JSON.parse(savedData);
            state.xp = parsed.xp || 0;
            state.inventory = parsed.inventory || [];
            state.stationIndex = parsed.stationIndex || 0;
            // Lives reset on reload to prevent cheese, or load them if you prefer persistence mid-run
            state.lives = state.inventory.includes('mug') ? STARTING_LIVES + 1 : STARTING_LIVES; 
        }
        state.highScore = highScoreData ? parseInt(highScoreData) : 0;
        
        setupShop();
        setupDevTools();
        setupButtons();
        setupRadio();
        checkTutorial(); 

        // Difficulty scaling based on total XP
        const difficultyMultiplier = Math.floor(state.xp / 2000);
        state.goalTarget = 5 + (difficultyMultiplier * 3);
        const goalText = document.getElementById('goal-text');
        if (goalText) goalText.innerText = `READ ${state.goalTarget} ARTICLES`;

        await startNewRun();

    } catch (err) {
        console.error(err);
        document.getElementById('headline').innerText = "SYSTEM ERROR";
        document.getElementById('summary').innerText = "App Crash: " + err.message;
    }
}

async function startNewRun() {
    const currentStation = STATIONS[state.stationIndex];
    const radioLabel = document.getElementById('radio-label');
    if (radioLabel) radioLabel.innerText = currentStation.name;

    // 1. Clear the old deck so we don't see "Ghost Cards"
    state.deck = []; 
    try { render(); } catch(e) {} // Force "Clocking In" screen

    try {
        const proxyUrl = "https://api.allorigins.win/raw?url=";
        
        // --- I REMOVED THE TIMEOUT HERE ---
        // Now it will wait until the news actually loads, no matter how long it takes.
        const res = await fetch(proxyUrl + encodeURIComponent(currentStation.url));
        
        if (!res.ok) throw new Error("Network Error");
        
        const text = await res.text();
        const xml = new DOMParser().parseFromString(text, "text/xml");
        const items = Array.from(xml.querySelectorAll("item"));
        
        if (items.length === 0) throw new Error("Feed Empty");

        // SUCCESS: Real News found
        const rawItems = items.sort(() => 0.5 - Math.random()).slice(0, 30); 
        generateDeck(rawItems, currentStation.name, false);

    } catch (e) {
        console.log("Signal Lost! Switching to Backup Disk...");
        // Only load backup if it truly fails
        const backupItems = [...OFFLINE_NEWS, ...OFFLINE_NEWS, ...OFFLINE_NEWS].slice(0, 30);
        generateDeck(backupItems, "BACKUP DISK", true);
    }
}

function generateDeck(items, sourceName, isOffline) {
    state.deck = items.map(item => {
        const rand = Math.random();
        let trait = 'standard';
        let traitLabel = 'MORNING REPORT';
        
        if (rand < 0.05) { trait = 'coffee'; traitLabel = 'FRESH BREW'; }
        else if (rand < 0.20) { trait = 'breaking'; traitLabel = 'BREAKING'; }
        else if (rand < 0.40) { trait = 'trending'; traitLabel = 'TRENDING'; }
        else if (rand < 0.50) { trait = 'clickbait'; traitLabel = 'CLICKBAIT'; }
        else if (rand < 0.60) { trait = 'premium'; traitLabel = 'PREMIUM'; }

        let title, summary, link;

        if (isOffline) {
            title = item.title;
            summary = item.desc;
            link = ""; // Offline news has no link
        } else {
            // --- ROBUST XML PARSING ---
            const titleNode = item.querySelector("title");
            const descNode = item.querySelector("description");
            
            // This is the logic that works best for RSS feeds
            const linkNode = item.querySelector("link");
            let url = linkNode ? linkNode.textContent.trim() : "";
            
            // Backup: sometimes the link is in the 'nextSibling' if the parser gets confused
            if (!url && linkNode && linkNode.nextSibling) {
                url = linkNode.nextSibling.textContent.trim();
            }

            title = titleNode ? titleNode.textContent : "Unknown Title";
            summary = descNode ? descNode.textContent.replace(/<[^>]*>?/gm, '').trim() : "";
            link = url;
        }

        if (!summary || summary.length < 5) summary = "Click READ to view story...";
        else summary = summary.substring(0, 150) + "...";

        return {
            title: title,
            summary: summary,
            link: link || "#", // Fallback to # if absolutely nothing found
            source: sourceName,
            trait: trait,
            traitLabel: traitLabel
        };
    });

    state.isGameOver = false;
    saveState();
    render();
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
            state.deck.shift(); // Remove card
            
            // CHECK LIFE OR DEATH
            if (state.lives <= 0) {
                gameOver();
            } else if (state.deck.length === 0) {
                // Deck finished!
                gameOver();
            } else {
                render();
            }
        }, 300);
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

        // Stats Logic
        // --- UPDATED XP LOGIC (Harder Economy) ---
        state.articlesRead++;
        state.combo++;
        state.shredderCharge = Math.min(100, state.shredderCharge + 20);

        // 1. Lower Base XP from 10 to 3
        // 2. Lower Combo Multiplier from 0.1 (10%) to 0.05 (5%)
        let xpGain = 3 * (1 + (state.combo * 0.05)); 
        
        if (card.trait === 'trending' || card.trait === 'premium') xpGain *= 2; 
        if (state.inventory.includes('pen') && card.trait === 'trending') xpGain += 5; // Reduced pen bonus from 15 to 5

        state.lives = Math.min(state.lives, 5);
        state.xp += Math.max(1, Math.floor(xpGain)); // Ensure at least 1 XP

        // Daily Quota
        if (!state.goalReached) {
            const progress = (state.articlesRead / state.goalTarget) * 100;
            const progressBar = document.getElementById('goal-progress-bar');
            if (progressBar) progressBar.style.width = `${Math.min(100, progress)}%`;

            if (state.articlesRead >= state.goalTarget) {
                state.goalReached = true;
                
                // NERFED BONUS: Reduced base from 500 to 100
                const bonus = 100 + (Math.floor(state.xp / 2000) * 50);
                
                state.xp += bonus;
                showFeedback(`QUOTA MET! +${bonus} XP`, "#2980b9", true);
                playSound('good');
                
                const note = document.getElementById('daily-goal-note');
                if (note) note.style.background = "#55efc4";
                const txt = document.getElementById('goal-text');
                if (txt) txt.innerText = "QUOTA COMPLETE ✓";
            }
        }
        // --- END UPDATED LOGIC ---

        playSound('deal'); 
        const link = card.link;
        state.deck.shift(); // Remove card
        saveState();
        
        // CHECK COMPLETION
        if (state.deck.length === 0) {
            gameOver(); // Success!
        } else {
            render();
        }
        
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
            
            if (state.deck.length === 0) gameOver();
            else {
                saveState();
                render();
            }
        }, 300);
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
            
            if (state.deck.length === 0) gameOver();
            else {
                saveState();
                render();
            }
        }, 300);
    });
}

function setupRadio() {
    const knob = document.getElementById('radio-knob');
    if (knob) {
        knob.onclick = () => {
            if (state.deck.length === 0 || state.isGameOver) {
                playSound('bad');
                return; 
            }

            const cost = 25;
            if (state.xp < cost) {
                playSound('bad');
                const label = document.getElementById('radio-label');
                label.innerText = "LOCKED (25 XP)";
                label.style.color = "#d63031";
                setTimeout(() => {
                    label.innerText = STATIONS[state.stationIndex].name;
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
            label.innerText = "TUNING...";
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

    if(catalog) {
        catalog.onclick = () => {
            if (state.isGameOver) return; 
            playSound('click');
            modal.classList.remove('hidden');
            if(xpDisplay) xpDisplay.innerText = state.xp;
            updateShopButtons();
        };
    }

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
            } else {
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
            if (confirm("⚠ SYSTEM RESET ⚠\nWipe all data?")) {
                localStorage.clear();
                location.reload();
            }
        };
    }
}

// ==========================================
// 8. TUTORIAL
// ==========================================
function checkTutorial() {
    const tutorialSeen = localStorage.getItem('tutorialSeen');
    const modal = document.getElementById('tutorial-modal');
    const btn = document.getElementById('btn-close-tutorial');

    if (!modal || !btn) return;

    if (!tutorialSeen) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        const closeAction = (e) => {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            modal.style.display = 'none';
            modal.classList.add('hidden');
            localStorage.setItem('tutorialSeen', 'true');
            try { playSound('thud'); } catch(err) {}
        };
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
// 9. GAME OVER & RENDER (The Lifecycle Logic)
// ==========================================
async function gameOver() {
    state.isGameOver = true;
    playSound(state.lives <= 0 ? 'bad' : 'good');
    
    const previousBest = parseInt(localStorage.getItem('highScore')) || 0;
    const isNewRecord = state.xp > previousBest;
    if (isNewRecord) localStorage.setItem('highScore', state.xp.toString());

    // --- DETERMINE OUTCOME ---
    const isDeath = state.lives <= 0;
    const nextFunction = isDeath ? "triggerDeath()" : "triggerNextDay()";
    const buttonText = isDeath ? "TRY AGAIN (LOSE XP)" : "START NEXT SHIFT";
    const title = isDeath ? "⚠️ TERMINATED" : "🏁 SHIFT COMPLETE";
    const titleColor = isDeath ? "#d63031" : "#27ae60";

    const winScreen = document.getElementById('win-screen');
    const cardContainer = document.getElementById('card-container');
    const rankEl = document.getElementById('player-rank');
    const currentRank = rankEl ? rankEl.innerText : "INTERN";

    if (cardContainer) cardContainer.style.display = 'none';
    
    if (winScreen) {
        winScreen.style.display = 'flex'; 
        winScreen.classList.remove('hidden');

        winScreen.innerHTML = `
            <div class="summary-paper">
                <h1 class="win-title" style="color: ${titleColor}">${title}</h1>
                ${isNewRecord ? '<div style="color:#27ae60; font-weight:bold; margin-bottom:10px;">⭐ NEW PERSONAL BEST! ⭐</div>' : ''}
                
                <div class="summary-line">RANK: <b>${currentRank}</b></div>
                
                <div class="summary-stats">
                    <div class="stat">TOTAL XP: <b>${state.xp}</b></div>
                    <div class="stat">ARTICLES FILED: <b>${state.articlesRead}</b></div>
                    ${!isDeath ? '<div class="stat" style="color:#27ae60;">Inventory Saved ✓</div>' : ''}
                </div>

                <button onclick="${nextFunction}" class="stamp-button" style="margin-top:20px;">${buttonText}</button>
            </div>
        `;
    }
}

function render() {
    const cardContainer = document.getElementById('card-container');
    const winScreen = document.getElementById('win-screen');
    const sourceTag = document.getElementById('source');
    
    const skipBtn = document.getElementById('btn-skip');
    const readBtn = document.getElementById('btn-read');
    const pinBtn = document.getElementById('btn-pin');
    const shredBtn = document.getElementById('btn-shred');
    const shredBar = document.getElementById('shredder-bar');

    document.body.className = `sanity-${Math.max(1, Math.min(3, state.lives))}`;

    let lifeStr = "";
    for(let i=0; i<state.lives; i++) lifeStr += "❤️ ";
    document.getElementById('skip-tokens').innerText = lifeStr || "DEAD";
    document.getElementById('xp-count').innerHTML = `${state.xp} XP <br> READ: ${state.articlesRead}`;

    if (state.isGameOver) {
        cardContainer.style.display = 'none';
        winScreen.style.display = 'flex';
        winScreen.classList.remove('hidden');
        return; 
    } else {
        winScreen.style.display = 'none';
        winScreen.classList.add('hidden');
        
        // If deck is empty but game isn't over, we are LOADING news
        if (state.deck.length === 0) {
            document.getElementById('headline').innerText = "CLOCKING IN...";
            document.getElementById('summary').innerText = "Fetching reports. Please wait...";
            document.getElementById('byline').innerText = "SYSTEM BUSY";
            
            // Disable buttons while loading
            document.getElementById('btn-skip').disabled = true;
            document.getElementById('btn-read').disabled = true;
            document.getElementById('btn-pin').disabled = true;
            
            cardContainer.style.display = 'flex';
            return;
        }
    }

    const card = state.deck[0];
    
    // Reset animation
    cardContainer.className = "card"; 
    void cardContainer.offsetWidth; 
    cardContainer.classList.add('anim-deal'); 
    
    document.getElementById('headline').innerText = card.title;
    document.getElementById('summary').innerText = card.summary;
    document.getElementById('byline').innerText = "SOURCE: " + card.source;

    sourceTag.className = "source-tag"; 
    sourceTag.style = ""; 
    sourceTag.innerText = card.traitLabel; 
    sourceTag.style.opacity = "1";
    if (card.trait !== 'standard') sourceTag.classList.add('anim-stamp');

    skipBtn.disabled = false;
    readBtn.disabled = false;
    pinBtn.disabled = false;

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

    const rankEl = document.getElementById('player-rank');
    if (rankEl) {
        let title = "UNPAID INTERN";
        if (state.xp > 500) title = "JUNIOR BLOGGER";
        if (state.xp > 2000) title = "SENIOR WRITER";
        if (state.xp > 5000) title = "CHIEF EDITOR";
        if (state.xp > 15000) title = "MEDIA MOGUL";
        rankEl.innerText = title;
    }

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