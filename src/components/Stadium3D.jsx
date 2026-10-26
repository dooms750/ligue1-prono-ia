import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

// Un stade de nuit en 3D. Les trois probabilités deviennent des colonnes de lumière :
// à gauche la victoire à domicile, au rond central le nul, à droite la victoire à l'extérieur.
// Le ballon roule vers le camp de l'équipe favorite.

const PITCH_W = 10.5;
const PITCH_H = 6.8;
const MAX_H = 7;

const SHOTS = {
  aerial: { r: 10.5, y: 13, look: 0 },
  low: { r: 8.2, y: 1.7, look: 0.8 },
  side: { r: 11.5, y: 4.2, look: 0.6 },
  verdict: { r: 12.4, y: 6.2, look: 1.4 },
};

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}

function pitchTexture() {
  const c = document.createElement("canvas");
  c.width = 1050; c.height = 680;
  const g = c.getContext("2d");
  for (let i = 0; i < 14; i++) {
    g.fillStyle = i % 2 ? "#1d6e43" : "#22794a";
    g.fillRect((i * c.width) / 14, 0, c.width / 14 + 1, c.height);
  }
  g.strokeStyle = "rgba(240,248,240,0.9)";
  g.lineWidth = 5;
  const m = 30;
  g.strokeRect(m, m, c.width - 2 * m, c.height - 2 * m);
  g.beginPath(); g.moveTo(c.width / 2, m); g.lineTo(c.width / 2, c.height - m); g.stroke();
  g.beginPath(); g.arc(c.width / 2, c.height / 2, 91, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "rgba(240,248,240,0.9)";
  g.beginPath(); g.arc(c.width / 2, c.height / 2, 6, 0, Math.PI * 2); g.fill();
  [m, c.width - m].forEach((x, k) => {
    const dir = k ? -1 : 1;
    g.strokeRect(k ? x - 165 : x, c.height / 2 - 201, 165, 402);
    g.strokeRect(k ? x - 55 : x, c.height / 2 - 92, 55, 184);
    g.beginPath(); g.arc(x + dir * 110, c.height / 2, 6, 0, Math.PI * 2); g.fill();
    g.beginPath();
    g.arc(x + dir * 110, c.height / 2, 91, k ? Math.PI * 0.705 : -Math.PI * 0.295, k ? Math.PI * 1.295 : Math.PI * 0.295);
    g.stroke();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.45)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// Si les deux maillots se ressemblent, l'équipe à l'extérieur passe en orange.
function distinctAway(homeColor, awayColor) {
  const a = new THREE.Color(homeColor), b = new THREE.Color(awayColor);
  const d = Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
  return d < 0.35 ? "#ff6a2b" : awayColor;
}

function buildScene(homeColor, rawAway) {
  const awayColor = distinctAway(homeColor, rawAway);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#060f19");
  scene.fog = new THREE.Fog("#060f19", 18, 42);

  scene.add(new THREE.HemisphereLight("#9bb8ff", "#0b1a12", 0.55));
  const key = new THREE.DirectionalLight("#fff2d6", 1.6);
  key.position.set(-6, 12, 7);
  scene.add(key);
  const fill = new THREE.DirectionalLight("#dfe8ff", 0.7);
  fill.position.set(7, 10, -6);
  scene.add(fill);

  const disposables = [];
  const track = (o) => (disposables.push(o), o);

  // Sol autour du terrain
  const ground = new THREE.Mesh(
    track(new THREE.PlaneGeometry(60, 60)),
    track(new THREE.MeshStandardMaterial({ color: "#0d2a1c", roughness: 1 })),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  scene.add(ground);

  const tex = track(pitchTexture());
  const pitch = new THREE.Mesh(
    track(new THREE.PlaneGeometry(PITCH_W, PITCH_H)),
    track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 })),
  );
  pitch.rotation.x = -Math.PI / 2;
  scene.add(pitch);

  // Buts
  const postMat = track(new THREE.MeshStandardMaterial({ color: "#f4f7f4", roughness: 0.4 }));
  const postGeo = track(new THREE.CylinderGeometry(0.035, 0.035, 1, 8));
  [-1, 1].forEach((s) => {
    const x = s * (PITCH_W / 2 - 0.145);
    [-0.37, 0.37].forEach((z) => {
      const p = new THREE.Mesh(postGeo, postMat);
      p.scale.y = 0.25; p.position.set(x, 0.125, z);
      scene.add(p);
    });
    const bar = new THREE.Mesh(postGeo, postMat);
    bar.scale.y = 0.74; bar.rotation.x = Math.PI / 2; bar.position.set(x, 0.25, 0);
    scene.add(bar);
  });

  // Tribunes et supporters
  const standMat = track(new THREE.MeshStandardMaterial({ color: "#14273a", roughness: 0.9 }));
  const roofMat = track(new THREE.MeshStandardMaterial({ color: "#0b1826", roughness: 0.8, side: THREE.DoubleSide }));
  const seats = [];
  const homeC = new THREE.Color(homeColor), awayC = new THREE.Color(awayColor);
  const neutral = [new THREE.Color("#c9d3dc"), new THREE.Color("#5c6c7a"), new THREE.Color("#8e9aa6")];

  const sides = [
    { len: PITCH_W + 2.6, pos: (d) => [0, 0, -(PITCH_H / 2 + 1.2 + d)], rot: 0, end: null },
    { len: PITCH_W + 2.6, pos: (d) => [0, 0, PITCH_H / 2 + 1.2 + d], rot: Math.PI, end: null, low: true },
    { len: PITCH_H + 2.6, pos: (d) => [-(PITCH_W / 2 + 1.2 + d), 0, 0], rot: Math.PI / 2, end: "home" },
    { len: PITCH_H + 2.6, pos: (d) => [PITCH_W / 2 + 1.2 + d, 0, 0], rot: -Math.PI / 2, end: "away" },
  ];
  sides.forEach((s) => {
    const tiers = s.low ? 3 : 5;
    for (let k = 0; k < tiers; k++) {
      const box = new THREE.Mesh(track(new THREE.BoxGeometry(s.len, 0.45 * (k + 1), 0.7)), standMat);
      const [x, , z] = s.pos(k * 0.7);
      box.position.set(x, 0.225 * (k + 1), z);
      box.rotation.y = s.rot;
      scene.add(box);
      const n = Math.floor(s.len / 0.22);
      for (let i = 0; i < n; i++) {
        if (Math.random() < 0.12) continue;
        const u = -s.len / 2 + 0.11 + i * 0.22;
        const along = new THREE.Vector3(u, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.rot);
        let col;
        const r = Math.random();
        if (s.end === "home") col = r < 0.8 ? homeC : neutral[i % 3];
        else if (s.end === "away") col = r < 0.45 ? awayC : neutral[i % 3];
        else col = r < 0.4 ? homeC : r < 0.5 ? awayC : neutral[i % 3];
        seats.push({ p: new THREE.Vector3(x + along.x, 0.45 * (k + 1) + 0.07, z + along.z), c: col, ph: Math.random() * 6.28 });
      }
    }
    if (!s.low) {
      const roof = new THREE.Mesh(track(new THREE.BoxGeometry(s.len + 0.4, 0.08, 3.2)), roofMat);
      const [x, , z] = s.pos(1.5);
      roof.position.set(x, 3.15, z);
      roof.rotation.y = s.rot;
      scene.add(roof);
    }
  });
  const crowd = new THREE.InstancedMesh(
    track(new THREE.BoxGeometry(0.12, 0.14, 0.1)),
    track(new THREE.MeshStandardMaterial({ roughness: 0.9 })),
    seats.length,
  );
  const mtx = new THREE.Matrix4();
  seats.forEach((s, i) => {
    mtx.makeTranslation(s.p.x, s.p.y, s.p.z);
    crowd.setMatrixAt(i, mtx);
    crowd.setColorAt(i, s.c);
  });
  scene.add(crowd);

  // Projecteurs
  const glow = track(glowTexture());
  const mastMat = track(new THREE.MeshStandardMaterial({ color: "#2a3a4a" }));
  const panelMat = track(new THREE.MeshBasicMaterial({ color: "#fff4cf" }));
  const glowMat = track(new THREE.SpriteMaterial({ map: glow, color: "#ffe9a8", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const x = sx * (PITCH_W / 2 + 4.2), z = sz * (PITCH_H / 2 + 3.6);
    const mast = new THREE.Mesh(track(new THREE.CylinderGeometry(0.07, 0.12, 7, 8)), mastMat);
    mast.position.set(x, 3.5, z);
    scene.add(mast);
    const panel = new THREE.Mesh(track(new THREE.BoxGeometry(1.1, 0.6, 0.08)), panelMat);
    panel.position.set(x, 7.1, z);
    panel.lookAt(0, 0, 0);
    scene.add(panel);
    const sp = new THREE.Sprite(glowMat);
    sp.position.copy(panel.position);
    sp.scale.set(4.5, 4.5, 1);
    scene.add(sp);
  });

  // Colonnes de probabilités
  const pillarGeo = track(new THREE.CylinderGeometry(0.62, 0.62, 1, 40));
  const ringGeo = track(new THREE.RingGeometry(0.75, 0.95, 48));
  const pillars = [
    { x: -PITCH_W / 4 - 0.2, color: homeColor },
    { x: 0, color: "#cfd8e2" },
    { x: PITCH_W / 4 + 0.2, color: awayColor },
  ].map(({ x, color }) => {
    const c = new THREE.Color(color);
    const mat = track(new THREE.MeshStandardMaterial({
      color: c, emissive: c, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.1,
      transparent: true, opacity: 0.92,
    }));
    const mesh = new THREE.Mesh(pillarGeo, mat);
    mesh.position.set(x, 0, 0);
    mesh.scale.y = 0.001;
    scene.add(mesh);
    const ring = new THREE.Mesh(ringGeo, track(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8, side: THREE.DoubleSide })));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.02, 0);
    scene.add(ring);
    const halo = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glow, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 })));
    halo.scale.set(2.6, 2.6, 1);
    scene.add(halo);
    return { mesh, ring, halo, x, h: 0, target: 0 };
  });

  // Ballon
  const ball = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.16, 24, 16)),
    track(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.35, emissive: "#ffffff", emissiveIntensity: 0.15 })),
  );
  ball.position.set(0, 0.16, 1.9);
  scene.add(ball);

  return { scene, pillars, ball, disposables };
}

export default function Stadium3D({ p, home, away, shot = "verdict", showPillars = true, height = 320, interactive = true, fallback = null, className = "", offsetY = 0 }) {
  const wrap = useRef(null);
  const labels = useRef([]);
  const state = useRef({ p, shot, showPillars });
  const [ok] = useState(webglAvailable);

  state.current = { p, shot, showPillars };

  useEffect(() => {
    if (!ok || !wrap.current) return undefined;
    const el = wrap.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    } catch {
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.prepend(renderer.domElement);

    const { scene, pillars, ball, disposables } = buildScene(home.color, away.color);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    const cam = { r: SHOTS.aerial.r, y: SHOTS.aerial.y, look: 0, angle: 0 };
    let fit = 1;
    let user = 0, dragging = null, lastInteract = -1e9, visible = true, raf = 0;

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Sur un écran étroit, on recule pour garder tout le terrain.
      camera.fov = w / h < 0.9 ? 52 : 42;
      fit = Math.max(1, 0.85 / (w / h)) * (w / h > 1.4 ? 1.12 : 1);
      // Décale l'image vers le bas pour laisser de la place au titre.
      if (offsetY) camera.setViewOffset(w, h, 0, -h * offsetY, w, h);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(el);

    const down = (e) => { if (!interactive) return; dragging = e.clientX; lastInteract = performance.now(); };
    const move = (e) => {
      if (dragging == null) return;
      user += (e.clientX - dragging) * -0.008;
      user = Math.max(-1.3, Math.min(1.3, user));
      dragging = e.clientX;
      lastInteract = performance.now();
    };
    const up = () => { dragging = null; };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);

    const tmp = new THREE.Vector3();
    const clock = new THREE.Clock();
    let ballX = 0;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      const { p: probs, shot: s, showPillars: sp } = state.current;
      const preset = SHOTS[s] || SHOTS.verdict;
      const k = reduced ? 1 : 1 - Math.exp(-dt * 2.2);
      cam.r += (preset.r - cam.r) * k;
      cam.y += (preset.y - cam.y) * k;
      cam.look += (preset.look - cam.look) * k;

      if (dragging == null && performance.now() - lastInteract > 2500) user *= 1 - Math.min(1, dt * 0.8);
      const sway = reduced ? 0 : Math.sin(t * 0.12) * 0.32;
      cam.angle = sway + user;
      camera.position.set(Math.sin(cam.angle) * cam.r * fit, cam.y * fit, Math.cos(cam.angle) * cam.r * fit);
      camera.lookAt(0, cam.look, 0);

      pillars.forEach((pl, i) => {
        pl.target = sp ? Math.max(probs[i] * MAX_H, 0.05) : 0.001;
        pl.h += (pl.target - pl.h) * (reduced ? 1 : 1 - Math.exp(-dt * 3.5));
        pl.mesh.scale.y = pl.h;
        pl.mesh.visible = pl.h > 0.03;
        pl.halo.visible = pl.h > 0.03;
        pl.mesh.position.y = pl.h / 2;
        pl.halo.position.set(pl.x, pl.h + 0.05, 0);
        pl.halo.material.opacity = sp ? 0.55 + Math.sin(t * 2 + i) * 0.12 : 0;
        pl.ring.material.opacity = sp ? 0.8 : 0;

        const lab = labels.current[i];
        if (lab) {
          tmp.set(pl.x, pl.h + 0.55, 0).project(camera);
          const x = (tmp.x * 0.5 + 0.5) * el.clientWidth;
          const y = (-tmp.y * 0.5 + 0.5) * el.clientHeight;
          lab.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
          lab.style.opacity = sp && pl.h > 0.3 ? "1" : "0";
        }
      });

      // Le ballon penche vers le favori : vers la gauche si l'équipe à domicile l'est.
      const lean = (probs[2] - probs[0]) * (PITCH_W / 2.4);
      const prev = ballX;
      ballX += (lean - ballX) * (reduced ? 1 : 1 - Math.exp(-dt * 1.5));
      ball.position.x = ballX;
      ball.rotation.z -= (ballX - prev) / 0.16;
      ball.position.y = 0.16 + (reduced ? 0 : Math.abs(Math.sin(t * 2.4)) * 0.05);

      renderer.render(scene, camera);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      disposables.forEach((d) => d.dispose && d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [ok, home.color, away.color, interactive, offsetY]);

  if (!ok) return fallback;

  const names = [home.name, "Nul", away.name];
  return (
    <div
      ref={wrap}
      className={`s3d ${interactive ? "s3d-drag" : ""} ${className}`}
      style={{ height }}
      role="img"
      aria-label={`Stade en 3D : ${home.name} ${Math.round(p[0] * 100)} %, nul ${Math.round(p[1] * 100)} %, ${away.name} ${Math.round(p[2] * 100)} %`}
    >
      {[0, 1, 2].map((i) => (
        <div key={i} ref={(n) => (labels.current[i] = n)} className={`s3d-label s3d-l${i}`} aria-hidden="true">
          <b>{Math.round(p[i] * 100)}<small>%</small></b>
          <span>{names[i]}</span>
        </div>
      ))}
    </div>
  );
}
