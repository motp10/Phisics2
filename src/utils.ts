/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SimulationParams, WavelengthSample } from './types';

/**
 * Converts wavelength in nanometers to RGB values based on Dan Bruton's algorithm.
 * Returns values in range 0 - 255.
 */
export function wavelengthToRGB(wavelength: number): { r: number; g: number; b: number } {
  let r = 0, g = 0, b = 0;
  let factor = 0;

  if (wavelength >= 380 && wavelength < 440) {
    r = -(wavelength - 440) / (440 - 380);
    g = 0.0;
    b = 1.0;
  } else if (wavelength >= 440 && wavelength < 490) {
    r = 0.0;
    g = (wavelength - 440) / (490 - 440);
    b = 1.0;
  } else if (wavelength >= 490 && wavelength < 510) {
    r = 0.0;
    g = 1.0;
    b = -(wavelength - 510) / (510 - 490);
  } else if (wavelength >= 510 && wavelength < 580) {
    r = (wavelength - 510) / (580 - 510);
    g = 1.0;
    b = 0.0;
  } else if (wavelength >= 580 && wavelength < 645) {
    r = 1.0;
    g = -(wavelength - 645) / (645 - 580);
    b = 0.0;
  } else if (wavelength >= 645 && wavelength <= 780) {
    r = 1.0;
    g = 0.0;
    b = 0.0;
  }

  // Factor to fade out at limits of human vision
  if (wavelength >= 380 && wavelength < 420) {
    factor = 0.3 + 0.7 * (wavelength - 380) / (420 - 380);
  } else if (wavelength >= 420 && wavelength <= 700) {
    factor = 1.0;
  } else if (wavelength >= 700 && wavelength <= 780) {
    factor = 0.3 + 0.7 * (780 - wavelength) / (780 - 700);
  } else {
    factor = 0.0;
  }

  return {
    r: Math.round(r * factor * 255),
    g: Math.round(g * factor * 255),
    b: Math.round(b * factor * 255),
  };
}

/**
 * Generates an array of wavelength samples with their respective spectrum weights
 */
export function generateSpectrum(params: SimulationParams): WavelengthSample[] {
  if (params.isWhiteLight) {
    // White light: flat spectrum across the visible range 380nm - 750nm
    const samplesCount = 50;
    const minW = 380;
    const maxW = 750;
    const step = (maxW - minW) / (samplesCount - 1);
    
    const samples: WavelengthSample[] = [];
    for (let i = 0; i < samplesCount; i++) {
      const w = minW + i * step;
      samples.push({
        wavelength: w,
        weight: 1.0 / samplesCount,
        color: wavelengthToRGB(w),
      });
    }
    return samples;
  }

  if (params.spectrumWidth <= 0 || params.spectrumWidth < 0.2) {
    // Strictly monochromatic
    return [
      {
        wavelength: params.centerWavelength,
        weight: 1.0,
        color: wavelengthToRGB(params.centerWavelength),
      },
    ];
  }

  // Quasi-monochromatic: Gaussian spectrum
  // FWHM = 2 * sqrt(2 * ln(2)) * sigma ≈ 2.35482 * sigma
  const sigma = params.spectrumWidth / 2.35482;
  const samplesCount = 41; // Use odd number to center exactly at lambda_0
  const samples: WavelengthSample[] = [];
  
  // Sample up to 3 sigmas
  const minW = Math.max(380, params.centerWavelength - 3 * sigma);
  const maxW = Math.min(780, params.centerWavelength + 3 * sigma);
  
  if (maxW <= minW) {
    return [
      {
        wavelength: params.centerWavelength,
        weight: 1.0,
        color: wavelengthToRGB(params.centerWavelength),
      },
    ];
  }

  const step = (maxW - minW) / (samplesCount - 1);
  let totalWeight = 0;

  // 1st pass: compute weights
  for (let i = 0; i < samplesCount; i++) {
    const w = minW + i * step;
    const weight = Math.exp(-Math.pow(w - params.centerWavelength, 2) / (2 * Math.pow(sigma, 2)));
    samples.push({
      wavelength: w,
      weight: weight,
      color: wavelengthToRGB(w),
    });
    totalWeight += weight;
  }

  // 2nd pass: normalize weights
  if (totalWeight > 0) {
    for (const sample of samples) {
      sample.weight /= totalWeight;
    }
  } else {
    samples[0].weight = 1.0;
  }

  return samples;
}

/**
 * Calculates physical intensity at a given radius r (meters) for a single wavelength
 */
export function calculateIntensityForWavelength(
  r: number,
  wavelength: number,
  params: SimulationParams
): number {
  const R = params.lensRadius;
  const n = params.refractiveIndex;
  
  // Wavelength in meters
  const lambda_meters = wavelength * 1e-9;
  
  // Gap thickness h = r^2 / 2R
  const h = (r * r) / (2 * R);
  
  // Path difference delta = 2*n*h + (reflected shift ? lambda/2 : 0)
  // For reflection: delta = 2 * n * h + lambda/2
  // For transmission: delta = 2 * n * h
  let delta: number;
  if (params.mode === 'reflected') {
    delta = 2 * n * h + lambda_meters / 2;
  } else {
    delta = 2 * n * h;
  }
  
  // Phase difference phi = 2pi * delta / lambda
  const phi = (2 * Math.PI * delta) / lambda_meters;
  
  // Intensity relative contribution: I = I0 * (1 + cos(phi)) / 2
  // For reflection this simplifies exactly to: I = sin^2(pi * n * r^2 / (lambda * R))
  // For transmission: I = cos^2(pi * n * r^2 / (lambda * R))
  return 0.5 * (1 + Math.cos(phi));
}

/**
 * Calculates Coherence Length L_c = lambda_0^2 / delta_lambda (in nanometers)
 * Returns value in micrometers.
 */
export function calculateCoherenceLength(params: SimulationParams): number {
  if (params.isWhiteLight) {
    // Center wavelength around 550nm, width around 370nm (flat 380-750)
    return Math.pow(550, 2) / 370; // very small coherence length
  }
  if (params.spectrumWidth <= 0) {
    return Infinity;
  }
  // Lc = lambda_0^2 / delta_lambda (nm)
  const lc_nm = Math.pow(params.centerWavelength, 2) / params.spectrumWidth;
  return lc_nm / 1000; // Return in micrometers
}

/**
 * Converts {r, g, b} object to hex representation
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (val: number) => Math.floor(Math.max(0, Math.min(255, val)));
  const hex = (val: number) => {
    const s = clamp(val).toString(16);
    return s.length === 1 ? '0' + s : s;
  };
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
