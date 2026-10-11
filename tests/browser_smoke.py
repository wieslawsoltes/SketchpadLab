"""Offline end-to-end browser validation. Requires installed Playwright/Chromium."""
import argparse
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--html', type=Path, default=ROOT/'Sketchpad-Lab.html')
parser.add_argument('--out', type=Path, default=ROOT/'test-results')
parser.add_argument('--chromium', default=os.getenv('CHROMIUM_EXECUTABLE','/usr/bin/chromium'))
args = parser.parse_args()
args.out.mkdir(parents=True, exist_ok=True)
errors, flows = [], []
html = args.html.read_text(encoding='utf-8')

def passed(name):
    flows.append(name)
    print('PASS', name, flush=True)

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1440,'height':1150},device_scale_factor=1)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(html,wait_until='load')
    page.wait_for_function('window.sketchpadLab?.machine?.cycles===0')
    backend = page.evaluate('sketchpadLab.display.backend')
    assert page.locator('[data-console-action]').count()==37
    assert page.locator('[data-toggle-bit]').count()==288
    assert not page.locator('#drawing-workbench').evaluate('(e)=>e.open')
    page.screenshot(path=str(args.out/'sketchpad-console.png'),full_page=True)
    passed('physical console: 37 buttons, 288 toggles, collapsed workbench, worker startup')

    def cycles(n):
        page.wait_for_function(f'sketchpadLab.machine.cycles==={n}')
    def program(name):
        page.select_option('#program-select',name)
        cycles(0)
    def stage():
        page.locator('#overlay').scroll_into_view_if_needed()
        return page.locator('#overlay').bounding_box()
    def tool(name):
        page.click(f'[data-tool="{name}"]')
        return stage()

    # New console modes are reversible view changes, not machine resets.
    assert page.locator('[data-sequence-unit]').count()==33
    page.click('#historical-cabinet-only')
    assert not page.locator('.app-header').is_visible()
    assert page.evaluate('sketchpadLab.machine.cycles')==0
    page.click('#historical-cabinet-only')
    assert page.locator('.app-header').is_visible()
    passed('console-only mode hides modern chrome without resetting either model')
    page.locator('#historical-focus').evaluate('(e)=>{e.value="65";e.dispatchEvent(new Event("input"))}')
    page.wait_for_function('sketchpadLab.display.focus===.65 && sketchpadLab.display.pointSpriteKey?.endsWith(":0.65")')
    page.locator('#historical-focus').evaluate('(e)=>{e.value="100";e.dispatchEvent(new Event("input"))}')
    page.wait_for_function('sketchpadLab.display.focus===1')
    passed('beam focus changes the rendered point sprite and its cache key')

    page.click('[data-view="assembly"]')
    page.click('#run-btn');cycles(3)
    assert int(page.evaluate('sketchpadLab.machine.registers.A'),8)==3989
    passed('accumulator execution')
    page.click('#back-btn');cycles(2)
    passed('reverse execution')
    page.screenshot(path=str(args.out/'sketchpad-debugger.png'),full_page=True)
    program('Index loop');page.click('#run-btn');cycles(19)
    assert int(page.evaluate('sketchpadLab.machine.registers.A'),8)==36
    passed('indexed loop')
    program('Vector diagnostic');page.click('#run-btn');cycles(11)
    assert page.evaluate('sketchpadLab.machine.vectors.length')==5
    assert page.evaluate('sketchpadLab.machine.profile')=='diagnostic-word-io'
    passed('nonhistorical diagnostic output separated from strict profile')
    page.click('#back-btn');cycles(10);page.click('#back-btn');cycles(9)
    assert page.evaluate('sketchpadLab.machine.vectors.length')==4
    passed('reverse diagnostic device output')

    program('M4 native macros');page.click('#run-btn');cycles(2)
    assert int(page.evaluate('sketchpadLab.machine.registers.E'),8)==int('123456',8)
    assert page.locator('#diagnostic-count').inner_text()=='0'
    passed('native M4 macro, register-containing literal, implicit allocation and execution')
    program('TX-2 scope');page.click('#run-btn');cycles(7)
    assert page.evaluate('sketchpadLab.machine.scope.length')==4
    assert page.evaluate('sketchpadLab.machine.scope[2].x')==200
    assert page.evaluate('sketchpadLab.machine.virtualTime')>=255
    assert page.evaluate('sketchpadLab.machine.profile')=='tx2-io-research'
    passed('INOUT priority switching, timed scope handshakes and four spots')
    page.click('#back-btn')
    page.wait_for_function('sketchpadLab.machine.reason==="reverse sequence/device boundary"')
    cycles(7)
    assert page.evaluate('sketchpadLab.machine.scope.length')==4
    assert page.evaluate('sketchpadLab.machine.limbo') is True
    passed('reverse of a breakpoint wakeup restores virtual time without undoing a scope instruction')
    page.click('#back-btn');cycles(6)
    assert page.evaluate('sketchpadLab.machine.scope.length')==3
    passed('scope output and virtual-time reversal')

    page.fill('#source-editor','100|\nRFD₆₀ 400200\n200|\nSTOP→ hJMP STOP')
    page.click('#assemble-btn');cycles(0)
    page.click('#run-btn');cycles(1)
    assert page.evaluate('sketchpadLab.machine.P')==0o400200
    assert page.locator('#listing tr.current').get_attribute('data-address')==str(0o200)
    assert page.evaluate('sketchpadLab.machine.sourceLine')==4
    passed('marked P placekeeper highlights the physical instruction and its original source line')

    page.fill('#source-editor','.org 100\nLDA 200\nSTOP: JMP STOP\n.org 200\n.word 123')
    page.click('#boot-tape-btn');cycles(0)
    page.wait_for_function('sketchpadLab.machine.bootingFromTape && sketchpadLab.machine.P===0o377750')
    assert all(v=='000' for v in page.evaluate('sketchpadLab.machine.F'))
    assert page.evaluate('sketchpadLab.machine.tape.position')==0
    passed('cold boot starts at ROM with zero configuration and unread tape')
    with page.expect_download() as download_info:
        page.click('#tape-export-btn')
    tape_path=args.out/'diagnostic.tape'
    download_info.value.save_as(str(tape_path))
    tape=tape_path.read_bytes()
    assert len(tape)==186 and all(b&128 for b in tape)
    passed('compiler exports a 186-byte reader-leader tape rather than image JSON')
    page.click('#run-btn');cycles(649)
    assert page.evaluate('sketchpadLab.machine.P')==0o100
    assert page.evaluate('sketchpadLab.machine.tape.position')==186
    assert page.evaluate('sketchpadLab.machine.tape.connected') is False
    assert page.evaluate('sketchpadLab.machine.tape.missed') is False
    page.screenshot(path=str(args.out/'sketchpad-tape-boot.png'),full_page=True)
    passed('published plugboard and reader leader execute 649 instructions to user entry')
    page.click('#step-btn');cycles(650)
    assert int(page.evaluate('sketchpadLab.machine.registers.A'),8)==0o123
    page.click('[data-view="console"]')
    assert int(page.locator('[data-register="FA"] output').inner_text(),8)==0
    assert int(page.locator('[data-register="F"] output').inner_text(),8)==0
    assert page.locator('[data-sequence-unit="42"]').evaluate('(e)=>e.classList.contains("current")')
    page.click('[data-view="assembly"]')
    passed('loaded payload executes and physical configuration/sequence indicators follow it')
    page.click('#back-btn');cycles(649)
    assert page.evaluate('sketchpadLab.machine.P')==0o100
    page.click('#reset-cpu-btn');cycles(0)
    assert page.evaluate('sketchpadLab.machine.P')==0o377750
    assert page.evaluate('sketchpadLab.machine.tape.position')==0
    passed('tape payload reverse-step and RESET return to reproducible bootstrap state')
    # Valid CPU assembly that would overwrite the resident loader must not boot.
    page.fill('#source-editor','.org 0\nLDA 100\n.org 100\n.word 1')
    page.click('#boot-tape-btn')
    page.wait_for_function('sketchpadLab.machine.reason.includes("tape build failed")')
    page.click('#run-btn')
    page.wait_for_function('document.getElementById("status-message").textContent.includes("Assemble a valid")')
    assert page.evaluate('sketchpadLab.machine.cycles')==0
    assert page.evaluate('sketchpadLab.machine.bootingFromTape') is False
    passed('a failed tape build cannot run the previous image')

    page.fill('#source-editor','THIS_IS_NOT_AN_OPCODE');page.click('#assemble-btn')
    page.wait_for_function('sketchpadLab.machine.reason.includes("assembly failed")')
    before = page.evaluate('sketchpadLab.machine.cycles')
    page.click('#run-btn')
    page.wait_for_function('document.getElementById("status-message").textContent.includes("Assemble a valid")')
    assert page.evaluate('sketchpadLab.machine.cycles')==before
    passed('failed assembly disables execution')

    page.click('[data-view="console"]')
    page.locator('#drawing-workbench').evaluate('(e)=>e.open=true')
    initial = page.evaluate('sketchpadLab.document.entities.size')
    box=tool('line')
    page.mouse.click(box['x']+80,box['y']+70);page.mouse.click(box['x']+230,box['y']+110)
    assert page.evaluate('sketchpadLab.document.entities.size')==initial+1
    passed('workbench line drawing')
    page.click('[data-constraint="horizontal"]')
    assert page.evaluate('sketchpadLab.document.lastSolve.converged')
    passed('workbench horizontal constraint')
    page.click('#undo-btn');page.click('#undo-btn')
    assert page.evaluate('sketchpadLab.document.entities.size')==initial
    passed('document undo')
    box=tool('circle')
    page.mouse.click(box['x']+110,box['y']+110);page.mouse.click(box['x']+150,box['y']+110)
    assert page.evaluate('[...sketchpadLab.document.entities.values()].at(-1).type')=='circle'
    page.click('#undo-btn');passed('workbench circle drawing')
    page.click('#insert-btn');box=stage();page.mouse.click(box['x']+140,box['y']+130)
    assert page.evaluate('[...sketchpadLab.document.entities.values()].at(-1).type')=='instance'
    page.click('#undo-btn')
    assert page.evaluate('sketchpadLab.document.entities.size')==initial
    passed('live master instance insertion and undo')

    page.locator('#drawing-workbench').evaluate('(e)=>e.open=false')
    page.evaluate('sketchpadLab.replaceDocument(new sketchpadLab.document.constructor())')
    box=stage();page.mouse.move(box['x']+100,box['y']+100)
    page.click('[data-console-action="draw"]')
    box=stage();page.mouse.move(box['x']+220,box['y']+130)
    page.click('[data-console-action="stop"]')
    assert page.evaluate('sketchpadLab.document.entities.size')==1
    assert page.evaluate('sketchpadLab.document.history.length')==1
    passed('physical DRAW / moving pen / STOP is one transaction')
    box=stage();page.mouse.move(box['x']+150,box['y']+200)
    page.click('[data-console-action="draw"]')
    page.click('[data-console-action="hold"]');page.click('#pen-shutter')
    assert page.evaluate('sketchpadLab.controller.motion!==null && !sketchpadLab.controller.hold')
    assert not page.locator('[data-console-action="hold"]').evaluate('(e)=>e.classList.contains("latched")')
    page.click('#pen-shutter')
    assert page.evaluate('sketchpadLab.controller.motion===null')
    passed('HOLD suppresses exactly one pen flick')

    # Text input is directed to the CRT, not the button that started the gesture.
    box=stage();page.mouse.move(box['x']+170,box['y']+170)
    page.locator('#overlay').focus();page.keyboard.press('t')
    page.keyboard.type('TX2');page.keyboard.press('Enter')
    assert page.evaluate('[...sketchpadLab.document.entities.values()].some(e=>e.type==="text"&&e.text==="TX2")')
    passed('keyboard light-pen text entry with vector lettering')
    page.fill('[data-toggle-register="21"] .toggle-value','123')
    page.locator('[data-toggle-register="21"] .toggle-value').press('Tab')
    page.wait_for_function('sketchpadLab.machine.inputs.toggles[5]==="83"')
    passed('physical octal toggle register reaches worker memory input')
    meta=page.locator('[data-console-action="meta"]');meta.scroll_into_view_if_needed()
    mb=meta.bounding_box();page.mouse.move(mb['x']+mb['width']/2,mb['y']+mb['height']/2)
    page.mouse.down();page.wait_for_function('sketchpadLab.machine.inputs.meta===true')
    page.mouse.up();page.wait_for_function('sketchpadLab.machine.inputs.meta===false')
    # The physical release clears the hardware input; the host META action latches by design.
    passed('37th META input drives external-input metabit')
    page.click('[data-view="assembly"]');program('Accumulator');page.click('#run-btn');cycles(3)
    assert page.evaluate('sketchpadLab.machine.inputs.toggles[5]')=='83'
    page.click('[data-view="console"]')
    assert int(page.locator('.arithmetic-indicators [data-register="A"] output').inner_text(),8)==3989
    assert page.locator('.arithmetic-indicators [data-register="A"] .lit').count()>0
    passed('register lamps track worker execution and toggles survive assembly')

    page.click('[data-view="archive"]')
    page.screenshot(path=str(args.out/'sketchpad-archive.png'),full_page=True)
    passed('archive provenance workspace navigation')
    mobile=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
    mobile.on('pageerror',lambda e:errors.append(str(e)))
    mobile.set_content(html,wait_until='load');mobile.wait_for_function('window.sketchpadLab?.machine')
    mobile.screenshot(path=str(args.out/'sketchpad-mobile.png'),full_page=True)
    overflow=mobile.evaluate('document.documentElement.scrollWidth>innerWidth')
    assert not overflow
    assert mobile.locator('[data-console-action]').count()==37
    passed('390px mobile layout without horizontal overflow')
    assert not errors, errors
    report={'passed':True,'pageErrors':errors,'backend':backend,'desktopViewport':[1440,1150],
            'mobileViewport':[390,844],'mobileHorizontalOverflow':overflow,'workflowCount':len(flows),'workflows':flows}
    (args.out/'browser-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
    browser.close()
