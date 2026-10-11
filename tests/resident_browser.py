"""Run the real device-resident WGSL backend. No mock GPU implementation.

Missing/blocked contexts are reported, not counted as passing shader tests.
--require-gpu rejects such unavailability, and is used by the CI conformance gate.
"""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--out', type=Path, default=ROOT/'test-results'/'resident')
parser.add_argument('--chromium', default=os.getenv('CHROMIUM_EXECUTABLE'))
parser.add_argument('--require-gpu', action='store_true')
args = parser.parse_args()
args.out.mkdir(parents=True, exist_ok=True)

records, visited = [], set()
pattern = re.compile(r'''((?:\bfrom\s*|\bimport\s*)["'])(\.{1,2}/[^"']+)(["'])''')
def visit(path):
    if path in visited:
        return
    visited.add(path)
    def replace(match):
        target = (ROOT/path).parent.joinpath(match[2]).resolve().relative_to(ROOT).as_posix()
        visit(target)
        return match[1]+'@hardware/'+target+match[3]
    text = pattern.sub(replace, (ROOT/path).read_text())
    records.append({'path': path, 'source': text})
visit('tests/resident-gpu.js')

script = r'''async records => {
 const adapter=await navigator.gpu?.requestAdapter();
 if(!adapter)return {status:'unavailable',reason:'No WebGPU adapter',physicalGPUVerified:false};
 const urls={};
 try{
  for(const r of records){const text=r.source.replace(/(["'])@hardware\/([^"']+)\1/g,(_m,q,path)=>q+urls[path]+q);
   urls[r.path]=URL.createObjectURL(new Blob([text],{type:'text/javascript'}));}
  const {testResidentGPU}=await import(urls['tests/resident-gpu.js']);
  return await testResidentGPU();
 }finally{for(const url of Object.values(urls))URL.revokeObjectURL(url);}
}'''
report = {'status': 'not-run', 'physicalGPUVerified': False}
with sync_playwright() as p:
    launch = {'headless':True, 'args':['--no-sandbox', '--enable-unsafe-webgpu']}
    executable = args.chromium or shutil.which('chromium')
    if executable:
        launch['executable_path'] = executable
    browser = p.chromium.launch(**launch)
    try:
        page = browser.new_page()
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/'resident.html'
            path.write_text('<!doctype html><title>Resident gate conformance</title>')
            try:
                page.goto(path.as_uri())
            except Exception as error:
                report = {'status':'unavailable', 'reason':str(error).splitlines()[0], 'physicalGPUVerified':False}
            else:
                try:
                    report = page.evaluate(script, records)
                except Exception as error:
                    report = {'status':'failed', 'reason':str(error), 'physicalGPUVerified':False}
                if report.get('status') == 'passed':
                    # Exercise the actual standalone module graph and worker in
                    # the same trustworthy file context used for shader checks.
                    try:
                        page.goto((ROOT/'Sketchpad-Lab.html').as_uri())
                        page.wait_for_function('window.sketchpadHardware')
                        page.click('#hardware-open')
                        page.uncheck('#hw-extended')
                        page.select_option('#hw-backend','webgpu-resident')
                        page.click('#hw-build')
                        page.wait_for_function('!document.querySelector("#hw-build").disabled',timeout=120000)
                        assert page.locator('#hw-status').get_attribute('data-error') != 'true', page.locator('#hw-status').inner_text()
                        for _ in range(3):
                            page.click('#hw-instruction')
                            page.wait_for_function('!document.querySelector("#hw-build").disabled',timeout=120000)
                            assert page.locator('#hw-status').get_attribute('data-error') != 'true', page.locator('#hw-status').inner_text()
                        assert page.evaluate('sketchpadHardware.state.backend') == 'webgpu-resident'
                        assert int(page.evaluate('sketchpadHardware.state.ports.find(p=>p.name==="A").value'),8) == 3989
                        assert page.evaluate('sketchpadLab.machine.cycles') == 0
                        page.screenshot(path=str(args.out/'resident-workbench.png'))
                        report['workbench']={'passed':True,'accumulator':3989,'instructionEmulatorCycles':0,'statistics':page.evaluate('sketchpadHardware.state.gpu')}
                        page.click('#hw-off')
                        assert not page.evaluate('sketchpadHardware.powered')
                    except Exception as error:
                        report['status']='failed'
                        report['reason']='Resident workbench: '+str(error)
    finally:
        browser.close()
(args.out/'report.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2), flush=True)
assert report['status'] != 'failed', report['reason'] if 'reason' in report else report
if args.require_gpu:
    assert report['status'] == 'passed', report
