// Preserve the original console/IDE as a separate module; hardware is opt-in.
import './app-main.js';
import {mountHardwareWorkbench} from './hardware.js';
document.querySelector('footer b').textContent='0.4.0';
mountHardwareWorkbench();
