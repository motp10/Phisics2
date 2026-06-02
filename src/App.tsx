/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Sliders, 
  Sun, 
  Activity, 
  Info, 
  Layers, 
  Eye, 
  BookOpen, 
  Settings, 
  Maximize2, 
  Minimize2, 
  HelpCircle, 
  RefreshCw, 
  Table, 
  Compass, 
  Maximize, 
  Flame, 
  Sparkles,
  ArrowDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SimulationParams, WavelengthSample, PointData } from './types';
import { 
  generateSpectrum, 
  calculateIntensityForWavelength, 
  calculateCoherenceLength, 
  rgbToHex, 
  wavelengthToRGB 
} from './utils';

// Predefined presets
const PRESETS = [
  { name: 'Лазер (Красный)', lambda: 632.8, delta: 0.1, R: 3.5, n: 1.0, isWhite: false, title: 'Ge-Ne Laser' },
  { name: 'Лазер (Зеленый)', lambda: 532.0, delta: 0.1, R: 3.0, n: 1.0, isWhite: false, title: 'DPSS Laser' },
  { name: 'Натриевая лампа', lambda: 589.0, delta: 6.0, R: 2.5, n: 1.0, isWhite: false, title: 'Sodium Lamp' },
  { name: 'Ртутная лампа (Зеленый)', lambda: 546.1, delta: 12.0, R: 2.0, n: 1.0, isWhite: false, title: 'Mercury Green' },
  { name: 'Белый свет (Радуга)', lambda: 550.0, delta: 300.0, R: 1.5, n: 1.0, isWhite: true, title: 'White Light' }
];

const MEDIUMS = [
  { name: 'Воздух (Вакуум)', n: 1.0 },
  { name: 'Вода (Дистиллированная)', n: 1.333 },
  { name: 'Глицерин', n: 1.473 },
  { name: 'Кедровое масло', n: 1.515 },
  { name: 'Тяжелый крон (Стекло)', n: 1.62 }
];

export default function App() {
  // Main simulation state
  const [params, setParams] = useState<SimulationParams>({
    lensRadius: 2.5,
    centerWavelength: 550,
    spectrumWidth: 20,
    refractiveIndex: 1.0,
    maxRadiusView: 1.6,
    mode: 'reflected',
    isWhiteLight: false
  });

  // UI state
  const [activeTab, setActiveTab] = useState<'canvas' | 'schematic' | 'theory'>('canvas');
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showRingsOverlay, setShowRingsOverlay] = useState<boolean>(false);
  const [hoveredRadius, setHoveredRadius] = useState<number | null>(null);
  const [hoveredRingIndex, setHoveredRingIndex] = useState<{ type: 'bright' | 'dark'; m: number } | null>(null);
  
  // Custom interactive wavelength presets
  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number>(-1);

  // Canvas ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Spectrum derivation
  const spectrum = useMemo(() => {
    return generateSpectrum(params);
  }, [params]);

  // Derived coherence length (in micrometers)
  const coherenceLength = useMemo(() => {
    return calculateCoherenceLength(params);
  }, [params]);

  // Precomputed 1D radial profiles for hyper-performance rendering (1024 points)
  // Maps radius 0 to r_max * sqrt(2) (to cover the diagonals of the canvas)
  const radialColorProfile = useMemo(() => {
    const pointsCount = 1000;
    const profile: { r: number; g: number; b: number; intensity: number }[] = [];
    const rMaxMeters = params.maxRadiusView * 1e-3;
    const maxRadiusDiagonal = rMaxMeters * Math.SQRT2;

    for (let k = 0; k < pointsCount; k++) {
      const r = (k / (pointsCount - 1)) * maxRadiusDiagonal;
      
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let totalIntensitySum = 0;

      for (let s = 0; s < spectrum.length; s++) {
        const sample = spectrum[s];
        const intensity = calculateIntensityForWavelength(r, sample.wavelength, params);
        
        sumR += sample.weight * intensity * sample.color.r;
        sumG += sample.weight * intensity * sample.color.g;
        sumB += sample.weight * intensity * sample.color.b;
        
        totalIntensitySum += sample.weight * intensity;
      }

      profile.push({
        r: Math.min(255, Math.max(0, Math.round(sumR))),
        g: Math.min(255, Math.max(0, Math.round(sumG))),
        b: Math.min(255, Math.max(0, Math.round(sumB))),
        intensity: totalIntensitySum
      });
    }

    return profile;
  }, [params, spectrum]);

  // Handle canvas drawing on profile or param updates
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    // Radius scaling: width/2 pixels corresponds to maxRadiusView in meters
    const halfWidth = width / 2;
    const maxDiagonalPixels = Math.sqrt(centerX * centerX + centerY * centerY);

    // Profile points count (1000)
    const profileSize = radialColorProfile.length;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const distPixels = Math.sqrt(dx * dx + dy * dy);

        // Convert pixel distance to index in our precomputed 1D profile
        // Map diagonal distance range to 1000 steps
        const profileIndex = Math.min(
          profileSize - 1,
          Math.floor((distPixels / maxDiagonalPixels) * (profileSize - 1))
        );

        const color = radialColorProfile[profileIndex];
        const pixelIdx = (y * width + x) * 4;

        data[pixelIdx] = color.r;
        data[pixelIdx + 1] = color.g;
        data[pixelIdx + 2] = color.b;
        data[pixelIdx + 3] = 255; // Fully opaque
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Draw grid overlays if enabled
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;

      // Draw horizontal & vertical axes
      ctx.beginPath();
      ctx.moveTo(centerX, 0);
      ctx.lineTo(centerX, height);
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();

      // Circles for grid steps (every 0.5 mm or appropriate)
      const stepMm = params.maxRadiusView > 2.5 ? 1.0 : 0.5;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '10px monospace';

      for (let rMm = stepMm; rMm < params.maxRadiusView; rMm += stepMm) {
        const rPixels = (rMm / params.maxRadiusView) * halfWidth;
        ctx.beginPath();
        ctx.arc(centerX, centerY, rPixels, 0, 2 * Math.PI);
        ctx.stroke();

        // Labels
        ctx.fillText(`${rMm.toFixed(1)} мм`, centerX + rPixels + 4, centerY - 6);
      }
    }

    // Highlight hovered ring index if active
    if (showRingsOverlay || hoveredRingIndex) {
      const activeRing = hoveredRingIndex;
      if (activeRing) {
        const m = activeRing.m;
        const lambda0_m = params.centerWavelength * 1e-9;
        const R = params.lensRadius;
        const n = params.refractiveIndex;
        let rMeters = 0;

        if (params.mode === 'reflected') {
          if (activeRing.type === 'dark') {
            rMeters = Math.sqrt(m * lambda0_m * R / n);
          } else {
            rMeters = Math.sqrt((m + 0.5) * lambda0_m * R / n);
          }
        } else {
          // transmitted
          if (activeRing.type === 'bright') {
            rMeters = Math.sqrt(m * lambda0_m * R / n);
          } else {
            rMeters = Math.sqrt((m + 0.5) * lambda0_m * R / n);
          }
        }

        const rMm = rMeters * 1000;
        if (rMm <= params.maxRadiusView) {
          const rPixels = (rMm / params.maxRadiusView) * halfWidth;
          ctx.strokeStyle = activeRing.type === 'dark' ? '#ef4444' : '#10b981';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([5, 3]);
          ctx.beginPath();
          ctx.arc(centerX, centerY, rPixels, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = activeRing.type === 'dark' ? '#fecaca' : '#d1fae5';
          ctx.font = 'bold 11px monospace';
          ctx.fillText(
            `${activeRing.type === 'dark' ? 'Темное' : 'Светлое'} m=${m} (${rMm.toFixed(3)} мм)`,
            centerX - rPixels + 6,
            centerY - rPixels - 6
          );
        }
      }
    }

    // Highlight currently hovered radius
    if (hoveredRadius !== null && hoveredRadius <= params.maxRadiusView) {
      const rPixels = (hoveredRadius / params.maxRadiusView) * halfWidth;
      ctx.strokeStyle = 'rgba(235, 196, 50, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(centerX, centerY, rPixels, 0, 2 * Math.PI);
      ctx.stroke();
    }

  }, [radialColorProfile, params, showGrid, showRingsOverlay, hoveredRingIndex, hoveredRadius]);

  // Compute points for SVG graph (from -r_max to +r_max, 400 points)
  const chartData = useMemo(() => {
    const points: PointData[] = [];
    const pointsCount = 301;
    const rMax = params.maxRadiusView; // mm

    for (let i = 0; i < pointsCount; i++) {
      // Offset from -r_max to +r_max mm
      const radiusMmSigned = -rMax + (i / (pointsCount - 1)) * (2 * rMax);
      const absRadiusMeters = Math.abs(radiusMmSigned) * 1e-3;

      // Compute total intensity as weighted average of spectrum contributions
      let sumIntensity = 0;
      for (let s = 0; s < spectrum.length; s++) {
        const sample = spectrum[s];
        const intensity = calculateIntensityForWavelength(absRadiusMeters, sample.wavelength, params);
        sumIntensity += sample.weight * intensity;
      }

      // Compute visual representation color
      // Find index in 1D profile
      const rMaxMeters = params.maxRadiusView * 1e-3;
      const diagonalLimit = rMaxMeters * Math.SQRT2;
      const ratio = absRadiusMeters / diagonalLimit;
      const profileSize = radialColorProfile.length;
      const profileIndex = Math.min(
        profileSize - 1,
        Math.floor(ratio * (profileSize - 1))
      );

      const profileColor = radialColorProfile[profileIndex];
      const colorHex = rgbToHex(profileColor?.r ?? 0, profileColor?.g ?? 0, profileColor?.b ?? 0);

      points.push({
        radiusMm: radiusMmSigned,
        intensity: sumIntensity,
        colorHex: colorHex
      });
    }

    return points;
  }, [params, spectrum, radialColorProfile]);

  // Handle canvas mouse tracking
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const dx = x - centerX;
    const dy = y - centerY;
    const distPixels = Math.sqrt(dx * dx + dy * dy);

    const halfWidth = canvas.width / 2;
    const radiusMm = (distPixels / halfWidth) * params.maxRadiusView;

    setHoveredRadius(radiusMm);
  };

  const handleCanvasMouseLeave = () => {
    setHoveredRadius(null);
  };

  // Preset activation
  const applyPreset = (idx: number) => {
    const preset = PRESETS[idx];
    setSelectedPresetIndex(idx);
    setParams(prev => ({
      ...prev,
      centerWavelength: preset.lambda,
      spectrumWidth: preset.delta,
      lensRadius: preset.R,
      refractiveIndex: preset.n,
      isWhiteLight: preset.isWhite
    }));
  };

  // Calculate rings coordinate lists (first 10 zones)
  const ringCoordinates = useMemo(() => {
    const lambda0_m = params.centerWavelength * 1e-9;
    const R = params.lensRadius;
    const n = params.refractiveIndex;

    const dark: { m: number; rMm: number }[] = [];
    const bright: { m: number; rMm: number }[] = [];

    // Reflection equations: 
    // Dark rings: r = sqrt(m * lambda * R / n)
    // Bright rings: r = sqrt((m + 0.5) * lambda * R / n)
    
    // Transmission equations are opposite:
    // Bright rings: r = sqrt(m * lambda * R / n)
    // Dark rings: r = sqrt((m + 0.5) * lambda * R / n)

    const isReflected = params.mode === 'reflected';

    for (let m = 0; m < 15; m++) {
      // Standard ring equations in meters
      const rMetersEqual = Math.sqrt(m * lambda0_m * R / n);
      const rMetersFractionVal = Math.sqrt((m + 0.5) * lambda0_m * R / n);

      const rMmEqual = rMetersEqual * 1000;
      const rMmFrac = rMetersFractionVal * 1000;

      if (isReflected) {
        if (rMmEqual <= params.maxRadiusView && m > 0) {
          dark.push({ m, rMm: rMmEqual });
        }
        if (rMmFrac <= params.maxRadiusView) {
          bright.push({ m, rMm: rMmFrac });
        }
      } else {
        // Transmitted
        if (rMmEqual <= params.maxRadiusView && m > 0) {
          bright.push({ m, rMm: rMmEqual });
        }
        if (rMmFrac <= params.maxRadiusView) {
          dark.push({ m, rMm: rMmFrac });
        }
      }
    }

    return { dark, bright };
  }, [params]);

  // Quick settings for Medium helper
  const applyMedium = (n: number) => {
    setParams(prev => ({ ...prev, refractiveIndex: n }));
  };

  // Compute intensity at hovered radius for real-time readout
  const intensityAtHoveredRadius = useMemo(() => {
    if (hoveredRadius === null) return null;
    const rMeters = hoveredRadius * 1e-3;

    let summedIntensity = 0;
    for (let s = 0; s < spectrum.length; s++) {
      const sample = spectrum[s];
      const intensity = calculateIntensityForWavelength(rMeters, sample.wavelength, params);
      summedIntensity += sample.weight * intensity;
    }
    return summedIntensity;
  }, [hoveredRadius, spectrum, params]);

  // Construct chart path coordinates for clean customized SVG
  const chartSvgPath = useMemo(() => {
    if (chartData.length === 0) return '';
    const width = 500;
    const height = 120;
    const padding = { top: 10, bottom: 10, left: 10, right: 10 };
    
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const rMax = params.maxRadiusView;

    let pathPoints = '';
    for (let i = 0; i < chartData.length; i++) {
      const d = chartData[i];
      // Map radiusMm [-rMax, +rMax] to [0, chartW]
      const xRatio = (d.radiusMm + rMax) / (2 * rMax);
      const x = padding.left + xRatio * chartW;
      
      // Map intensity [0, 1] to [chartH, 0]
      const y = padding.top + (1 - d.intensity) * chartH;
      
      if (i === 0) {
        pathPoints += `M ${x.toFixed(1)} ${y.toFixed(1)}`;
      } else {
        pathPoints += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
    }
    return pathPoints;
  }, [chartData, params.maxRadiusView]);

  // Coherence visibility envelop path (decorating the chart in quasi-mono mode)
  // Visibility contrast decay is approx: V(r) = exp(- (r^2 / 2R) / L_c)
  // Let's plot this envelope beautifully to make it look incredibly scientific!
  const envelopePaths = useMemo(() => {
    if (params.spectrumWidth <= 2 || params.isWhiteLight) return { top: '', bottom: '' };
    
    const width = 500;
    const height = 120;
    const padding = { top: 10, bottom: 10, left: 10, right: 10 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;
    const rMax = params.maxRadiusView;

    let topPath = '';
    let bottomPath = '';

    const R = params.lensRadius;
    const n = params.refractiveIndex;
    const lambda0 = params.centerWavelength * 1e-9;
    const deltaLambda = params.spectrumWidth * 1e-9;
    
    // Coherence length in meters Lc = lambda0^2 / deltaLambda
    const L_c = (lambda0 * lambda0) / deltaLambda;

    for (let i = 0; i <= 150; i++) {
      const radiusMmSigned = -rMax + (i / 150) * (2 * rMax);
      const r = Math.abs(radiusMmSigned) * 1e-3;
      const h = (r * r) / (2 * R);
      
      // Coherence factor (degree of coherence)
      // For Gaussian spectrum: g(tau) = exp(- (pi^2 * delta_nu^2 * tau^2) / (4 * ln2))
      // It is simpler to plot the envelope as visual cue: V(r) = exp(- pi * (2 * n * h) / L_c)
      const opDifference = 2 * n * h;
      const V = Math.exp(-Math.pow((Math.PI * opDifference) / L_c, 2));

      const xRatio = (radiusMmSigned + rMax) / (2 * rMax);
      const x = padding.left + xRatio * chartW;

      // Top of envelope (intensity = 0.5 + 0.5 * V)
      const yTop = padding.top + (1 - (0.5 + 0.5 * V)) * chartH;
      // Bottom of envelope (intensity = 0.5 - 0.5 * V)
      const yBottom = padding.top + (1 - (0.5 - 0.5 * V)) * chartH;

      if (i === 0) {
        topPath += `M ${x.toFixed(1)} ${yTop.toFixed(1)}`;
        bottomPath += `M ${x.toFixed(1)} ${yBottom.toFixed(1)}`;
      } else {
        topPath += ` L ${x.toFixed(1)} ${yTop.toFixed(1)}`;
        bottomPath += ` L ${x.toFixed(1)} ${yBottom.toFixed(1)}`;
      }
    }

    return { top: topPath, bottom: bottomPath };
  }, [params, params.maxRadiusView]);

  return (
    <div id="newtons-rings-app" className="min-h-screen bg-[#0e131f] text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* Top Professional Header */}
      <header id="app-header" className="border-b border-slate-800 bg-[#0b0e17]/95 sticky top-0 z-50 px-4 py-3.5 backdrop-blur shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-md shadow-indigo-500/10">
              <Compass className="h-5 w-5 text-white animate-spin-slow" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white flex items-center gap-1.5">
                Кольца Ньютона
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-cyan-400 border border-slate-700">Физ-Моделирование</span>
              </h1>
              <p className="text-xs text-slate-400">Интерактивная симуляция интерференционной картины воздушного клина</p>
            </div>
          </div>

          {/* Quick presets strip */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full no-scrollbar">
            <span className="text-xs font-mono text-slate-500 mr-1 hidden md:inline">Пресеты излучения:</span>
            {PRESETS.map((p, idx) => (
              <button
                key={idx}
                onClick={() => applyPreset(idx)}
                className={`text-xs px-2.5 py-1.5 rounded-lg border font-mono transition-all duration-200 whitespace-nowrap ${
                  selectedPresetIndex === idx
                    ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500 shadow-md shadow-indigo-900/10'
                    : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Controls & Equipment State (lg:span-5) */}
        <section id="controls-section" className="lg:col-span-5 flex flex-col gap-5">
          
          {/* Main Controls Card */}
          <div className="bg-[#131929] border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="border-b border-slate-800 px-5 py-3.5 bg-gradient-to-r from-[#171e32] to-[#131929] flex items-center justify-between">
              <h2 className="font-semibold text-slate-200 flex items-center gap-2 text-sm uppercase tracking-wider">
                <Sliders className="h-4 w-4 text-cyan-400" />
                Параметры эксперимента
              </h2>
              <button 
                onClick={() => {
                  setParams({
                    lensRadius: 2.5,
                    centerWavelength: 550,
                    spectrumWidth: 20,
                    refractiveIndex: 1.0,
                    maxRadiusView: 1.6,
                    mode: 'reflected',
                    isWhiteLight: false
                  });
                  setSelectedPresetIndex(-1);
                }}
                title="Сбросить к исходным" 
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-5">
              {/* INTERFERENCE TYPE MODE SWITCHER */}
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">Схема наблюдения</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setParams(prev => ({ ...prev, mode: 'reflected' }))}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition duration-200 ${
                      params.mode === 'reflected'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                    }`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Отраженный свет
                  </button>
                  <button
                    onClick={() => setParams(prev => ({ ...prev, mode: 'transmitted' }))}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition duration-200 ${
                      params.mode === 'transmitted'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                    }`}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    Проходящий свет
                  </button>
                </div>
              </div>

              {/* LIGHT SOURCE TYPE CONTROLS */}
              <div className="border-t border-slate-800/80 pt-4">
                <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">Характер источника света</label>
                
                <div className="grid grid-cols-3 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 mb-4 text-[11px]">
                  <button
                    onClick={() => {
                      setParams(p => ({ ...p, isWhiteLight: false, spectrumWidth: 0 }));
                      setSelectedPresetIndex(-1);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-center transition ${
                      !params.isWhiteLight && params.spectrumWidth <= 0
                        ? 'bg-slate-800 text-cyan-400 font-semibold border border-slate-700'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Монохромат.
                  </button>
                  <button
                    onClick={() => {
                      setParams(p => ({ ...p, isWhiteLight: false, spectrumWidth: Math.max(5, p.spectrumWidth) }));
                      setSelectedPresetIndex(-1);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-center transition ${
                      !params.isWhiteLight && params.spectrumWidth > 0
                        ? 'bg-slate-800 text-cyan-400 font-semibold border border-slate-700'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Квазимонохр.
                  </button>
                  <button
                    onClick={() => {
                      setParams(p => ({ ...p, isWhiteLight: true }));
                      setSelectedPresetIndex(-1);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-center transition ${
                      params.isWhiteLight
                        ? 'bg-slate-800 text-cyan-400 font-semibold border border-slate-700'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Белый свет
                  </button>
                </div>

                {/* DYNAMIC SETTINGS FOR CURRENT LIGHT SOURCE */}
                {params.isWhiteLight ? (
                  <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/80 text-xs text-slate-400 flex items-start gap-2 animate-fadeIn">
                    <Sparkles className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-300">Режим белого света активен</p>
                      <p className="mt-1 leading-relaxed text-[11px]">
                        Имитирует непрерывный солнечный спектр спектрального диапазона <strong className="text-slate-300 font-mono">380-750 нм</strong>. Из-за разного радиуса колец для разных длин волн формируется красивая многоцветная (радужная) интерференция, быстро затухающая при росте радиуса.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 animate-fadeIn">
                    {/* Center Wavelength λ_0 */}
                    <div>
                      <div className="flex items-center justify-between text-xs font-mono mb-1">
                        <span className="text-slate-400">Центральная длина волны (λ₀):</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="380"
                            max="780"
                            value={params.centerWavelength}
                            onChange={(e) => {
                              const val = Math.min(780, Math.max(380, Number(e.target.value)));
                              setParams(prev => ({ ...prev, centerWavelength: val }));
                              setSelectedPresetIndex(-1);
                            }}
                            className="w-14 bg-slate-950 border border-slate-800 text-center py-0.5 text-cyan-400 rounded focus:outline-none focus:border-cyan-500 font-semibold"
                          />
                          <span className="text-slate-500">нм</span>
                        </div>
                      </div>
                      
                      {/* Interactive Colored Slider Track */}
                      <div className="relative mt-2">
                        <input
                          type="range"
                          min="380"
                          max="780"
                          value={params.centerWavelength}
                          onChange={(e) => {
                            setParams(prev => ({ ...prev, centerWavelength: Number(e.target.value) }));
                            setSelectedPresetIndex(-1);
                          }}
                          className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                          style={{
                            background: `linear-gradient(to right, 
                              #8b5cf6 0%,  /* 380nm Purple */
                              #3b82f6 20%, /* 460nm Blue */
                              #06b6d4 35%, /* 520nm Cyan */
                              #10b981 48%, /* 572nm Green */
                              #eab308 65%, /* 640nm Yellow */
                              #ef4444 85%, /* 700nm Red */
                              #991b1b 100% /* 785nm Deep Red */
                            )`
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1 px-0.5">
                        <span>Фиолетовый (380)</span>
                        <span>Зеленый (550)</span>
                        <span>Красный (780)</span>
                      </div>
                    </div>

                    {/* Spectral Width Δλ */}
                    <div>
                      <div className="flex items-center justify-between text-xs font-mono mb-1">
                        <span className="text-slate-400">Ширина спектра излучения (Δλ):</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max="300"
                            step="0.5"
                            value={params.spectrumWidth}
                            onChange={(e) => {
                              const val = Math.min(300, Math.max(0, Number(e.target.value)));
                              setParams(prev => ({ ...prev, spectrumWidth: val }));
                              setSelectedPresetIndex(-1);
                            }}
                            className="w-14 bg-slate-950 border border-slate-800 text-center py-0.5 text-cyan-400 rounded focus:outline-none focus:border-cyan-500 font-semibold"
                          />
                          <span className="text-slate-500">нм</span>
                        </div>
                      </div>
                      
                      {/* Simple slide */}
                      <input
                        type="range"
                        min="0"
                        max="300"
                        step="1"
                        value={params.spectrumWidth}
                        onChange={(e) => {
                          setParams(prev => ({ ...prev, spectrumWidth: Number(e.target.value) }));
                          setSelectedPresetIndex(-1);
                        }}
                        className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                      <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1 px-0.5">
                        <span>Сверхчистый (0 нм)</span>
                        <span>Квазимоно (10-30 нм)</span>
                        <span>Широкий (300 нм)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* LENS GEOMETRY CURVATURE */}
              <div className="border-t border-slate-800/80 pt-4">
                <div className="flex items-center justify-between text-xs font-mono mb-1">
                  <span className="text-slate-400 flex items-center gap-1">
                    Радиус кривизны линзы (R):
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0.5"
                      max="15"
                      step="0.1"
                      value={params.lensRadius}
                      onChange={(e) => {
                        const val = Math.min(15, Math.max(0.2, Number(e.target.value)));
                        setParams(prev => ({ ...prev, lensRadius: val }));
                      }}
                      className="w-14 bg-slate-950 border border-slate-800 text-center py-0.5 text-cyan-400 rounded focus:outline-none focus:border-cyan-500 font-semibold"
                    />
                    <span className="text-slate-500">м</span>
                  </div>
                </div>

                <input
                  type="range"
                  min="0.5"
                  max="15.0"
                  step="0.1"
                  value={params.lensRadius}
                  onChange={(e) => setParams(prev => ({ ...prev, lensRadius: Number(e.target.value) }))}
                  className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-teal-500"
                />
                <p className="text-[10px] text-slate-500 leading-tight mt-1">
                  Больший радиус R увеличивает ширину колец, делая мелкие круги более разреженными.
                </p>
              </div>

              {/* MEDIUM IN THE GAP (REFRACTIVE INDEX) */}
              <div className="border-t border-slate-800/80 pt-4">
                <div className="flex items-center justify-between text-xs font-mono mb-1">
                  <span className="text-slate-400">Среда в зазоре (Показатель преломления n):</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1.0"
                      max="1.8"
                      step="0.001"
                      value={params.refractiveIndex}
                      onChange={(e) => {
                        const val = Math.min(1.8, Math.max(1.0, Number(e.target.value)));
                        setParams(prev => ({ ...prev, refractiveIndex: val }));
                      }}
                      className="w-16 bg-slate-950 border border-slate-800 text-center py-0.5 text-cyan-400 rounded focus:outline-none focus:border-cyan-500 font-semibold"
                    />
                  </div>
                </div>

                <input
                  type="range"
                  min="1.00"
                  max="1.80"
                  step="0.01"
                  value={params.refractiveIndex}
                  onChange={(e) => setParams(prev => ({ ...prev, refractiveIndex: Number(e.target.value) }))}
                  className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-pink-500"
                />

                {/* Quick preset buttons for medium */}
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {MEDIUMS.map((m, i) => (
                    <button
                      key={i}
                      onClick={() => applyMedium(m.n)}
                      className={`text-[10px] px-2 py-1 rounded transition border ${
                        Math.abs(params.refractiveIndex - m.n) < 0.005
                          ? 'bg-pink-950/40 text-pink-400 border-pink-700 font-semibold'
                          : 'bg-slate-950/80 text-slate-400 border-slate-800/80 hover:text-slate-300'
                      }`}
                      title={m.name}
                    >
                      {m.name.split(' ')[0]} ({m.n})
                    </button>
                  ))}
                </div>
              </div>

              {/* ZOOM & OBSERVATION RANGE */}
              <div className="border-t border-slate-800/80 pt-4">
                <div className="flex items-center justify-between text-xs font-mono mb-1">
                  <span className="text-slate-400">Диапазон видимости (r_max в мм):</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0.2"
                      max="5.0"
                      step="0.1"
                      value={params.maxRadiusView}
                      onChange={(e) => {
                        const val = Math.min(5.0, Math.max(0.1, Number(e.target.value)));
                        setParams(prev => ({ ...prev, maxRadiusView: val }));
                      }}
                      className="w-14 bg-slate-950 border border-slate-800 text-center py-0.5 text-cyan-400 rounded focus:outline-none focus:border-cyan-500 font-semibold"
                    />
                    <span className="text-slate-500">мм</span>
                  </div>
                </div>

                <input
                  type="range"
                  min="0.2"
                  max="5.0"
                  step="0.1"
                  value={params.maxRadiusView}
                  onChange={(e) => setParams(prev => ({ ...prev, maxRadiusView: Number(e.target.value) }))}
                  className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>

            </div>
          </div>

          {/* Real-time Physical Attributes Display Card */}
          <div className="bg-[#131929] border border-slate-800 rounded-2xl shadow-xl p-5">
            <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-emerald-400" />
              Физические показатели
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <p className="text-[10px] text-slate-500 font-mono">Длина когерентности L_c</p>
                <p className="text-lg font-mono font-semibold text-emerald-400 mt-1">
                  {coherenceLength === Infinity ? (
                    '∞ (Теор.)'
                  ) : (
                    <>
                      {coherenceLength.toFixed(2)} <span className="text-xs">мкм</span>
                    </>
                  )}
                </p>
                <p className="text-[9px] text-slate-500 mt-1.5 inline-block leading-tight">
                  {params.spectrumWidth <= 0 
                    ? 'Идеальная когерентность волн' 
                    : `Интерференция угасает за пределами r ≈ ${Math.sqrt((coherenceLength/1000) * params.lensRadius / params.refractiveIndex * 1000).toFixed(2)} мм`}
                </p>
              </div>

              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <p className="text-[10px] text-slate-500 font-mono">Центральный минимум</p>
                <p className="text-lg font-semibold text-sky-400 mt-1">
                  {params.mode === 'reflected' ? 'ТЕМНЫЙ' : 'СВЕТЛЫЙ'}
                </p>
                <p className="text-[9px] text-slate-500 mt-1.5 inline-block leading-tight">
                  {params.mode === 'reflected' 
                    ? 'Потеря полуволны (сдвиг π) при отражении'
                    : 'Прямое прохождение без фазового скачка'}
                </p>
              </div>
            </div>

            <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3.5 mt-3 text-xs leading-relaxed text-slate-400">
              <span className="font-semibold text-slate-200">Физический эффект:</span> при помещении жидкости с высоким <strong className="text-pink-400 font-mono">n</strong> в зазор, оптическая разность хода возрастает, из-за чего кольца спадают к центру (эффект сжатия картины). Проверьте этот эффект на воде!
            </div>
          </div>

        </section>

        {/* RIGHT COLUMN: Interactive Views & Plot Charts (lg:span-7) */}
        <section id="visualization-section" className="lg:col-span-7 flex flex-col gap-5">
          
          {/* View Tab selector */}
          <div className="flex bg-[#131929] border border-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('canvas')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                activeTab === 'canvas'
                  ? 'bg-indigo-600 font-semibold text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-950/40'
              }`}
            >
              <Eye className="h-4 w-4" />
              Интерференционные кольца
            </button>
            <button
              onClick={() => setActiveTab('schematic')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                activeTab === 'schematic'
                  ? 'bg-indigo-600 font-semibold text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-950/40'
              }`}
            >
              <Layers className="h-4 w-4" />
              Оптическая схема эксперимента
            </button>
            <button
              onClick={() => setActiveTab('theory')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition overflow-hidden whitespace-nowrap ${
                activeTab === 'theory'
                  ? 'bg-indigo-600 font-semibold text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-950/40'
              }`}
            >
              <BookOpen className="h-4 w-4" />
              Физическая теория
            </button>
          </div>

          {/* Active Tab rendering */}
          <div className="bg-[#131929] border border-slate-800 rounded-2xl shadow-xl p-5 flex flex-col items-center">
            
            <AnimatePresence mode="wait">
              {activeTab === 'canvas' && (
                <motion.div
                  key="canvas-tab"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="w-full flex flex-col items-center gap-4"
                >
                  {/* Outer Frame for Simulator Canvas */}
                  <div className="relative border-4 border-slate-950 rounded-2xl p-0.5 bg-slate-950 shadow-inner flex items-center justify-center w-full max-w-[410px] aspect-square">
                    <canvas
                      ref={canvasRef}
                      width={400}
                      height={400}
                      onMouseMove={handleCanvasMouseMove}
                      onMouseLeave={handleCanvasMouseLeave}
                      className="rounded-xl cursor-crosshair w-full h-full bg-black block"
                    />

                    {/* Interactive Canvas readout */}
                    {hoveredRadius !== null && hoveredRadius <= params.maxRadiusView && (
                      <div className="absolute bottom-4 left-4 right-4 bg-slate-950/90 border border-slate-800 backdrop-blur-md px-3 py-2 rounded-xl text-xs font-mono flex justify-between items-center shadow-lg">
                        <span className="text-slate-400">r = <strong className="text-amber-400 font-semibold">{hoveredRadius.toFixed(3)}</strong> мм</span>
                        <span className="text-slate-400">Интенсивность = <strong className="text-cyan-400">{intensityAtHoveredRadius !== null ? Math.round(intensityAtHoveredRadius * 100) : 0}%</strong></span>
                      </div>
                    )}
                  </div>

                  {/* Overlays toolbar */}
                  <div className="w-full flex items-center justify-between bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl">
                    <span className="text-xs text-slate-400 font-mono">Дополнительно:</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowGrid(!showGrid)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                          showGrid
                            ? 'bg-slate-800 text-teal-400 border-teal-800/80 font-semibold'
                            : 'bg-slate-950 text-slate-500 border-slate-900 hover:text-slate-300'
                        }`}
                      >
                        Оси & Линейка
                      </button>
                      
                      <button
                        onClick={() => setShowRingsOverlay(!showRingsOverlay)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                          showRingsOverlay
                            ? 'bg-slate-800 text-teal-400 border-teal-800/80 font-semibold'
                            : 'bg-slate-950 text-slate-500 border-slate-900 hover:text-slate-300'
                        }`}
                        title="Подсветить теоретические положения колец"
                      >
                        Теорет. Кольца
                      </button>
                    </div>
                  </div>

                  {/* Intensity coordinates continuous plotting */}
                  <div className="w-full mt-2">
                    <div className="flex items-center justify-between mb-1 px-1">
                      <h3 className="text-xs font-mono text-slate-300 flex items-center gap-1">
                        <Activity className="h-3.5 w-3.5 text-cyan-400" />
                        График зависимости интенсивности I(r)
                      </h3>
                      <span className="text-[10px] font-mono text-slate-500">I ∈ [0, 1]</span>
                    </div>

                    {/* Chart Frame */}
                    <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 relative overflow-hidden">
                      
                      {/* Responsive Styled SVG Line chart */}
                      <svg viewBox="0 0 500 120" className="w-full h-auto overflow-visible">
                        {/* Grid lines */}
                        <line x1="10" y1="10" x2="490" y2="10" stroke="rgba(255,255,255,0.05)" />
                        <line x1="10" y1="65" x2="490" y2="65" stroke="rgba(255,255,255,0.05)" />
                        <line x1="10" y1="110" x2="490" y2="110" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
                        <line x1="250" y1="5" x2="250" y2="115" stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="3,3" />

                        {/* Spectral Color strip gradient underneath */}
                        <defs>
                          <linearGradient id="chart-bg-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            {chartData.filter((_, idx) => idx % 6 === 0 || idx === chartData.length - 1).map((d, index, arr) => {
                              const ratio = index / (arr.length - 1);
                              return (
                                <stop key={index} offset={`${ratio * 100}%`} stopColor={d.colorHex} stopOpacity="0.12" />
                              );
                            })}
                          </linearGradient>
                        </defs>
                        <rect x="10" y="10" width="480" height="100" fill="url(#chart-bg-gradient)" />

                        {/* Coherence Visibility Envelope */}
                        {envelopePaths.top && (
                          <>
                            <path d={envelopePaths.top} fill="none" stroke="rgba(168, 85, 247, 0.25)" strokeWidth="1" strokeDasharray="2,2" />
                            <path d={envelopePaths.bottom} fill="none" stroke="rgba(168, 85, 247, 0.25)" strokeWidth="1" strokeDasharray="2,2" />
                          </>
                        )}

                        {/* Primary plot line */}
                        <path
                          d={chartSvgPath}
                          fill="none"
                          stroke={params.isWhiteLight ? '#cbd5e1' : rgbToHex(
                            wavelengthToRGB(params.centerWavelength).r,
                            wavelengthToRGB(params.centerWavelength).g,
                            wavelengthToRGB(params.centerWavelength).b
                          )}
                          strokeWidth="2"
                          className="transition-all duration-300"
                        />

                        {/* Vertical pointer on click / hover */}
                        {hoveredRadius !== null && hoveredRadius <= params.maxRadiusView && (
                          <>
                            {/* Hover left point */}
                            {(() => {
                              const leftX = 250 - (hoveredRadius / params.maxRadiusView) * 240;
                              return (
                                <line x1={leftX} y1="5" x2={leftX} y2="115" stroke="rgba(235, 196, 50, 0.6)" strokeWidth="1" />
                              );
                            })()}
                            {/* Hover right point */}
                            {(() => {
                              const rightX = 250 + (hoveredRadius / params.maxRadiusView) * 240;
                              return (
                                <>
                                  <line x1={rightX} y1="5" x2={rightX} y2="115" stroke="rgba(235, 196, 50, 0.6)" strokeWidth="1" />
                                  <circle cx={rightX} cy={10 + (1 - (intensityAtHoveredRadius ?? 0.5)) * 100} r="4" fill="#f59e0b" />
                                </>
                              );
                            })()}
                          </>
                        )}

                        {/* Interactive hovered ring highlighting indicator line */}
                        {hoveredRingIndex && (
                          (() => {
                            const m = hoveredRingIndex.m;
                            const lambda0_m = params.centerWavelength * 1e-9;
                            const R = params.lensRadius;
                            const n = params.refractiveIndex;
                            let rMeters = 0;

                            if (params.mode === 'reflected') {
                              rMeters = (hoveredRingIndex.type === 'dark')
                                ? Math.sqrt(m * lambda0_m * R / n)
                                : Math.sqrt((m + 0.5) * lambda0_m * R / n);
                            } else {
                              rMeters = (hoveredRingIndex.type === 'bright')
                                ? Math.sqrt(m * lambda0_m * R / n)
                                : Math.sqrt((m + 0.5) * lambda0_m * R / n);
                            }

                            const rMm = rMeters * 1000;
                            if (rMm <= params.maxRadiusView) {
                              const svgX_left = 250 - (rMm / params.maxRadiusView) * 240;
                              const svgX_right = 250 + (rMm / params.maxRadiusView) * 240;
                              return (
                                <>
                                  <line x1={svgX_left} y1="5" x2={svgX_left} y2="115" stroke={hoveredRingIndex.type === 'dark' ? '#ef4444' : '#10b981'} strokeWidth="1.5" strokeDasharray="3,1" />
                                  <line x1={svgX_right} y1="5" x2={svgX_right} y2="115" stroke={hoveredRingIndex.type === 'dark' ? '#ef4444' : '#10b981'} strokeWidth="1.5" strokeDasharray="3,1" />
                                </>
                              );
                            }
                            return null;
                          })()
                        )}

                        {/* Chart Labels */}
                        <text x="5" y="118" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="monospace">-{params.maxRadiusView.toFixed(1)} мм</text>
                        <text x="254" y="118" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="monospace">r = 0 (Ось)</text>
                        <text x="450" y="118" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="monospace">+{params.maxRadiusView.toFixed(1)} мм</text>
                        <text x="254" y="15" fill="rgba(255,255,255,0.3)" fontSize="8" fontFamily="monospace" textAnchor="middle">Центр клина</text>
                      </svg>

                      {/* Continuous spectrum rainbow horizontal strip */}
                      <div className="h-2 w-[480px] mx-auto rounded-full mt-2 relative border border-slate-900" 
                        style={{
                          background: `linear-gradient(to right, ${chartData.filter((_, idx)=>idx%10===0 || idx===chartData.length-1).map(d => d.colorHex).join(', ')})`
                        }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'schematic' && (
                <motion.div
                  key="schematic-tab"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="w-full flex flex-col items-center gap-4"
                >
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 w-full">
                    <h3 className="text-sm font-semibold text-teal-400 mb-3 font-mono">
                      Интерактивная диаграмма интерференционного клина
                    </h3>
                    
                    {/* SVG Physical schematic drawing representing lens curvature, air thickness, reflected beams */}
                    <svg viewBox="0 0 500 240" className="w-full h-auto max-w-[460px] mx-auto bg-slate-950/20 border border-slate-900 rounded-lg p-2">
                      {/* Incident light wave representation */}
                      <g stroke="rgba(34, 211, 238, 0.3)" strokeWidth="1.5">
                        <line x1="180" y1="10" x2="180" y2="40" />
                        <line x1="220" y1="10" x2="220" y2="40" />
                        <line x1="250" y1="5" x2="250" y2="45" stroke="rgba(34, 211, 238, 0.45)" />
                        <line x1="280" y1="10" x2="280" y2="40" />
                        <line x1="320" y1="10" x2="320" y2="40" />
                      </g>
                      
                      {/* Downward Wave arrows */}
                      <g fill="rgba(34, 211, 238, 0.4)" stroke="none">
                        <polygon points="180,45 177,37 183,37" />
                        <polygon points="220,45 217,37 223,37" />
                        <polygon points="250,50 246,41 254,41" />
                        <polygon points="280,45 277,37 283,37" />
                        <polygon points="320,45 317,37 323,37" />
                      </g>

                      {/* TEXT: Incident light */}
                      <text x="250" y="16" fill="#22d3ee" fontSize="10" fontFamily="sans-serif" textAnchor="middle" className="font-semibold tracking-wider">Падающая плоская волна (λ₀)</text>

                      {/* Lens Bottom Spherical interface (Curved) */}
                      {/* Center of circle would be high up, representing Radius of curvature R */}
                      <path d="M 80,60 Q 250,150 420,60" fill="#38bdf8" fillOpacity="0.1" stroke="#38bdf8" strokeWidth="2.5" />
                      
                      {/* Flat Glass Plate below air layer */}
                      <rect x="50" y="170" width="400" height="25" fill="#1e293b" stroke="#64748b" strokeWidth="1.5" />

                      {/* Path difference representation details */}
                      <line x1="250" y1="150" x2="250" y2="170" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="2,2" />
                      <text x="256" y="163" fill="#f59e0b" fontSize="10" fontFamily="sans-serif">Зазор h</text>

                      {/* Reflections on beam ray #180 (air layer) */}
                      {/* Left vertical ray split reflection */}
                      <g stroke="#f43f5e" strokeWidth="1.5">
                        {/* Wave splits at bounding interface of lens bottom (y=112) */}
                        <line x1="180" y1="40" x2="180" y2="114" stroke="#e2e8f0" strokeWidth="1" />
                        
                        {/* Beam 1 reflects from bottom lens surface (going up) */}
                        <line x1="178" y1="114" x2="165" y2="50" />
                        {/* Beam 2 passes gap (114 to 170) and reflects from lower plate (y=170) (going up) */}
                        <line x1="180" y1="114" x2="180" y2="170" stroke="#e0f2fe" strokeWidth="1.5" />
                        <line x1="180" y1="170" x2="169" y2="50" stroke="#fb7185" />
                      </g>
                      
                      <text x="145" y="45" fill="#ef4444" fontSize="9" fontFamily="monospace">Луч 1</text>
                      <text x="175" y="45" fill="#f87171" fontSize="9" fontFamily="monospace">Луч 2</text>

                      {/* Labels on interfaces */}
                      <text x="360" y="90" fill="#38bdf8" fontSize="11" fontFamily="sans-serif" className="font-semibold">Стеклянная Линза</text>
                      <text x="250" y="210" fill="#64748b" fontSize="11" fontFamily="sans-serif" textAnchor="middle" className="font-semibold">Нижняя плоская пластина</text>
                      <text x="250" y="132" fill="#cbd5e1" fontSize="10" fontFamily="sans-serif" textAnchor="middle">Среда в зазоре n</text>

                      {/* Phase shifts descriptors */}
                      <rect x="55" y="115" width="105" height="40" rx="4" fill="#0f172a" stroke="#1e293b" />
                      <text x="60" y="128" fill="#94a3b8" fontSize="8" fontFamily="sans-serif">Линза ➔ Среда n</text>
                      <text x="60" y="140" fill="#22d3ee" fontSize="8" fontFamily="sans-serif">Отражение без сдвига фазы</text>
                      <text x="60" y="150" fill="#22d3ee" fontSize="8" fontFamily="sans-serif">(если n_линзы &gt; n)</text>

                      <rect x="340" y="115" width="105" height="40" rx="4" fill="#0f172a" stroke="#1e293b" />
                      <text x="345" y="128" fill="#94a3b8" fontSize="8" fontFamily="sans-serif">Среда n ➔ Пластина</text>
                      <text x="345" y="140" fill="#ef4444" fontSize="8" fontFamily="sans-serif">Сдвиг фазы на π (λ₀/2)</text>
                      <text x="345" y="150" fill="#ef4444" fontSize="8" fontFamily="sans-serif">(Отражение от более плотной)</text>
                    </svg>
                  </div>

                  <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 leading-relaxed text-left w-full">
                    <p className="font-semibold text-slate-200 mb-2">Объяснение оптической схемы:</p>
                    <ol className="list-decimal pl-4 flex flex-col gap-1.5 text-slate-400">
                      <li>Падающий вертикальный луч расщепляется в точке соприкосновения линзы с воздушной прослойкой.</li>
                      <li>
                        <strong className="text-slate-300">Первый отраженный луч</strong> образуется на сферической границе (стекло - среда с показателем <span className="font-mono text-pink-400">n</span>). Отражение происходит без изменения фазы.
                      </li>
                      <li>
                        <strong className="text-slate-300">Второй отраженный луч</strong> образуется на плоской стеклянной границе пластины (среда с показателем <span className="font-mono text-pink-400">n</span> - стекло). Так как показатель преломления стекла (1.5) обычно больше среды в зазоре, происходит отражение от оптически более плотной среды, приводящее к сдвигу фазы когерентных волн на <strong className="text-red-400 font-mono">π</strong> (потеря полуволны <strong className="text-red-400 font-mono">λ/2</strong>).
                      </li>
                      <li>
                        Накладываясь при возвращении вверх, лучи 1 и 2 интерферируют. Разность фаз зависит от толщины клина <span className="text-amber-400 font-semibold font-mono">h</span> в данной радиальной точке.
                      </li>
                    </ol>
                  </div>
                </motion.div>
              )}

              {activeTab === 'theory' && (
                <motion.div
                  key="theory-tab"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="w-full flex flex-col gap-4 text-left leading-relaxed text-slate-300 text-xs"
                >
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col gap-3">
                    <h3 className="text-sm font-semibold text-teal-400 font-mono">Математический аппарат явления</h3>
                    
                    <div>
                      <p className="mb-2">
                        Толщина зазора <span className="text-slate-200 font-semibold font-mono">h</span> на расстоянии <span className="text-slate-200 font-semibold font-mono">r</span> от центра контакта плосковыпуклой линзы радиуса <span className="text-slate-200 font-semibold font-mono">R</span>:
                      </p>
                      <div className="bg-[#131929] border border-slate-800 p-2 text-center rounded-lg font-mono text-cyan-400 font-semibold text-sm">
                        h ≈ r² / (2R)
                      </div>
                    </div>

                    <div className="mt-2">
                      <p className="mb-2">
                        Оптическая разность хода встречных волн <span className="text-slate-200 font-semibold font-mono">Δ</span> в отраженном свете (с учетом потери полуволны):
                      </p>
                      <div className="bg-[#131929] border border-slate-800 p-2 text-center rounded-lg font-mono text-cyan-400 font-semibold text-sm">
                        Δ = 2 · n · h + λ₀ / 2 = (n · r² / R) + λ₀ / 2
                      </div>
                    </div>

                    <div className="mt-2">
                      <p className="mb-1">
                        Условие интерференционных полос в отраженном свете:
                      </p>
                      <ul className="list-disc pl-4 text-slate-400 flex flex-col gap-1">
                        <li>
                          <strong className="text-red-400">Тёмные кольца (Минимум):</strong> разность хода равна нечетному числу полуволн, что дает радиусы:
                          <div className="mt-1 font-mono text-emerald-400 font-semibold bg-slate-900 p-1 text-center rounded">r_dark = √ ( m · λ · R / n ), &nbsp; m = 0, 1, 2...</div>
                        </li>
                        <li className="mt-1">
                          <strong className="text-emerald-400">Светлые кольца (Максимум):</strong> разность хода равна четному числу полуволн, радиусы:
                          <div className="mt-1 font-mono text-emerald-400 font-semibold bg-slate-900 p-1 text-center rounded">r_bright = √ ( (m + 1/2) · λ · R / n ), &nbsp; m = 0, 1, 2...</div>
                        </li>
                      </ul>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 mt-2">
                      <h4 className="font-semibold text-amber-400 mb-1">Квазимонохроматичность и когерентность</h4>
                      <p className="text-slate-400 text-[11px]">
                        Реальный свет имеет спектр шириной <span className="font-mono">Δλ</span>. Длина когерентности <span className="font-mono">L_c = λ₀² / Δλ</span> ограничивает предел интерференции. На разности хода <span className="font-mono">Δ &gt; L_c</span> интерференционные спектральные кольца смещаются относительно друг друга и картина полностью размывается в монотонный фон, равный цвету источника.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Ring coordinates metrics table (Highly Interactive) */}
          <div className="bg-[#131929] border border-slate-800 rounded-2xl shadow-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Table className="h-4 w-4 text-indigo-400" />
                Теоретические радиусы колец (в пределах области обзора)
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">λ₀ = {params.centerWavelength} нм</span>
            </div>

            <p className="text-[11px] text-slate-500 mb-3 block leading-relaxed">
              Наведите мышь на строчку таблицы колец, чтобы временно подсветить его окружность и увидеть точное положение на графике и холсте симулятора.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Dark rings table */}
              <div className="bg-slate-950/80 rounded-xl border border-slate-900 overflow-hidden">
                <div className="bg-red-950/30 text-red-400 font-mono text-xs px-3 py-2 border-b border-slate-900 font-semibold flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-red-500" />
                  Темные кольца (Минимумы {params.mode === 'reflected' ? 'отражения' : 'прохождения'})
                </div>

                <div className="max-h-56 overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead className="bg-slate-900/50 text-slate-500 border-b border-slate-900">
                      <tr>
                        <th className="px-3 py-1.5">Порядок (m)</th>
                        <th className="px-3 py-1.5">Радиус (r_m)</th>
                        <th className="px-3 py-1.5 text-right">Толщина зазора (h)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900">
                      {ringCoordinates.dark.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-4 text-center text-slate-600">Кольца отсутствуют в данной шкале</td>
                        </tr>
                      ) : (
                        ringCoordinates.dark.map((ring) => {
                          const hMm = Math.pow(ring.rMm * 1e-3, 2) / (2 * params.lensRadius) * 1e6; // in micrometers
                          const isHovered = hoveredRingIndex?.type === 'dark' && hoveredRingIndex?.m === ring.m;
                          return (
                            <tr
                              key={`dark-${ring.m}`}
                              onMouseEnter={() => setHoveredRingIndex({ type: 'dark', m: ring.m })}
                              onMouseLeave={() => setHoveredRingIndex(null)}
                              className={`cursor-pointer transition ${
                                isHovered ? 'bg-red-950/40 text-red-300' : 'hover:bg-slate-900/40 text-slate-400'
                              }`}
                            >
                              <td className="px-3 py-2 font-bold">{ring.m}</td>
                              <td className="px-3 py-2 text-slate-200">{ring.rMm.toFixed(4)} мм</td>
                              <td className="px-3 py-2 text-right text-slate-500">{hMm.toFixed(3)} мкм</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bright rings table */}
              <div className="bg-slate-950/80 rounded-xl border border-slate-900 overflow-hidden">
                <div className="bg-emerald-950/30 text-emerald-400 font-mono text-xs px-3 py-2 border-b border-slate-900 font-semibold flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  Светлые кольца (Максимумы {params.mode === 'reflected' ? 'отражения' : 'прохождения'})
                </div>

                <div className="max-h-56 overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead className="bg-slate-900/50 text-slate-500 border-b border-slate-900">
                      <tr>
                        <th className="px-3 py-1.5">Порядок (m)</th>
                        <th className="px-3 py-1.5">Радиус (r_m)</th>
                        <th className="px-3 py-1.5 text-right">Толщина зазора (h)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900">
                      {ringCoordinates.bright.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-4 text-center text-slate-600">Кольца отсутствуют в данной шкале</td>
                        </tr>
                      ) : (
                        ringCoordinates.bright.map((ring) => {
                          const hMm = Math.pow(ring.rMm * 1e-3, 2) / (2 * params.lensRadius) * 1e6; // in micrometers
                          const isHovered = hoveredRingIndex?.type === 'bright' && hoveredRingIndex?.m === ring.m;
                          return (
                            <tr
                              key={`bright-${ring.m}`}
                              onMouseEnter={() => setHoveredRingIndex({ type: 'bright', m: ring.m })}
                              onMouseLeave={() => setHoveredRingIndex(null)}
                              className={`cursor-pointer transition ${
                                isHovered ? 'bg-emerald-950/40 text-emerald-300' : 'hover:bg-slate-900/40 text-slate-400'
                              }`}
                            >
                              <td className="px-3 py-2 font-bold">{ring.m}</td>
                              <td className="px-3 py-2 text-slate-200">{ring.rMm.toFixed(4)} мм</td>
                              <td className="px-3 py-2 text-right text-slate-500">{hMm.toFixed(3)} мкм</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>

        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-[#0b0e17] py-6 px-4 mt-12 text-center text-xs text-slate-500 font-mono">
        <p>© 2026 Моделирование колец Ньютона • Физический симулятор зазора воздушного клина</p>
      </footer>
    </div>
  );
}
