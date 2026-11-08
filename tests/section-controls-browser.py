"""Exercise the actual Question Studio and bank loader with a synthetic transport."""
import os
import re
from pathlib import Path
from urllib.parse import unquote, urlparse

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://section-fixture.test"
GROUP = "10000000-0000-4000-8000-000000000001"
OTHER_GROUP = "10000000-0000-4000-8000-000000000002"

TRANSPORT = r"""
(() => {
  const group = "10000000-0000-4000-8000-000000000001";
  const other = "10000000-0000-4000-8000-000000000002";
  const first = "20000000-0000-4000-8000-000000000001";
  const second = "20000000-0000-4000-8000-000000000002";
  const tables = {
    profiles: [{id: "fixture", username: "fixture", role: "developer"}],
    modules: [{id:first,slug:"mod1",name:"First fixture",revision:7,is_published:true},
              {id:second,slug:"mod2",name:"Other fixture",revision:11,is_published:true}],
    question_groups: [{id:group,module_id:first,name:"Section Alpha",sort_order:1,is_enabled:true},
                      {id:other,module_id:second,name:"Section Other",sort_order:1,is_enabled:true}],
    questions: [
      {id:"active-card",module_id:first,group_id:group,is_active:true,sort_order:1},
      {id:"held-review-card",module_id:first,group_id:group,is_active:false,sort_order:2},
      {id:"other-card",module_id:second,group_id:other,is_active:true,sort_order:1}
    ].map(row=>({...row,question_type:"flashcard",question_text:row.id,answer_data:{text:"Fixture answer"}})),
    card_progress: [{question_id:"active-card",total_reviews:3,reps:2},
                    {question_id:"held-review-card",total_reviews:5,reps:1}]
  };
  const calls = [];
  const control = {toggleError:null, snapshotError:null};
  window.__sectionsFixture = {tables,calls,control};
  const ok = data => ({data:structuredClone(data),error:null});
  const failed = message => ({data:null,error:{message}});
  function from(table) {
    if(!tables[table]) throw Error("Unexpected table " + table);
    let rows = tables[table].slice();
    return {
      select() { return this; },
      eq(key,value) { rows=rows.filter(row=>row[key]===value); return this; },
      order() { return Promise.resolve(ok(rows)); },
      single() { return Promise.resolve(ok(rows[0]||null)); },
      maybeSingle() { return Promise.resolve(ok(rows[0]||null)); },
      then(resolve,reject) { return Promise.resolve(ok(rows)).then(resolve,reject); }
    };
  }
  const user={id:"fixture"};
  window.supabase={createClient:()=>({
    from,
    auth:{getSession:async()=>ok({session:{user}}),getUser:async()=>ok({user}),
          onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    async rpc(name,args) {
      calls.push({name,args:structuredClone(args)});
      if(name==="security_access_status") return ok({allowed:true,approved:true,session_valid:true,mfa_required:false,aal:"aal1"});
      if(name==="set_question_group_enabled") {
        if(control.toggleError) return failed(control.toggleError);
        const module=tables.modules.find(m=>m.id===args.p_module_id);
        const row=tables.question_groups.find(g=>g.id===args.p_group_id&&g.module_id===args.p_module_id);
        if(!row||!module||module.revision!==args.p_expected_revision) return failed("stale_module_revision");
        row.is_enabled=args.p_enabled;
        return ok(++module.revision);
      }
      if(name==="sync_module_snapshot") {
        if(control.snapshotError) return failed(control.snapshotError);
        const module=tables.modules.find(m=>m.id===args.p_module_id);
        if(!module||module.revision!==args.p_expected_revision) return failed("stale_module_revision");
        for(const incoming of args.p_groups) Object.assign(tables.question_groups.find(g=>g.id===incoming.id),incoming);
        for(const incoming of args.p_questions) Object.assign(tables.questions.find(q=>q.id===incoming.id),incoming);
        return ok(++module.revision);
      }
      throw Error("Unexpected RPC " + name);
    },
    storage:{from:()=>({createSignedUrls:async paths=>ok(paths.map(path=>({path,signedUrl:"https://section-fixture.test/"+path})))})}
  })};
})();
"""


def main():
    with sync_playwright() as playwright:
        options = {"headless": True}
        if os.environ.get("T08_CHROMIUM_EXECUTABLE"):
            options["executable_path"] = os.environ["T08_CHROMIUM_EXECUTABLE"]
        browser = playwright.chromium.launch(**options)
        page = browser.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("dialog", lambda dialog: dialog.accept())

        def route(request_route):
            request_url = urlparse(request_route.request.url)
            if request_url.hostname == "cdn.jsdelivr.net" and "supabase" in request_url.path:
                return request_route.fulfill(content_type="application/javascript", body=TRANSPORT)
            if request_url.hostname != "section-fixture.test":
                return request_route.abort()
            file = (ROOT / unquote(request_url.path).lstrip("/")).resolve()
            if file.is_relative_to(ROOT) and file.is_file():
                return request_route.fulfill(path=file)
            return request_route.fulfill(status=404, body="Missing fixture path")

        page.route("**/*", route)
        def open_studio():
            page.goto(ORIGIN + "/developer.html")
            page.wait_for_function("typeof project !== 'undefined' && project.moduleRevision === 7 && cloudReady")
            page.locator('[data-view="groups"]').click()

        open_studio()
        toggle = page.locator(f'[data-toggle-group="{GROUP}"]')
        state = page.locator(f'[data-group-enabled="{GROUP}"]')
        expect(toggle).to_have_attribute("aria-pressed", "true")
        expect(state).to_have_text("Enabled")

        original_progress = page.evaluate("__sectionsFixture.tables.card_progress")
        toggle.click()
        expect(toggle).to_have_attribute("aria-pressed", "false")
        expect(state).to_have_text("Disabled")
        calls = page.evaluate("__sectionsFixture.calls.filter(call => call.name !== 'security_access_status')")
        assert calls == [{"name":"set_question_group_enabled","args":{
            "p_module_id":"20000000-0000-4000-8000-000000000001","p_group_id":GROUP,
            "p_enabled":False,"p_expected_revision":7}}]
        assert page.evaluate("FC.loadBank('mod1').then(bank=>bank.cards.map(card=>card.id))") == []
        assert page.evaluate("FC.loadBank('mod2').then(bank=>bank.cards.map(card=>card.id))") == ["other-card"]
        assert page.evaluate("__sectionsFixture.tables.card_progress") == original_progress

        name = page.locator(f'[data-group-name="{GROUP}"]')
        name.fill("Renamed section Alpha")
        name.press("Tab")
        page.wait_for_function("__sectionsFixture.calls.some(call=>call.name==='sync_module_snapshot') && project.moduleRevision===9")
        snapshot = page.evaluate("__sectionsFixture.calls.find(call=>call.name==='sync_module_snapshot').args")
        assert {row["id"]:row["is_active"] for row in snapshot["p_questions"]} == {"active-card":True,"held-review-card":False}
        assert page.evaluate("FC.loadBank('mod1').then(bank=>bank.cards.length)") == 0
        toggle.click()
        expect(toggle).to_have_attribute("aria-pressed", "true")
        assert page.evaluate("FC.loadBank('mod1').then(bank=>bank.cards.map(card=>card.id))") == ["active-card"]
        assert page.evaluate("__sectionsFixture.tables.card_progress") == original_progress
        print("PASS clean toggle uses one targeted RPC; snapshot and re-enable preserve held status and progress")

        page.evaluate("__sectionsFixture.control.snapshotError='Fixture pending edit failure'")
        page.evaluate("""group => {
            const input = document.querySelector('[data-group-name="' + group + '"]');
            input.value = "Pending section name";
            input.dispatchEvent(new Event("change", {bubbles:true}));
            document.querySelector('[data-toggle-group="' + group + '"]').click();
        }""", GROUP)
        expect(page.locator("#groupToggleStatus")).to_contain_text("Fixture pending edit failure")
        assert page.evaluate("__sectionsFixture.calls.filter(call=>call.name==='set_question_group_enabled').length") == 2
        assert page.evaluate("__sectionsFixture.tables.question_groups[0].is_enabled")
        print("PASS a failed pending edit blocks the section change")

        open_studio()
        page.evaluate("__sectionsFixture.control.toggleError='Fixture network failure'")
        toggle.click()
        expect(page.locator("#groupToggleStatus")).to_contain_text(re.compile("Fixture network failure", re.I))
        expect(toggle).to_have_attribute("aria-pressed", "true")
        assert page.evaluate("__sectionsFixture.tables.question_groups[0].is_enabled")
        open_studio()
        page.evaluate("__sectionsFixture.tables.modules[0].revision++")
        toggle.click()
        expect(page.locator("#groupToggleStatus")).to_contain_text(re.compile("conflict|refresh|stale", re.I))
        assert page.evaluate("__sectionsFixture.tables.question_groups[0].is_enabled")
        assert page.evaluate("__sectionsFixture.tables.card_progress") == original_progress
        assert not errors, errors
        print("PASS failed and conflicting toggles leave existing section and progress intact")
        browser.close()


if __name__ == "__main__":
    main()
