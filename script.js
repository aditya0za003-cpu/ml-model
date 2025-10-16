document.addEventListener("DOMContentLoaded", async () => {
  const startScreen = document.getElementById("start-screen");
  const startBtn = document.getElementById("start-btn");
  const app = document.getElementById("app");
  const clickArea = document.querySelector(".click-area");
  const displayText = document.querySelector(".display-text");
  const scoreElements = document.querySelectorAll(".score span");
  const dingSound = document.getElementById("ding");

  const attemptsEl = document.getElementById("attempts");
  const bestEl = document.getElementById("best");
  const averageEl = document.getElementById("average");

  const finalScreen = document.getElementById("final-screen");
  const segmentScores = document.getElementById("segment-scores");
  const finalMessage = document.getElementById("final-message");
  const restartBtn = document.getElementById("restart-btn");

  const colors = ["#009578","#0047AB","#FF8C00","#800080","#00CED1","#FFD700","#FF1493","#32CD32","#FF4500","#8B0000","#1E90FF","#00FF7F"];

  let scoreHistory = [];
  let currentDifficulty = 1; // initial difficulty
  let waitingForClick = false;
  let sessionActive = false;
  let countdownTimer;
  let remainingTime = 30;
  let lastScoresIndex = 0;

  const clockEl = document.createElement("div");
  clockEl.style.position = "absolute";
  clockEl.style.top = "10px";
  clockEl.style.right = "10px";
  clockEl.style.fontSize = "18px";
  clockEl.style.fontWeight = "bold";
  clockEl.style.zIndex = "100";
  clockEl.textContent = "Time: 30s";
  app.style.position = "relative";
  app.appendChild(clockEl);

  // --- Load and train ML Model ---
  let model;
  async function loadModel() {
    try {
      const response = await fetch("adaptive_reaction_dataset.csv");
      if (!response.ok) {
        console.error("CSV not loaded, adaptive difficulty disabled");
        return;
      }
      const csvText = await response.text();
      const rows = csvText.trim().split("\n").slice(1);
      const inputs = [];
      const labels = [];
      rows.forEach(r => {
        const cols = r.split(",").map(Number);
        inputs.push(cols.slice(0, 3));
        labels.push(cols[3] - 1); // Convert 1,2,3 → 0,1,2 for training
      });

      const xs = tf.tensor2d(inputs);
      const ys = tf.oneHot(tf.tensor1d(labels, "int32"), 3);

      model = tf.sequential();
      model.add(tf.layers.dense({ units: 16, activation: "relu", inputShape: [3] }));
      model.add(tf.layers.dense({ units: 8, activation: "relu" }));
      model.add(tf.layers.dense({ units: 3, activation: "softmax" }));
      model.compile({ optimizer: "adam", loss: "categoricalCrossentropy", metrics: ["accuracy"] });

      await model.fit(xs, ys, { epochs: 10, shuffle: true });
      console.log("✅ ML Model trained on CSV dataset");
    } catch (err) {
      console.error("Error loading/training model:", err);
      model = null;
    }
  }

  await loadModel();

  // --- Game Event Listeners ---
  startBtn.addEventListener("click", () => {
    startScreen.classList.add("hidden");
    app.classList.remove("hidden");
    resetGame();
    startSession();
  });

  restartBtn.addEventListener("click", () => {
    finalScreen.classList.add("hidden");
    app.classList.remove("hidden");
    resetGame();
    startSession();
  });

  // --- Game Functions ---
  function resetGame() {
    displayText.textContent = "Get Ready...";
    scoreHistory = [];
    currentDifficulty = 1;
    waitingForClick = false;
    sessionActive = true;
    remainingTime = 30;
    lastScoresIndex = 0;

    attemptsEl.textContent = 0;
    bestEl.textContent = 0;
    averageEl.textContent = 0;
    clockEl.textContent = "Time: 30s";
    scoreElements.forEach(el => el.textContent = 0);
    dingSound.load();
  }

  function startSession() {
    countdownTimer = setInterval(() => {
      if (!sessionActive) {
        clearInterval(countdownTimer);
        return;
      }
      remainingTime--;
      clockEl.textContent = `Time: ${remainingTime}s`;
      if (remainingTime <= 0) {
        sessionActive = false;
        clearInterval(countdownTimer);
        showFinalScreen();
      }
    }, 1000);

    startTrial();
  }

  function startTrial() {
    if (!sessionActive) return;
    const stimuli = ["color", "sound", "catch"];
    const stim = stimuli[Math.floor(Math.random() * stimuli.length)];
    if (stim === "color") startColorTrial();
    else if (stim === "sound") startSoundTrial();
    else startCatchTrial();
  }

  function startColorTrial() {
    displayText.textContent = "Click when color changes...";
    clickArea.style.background = "#950000";
    const delay = Math.max(300, 1500 - currentDifficulty * 100); // prevent negative delay

    setTimeout(() => {
      if (!sessionActive) return;
      const color = colors[Math.floor(Math.random() * colors.length)];
      clickArea.style.background = color;
      const startTime = Date.now();
      waitingForClick = true;

      clickArea.onclick = () => {
        if (!waitingForClick) return;
        recordTrial("Color", Date.now() - startTime);
        clickArea.onclick = null;
        waitingForClick = false;
        startTrial();
      };
    }, delay);
  }

  function startSoundTrial() {
    displayText.textContent = "Click when you hear sound!";
    clickArea.style.background = "#950000";
    const icon = document.createElement("div");
    icon.className = "sound-icon";
    icon.innerHTML = "🔊";
    clickArea.appendChild(icon);

    const delay = Math.max(300, 1500 - currentDifficulty * 100);
    setTimeout(() => {
      if (!sessionActive) { icon.remove(); return; }
      dingSound.currentTime = 0;
      dingSound.play().catch(() => {});
      icon.style.opacity = 1;

      const startTime = Date.now();
      waitingForClick = true;

      clickArea.onclick = () => {
        if (!waitingForClick) return;
        recordTrial("Sound", Date.now() - startTime);
        clickArea.onclick = null;
        waitingForClick = false;
        icon.remove();
        startTrial();
      };
    }, delay);
  }

  function startCatchTrial() {
    displayText.textContent = "Click the falling stick!";
    clickArea.style.background = "#950000";

    setTimeout(() => {
      if (!sessionActive) return;
      const stick = document.createElement("div");
      stick.className = "falling-stick";
      stick.style.width = "40px";
      stick.style.height = "80px";
      stick.style.left = Math.random() * (clickArea.offsetWidth - 40) + "px";
      stick.style.top = "-80px";
      clickArea.appendChild(stick);

      const fallSpeed = 7 + currentDifficulty * 2;
      const startTime = Date.now();
      waitingForClick = true;
      let posY = -80;

      const interval = setInterval(() => {
        if (!waitingForClick || !sessionActive) {
          clearInterval(interval);
          stick.remove();
          return;
        }
        posY += fallSpeed;
        stick.style.top = posY + "px";
        if (posY >= clickArea.offsetHeight) {
          clearInterval(interval);
          stick.remove();
          waitingForClick = false;
          startTrial();
        }
      }, 20);

      stick.addEventListener("mousedown", () => {
        if (!waitingForClick) return;
        recordTrial("Catch", Date.now() - startTime);
        clearInterval(interval);
        stick.remove();
        waitingForClick = false;
        startTrial();
      });
    }, 800);
  }

  function recordTrial(type, rt) {
    scoreHistory.push({ type, reactionTime: rt });
    scoreElements[lastScoresIndex].textContent = rt;
    lastScoresIndex = (lastScoresIndex + 1) % scoreElements.length;

    updateStats();
    if (model) adaptDifficulty();
  }

  function updateStats() {
    if (scoreHistory.length > 0) {
      const best = Math.min(...scoreHistory.map(s => s.reactionTime));
      const avg = Math.round(scoreHistory.reduce((a,b)=>a+b.reactionTime,0)/scoreHistory.length);
      attemptsEl.textContent = scoreHistory.length;
      bestEl.textContent = best;
      averageEl.textContent = avg;
    }
  }

  async function adaptDifficulty() {
    if (!model) return;

    const colorAvg = scoreHistory.filter(s=>s.type==="Color").reduce((a,b)=>a+b.reactionTime,0) /
                     Math.max(1, scoreHistory.filter(s=>s.type==="Color").length);
    const soundAvg = scoreHistory.filter(s=>s.type==="Sound").reduce((a,b)=>a+b.reactionTime,0) /
                     Math.max(1, scoreHistory.filter(s=>s.type==="Sound").length);
    const catchAvg = scoreHistory.filter(s=>s.type==="Catch").reduce((a,b)=>a+b.reactionTime,0) /
                     Math.max(1, scoreHistory.filter(s=>s.type==="Catch").length);

    const inputTensor = tf.tensor2d([[colorAvg, soundAvg, catchAvg]]);
    const prediction = model.predict(inputTensor);
    const predClass = prediction.argMax(1).dataSync()[0];

    currentDifficulty = predClass + 1; // 1,2,3
  }

  function showFinalScreen() {
    app.classList.add("hidden");
    finalScreen.classList.remove("hidden");

    const colorAvg = Math.round(scoreHistory.filter(s=>s.type==="Color").reduce((a,b)=>a+b.reactionTime,0) /
                     Math.max(1, scoreHistory.filter(s=>s.type==="Color").length));
    const soundAvg = Math.round(scoreHistory.filter(s=>s.type==="Sound").reduce((a,b)=>a+b.reactionTime,0) /
                     Math.max(1, scoreHistory.filter(s=>s.type==="Sound").length));
    const catchAvg = Math.round(scoreHistory.filter(s=>s.type==="Catch").reduce((a,b)=>a+b.reactionTime,0) /
                     Math.max(1, scoreHistory.filter(s=>s.type==="Catch").length));

    segmentScores.innerHTML = `
      <p>Color Avg: ${colorAvg} ms</p>
      <p>Sound Avg: ${soundAvg} ms</p>
      <p>Catch Avg: ${catchAvg} ms</p>
    `;
    finalMessage.textContent = "Session Over!";
  }
});
