/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SimulationParams {
  lensRadius: number;       // R in meters (e.g., 0.5 to 15.0)
  centerWavelength: number;  // lambda_0 in nm (e.g., 380 to 780)
  spectrumWidth: number;     // delta_lambda in nm (e.g., 0 to 250)
  refractiveIndex: number;   // n (e.g., 1.0 for air, 1.33 for water, etc.)
  maxRadiusView: number;     // r_max in mm (observation window radius, e.g., 0.2 to 5.0)
  mode: 'reflected' | 'transmitted'; // reflected (dark center) or transmitted (bright center)
  isWhiteLight: boolean;     // whether to simulate white light (flat full-spectrum source)
}

export interface WavelengthSample {
  wavelength: number; // in nm
  weight: number;     // normalized weight in spectrum
  color: { r: number; g: number; b: number };
}

export interface PointData {
  radiusMm: number;
  intensity: number;
  colorHex: string;
}
