/**
 * GhostStack Fingerprint Shield
 * Complete 10-point fingerprint protection. Deterministic noise per session.
 * @module FingerprintShield
 */

import { createHash, randomBytes } from 'crypto'
import { UserAgentRotator } from './UserAgentRotator'
import { WebRTCShield } from './WebRTCShield'

export type PrivacyLevel = 'standard' | 'strict' | 'maximum' | 'custom'

export interface FingerprintSettings {
  level: PrivacyLevel
  canvasSpoofing: boolean
  webglSpoofing: boolean
  audioSpoofing: boolean
  fontSpoofing: boolean
  screenSpoofing: boolean
  userAgentRotation: boolean
  webrtcProtection: boolean
  batterySpoofing: boolean
  hardwareSpoofing: boolean
  timezoneSpoofing: boolean
  timezoneOverride: string | null
}

export interface FingerprintTestResult {
  uniquenessScore: number
  exposedAPIs: string[]
  protectedAPIs: string[]
  recommendations: string[]
}

const PRESETS: Record<PrivacyLevel, Omit<FingerprintSettings, 'level' | 'timezoneOverride'>> = {
  standard: { canvasSpoofing: true, webglSpoofing: true, audioSpoofing: false, fontSpoofing: false, screenSpoofing: false, userAgentRotation: true, webrtcProtection: true, batterySpoofing: true, hardwareSpoofing: true, timezoneSpoofing: false },
  strict: { canvasSpoofing: true, webglSpoofing: true, audioSpoofing: true, fontSpoofing: true, screenSpoofing: true, userAgentRotation: true, webrtcProtection: true, batterySpoofing: true, hardwareSpoofing: true, timezoneSpoofing: false },
  maximum: { canvasSpoofing: true, webglSpoofing: true, audioSpoofing: true, fontSpoofing: true, screenSpoofing: true, userAgentRotation: true, webrtcProtection: true, batterySpoofing: true, hardwareSpoofing: true, timezoneSpoofing: true },
  custom: { canvasSpoofing: true, webglSpoofing: true, audioSpoofing: true, fontSpoofing: true, screenSpoofing: true, userAgentRotation: true, webrtcProtection: true, batterySpoofing: true, hardwareSpoofing: true, timezoneSpoofing: false }
}

const GPU_STRINGS = [
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (AMD)', r: 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (AMD)', r: 'ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (AMD)', r: 'ANGLE (AMD, AMD Radeon RX 7900 XTX Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (AMD)', r: 'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (Intel)', r: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (Intel)', r: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (Intel)', r: 'ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2080 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { v: 'Google Inc. (AMD)', r: 'ANGLE (AMD, AMD Radeon RX 5700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' }
]

const RESOLUTIONS = [
  [1920,1080],[2560,1440],[3840,2160],[1366,768],[1536,864],[1440,900],
  [1680,1050],[1280,720],[1280,800],[1600,900],[2560,1600],[1920,1200],
  [3440,1440],[2880,1800],[1360,768],[1280,1024],[1024,768],[1600,1200],
  [2256,1504],[2736,1824]
]

export class FingerprintShield {
  private sessionId: string
  private settings: FingerprintSettings
  private uaRotator: UserAgentRotator
  private webrtcShield: WebRTCShield
  private gpuIdx: number
  private screenIdx: number

  constructor() {
    this.sessionId = randomBytes(32).toString('hex')
    this.uaRotator = new UserAgentRotator()
    this.webrtcShield = new WebRTCShield()
    const h = createHash('sha256').update(this.sessionId).digest()
    this.gpuIdx = h.readUInt8(0) % GPU_STRINGS.length
    this.screenIdx = h.readUInt8(1) % RESOLUTIONS.length
    this.settings = { level: 'strict', ...PRESETS.strict, timezoneOverride: null }
  }

  /** @returns Injectable JavaScript for fingerprint spoofing */
  getSpoofScript(): string {
    const s = this.settings
    const gpu = GPU_STRINGS[this.gpuIdx]
    const scr = RESOLUTIONS[this.screenIdx]
    const tz = s.timezoneOverride || 'UTC'
    const parts: string[] = []

    parts.push(`(function(){
const _sid='${this.sessionId.substring(0,16)}';
const _h=function(s){let h=0;for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;}return Math.abs(h);};
const _n=function(s){return(Math.sin(s)*10000)-Math.floor(Math.sin(s)*10000);};
const _d=location.hostname;
const _s=_h(_sid+_d);`)

    if (s.canvasSpoofing) parts.push(`
const _cTD=HTMLCanvasElement.prototype.toDataURL;
const _cGI=CanvasRenderingContext2D.prototype.getImageData;
HTMLCanvasElement.prototype.toDataURL=function(){const c=this.getContext('2d');if(c&&this.width>0&&this.height>0){try{const x=Math.floor(Math.abs(_n(_s+1))*Math.min(this.width,10));const y=Math.floor(Math.abs(_n(_s+2))*Math.min(this.height,10));const id=c.getImageData(x,y,1,1);id.data[3]=id.data[3]===255?254:255;c.putImageData(new ImageData(new Uint8ClampedArray(id.data),1,1),x,y);}catch(e){}}return _cTD.apply(this,arguments);};
CanvasRenderingContext2D.prototype.getImageData=function(){const d=_cGI.apply(this,arguments);if(d&&d.data.length>0){d.data[_s%Math.max(1,d.data.length-4)]=(d.data[_s%Math.max(1,d.data.length-4)]+1)%256;}return d;};`)

    if (s.webglSpoofing) parts.push(`
const _wgl=function(p,o){p.getParameter=function(pm){if(pm===37445)return'${gpu.v}';if(pm===37446)return'${gpu.r}';return o.apply(this,arguments);};};
if(typeof WebGLRenderingContext!=='undefined')_wgl(WebGLRenderingContext.prototype,WebGLRenderingContext.prototype.getParameter);
if(typeof WebGL2RenderingContext!=='undefined')_wgl(WebGL2RenderingContext.prototype,WebGL2RenderingContext.prototype.getParameter);`)

    if (s.audioSpoofing) parts.push(`
if(typeof AudioContext!=='undefined'){const _AC=AudioContext;const _oca=_AC.prototype.createAnalyser;_AC.prototype.createAnalyser=function(){const a=_oca.apply(this,arguments);const _gf=a.getFloatFrequencyData.bind(a);a.getFloatFrequencyData=function(arr){_gf(arr);for(let i=0;i<arr.length;i++)arr[i]+=_n(_s+i)*0.0001;};return a;};}`)

    if (s.fontSpoofing) parts.push(`
if(document.fonts&&document.fonts.check){const _bf=['Arial','Times New Roman','Courier New','Georgia','Verdana'];const _ef=['Helvetica','Palatino','Comic Sans MS','Impact','Tahoma','Trebuchet MS','Cambria','Calibri'];const _sf=new Set(_bf);for(let i=0;i<_ef.length;i++){if(_n(_s+i+100)>0.5)_sf.add(_ef[i]);}const _oc=document.fonts.check.bind(document.fonts);document.fonts.check=function(f){const m=f.match(/["']([^"']+)["']/);if(m&&!_sf.has(m[1]))return false;return _oc(f);};}`)

    if (s.screenSpoofing) parts.push(`
Object.defineProperty(screen,'width',{get:()=>${scr[0]}});Object.defineProperty(screen,'height',{get:()=>${scr[1]}});Object.defineProperty(screen,'availWidth',{get:()=>${scr[0]}});Object.defineProperty(screen,'availHeight',{get:()=>${scr[1]-40}});Object.defineProperty(screen,'colorDepth',{get:()=>24});Object.defineProperty(screen,'pixelDepth',{get:()=>24});`)

    if (s.batterySpoofing) parts.push(`
if(navigator.getBattery)navigator.getBattery=()=>Promise.resolve({charging:true,chargingTime:Infinity,dischargingTime:Infinity,level:0.75,addEventListener(){},removeEventListener(){},dispatchEvent(){return true}});`)

    if (s.hardwareSpoofing) parts.push(`
Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>4});Object.defineProperty(navigator,'deviceMemory',{get:()=>8});`)

    if (s.timezoneSpoofing) parts.push(`
const _oDTF=Intl.DateTimeFormat;Intl.DateTimeFormat=function(){const f=new _oDTF(...arguments);const _or=f.resolvedOptions.bind(f);f.resolvedOptions=function(){const o=_or();o.timeZone='${tz}';return o;};return f;};Intl.DateTimeFormat.prototype=_oDTF.prototype;Intl.DateTimeFormat.supportedLocalesOf=_oDTF.supportedLocalesOf;`)

    if (s.webrtcProtection) parts.push(this.webrtcShield.getInjectionScript())

    parts.push('})();')
    return parts.join('\n')
  }

  getSettings(): FingerprintSettings { return { ...this.settings } }

  updateSettings(updates: Partial<FingerprintSettings>): void {
    this.settings = { ...this.settings, ...updates }
  }

  setLevel(level: PrivacyLevel): void {
    this.settings = { ...this.settings, level, ...PRESETS[level], timezoneOverride: this.settings.timezoneOverride }
  }

  getUserAgent(): string {
    return this.settings.userAgentRotation ? this.uaRotator.getSessionUA() : ''
  }

  getTestResults(): FingerprintTestResult {
    const s = this.settings
    const checks = [
      { name: 'Canvas', on: s.canvasSpoofing }, { name: 'WebGL', on: s.webglSpoofing },
      { name: 'Audio', on: s.audioSpoofing }, { name: 'Fonts', on: s.fontSpoofing },
      { name: 'Screen', on: s.screenSpoofing }, { name: 'User Agent', on: s.userAgentRotation },
      { name: 'WebRTC', on: s.webrtcProtection }, { name: 'Battery', on: s.batterySpoofing },
      { name: 'Hardware', on: s.hardwareSpoofing }, { name: 'Timezone', on: s.timezoneSpoofing }
    ]
    const protectedAPIs = checks.filter(c => c.on).map(c => c.name)
    const exposedAPIs = checks.filter(c => !c.on).map(c => c.name)
    return {
      uniquenessScore: Math.max(0, 100 - protectedAPIs.length * 10),
      exposedAPIs, protectedAPIs,
      recommendations: exposedAPIs.map(a => `Enable ${a} spoofing`)
    }
  }
}
