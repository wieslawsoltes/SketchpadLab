"""Offline hardware UI and optional real WebGPU conformance checks.

--gpu attempts execution in a trustworthy file context. Missing adapters/context
are reported as unavailable; --require-gpu turns that into a failing test. An
available adapter that produces wrong gate results always fails the test.
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
parser.add_argument('--html', type=Path, default=ROOT/'Sketchpad-Lab.html')
parser.add_argument('--out', type=Path, default=ROOT/'test-results'/'hardware')
parser.add_argument('--chromium', default=os.getenv('CHROMIUM_EXECUTABLE'))
parser.add_argument('--gpu', action='store_true')
parser.add_argument('--require-gpu', action='store_true')
args = parser.parse_args()
args.out.mkdir(parents=True, exist_ok=True)
errors, flows = [], []

def passed(name):
    flows.append(name)
    print('PASS', name, flush=True)

def gpu_modules():
    """Build a blob-module graph from the actual source, never a mock shader."""
    records, seen = [], set()
    pattern = re.compile(r'''((?:\bfrom\s*|\bimport\s*)["'])(\.{1,2}/[^"']+)(["'])''')
    def visit(path):
        if path in seen:
            return
        seen.add(path)
        def dependency(match):
            target = (ROOT/path).parent.joinpath(match[2]).resolve().relative_to(ROOT).as_posix()
            visit(target)
            return match[1]+'@hw/'+target+match[3]
        text = pattern.sub(dependency, (ROOT/path).read_text())
        records.append({'path':path, 'source':text})
    for name in ['logic','netlist','digital','webgpu','tx2-board']:
        visit(f'packages/hardware-sim/{name}.js')
    return records

GPU_TEST = r'''async records => {
 const adapter=await navigator.gpu?.requestAdapter();
 if(!adapter)return {status:'unavailable',reason:'No WebGPU adapter in this browser context'};
 const info=adapter.info;
 const description={description:info?.description,architecture:info?.architecture,vendor:info?.vendor,isFallbackAdapter:info?.isFallbackAdapter};
 const urls={};try{
  for(const r of records){const code=r.source.replace(/(["'])@hw\/([^"']+)\1/g,(_m,q,p)=>q+urls[p]+q);urls[r.path]=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));}
  const {NetlistBuilder}=await import(urls['packages/hardware-sim/netlist.js']);
  const {DigitalSimulator}=await import(urls['packages/hardware-sim/digital.js']);
  const {WebGPUGateEvaluator,GPUClockedSimulator}=await import(urls['packages/hardware-sim/webgpu.js']);
  const {logicGate}=await import(urls['packages/hardware-sim/logic.js']);
  const b=new NetlistBuilder('all four-state gates'),pins=b.input('states',4);
  for(let op=0;op<11;op++)for(let c=0;c<4;c++)for(let d=0;d<4;d++)for(let a=0;a<4;a++)b.gate(op,pins[a],pins[d],pins[c]);
  const plan=b.compile(),values=Uint32Array.from(plan.initial);pins.forEach((pin,i)=>values[pin]=i);
  const evaluator=await WebGPUGateEvaluator.create(plan);
  try{const output=await evaluator.evaluate(values);for(const g of plan.gates)if(output[g.q]!==logicGate(g.op,values[g.a],values[g.b],values[g.c]))throw new Error('GPU truth-table mismatch');}finally{evaluator.dispose();}
  const c=new NetlistBuilder('clocked storage'),q=c.register('counter',8);q.connect(c.add(q.q,c.constant(1,8)).sum);c.output('counter',q.q);
  const ram=c.ram('RAM',{width:8,depth:256,address:q.q,data:c.bits(1,q.q),write:c.one});c.output('RAMread',ram);
  const p=c.compile(),cpu=new DigitalSimulator(p),gpuState=new DigitalSimulator(p),gpu=await GPUClockedSimulator.create(gpuState);
  try{for(let i=0;i<16;i++){cpu.clock();await gpu.clock();if(cpu.values.some((v,i)=>v!==gpuState.values[i])||cpu.memories[0].values.some((v,i)=>v!==gpuState.memories[0].values[i]))throw new Error('GPU clock/memory mismatch');}
   cpu.back();gpuState.back();if(cpu.values.some((v,i)=>v!==gpuState.values[i]))throw new Error('GPU reverse mismatch');
  }finally{gpu.dispose();}
  const {TX2GateBoard}=await import(urls['packages/hardware-sim/tx2-board.js']);
  const instruction=(op,address,config=0,index=0)=>(BigInt(config)<<30n)|(BigInt(op)<<24n)|(BigInt(index)<<18n)|BigInt(address);
  // REX_60 110; IOS_60 30000; JPD 102; scope TSD 120. Encoding uses published fields.
  const image={entry:0o100,words:[[0o100,instruction(0o12,0o110,0,0o60)],
   [0o101,instruction(0o4,0o30000,0,0o60)],[0o102,instruction(0o5,0o102,0o20)],
   [0o110,instruction(0o57,0o120)],[0o120,0n]]};
  const ref=new TX2GateBoard(image,{inout:true,depth:128}),actual=new TX2GateBoard(image,{inout:true,depth:128});
  const runner=await GPUClockedSimulator.create(actual.simulator);
  try{for(let i=0;i<17;i++){ref.simulator.clock();await runner.clock();
   if(ref.simulator.values.some((v,i)=>v!==actual.simulator.values[i]))throw new Error('INOUT GPU wire mismatch at clock '+i);
   for(let m=0;m<ref.simulator.memories.length;m++)if(ref.simulator.memories[m].values.some((v,i)=>v!==actual.simulator.memories[m].values[i]))throw new Error('INOUT GPU storage mismatch');
  }
  if(actual.simulator.read('scopeCount')!==1n)throw new Error('GPU board did not emit expected scope spot');
  }finally{runner.dispose();}
  return {status:'passed',adapter:description,truthCases:704,clockedComparisons:16,reverseComparisons:1,inoutBoardClocks:17,inoutScopeSpots:1,physicalGPUVerified:false};
 }finally{for(const url of Object.values(urls))URL.revokeObjectURL(url);}
}'''

with sync_playwright() as pw:
    executable = args.chromium or shutil.which('chromium')
    launch = {'headless':True, 'args':['--no-sandbox']}
    if executable:
        launch['executable_path'] = executable
    browser = pw.chromium.launch(**launch)
    page = browser.new_page(viewport={'width':1600,'height':1040})
    page.set_default_timeout(20000)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(args.html.read_text(), wait_until='load')
    page.wait_for_function('window.sketchpadHardware && window.sketchpadLab?.machine?.cycles===0')
    assert not page.evaluate('sketchpadHardware.powered')
    page.click('#hardware-open')
    assert page.locator('#hardware-dialog').is_visible()
    assert not page.evaluate('sketchpadHardware.powered')
    passed('hardware is off by default; opening the workbench allocates no worker')

    def done(expect_error=False):
        page.wait_for_function('!document.querySelector("#hw-build").disabled',timeout=120000)
        is_error=page.locator('#hw-status').get_attribute('data-error')=='true'
        assert is_error==expect_error, page.locator('#hw-status').inner_text()
    def run(selector):
        page.click(selector)
        done()
    def reg(name):
        return int(page.evaluate('(n)=>sketchpadHardware.state.ports.find(p=>p.name===n).value',name),8)

    run('#hw-build')
    board_stats=page.evaluate('sketchpadHardware.state.statistics')
    for _ in range(3):
        run('#hw-instruction')
    assert reg('A')==3989 and page.evaluate('sketchpadLab.machine.cycles')==0
    passed('extended gate board executes assembly without advancing the instruction emulator')
    run('#hw-checkpoint');run('#hw-clock');run('#hw-restore')
    assert page.evaluate('sketchpadHardware.state.ticks')==9
    page.select_option('#hw-probe','A');run('#hw-inspect')
    assert page.locator('#hw-cone svg').count()==1
    page.screenshot(path=str(args.out/'hardware-board.png'))
    passed('clock stepping, checkpoints and actual driver-cone inspection')
    with page.expect_download() as event:
        run('#hw-trace')
    event.value.save_as(args.out/'gate-waveforms.vcd')
    assert '$var wire' in (args.out/'gate-waveforms.vcd').read_text()
    with page.expect_download() as event:
        run('#hw-snapshot')
    event.value.save_as(args.out/'hardware-snapshot.json')
    passed('VCD and portable snapshot exports')

    previous=reg('A')
    page.fill('#hw-source','INVALID ^ ???');page.click('#hw-build');done(expect_error=True)
    assert reg('A')==previous
    assert page.locator('#hw-run').is_disabled()
    passed('failed compilation keeps the previous circuit but disables stale-source execution')
    with page.expect_file_chooser() as event:
        page.click('#hw-open-state')
    event.value.set_files(args.out/'hardware-snapshot.json')
    page.wait_for_function('document.querySelector("#hw-status").textContent.startsWith("RESTOREFILE")', timeout=120000)
    done()
    assert reg('A')==3989 and not page.locator('#hw-run').is_disabled()
    passed('snapshot file restores model source, worker and storage')

    page.select_option('#hw-example','1');run('#hw-build')
    for _ in range(4):
        run('#hw-instruction')
    assert reg('A')==1963
    passed('gate multiplier and divider execute the compiled example')

    page.select_option('#hw-example','0');page.uncheck('#hw-extended');page.select_option('#hw-memory','gates');run('#hw-build')
    for _ in range(3):
        run('#hw-instruction')
    assert reg('A')==3989
    assert page.evaluate('sketchpadHardware.state.statistics.memoryBits')==0
    assert page.evaluate('sketchpadHardware.state.statistics.flipFlops')>256*37
    passed('small RAM is built from explicit flip-flops and gates, not RAM macros')

    for index in [3,4,5,6,7]:
        page.select_option('#hw-example',str(index));run('#hw-build')
        page.fill('#hw-budget','20');run('#hw-run')
        assert page.evaluate('sketchpadHardware.state.time')>0
        if index>=5:
            assert page.evaluate('sketchpadHardware.state.electrical.iterations')>0
        page.screenshot(path=str(args.out/f'hardware-example-{index}.png'))
        passed(['NAND latch with propagation delays','delayed ring oscillator','RC transient','nonlinear BJT transient','mixed transistor/digital co-simulation'][index-3])

    page.select_option('#hw-example','0');page.select_option('#hw-memory','macro');run('#hw-build')
    page.fill('#hw-breakpoint','100');run('#hw-run')
    assert page.evaluate('sketchpadHardware.state.ticks')==0
    assert page.evaluate('sketchpadHardware.state.lastRun.reason')=='breakpoint'
    passed('instruction breakpoint stops at fetch before the first gate clock')
    page.fill('#hw-breakpoint','');page.fill('#hw-budget','100000');page.click('#hw-run')
    page.wait_for_function('sketchpadHardware.state.ticks>0')
    page.click('#hw-pause');done()
    page.wait_for_function('sketchpadHardware.state.lastRun?.reason==="paused"')
    assert page.evaluate('sketchpadHardware.state.lastRun.executed')<100000
    passed('long gate execution yields and pauses without blocking the UI')

    page.click('#hw-close');assert not page.locator('#hardware-dialog').is_visible()
    assert page.evaluate('sketchpadLab.machine.cycles')==0
    page.click('#hardware-open');page.click('#hw-off')
    assert not page.evaluate('sketchpadHardware.powered')
    passed('close and power off preserve the original console state')
    page.select_option('#hw-example','9');run('#hw-build')
    assert page.evaluate('sketchpadHardware.state.inout.tape.position')==0
    assert page.locator('#hw-inout').is_checked()
    assert page.locator('#hw-boot').input_value()=='tape'
    run('#hw-run')
    assert reg('P')==0o100 and reg('K')==0o52
    assert page.evaluate('sketchpadHardware.state.lastRun.reason')=='breakpoint'
    assert not page.evaluate('sketchpadHardware.state.inout.tape.connected')
    assert not page.evaluate('sketchpadHardware.state.inout.tape.missed')
    run('#hw-instruction');assert reg('A')==1963
    assert page.evaluate('sketchpadLab.machine.cycles')==0
    page.screenshot(path=str(args.out/'hardware-gate-boot.png'))
    passed('published bootstrap executes through gates, reaches entry and leaves instruction emulator untouched')

    with page.expect_download() as event:
        run('#hw-snapshot')
    event.value.save_as(args.out/'gate-boot-state.json')
    page.select_option('#hw-example','0')
    with page.expect_file_chooser() as event:
        page.click('#hw-open-state')
    event.value.set_files(args.out/'gate-boot-state.json')
    page.wait_for_function('document.querySelector("#hw-status").textContent.startsWith("RESTOREFILE")', timeout=120000)
    done();assert page.locator('#hw-inout').is_checked()
    assert page.locator('#hw-boot').input_value()=='tape' and reg('A')==1963
    passed('snapshot import restores INOUT, boot method, configuration and tape storage')

    page.select_option('#hw-example','8');run('#hw-build');run('#hw-run')
    assert page.evaluate('sketchpadHardware.state.inout.scope.count')>=96
    page.locator('#hw-scope').scroll_into_view_if_needed()
    box=page.locator('#hw-scope').bounding_box()
    span=min(box['width']-30,box['height']-20)
    page.mouse.move(box['x']+box['width']/2+340*span/1022,box['y']+box['height']/2)
    page.mouse.down()
    page.wait_for_function('sketchpadHardware.state.inout.pen.down')
    # Activate the actual Run button without moving the captured light pen.
    page.locator('#hw-run').evaluate('(e)=>e.click()');done()
    assert page.evaluate('sketchpadHardware.state.inout.pen.hits')>0
    page.mouse.up();page.wait_for_function('!sketchpadHardware.state.inout.pen.down')
    page.screenshot(path=str(args.out/'hardware-gate-scope.png'))
    passed('scope displays gate-emitted geometry and optical hit gates react to live pen input')
    page.select_option('#hw-io-view','cone');page.select_option('#hw-probe','K');run('#hw-inspect')
    assert page.locator('#hw-cone svg').is_visible()
    page.select_option('#hw-io-view','scope')
    passed('I/O view switches between emitted scope points and actual sequence-register drivers')
    page.select_option('#hw-example','10');run('#hw-build');run('#hw-run')
    assert page.evaluate('sketchpadHardware.state.inout.punch.count')==6
    passed('paper punch produces six gate-splayed output frames in the browser')
    page.set_viewport_size({'width':390,'height':844})
    page.select_option('#hw-example','5');run('#hw-build');page.fill('#hw-budget','20');run('#hw-run')
    assert page.locator('#hardware-dialog').evaluate('(e)=>e.scrollWidth<=e.clientWidth')
    page.screenshot(path=str(args.out/'hardware-mobile.png'))
    passed('390px mobile electrical workbench has no horizontal overflow')
    page.select_option('#hw-example','8');run('#hw-build');page.fill('#hw-budget','1000');run('#hw-run')
    assert page.locator('#hardware-dialog').evaluate('(e)=>e.scrollWidth<=e.clientWidth')
    page.screenshot(path=str(args.out/'hardware-io-mobile.png'))
    passed('390px gate-I/O controls and scope keep the layout within the viewport')
    browser.close()

    gpu_report={'status':'not-requested','physicalGPUVerified':False}
    if args.gpu or args.require_gpu:
        gpu_launch={**launch,'args':['--no-sandbox','--enable-unsafe-webgpu']}
        gpu_browser=pw.chromium.launch(**gpu_launch)
        p=gpu_browser.new_page()
        # File URLs are trustworthy in normal Chromium. Environments that prohibit
        # all navigation report the limitation rather than disabling their policy.
        with tempfile.TemporaryDirectory() as temp:
            fixture=Path(temp)/'gpu.html';fixture.write_text('<!doctype html><title>Gate conformance</title>')
            try:
                p.goto(fixture.as_uri())
            except Exception as error:
                gpu_report={'status':'unavailable','reason':str(error).splitlines()[0],'physicalGPUVerified':False}
            else:
                gpu_report=p.evaluate(GPU_TEST,gpu_modules())
        gpu_browser.close()
    report={'browser':pw.chromium.name,'flows':flows,'passed':len(flows),'errors':errors,'board':board_stats,'gpu':gpu_report}
    (args.out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
    assert not errors
    if args.require_gpu:
        assert gpu_report['status']=='passed',gpu_report
