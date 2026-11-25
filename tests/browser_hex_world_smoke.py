"""Hex World camera lab: real browser projection, controls, scene loading and errors."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium

ROOT=Path(__file__).resolve().parents[1]
SCENE=json.loads((ROOT/'web/hex-world-demo.json').read_text())
with sync_playwright() as pw:
    browser=launch_chromium(pw)
    page=browser.new_page(viewport={'width':1280,'height':820})
    page.set_default_timeout(8000)
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content((ROOT/'web/hex-world-lab.html').read_text(),wait_until='domcontentloaded')
    page.evaluate('scene=>{window.fetch=async()=>new Response(JSON.stringify(scene),{status:200,headers:{"content-type":"application/json"}})}',SCENE)
    page.add_script_tag(content=(ROOT/'web/hex-world-core.js').read_text())
    page.add_script_tag(content=(ROOT/'web/hex-world-lab.js').read_text())
    page.wait_for_function('window.HexWorldLab?.getScene()?.tiles.length===127')
    assert page.locator('#scene-name').inner_text()==SCENE['name']
    assert page.evaluate('HexWorldLab.getScene().tiles.some(t=>t.elevation>0)')
    assert page.evaluate('HexWorld.exposedFaces(HexWorld.createSceneIndex(HexWorldLab.getScene()), HexWorldLab.getScene().tiles.find(t=>t.elevation>0)).length>0')
    assert page.locator('#message').inner_text().startswith('127 hexes · 14 objects')
    assert page.locator('canvas').evaluate('(el)=>el.width>500&&el.height>300')
    assert page.evaluate('HexWorldLab.camera.zoom')>25,'The initial map must fit the actual canvas, not a pre-layout 1px viewport'
    center=page.evaluate('''()=>{const r=document.querySelector('#scene-canvas').getBoundingClientRect();
      const p=HexWorld.project(HexWorldLab.camera,0,0,r.width,r.height);
      return {x:r.left+p.x,y:r.top+p.y};}''')
    page.mouse.click(center['x'],center['y'])
    assert page.evaluate('HexWorldLab.getSelected()?.q===0&&HexWorldLab.getSelected()?.r===0')
    initial=page.evaluate('HexWorldLab.camera.zoom')
    page.mouse.move(center['x'],center['y']);page.mouse.wheel(0,-175)
    page.wait_for_function('(zoom)=>HexWorldLab.camera.zoom>zoom',arg=initial)
    page.mouse.click(center['x'],center['y'])
    assert page.evaluate('HexWorldLab.getSelected()?.q===0&&HexWorldLab.getSelected()?.r===0')
    page.locator('#rotate-right').click()
    assert page.evaluate('HexWorldLab.camera.rotation')==1
    page.locator('#rotate-left').click()
    assert page.evaluate('HexWorldLab.camera.rotation')==0
    assert page.locator('#camera-tilt').count()==0
    assert '35.26' in page.locator('#tilt-value').inner_text()
    assert page.evaluate('HexWorldLab.camera.tilt===undefined')
    assert page.evaluate('Math.abs(HexWorld.ISO_ELEVATION_DEG-35.26438968)<1e-6')
    page.mouse.move(center['x'],center['y']);page.mouse.down(button='middle');page.mouse.move(center['x']+90,center['y']+38,steps=3);page.mouse.up(button='middle')
    assert page.evaluate('HexWorldLab.camera.panX')!=0
    page.locator('#fit-scene').click()
    assert page.evaluate('HexWorldLab.getScene().id')=='forest-clearing'
    invalid={**SCENE,'tiles':SCENE['tiles']+[SCENE['tiles'][0]]}
    page.locator('#scene-file').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':json.dumps(invalid).encode()})
    page.wait_for_function("document.querySelector('#message').textContent.includes('duplicate tile')")
    assert page.evaluate('HexWorldLab.getScene().id')=='forest-clearing'
    alternate={**SCENE,'id':'new-map','name':'New Map'}
    page.locator('#scene-file').set_input_files({'name':'new-map.json','mimeType':'application/json','buffer':json.dumps(alternate).encode()})
    page.wait_for_function("HexWorldLab.getScene()?.id==='new-map'")
    assert page.locator('#scene-name').inner_text()=='New Map'
    assert not errors,errors
    browser.close()
print('Hex World camera and scene-loading browser smoke PASS')
