/* ============================================================
   SPLITTING THE ATOM — app.js
   Handles: SPA navigation, progress tracking (localStorage),
   quiz grading + persistence, keyboard navigation, dark/light
   theme, reduced-motion handling, and the interactive
   chain-reaction canvas.
   ============================================================ */

(function () {
  "use strict";

  const STORAGE_KEY = "sta_progress_v1";
  const THEME_KEY = "sta_theme_v1";
  const MODULES = ["module1", "module2", "module3", "module4", "module5"];
  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const SITE_TITLE = "Jay's Atomic Academy — Nuclear Fission Power";
  const VIEW_TITLES = {
    home: SITE_TITLE,
    module1: "Module 01: Dawn of the Atomic Age — Jay's Atomic Academy",
    module2: "Module 02: The Core Mechanics — Jay's Atomic Academy",
    module3: "Module 03: Heat into Electricity — Jay's Atomic Academy",
    module4: "Module 04: Powering the World — Jay's Atomic Academy",
    module5: "Module 05: The Horizon — Jay's Atomic Academy",
    glossary: "Glossary — Jay's Atomic Academy",
    examCert: "Certification Exam — Jay's Atomic Academy",
  };

  // Shared neutron multiplication factor (k) used by the Module 02
  // chain-reaction demo; adjusted live via the slider in wireKFactorSlider().
  let kFactor = 1.0;

  /* ---------------- Progress store ---------------- */
  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (!parsed.quizzes) parsed.quizzes = {};
      return parsed;
    } catch (e) {
      return { quizzes: {} };
    }
  }

  function saveProgress(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* localStorage unavailable — app still works, just won't persist */
    }
  }

  let progress = loadProgress();

  function markComplete(moduleId) {
    progress[moduleId] = true;
    saveProgress(progress);
    renderProgress();
  }

  function renderProgress() {
    const completedCount = MODULES.filter((m) => progress[m]).length;
    const pct = Math.round((completedCount / MODULES.length) * 100);
    const fill = document.getElementById("progressFill");
    const label = document.getElementById("progressPercent");
    if (fill) fill.style.width = pct + "%";
    if (label) label.textContent = pct + "%";

    document.querySelectorAll(".rod").forEach((rod) => {
      const target = rod.getAttribute("data-target");
      const light = rod.querySelector(".rod-light");
      if (!light || target === "home") return;
      if (progress[target]) {
        light.setAttribute("data-status", "complete");
      }

      // Show a small "correct/total" score badge once a module's quiz
      // has been attempted, so progress is more than just a checkmark.
      const score = progress.quizzes && progress.quizzes[target];
      if (score && typeof score.correct === "number") {
        let badge = rod.querySelector(".rod-score");
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "rod-score mono";
          rod.appendChild(badge);
        }
        badge.textContent = score.correct + "/" + score.total;
      }
    });
  }

  /* ---------------- Navigation ---------------- */
  function showView(viewId) {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    const target = document.getElementById(viewId);
    if (target) target.classList.add("active");
    // Right-rail sync
    document.querySelectorAll(".aside-view").forEach((v) => v.classList.remove("active"));
    const asideTarget = document.getElementById("aside-" + viewId);
    if (asideTarget) asideTarget.classList.add("active");
    // Let any canvases inside this view know they're now visible (they may have
    // initialized at 0x0 size while hidden with display:none).
    document.dispatchEvent(new CustomEvent("view:shown", { detail: { viewId } }));

    if (VIEW_TITLES[viewId]) document.title = VIEW_TITLES[viewId];

    document.querySelectorAll(".rod").forEach((rod) => {
      rod.classList.toggle("is-current", rod.getAttribute("data-target") === viewId);
      const light = rod.querySelector(".rod-light");
      if (!light) return;
      if (rod.getAttribute("data-target") === viewId) {
        if (light.getAttribute("data-status") !== "complete") {
          light.setAttribute("data-status", "active");
        }
      } else if (light.getAttribute("data-status") === "active") {
        light.setAttribute("data-status", "incomplete");
      }
    });

    window.scrollTo({ top: 0, behavior: REDUCED_MOTION ? "auto" : "smooth" });
    // Collapse mobile nav after selection
    if (window.innerWidth <= 900) {
      document.getElementById("controlPanel").classList.remove("open");
    }
  }

  function wireNavigation() {
    document.querySelectorAll("[data-target]").forEach((el) => {
      el.addEventListener("click", () => {
        const target = el.getAttribute("data-target");
        if (target) showView(target);
      });
    });

    const startBtn = document.getElementById("startLearning");
    if (startBtn) startBtn.addEventListener("click", () => showView("module1"));
  }

  /* ---------------- Keyboard navigation: sidebar rod list ---------------- */
  function wireRodKeyboardNav() {
    const rodNav = document.getElementById("rodNav");
    if (!rodNav) return;
    rodNav.addEventListener("keydown", (evt) => {
      const rods = Array.from(rodNav.querySelectorAll(".rod"));
      const current = document.activeElement;
      const idx = rods.indexOf(current);
      if (idx === -1) return;

      let nextIdx = null;
      if (evt.key === "ArrowDown") nextIdx = (idx + 1) % rods.length;
      else if (evt.key === "ArrowUp") nextIdx = (idx - 1 + rods.length) % rods.length;
      else if (evt.key === "Home") nextIdx = 0;
      else if (evt.key === "End") nextIdx = rods.length - 1;

      if (nextIdx !== null) {
        evt.preventDefault();
        rods[nextIdx].focus();
      }
    });
  }

  /* ---------------- Keyboard navigation: quiz option groups ---------------- */
  function wireQuizKeyboardNav() {
    document.querySelectorAll(".quiz-opts").forEach((group) => {
      group.addEventListener("keydown", (evt) => {
        const buttons = Array.from(group.querySelectorAll("button"));
        const current = document.activeElement;
        const idx = buttons.indexOf(current);
        if (idx === -1) return;

        let nextIdx = null;
        if (evt.key === "ArrowDown" || evt.key === "ArrowRight") nextIdx = (idx + 1) % buttons.length;
        else if (evt.key === "ArrowUp" || evt.key === "ArrowLeft") nextIdx = (idx - 1 + buttons.length) % buttons.length;

        if (nextIdx !== null) {
          evt.preventDefault();
          buttons[nextIdx].focus();
        }
      });
    });
  }

  /* ---------------- Quiz logic ---------------- */
  function applyAnswerVisuals(btn, buttons, correctVal) {
    const chosen = btn.getAttribute("data-val");
    buttons.forEach((b) => (b.disabled = true));
    if (chosen === correctVal) {
      btn.classList.add("correct");
    } else {
      btn.classList.add("incorrect");
      buttons.forEach((b) => {
        if (b.getAttribute("data-val") === correctVal) b.classList.add("correct");
      });
    }
  }

  function wireQuiz(quizId, moduleId) {
    const quiz = document.getElementById(quizId);
    if (!quiz) return;
    const questions = quiz.querySelectorAll(".quiz-q");
    const resultEl = document.getElementById("quizResult" + moduleId.replace("module", ""));
    const saved = progress.quizzes[moduleId];

    let answered = 0;
    let correct = 0;

    function finish() {
      if (resultEl) {
        const total = questions.length;
        let remark;
        if (correct === total) remark = "Excellent work — you've got this one down cold.";
        else if (correct >= Math.ceil(total / 2)) remark = "Solid grasp of the material — nice job.";
        else remark = "Good effort — consider skimming this module again before your presentation.";
        resultEl.textContent = "TEACHER'S NOTE: " + correct + " / " + total + " correct. " + remark;
      }
      progress.quizzes[moduleId] = { answers: (progress.quizzes[moduleId] && progress.quizzes[moduleId].answers) || {}, correct, total: questions.length };
      saveProgress(progress);
      markComplete(moduleId);
    }

    questions.forEach((q, qIndex) => {
      const correctVal = q.getAttribute("data-answer");
      const buttons = q.querySelectorAll(".quiz-opts button");

      // Restore a previously-saved answer for this question, if any, so
      // reloading the page doesn't reset an already-completed quiz back
      // to a blank, re-answerable state.
      const savedAnswer = saved && saved.answers ? saved.answers[qIndex] : undefined;
      if (savedAnswer !== undefined) {
        const chosenBtn = Array.from(buttons).find((b) => b.getAttribute("data-val") === savedAnswer);
        if (chosenBtn) {
          applyAnswerVisuals(chosenBtn, buttons, correctVal);
          answered++;
          if (chosenBtn.getAttribute("data-val") === correctVal) correct++;
        }
      }

      buttons.forEach((btn) => {
        btn.addEventListener("click", () => {
          if (btn.disabled) return; // already answered this question
          const chosen = btn.getAttribute("data-val");
          applyAnswerVisuals(btn, buttons, correctVal);
          if (chosen === correctVal) correct++;
          answered++;

          // Persist this individual answer immediately, so a closed tab
          // mid-quiz still resumes exactly where the learner left off.
          if (!progress.quizzes[moduleId]) progress.quizzes[moduleId] = { answers: {}, correct: 0, total: questions.length };
          if (!progress.quizzes[moduleId].answers) progress.quizzes[moduleId].answers = {};
          progress.quizzes[moduleId].answers[qIndex] = chosen;
          saveProgress(progress);

          if (answered === questions.length) finish();
        });
      });
    });

    // If every question was already answered on a previous visit, show
    // the saved result immediately instead of leaving it blank.
    if (answered === questions.length && questions.length > 0) {
      if (resultEl) {
        const total = questions.length;
        let remark;
        if (correct === total) remark = "Excellent work — you've got this one down cold.";
        else if (correct >= Math.ceil(total / 2)) remark = "Solid grasp of the material — nice job.";
        else remark = "Good effort — consider skimming this module again before your presentation.";
        resultEl.textContent = "TEACHER'S NOTE: " + correct + " / " + total + " correct. " + remark;
      }
    }
  }

  /* ---------------- "Ask first, then reveal" widgets ---------------- */
  function wireReveals() {
    document.querySelectorAll(".predict").forEach((block) => {
      const btn = block.querySelector(".predict-btn");
      const answer = block.querySelector(".predict-answer");
      if (!btn || !answer) return;
      btn.addEventListener("click", () => {
        const isOpen = block.classList.toggle("open");
        btn.textContent = isOpen ? "Hide answer ↑" : btn.getAttribute("data-label") || "Reveal the answer →";
        if (isOpen) answer.scrollIntoView({ behavior: REDUCED_MOTION ? "auto" : "smooth", block: "nearest" });
      });
    });
  }

  /* ---------------- Reset progress ---------------- */
  function wireReset() {
    const btn = document.getElementById("resetProgress");
    if (!btn) return;
    btn.addEventListener("click", () => {
      if (confirm("Reset all module progress? This cannot be undone.")) {
        progress = { quizzes: {} };
        saveProgress(progress);
        document.querySelectorAll(".rod-light").forEach((light) => {
          const rod = light.closest(".rod");
          // The glossary rod isn't progress-tracked -- leave its light alone.
          if (rod && rod.getAttribute("data-target") === "glossary") return;
          if (light.getAttribute("data-status") !== undefined) {
            light.setAttribute("data-status", "incomplete");
          }
        });
        document.querySelectorAll(".rod-score").forEach((el) => el.remove());
        document.querySelectorAll(".quiz-opts button").forEach((b) => {
          b.disabled = false;
          b.classList.remove("correct", "incorrect", "exam-picked");
        });
        document.querySelectorAll(".quiz-result").forEach((el) => (el.textContent = ""));

        // Reset the certification exam back to its intro screen.
        const examIntro = document.getElementById("examIntro");
        const examBody = document.getElementById("examBody");
        const examResult = document.getElementById("examResult");
        if (examIntro) examIntro.hidden = false;
        if (examBody) examBody.hidden = true;
        if (examResult) examResult.hidden = true;

        renderProgress();
        showView("home");
      }
    });
  }

  /* ---------------- Theme toggle (light / dark) ---------------- */
  function applyTheme(theme) {
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    const toggle = document.getElementById("themeToggle");
    if (toggle) {
      const icon = toggle.querySelector(".theme-icon");
      const label = toggle.querySelector(".theme-label");
      toggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
      if (icon) icon.textContent = theme === "dark" ? "☀️" : "🌙";
      if (label) label.textContent = theme === "dark" ? "LIGHT MODE" : "DARK MODE";
    }
  }

  function wireThemeToggle() {
    const toggle = document.getElementById("themeToggle");
    if (!toggle) return;
    let saved = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch (e) {}
    applyTheme(saved === "dark" ? "dark" : "light");

    toggle.addEventListener("click", () => {
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      const next = isDark ? "light" : "dark";
      applyTheme(next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (e) {}
    });
  }

  /* ---------------- Mobile nav toggle ---------------- */
  function wirePanelToggle() {
    const toggle = document.getElementById("panelToggle");
    const panel = document.getElementById("controlPanel");
    if (!toggle || !panel) return;
    toggle.style.display = "none"; // shown via CSS media query override below if needed
    toggle.addEventListener("click", () => panel.classList.toggle("open"));
  }

  /* ============================================================
     CHAIN REACTION CANVAS
     A hex-packed grid of "atoms." Clicking one fissions it,
     which releases 2-3 neutrons that travel outward and can
     trigger neighboring atoms — a simple, visual analogy for
     a self-sustaining chain reaction. Respects prefers-reduced-
     motion: no autoplay, and fissions resolve instantly instead
     of animating traveling neutrons / pulsing glows.
     ============================================================ */
  function initChainReaction() {
    const canvas = document.getElementById("chainCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const countEl = document.getElementById("reactCount");
    const energyEl = document.getElementById("reactEnergy");
    const resetBtn = document.getElementById("resetChain");

    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let W = canvas.clientWidth || 480;
    let H = canvas.clientHeight || 480;

    function resize() {
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      buildAtoms();
    }

    let atoms = [];
    let neutrons = [];
    let fissionCount = 0;

    function buildAtoms() {
      atoms = [];
      const cols = 9;
      const rows = 9;
      const marginX = W * 0.1;
      const marginY = H * 0.1;
      const spacingX = (W - marginX * 2) / (cols - 1);
      const spacingY = (H - marginY * 2) / (rows - 1);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const offset = r % 2 === 0 ? 0 : spacingX / 2;
          const x = marginX + c * spacingX + offset;
          const y = marginY + r * spacingY;
          if (x > W - marginX + 1) continue;
          atoms.push({
            x,
            y,
            r: 5,
            split: false,
            pulse: 0,
          });
        }
      }
    }

    function nearestUnsplit(x, y, excludeSet) {
      let best = null;
      let bestDist = Infinity;
      for (const a of atoms) {
        if (a.split || excludeSet.has(a)) continue;
        const d = Math.hypot(a.x - x, a.y - y);
        if (d < bestDist) {
          bestDist = d;
          best = a;
        }
      }
      return { atom: best, dist: bestDist };
    }

    function fissionAtom(atom) {
      if (atom.split) return;
      atom.split = true;
      atom.pulse = REDUCED_MOTION ? 0 : 1;
      fissionCount++;
      if (countEl) countEl.textContent = String(fissionCount);
      if (energyEl) energyEl.textContent = (fissionCount * 200).toLocaleString();

      // emit 2-3 neutrons toward nearby unsplit atoms
      const numNeutrons = 2 + Math.floor(Math.random() * 2);
      const targeted = new Set();
      for (let i = 0; i < numNeutrons; i++) {
        const angle = Math.random() * Math.PI * 2;
        const searchX = atom.x + Math.cos(angle) * 60;
        const searchY = atom.y + Math.sin(angle) * 60;
        const { atom: target, dist } = nearestUnsplit(searchX, searchY, targeted);
        if (target && dist < 90) {
          targeted.add(target);
          if (REDUCED_MOTION) {
            // Skip the traveling-neutron animation entirely — resolve
            // the chain reaction's next step immediately instead.
            fissionAtom(target);
          } else {
            neutrons.push({
              fromX: atom.x,
              fromY: atom.y,
              toX: target.x,
              toY: target.y,
              t: 0,
              target,
            });
          }
        }
      }
    }

    function handleClick(evt) {
      const rect = canvas.getBoundingClientRect();
      const x = ((evt.clientX - rect.left) / rect.width) * W;
      const y = ((evt.clientY - rect.top) / rect.height) * H;
      let closest = null;
      let closestDist = Infinity;
      for (const a of atoms) {
        if (a.split) continue;
        const d = Math.hypot(a.x - x, a.y - y);
        if (d < closestDist) {
          closestDist = d;
          closest = a;
        }
      }
      if (closest && closestDist < 26) {
        fissionAtom(closest);
      }
    }

    function resetSim() {
      fissionCount = 0;
      neutrons = [];
      if (countEl) countEl.textContent = "0";
      if (energyEl) energyEl.textContent = "0";
      buildAtoms();
    }

    canvas.addEventListener("click", (evt) => {
      handleClick(evt);
      userInteracted = true;
      idleTimer = 0;
    });
    if (resetBtn) resetBtn.addEventListener("click", () => { resetSim(); userInteracted = false; });
    window.addEventListener("resize", resize);
    document.addEventListener("view:shown", (e) => {
      if (e.detail.viewId === "home") resize();
    });

    // ---- Autoplay loop: keeps the reactor "running" on its own so the
    // landing page always looks alive, even before the visitor clicks.
    // Disabled entirely under prefers-reduced-motion. ----
    let idleTimer = 0;
    let userInteracted = false;
    const AUTOPLAY_INTERVAL = 70; // frames between auto-fissions (~1.2s at 60fps)

    function autoplayTick() {
      if (REDUCED_MOTION) return;
      idleTimer++;
      const unsplit = atoms.filter((a) => !a.split);
      if (unsplit.length === 0 && neutrons.length === 0) {
        // full core has reacted — pause briefly, then restart the loop
        if (idleTimer > AUTOPLAY_INTERVAL) {
          resetSim();
          idleTimer = 0;
        }
        return;
      }
      if (neutrons.length === 0 && idleTimer > AUTOPLAY_INTERVAL) {
        const pick = unsplit[Math.floor(Math.random() * unsplit.length)];
        if (pick) fissionAtom(pick);
        idleTimer = 0;
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      autoplayTick();

      // draw neutrons in flight
      for (let i = neutrons.length - 1; i >= 0; i--) {
        const n = neutrons[i];
        n.t += 0.045;
        if (n.t >= 1) {
          fissionAtom(n.target);
          neutrons.splice(i, 1);
          continue;
        }
        const x = n.fromX + (n.toX - n.fromX) * n.t;
        const y = n.fromY + (n.toY - n.fromY) * n.t;
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = "#F2A900";
        ctx.shadowColor = "#F2A900";
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // draw atoms
      for (const a of atoms) {
        if (a.pulse > 0) a.pulse *= 0.9;
        const glowR = a.r + (a.split ? a.pulse * 10 : 0);
        ctx.beginPath();
        ctx.arc(a.x, a.y, glowR, 0, Math.PI * 2);
        if (a.split) {
          ctx.fillStyle = "rgba(22, 82, 196, " + (0.35 + a.pulse * 0.5) + ")";
        } else {
          ctx.fillStyle = "rgba(139, 150, 174, 0.55)";
        }
        ctx.fill();

        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        ctx.fillStyle = a.split ? "#1652C4" : "#8B96AE";
        ctx.fill();

        if (a.split && a.pulse > 0.03) {
          ctx.beginPath();
          ctx.arc(a.x, a.y, a.r + 4 + a.pulse * 8, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(224, 51, 47, " + (a.pulse * 0.9) + ")";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      requestAnimationFrame(draw);
    }

    resize();
    requestAnimationFrame(draw);
  }

  /* ---------------- Completion banner ---------------- */
  function checkCompletion() {
    const banner = document.getElementById("completionBanner");
    if (!banner) return;
    const allDone = MODULES.every((m) => progress[m]);
    banner.hidden = !allDone;
  }

  const originalMarkComplete = markComplete;
  markComplete = function (moduleId) {
    originalMarkComplete(moduleId);
    checkCompletion();
  };

  /* ---------------- Second chain-reaction demo (Module 2) ---------------- */
  function initChainReaction2() {
    const canvas = document.getElementById("chainCanvas2");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const countEl = document.getElementById("reactCount2");
    const resetBtn = document.getElementById("resetChain2");

    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let W, H, atoms, neutrons, fissionCount;

    function resize() {
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      build();
    }

    function build() {
      atoms = [];
      fissionCount = 0;
      neutrons = [];
      if (countEl) countEl.textContent = "0";
      const cols = 8, rows = 5;
      const marginX = W * 0.1, marginY = H * 0.15;
      const spacingX = (W - marginX * 2) / (cols - 1);
      const spacingY = (H - marginY * 2) / (rows - 1);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const offset = r % 2 === 0 ? 0 : spacingX / 2;
          const x = marginX + c * spacingX + offset;
          if (x > W - marginX + 1) continue;
          atoms.push({ x, y: marginY + r * spacingY, r: 6, split: false, pulse: 0 });
        }
      }
    }

    function nearestUnsplit(x, y, excludeSet) {
      let best = null, bestDist = Infinity;
      for (const a of atoms) {
        if (a.split || excludeSet.has(a)) continue;
        const d = Math.hypot(a.x - x, a.y - y);
        if (d < bestDist) { bestDist = d; best = a; }
      }
      return { atom: best, dist: bestDist };
    }

    function fission(atom) {
      if (atom.split) return;
      atom.split = true;
      atom.pulse = REDUCED_MOTION ? 0 : 1;
      fissionCount++;
      if (countEl) countEl.textContent = String(fissionCount);
      const num = 2 + Math.floor(Math.random() * 2);
      // The neutron multiplication factor (k) scales how often a candidate
      // neutron that finds a nearby target actually goes on to cause the
      // next fission. `num` averages 2.5, so dividing k by 2.5 makes the
      // expected number of successful new fissions per fission equal k:
      // k=1 sustains the reaction, k<1 lets it die out, k>1 makes it grow.
      const successProb = Math.min(1, Math.max(0, kFactor / 2.5));
      const targeted = new Set();
      for (let i = 0; i < num; i++) {
        const angle = Math.random() * Math.PI * 2;
        const { atom: target, dist } = nearestUnsplit(atom.x + Math.cos(angle) * 70, atom.y + Math.sin(angle) * 70, targeted);
        if (target && dist < 100 && Math.random() < successProb) {
          targeted.add(target);
          if (REDUCED_MOTION) {
            fission(target);
          } else {
            neutrons.push({ fromX: atom.x, fromY: atom.y, toX: target.x, toY: target.y, t: 0, target });
          }
        }
      }
    }

    canvas.addEventListener("click", (evt) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((evt.clientX - rect.left) / rect.width) * W;
      const y = ((evt.clientY - rect.top) / rect.height) * H;
      let closest = null, closestDist = Infinity;
      for (const a of atoms) {
        if (a.split) continue;
        const d = Math.hypot(a.x - x, a.y - y);
        if (d < closestDist) { closestDist = d; closest = a; }
      }
      if (closest && closestDist < 28) fission(closest);
    });

    if (resetBtn) resetBtn.addEventListener("click", build);
    window.addEventListener("resize", resize);
    // The canvas starts life inside a display:none section, so clientWidth/
    // clientHeight are 0 at page load. Rebuild once Module 2 actually becomes
    // visible so the atom grid lays out correctly instead of rendering empty.
    document.addEventListener("view:shown", (e) => {
      if (e.detail.viewId === "module2") resize();
    });

    function draw() {
      ctx.clearRect(0, 0, W, H);
      for (let i = neutrons.length - 1; i >= 0; i--) {
        const n = neutrons[i];
        n.t += 0.045;
        if (n.t >= 1) { fission(n.target); neutrons.splice(i, 1); continue; }
        const x = n.fromX + (n.toX - n.fromX) * n.t;
        const y = n.fromY + (n.toY - n.fromY) * n.t;
        ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = "#F2A900"; ctx.shadowColor = "#F2A900"; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0;
      }
      for (const a of atoms) {
        if (a.pulse > 0) a.pulse *= 0.9;
        const glowR = a.r + (a.split ? a.pulse * 10 : 0);
        ctx.beginPath(); ctx.arc(a.x, a.y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = a.split ? "rgba(22, 82, 196, " + (0.35 + a.pulse * 0.5) + ")" : "rgba(139, 150, 174, 0.55)";
        ctx.fill();
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        ctx.fillStyle = a.split ? "#1652C4" : "#8B96AE";
        ctx.fill();
        if (a.split && a.pulse > 0.03) {
          ctx.beginPath();
          ctx.arc(a.x, a.y, a.r + 4 + a.pulse * 8, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(224, 51, 47, " + (a.pulse * 0.9) + ")";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      requestAnimationFrame(draw);
    }

    resize();
    requestAnimationFrame(draw);
  }

  /* ---------------- Neutron multiplication factor (k) slider — Module 02 ---------------- */
  function wireKFactorSlider() {
    const slider = document.getElementById("kFactorSlider");
    const valueEl = document.getElementById("kFactorValue");
    const stateEl = document.getElementById("kFactorState");
    if (!slider) return;

    function update() {
      kFactor = parseFloat(slider.value);
      if (valueEl) valueEl.textContent = kFactor.toFixed(2);
      let stateClass, stateText;
      if (kFactor < 0.98) {
        stateClass = "state-sub";
        stateText = "k = " + kFactor.toFixed(2) + " — SUBCRITICAL: fewer than one neutron per fission triggers another. The reaction dies out.";
      } else if (kFactor > 1.02) {
        stateClass = "state-super";
        stateText = "k = " + kFactor.toFixed(2) + " — SUPERCRITICAL: more than one neutron per fission triggers another. The reaction grows exponentially.";
      } else {
        stateClass = "state-critical";
        stateText = "k = " + kFactor.toFixed(2) + " — CRITICAL: each fission triggers, on average, exactly one more.";
      }
      if (stateEl) {
        stateEl.textContent = stateText;
        stateEl.className = "k-factor-state mono " + stateClass;
      }
    }

    slider.addEventListener("input", update);
    update();
  }

  /* ---------------- Searchable glossary ---------------- */
  function wireGlossarySearch() {
    const input = document.getElementById("glossarySearch");
    const list = document.getElementById("glossaryList");
    const emptyEl = document.getElementById("glossaryEmpty");
    const countEl = document.getElementById("glossaryCount");
    if (!input || !list) return;
    const entries = Array.from(list.querySelectorAll(".glossary-entry"));
    const total = entries.length;

    function filter() {
      const term = input.value.trim().toLowerCase();
      let shown = 0;
      entries.forEach((entry) => {
        const match = term === "" || entry.textContent.toLowerCase().indexOf(term) !== -1;
        entry.hidden = !match;
        if (match) shown++;
      });
      if (countEl) countEl.textContent = term === "" ? total + " terms" : shown + " of " + total;
      if (emptyEl) emptyEl.hidden = shown !== 0;
    }

    input.addEventListener("input", filter);
    filter();
  }
  /* ============================================================
     CERTIFICATION EXAM — 15 questions, 3 drawn from each module,
     order and options reshuffled on every attempt. 50% (8/15) to pass.
     ============================================================ */
  const EXAM_QUESTIONS = [
    { module: "module1", q: "What did Becquerel's fogged photographic plates reveal?", answer: "a", options: [
      { val: "a", text: "Uranium salts emit energy on their own, with no external light source" },
      { val: "b", text: "Photographic plates are sensitive to heat" },
      { val: "c", text: "Uranium is chemically unstable in air" },
    ]},
    { module: "module1", q: "What made Chicago Pile-1 historically significant?", answer: "b", options: [
      { val: "a", text: "It was the first commercial power plant" },
      { val: "b", text: "It was the first controlled, self-sustaining nuclear chain reaction" },
      { val: "c", text: "It was the first reactor to use enriched uranium" },
    ]},
    { module: "module1", q: "What distinguishes Generation III/III+ reactor designs?", answer: "c", options: [
      { val: "a", text: "They don't require containment structures" },
      { val: "b", text: "They run on unenriched uranium only" },
      { val: "c", text: "Passive safety systems that use gravity and natural convection instead of powered pumps" },
    ]},
    { module: "module2", q: "Where does the energy released by fission actually come from?", answer: "b", options: [
      { val: "a", text: "Neutrons carry energy into the nucleus and it bounces back out" },
      { val: "b", text: "A tiny amount of mass converts directly into energy, per E = mc²" },
      { val: "c", text: "It's released by the radioactive decay of the fragments only" },
    ]},
    { module: "module2", q: "What does a moderator do inside a reactor?", answer: "a", options: [
      { val: "a", text: "Slows fast neutrons down so they're more likely to trigger further fission" },
      { val: "b", text: "Absorbs neutrons permanently to shut the reaction down" },
      { val: "c", text: "Speeds neutrons up so they carry more energy" },
    ]},
    { module: "module2", q: "What does it mean for a reactor to be at criticality (k = 1)?", answer: "c", options: [
      { val: "a", text: "The core has run out of fuel" },
      { val: "b", text: "All control rods are fully withdrawn" },
      { val: "c", text: "On average, exactly one neutron from each fission goes on to cause the next, so the reaction rate stays constant" },
    ]},
    { module: "module3", q: "What's the key structural difference between a PWR and a BWR?", answer: "a", options: [
      { val: "a", text: "A PWR uses two separate water loops; a BWR uses only one" },
      { val: "b", text: "A BWR has no moderator" },
      { val: "c", text: "A PWR doesn't use water at all" },
    ]},
    { module: "module3", q: "In a PWR, what actually touches the turbine blades?", answer: "b", options: [
      { val: "a", text: "Primary loop water, straight from the core" },
      { val: "b", text: "Steam from the secondary loop, which never contacted the core" },
      { val: "c", text: "Molten fuel pellets" },
    ]},
    { module: "module3", q: "What does \"defense in depth\" mean in reactor safety?", answer: "c", options: [
      { val: "a", text: "Building reactors deep underground" },
      { val: "b", text: "Using only one very thick containment wall" },
      { val: "c", text: "Multiple independent barriers (cladding, vessel, containment) all have to fail together for radioactive material to escape" },
    ]},
    { module: "module4", q: "Why is nuclear power well suited to covering a grid's \"baseload\"?", answer: "b", options: [
      { val: "a", text: "It can ramp output up and down instantly to match demand" },
      { val: "b", text: "It runs at close to full output continuously for 12–24 months between refueling" },
      { val: "c", text: "It only operates during peak daytime demand" },
    ]},
    { module: "module4", q: "Roughly how much used fuel does a typical reactor produce per year?", answer: "a", options: [
      { val: "a", text: "Around 20–30 tonnes" },
      { val: "b", text: "Around 20,000–30,000 tonnes" },
      { val: "c", text: "Effectively zero — reactors don't produce solid waste" },
    ]},
    { module: "module4", q: "What triggered the Fukushima Daiichi accident?", answer: "c", options: [
      { val: "a", text: "A mishandled safety test by plant operators" },
      { val: "b", text: "A reactor design with no containment structure" },
      { val: "c", text: "An earthquake and tsunami that disabled the backup power needed for cooling" },
    ]},
    { module: "module5", q: "What's the main idea behind Small Modular Reactors (SMRs)?", answer: "b", options: [
      { val: "a", text: "They eliminate the need for a moderator" },
      { val: "b", text: "Factory-built, standardized modules can cut cost and schedule risk versus custom-built plants" },
      { val: "c", text: "They generate more power than any traditional reactor" },
    ]},
    { module: "module5", q: "How does a molten salt reactor respond if it overheats?", answer: "a", options: [
      { val: "a", text: "A plug melts and the liquid fuel drains passively into a safe, cooled tank" },
      { val: "b", text: "It automatically increases power output" },
      { val: "c", text: "Nothing — it has no overheating safeguard" },
    ]},
    { module: "module5", q: "What's a key advantage of fast neutron reactors?", answer: "c", options: [
      { val: "a", text: "They require no containment structure" },
      { val: "b", text: "They run without any fuel at all" },
      { val: "c", text: "They can use more of the uranium fuel, potentially reducing long-lived waste" },
    ]},
  ];

  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function renderExamBadge() {
    const rod = document.querySelector('.rod[data-target="examCert"]');
    if (!rod) return;
    const score = progress.exam;
    if (score && typeof score.correct === "number") {
      let badge = rod.querySelector(".rod-score");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "rod-score mono";
        rod.appendChild(badge);
      }
      badge.textContent = score.correct + "/" + score.total;
      if (score.passed) {
        const light = rod.querySelector(".rod-light");
        if (light) light.setAttribute("data-status", "complete");
      }
    }
  }

  function wireExam() {
    const introEl = document.getElementById("examIntro");
    const startBtn = document.getElementById("examStartBtn");
    const bodyEl = document.getElementById("examBody");
    const questionsEl = document.getElementById("examQuestions");
    const submitBtn = document.getElementById("examSubmitBtn");
    const answeredCountEl = document.getElementById("examAnsweredCount");
    const progressFillEl = document.getElementById("examProgressFill");
    const resultEl = document.getElementById("examResult");
    const resultBadgeEl = document.getElementById("examResultBadge");
    const resultHeadingEl = document.getElementById("examResultHeading");
    const resultBodyEl = document.getElementById("examResultBody");
    const retryBtn = document.getElementById("examRetryBtn");
    if (!introEl || !startBtn || !bodyEl) return;

    const MODULE_TAGS = { module1: "M01", module2: "M02", module3: "M03", module4: "M04", module5: "M05" };
    let currentSet = [];
    let answers = {};
    let submitted = false;

    function updateProgress() {
      const answeredCount = Object.keys(answers).length;
      if (answeredCountEl) answeredCountEl.textContent = String(answeredCount);
      if (progressFillEl) progressFillEl.style.width = Math.round((answeredCount / currentSet.length) * 100) + "%";
      if (submitBtn) submitBtn.disabled = answeredCount < currentSet.length;
    }

    function renderExam() {
      currentSet = shuffleArray(EXAM_QUESTIONS);
      answers = {};
      submitted = false;
      questionsEl.innerHTML = "";

      currentSet.forEach((q, idx) => {
        const opts = shuffleArray(q.options);
        const block = document.createElement("div");
        block.className = "quiz-q";
        block.setAttribute("data-qindex", String(idx));

        const modTag = document.createElement("span");
        modTag.className = "quiz-q-module mono";
        modTag.textContent = MODULE_TAGS[q.module] || "";
        block.appendChild(modTag);

        const p = document.createElement("p");
        p.textContent = (idx + 1) + ". " + q.q;
        block.appendChild(p);

        const optsWrap = document.createElement("div");
        optsWrap.className = "quiz-opts";
        opts.forEach((opt) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.setAttribute("data-val", opt.val);
          btn.textContent = opt.text;
          btn.addEventListener("click", () => {
            if (submitted) return;
            optsWrap.querySelectorAll("button").forEach((b) => b.classList.remove("exam-picked"));
            btn.classList.add("exam-picked");
            answers[idx] = opt.val;
            updateProgress();
          });
          optsWrap.appendChild(btn);
        });
        block.appendChild(optsWrap);
        questionsEl.appendChild(block);
      });

      updateProgress();
    }

    function gradeExam() {
      submitted = true;
      let correct = 0;
      const total = currentSet.length;

      currentSet.forEach((q, idx) => {
        const block = questionsEl.querySelector('[data-qindex="' + idx + '"]');
        if (!block) return;
        const chosen = answers[idx];
        const isCorrect = chosen === q.answer;
        if (isCorrect) correct++;
        block.querySelectorAll(".quiz-opts button").forEach((b) => {
          b.disabled = true;
          b.classList.remove("exam-picked");
          if (b.getAttribute("data-val") === q.answer) b.classList.add("correct");
          else if (b.getAttribute("data-val") === chosen) b.classList.add("incorrect");
        });
      });

      const pct = Math.round((correct / total) * 100);
      const passed = pct >= 50;

      bodyEl.hidden = true;
      if (resultEl) resultEl.hidden = false;
      if (resultBadgeEl) {
        resultBadgeEl.textContent = passed ? "PASS" : "FAIL — TRY AGAIN";
        resultBadgeEl.className = "exam-result-badge mono " + (passed ? "pass" : "fail");
      }
      if (resultHeadingEl) resultHeadingEl.textContent = correct + " / " + total + " correct — " + pct + "%";
      if (resultBodyEl) {
        resultBodyEl.textContent = passed
          ? "You passed the certification exam." + (pct === 100 ? " A perfect score, even — nicely done." : " Solid grasp of the material across all five modules.")
          : "You need 50% (8 of 15) to pass. Revisit the modules where you missed questions, then retake the exam whenever you're ready — there's no limit on attempts.";
      }

      progress.exam = { correct, total, passed, pct };
      saveProgress(progress);
      renderExamBadge();

      if (resultEl) resultEl.scrollIntoView({ behavior: REDUCED_MOTION ? "auto" : "smooth", block: "start" });
    }

    function startExam() {
      introEl.hidden = true;
      if (resultEl) resultEl.hidden = true;
      bodyEl.hidden = false;
      renderExam();
      bodyEl.scrollIntoView({ behavior: REDUCED_MOTION ? "auto" : "smooth", block: "start" });
    }

    startBtn.addEventListener("click", startExam);
    if (retryBtn) retryBtn.addEventListener("click", startExam);
    if (submitBtn) submitBtn.addEventListener("click", gradeExam);

    renderExamBadge();
  }

  /* ---------------- Module visual labs ---------------- */
  function wireModuleVisualLabs() {
    const visuals = {
      module1: { kicker: "FIELD IMAGE · DISCOVERY", title: "A century of curious experiments", body: "Follow the discoveries that transformed atoms from an idea into a new source of energy.", fact: "Tap the timeline cards below to see how one discovery unlocked the next." },
      module2: { kicker: "FIELD IMAGE · PHYSICS", title: "One collision. A runaway cascade.", body: "Watch how a neutron can set a chain reaction in motion — then tune it back to balance.", fact: "Try the live k-factor control below: k = 1 means a steady reaction." },
      module3: { kicker: "FIELD IMAGE · ENGINEERING", title: "Heat becomes a city’s electricity", body: "Trace energy from the fuel pellet to the spinning turbine through the plant’s safety systems.", fact: "Every commercial reactor ultimately turns heat into motion, then motion into electricity." },
      module4: { kicker: "FIELD IMAGE · THE GRID", title: "Big energy, visible trade-offs", body: "Compare the climate, reliability, waste, and safety questions that shape real power systems.", fact: "Use the charts below as conversation starters, not as a substitute for the full context." },
      module5: { kicker: "FIELD IMAGE · TOMORROW", title: "The next generation takes shape", body: "Explore modular designs and bolder reactor concepts aiming to make clean power easier to build.", fact: "The future is not one machine: it is a portfolio of designs solving different problems." },
    };

    Object.entries(visuals).forEach(([id, data]) => {
      const view = document.getElementById(id);
      const header = view && view.querySelector(".module-head");
      if (!header || view.querySelector(".module-visual-lab")) return;
      const card = document.createElement("section");
      card.className = "module-visual-lab";
      card.setAttribute("data-module", id);
      const copy = document.createElement("div");
      copy.className = "module-visual-copy";
      const kicker = document.createElement("span");
      kicker.className = "mono";
      kicker.textContent = data.kicker;
      const title = document.createElement("h3");
      title.textContent = data.title;
      const body = document.createElement("p");
      body.textContent = data.body;
      const fact = document.createElement("p");
      fact.className = "visual-fact";
      fact.textContent = data.fact;
      copy.append(kicker, title, body, fact);
      card.appendChild(copy);
      header.insertAdjacentElement("afterend", card);
    });
  }

  /* ---------------- Init ---------------- */
  document.addEventListener("DOMContentLoaded", function () {
    wireNavigation();
    wireRodKeyboardNav();
    wireQuizKeyboardNav();
    wireQuiz("quiz1", "module1");
    wireQuiz("quiz2", "module2");
    wireQuiz("quiz3", "module3");
    wireQuiz("quiz4", "module4");
    wireQuiz("quiz5", "module5");
    wireReset();
    wireThemeToggle();
    wirePanelToggle();
    wireReveals();
    wireKFactorSlider();
    wireGlossarySearch();
    wireExam();
    wireModuleVisualLabs();
    renderProgress();
    checkCompletion();
    initChainReaction();
    initChainReaction2();
    showView("home");
  });
})();
