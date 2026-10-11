// Preserve the original console/IDE as a separate module; hardware is opt-in.
import './app-main.js';
import {mountHardwareWorkbench} from './hardware.js';
document.querySelector('footer b').textContent='0.5.0';
mountHardwareWorkbench();
// Register the independently optional resident executor at the application boundary.
const residentOption=new Option('WebGPU · resident clocks','webgpu-resident');
residentOption.title='Gates, registers, RAM and peripheral storage advance on the GPU; bounded batches retain per-clock reversal.';
document.querySelector('#hw-backend').add(residentOption);
