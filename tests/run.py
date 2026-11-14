import asyncio, json, os, subprocess, sys
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
subprocess.run([sys.executable,os.path.join(ROOT,'tests','build.py')],check=True)
OUT=os.path.join(ROOT,'tests','out')
CHROME=os.environ.get('CHROME','/usr/bin/google-chrome')
from playwright.async_api import async_playwright
errs=[]
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=CHROME,args=['--allow-file-access-from-files'])
    pg=await b.new_page(viewport={'width':390,'height':844})
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    pg.on('console',lambda m:m.type=='error' and errs.append('CONSOLE '+m.text))
    await pg.goto('file://'+OUT+'/test.html')
    async def txt(): return await pg.inner_text('body')
    async def click(t): await pg.get_by_text(t,exact=True).first.click()
    async def attach(btn):
      async with pg.expect_file_chooser() as fc: await pg.get_by_text(btn).first.click()
      f=await fc.value; await f.set_files(OUT+'/dummy.pdf'); await pg.wait_for_timeout(300)
    await click('社内の方')
    await pg.fill('#lgName','栗原'); await pg.fill('#lgPw','9999'); await click('入る'); await pg.wait_for_timeout(200)
    assert 'パスワードが違います' in await txt(), 'wrong pw'
    await pg.fill('#lgPw','1228'); await click('入る'); await pg.wait_for_timeout(200)
    t=await txt(); assert '総売上' in t; print('login ok')
    # calculator
    await click('粗利計算')
    await pg.fill('#cwC','1300000'); await pg.dispatch_event('#cwC','input')
    await pg.fill('#cwR','22'); await pg.dispatch_event('#cwR','input')
    t=await pg.inner_text('#cwOut'); print('calc1:',t.replace('\n',' | ')); assert '¥1,014,000 以内' in t
    await pg.fill('#cwC',''); 
    await pg.locator('#cwRows input').nth(1).fill('1000000'); await pg.locator('#cwRows input').nth(1).dispatch_event('input')
    await pg.fill('#cwR','22'); await pg.dispatch_event('#cwR','input')
    print('calc2 c=',await pg.input_value('#cwC')); assert await pg.input_value('#cwC')=='1282052'
    await click('＋ 業者を追加'); await click('＋ 業者を追加')
    ins=pg.locator('#cwRows .subrow')
    for i,v in enumerate(['300000','900000','400000']):
      a=ins.nth(i).locator('input').nth(1); await a.fill(v); await a.dispatch_event('input')
    await pg.fill('#cwR','25'); await pg.dispatch_event('#cwR','input')
    print('calc3 c=',await pg.input_value('#cwC')); assert await pg.input_value('#cwC')=='2133334'
    await click('閉じる')
    # add site
    await click('＋ 現場を追加')
    await pg.fill('#sfName','福島1丁目ビル新築工事'); await pg.fill('#sfAd','大阪市福島区福島1-1-1'); await pg.fill('#sfCl','山口一樹'); await pg.fill('#sfS','2026-10-01'); await pg.fill('#sfE','2027-03-31')
    await pg.select_option('#sfM','牛尾和寛'); await pg.fill('#sfSa','〇〇不動産（紹介）')
    await attach('📎 見積書PDFを添付')
    print('contract from pdf:',await pg.input_value('#cwC')); assert await pg.input_value('#cwC')=='1000000'
    await pg.fill('#cwC','2000000'); await pg.dispatch_event('#cwC','input')
    r0=pg.locator('#cwRows .subrow').nth(0).locator('input')
    await r0.nth(0).fill('A工業'); await r0.nth(0).dispatch_event('input')
    await r0.nth(1).fill('1500000'); await r0.nth(1).dispatch_event('input')
    print('r=',await pg.input_value('#cwR')); assert await pg.input_value('#cwR')=='25.0'
    await click('保存'); await pg.wait_for_timeout(300)
    t=await txt(); assert '福島1丁目ビル新築工事' in t and '山口一樹様' in t; print('site saved')
    assert '大阪市福島区福島1-1-1' in t and '地図で開く' in t; print('address ok')
    await click('実行予算'); t=await txt(); assert 'A工業' in t and '¥1,500,000' in t; print('budget ok')
    await click('下請請求'); await click('＋ 請求を追加')
    await pg.fill('#blV','A工業'); await pg.fill('#blD','2026-11-10'); await pg.fill('#blA','600000'); await click('保存'); await pg.wait_for_timeout(200)
    await click('概要'); t=await txt(); assert '70.0%' in t; print('actual margin 70% ok')
    await attach('＋ 工程表を添付'); t=await txt(); assert '最新' in t and 'dummy' in t; print('schedule attach ok')
    # client invoice
    await click('請求・入金'); await click('＋ 請求を追加')
    window_parsed={'kind':'請求書','company':'エクステージ','date':'2026-08-01','subtotal':1000000,'tax':100000,'total':1100000}
    await pg.evaluate('p=>window.__mockParsed=p',window_parsed)
    await attach('📎 請求書PDFを添付')
    assert await pg.input_value('#ciA')=='1000000' and await pg.input_value('#ciD')=='2026-08-01'
    await click('保存'); await pg.wait_for_timeout(200)
    t=await txt(); assert '入金遅れ' in t and '請求1件中0件' in t; print('cinv late ok')
    await click('現場'); t=await txt(); assert '入金漏れの可能性あり' in t; print('banner ok')
    await pg.locator('.card.site',has_text='福島1丁目ビル新築工事').first.click(); await click('請求・入金')
    await pg.locator('button.chip',has_text='□').first.click(); await click('入金を確認しました'); await pg.wait_for_timeout(200)
    t=await txt(); assert '経理確認済み' in t and '請求分はすべて入金済み' in t; print('check ok')
    await click('＋ 請求を追加'); await pg.select_option('#ciT','完成金（残金）'); await pg.fill('#ciA','1000000'); await click('保存'); await pg.wait_for_timeout(200)
    await pg.locator('button.chip',has_text='□').first.click(); await click('入金を確認しました'); await pg.wait_for_timeout(200)
    t=await txt(); assert '✓ 全入金済み' in t; print('全入金済み ok')
    await click('現場'); t=await txt(); assert '入金漏れ' not in t; assert '全入金済み' in t
    # report with add work
    await pg.locator('.card.site',has_text='福島1丁目ビル新築工事').first.click(); await click('日報')
    await click('＋ 日報を書く'); await pg.fill('#rpC','雨で1日遅れ'); await pg.check('#rpA'); await pg.fill('#rpAm','200000'); await pg.fill('#rpV','B設備'); await pg.fill('#rpVQ','150000'); await click('保存'); await pg.wait_for_timeout(200)
    await click('確定にする'); await pg.wait_for_timeout(200)
    await click('概要'); t=await txt(); print('after add: sales 2,200,000?', '¥2,200,000' in t); assert '¥2,200,000' in t
    await pg.screenshot(path=OUT+'/site.png',full_page=True)
    await click('← 戻る')
    for tab in ['担当・お客様','書類','入金・支払','外注日報','管理']:
      await click(tab); await pg.wait_for_timeout(100)
    await pg.evaluate("F.period='all'"); await click('担当・お客様'); await pg.get_by_text('牛尾和寛').first.click(); t=await txt(); assert '福島1丁目ビル新築工事' in t
    await click('‹ 担当者一覧へ'); t=await txt(); assert '営業窓口' not in t and '〇〇不動産' not in t; print('no sales in person ok')
    await pg.get_by_text('牛尾和寛').first.click()
    await click('‹ 担当者一覧へ'); await click('お客様（元請・施主）'); await pg.get_by_text('山口一樹様').first.click(); t=await txt(); assert '総利益' in t
    await pg.get_by_text('福島1丁目ビル新築工事').first.click(); await click('← 戻る'); t=await txt(); assert '山口一樹様' in t
    await click('‹ お客様一覧へ'); print('person/client ok')
    # notify emails setting
    await pg.locator('nav button',has_text='管理').click(); await pg.fill('#adN','a@example.com、b@example.com'); await pg.get_by_text('設定を保存',exact=True).click(); await pg.wait_for_timeout(300)
    assert await pg.input_value('#adN')=='a@example.com、b@example.com'; print('notify setting ok')
    # outsourcer
    await pg.evaluate("SES=null;localStorage.removeItem(KEY);LG.role=null;renderLogin()")
    await click('外注・協力業者の方'); await pg.fill('#lgName','田中塗装'); await click('入る'); await pg.wait_for_timeout(200)
    t=await txt(); assert '総売上' not in t and '作業日報' in t
    leak=await pg.evaluate("(async()=>{try{await api('all');return 'LEAK'}catch(e){return e.message}})()"); print('out all ->',leak); assert leak!='LEAK'
    leak2=await pg.evaluate("(async()=>{try{await api('all',{role:'staff',pw:'0000'});return 'LEAK'}catch(e){return e.message}})()"); assert leak2!='LEAK'
    await pg.select_option('#owS',index=1); await pg.fill('#owW','外壁塗装'); await click('あり')
    e=pg.locator('#owExp input'); await e.nth(1).fill('1200'); await e.nth(1).dispatch_event('input')
    await click('日報を送る'); await pg.wait_for_timeout(200); t=await txt(); assert '外壁塗装' in t and '8.0時間' in t; print('worklog ok')
    ml=await pg.evaluate('window.__mails'); assert len(ml)==1 and ml[0]['to']=='a@example.com,b@example.com' and '田中塗装さんから日報' in ml[0]['subject'] and '¥' not in ml[0]['body'] and '1200' not in ml[0]['body'], ml; print('notify worklog ok')
    await pg.select_option('#owS','__other'); await pg.fill('#owOn','事務所'); await pg.fill('#owOw','事務所の掃除'); await pg.fill('#owOp','本社事務所'); await pg.fill('#owW','')
    await pg.screenshot(path=OUT+'/out_other.png',full_page=True)
    await click('日報を送る'); await pg.wait_for_timeout(200); t=await txt(); assert 'その他：事務所' in t and '作業名：事務所の掃除' in t and '作業場所：本社事務所' in t; print('worklog other ok')
    await click('請求書'); await pg.evaluate("window.__mockParsed={company:'田中塗装',date:'2026-11-20',subtotal:450000,tax:45000,total:495000}")
    await attach('📄 請求書を選ぶ'); await pg.select_option('#oiS',index=1); t=await pg.inner_text('#oiP'); print(t); assert '2027年1月10日（日）' in t
    await click('送る'); await pg.wait_for_timeout(200); t=await txt(); assert '送信済' in t
    ml=await pg.evaluate('window.__mails'); assert len(ml)==3 and '請求書' in ml[2]['subject'] and '450000' not in ml[2]['body'] and '495' not in ml[2]['body'], ml; print('notify invoice ok')
    await pg.screenshot(path=OUT+'/out.png',full_page=True)
    # unlock + staff sees invoice
    await click('この端末の外注設定を解除'); await pg.fill('#ulP','1228'); await click('解除する'); await pg.wait_for_timeout(200)
    await click('社内の方'); await pg.fill('#lgName','栗原'); await pg.fill('#lgPw','1228'); await click('入る'); await pg.wait_for_timeout(200)
    t=await txt(); assert '新しい請求書が1件' in t
    await pg.locator('nav button',has_text='入金・支払').click(); await click('現場に計上'); await click('計上する'); await pg.wait_for_timeout(200)
    t=await txt(); assert '2027年1月10日（日） お支払い' in t; print('post invoice ok')
    await pg.screenshot(path=OUT+'/pay.png',full_page=True)
    await click('外注日報'); t=await txt(); assert '田中塗装' in t and '¥1,200' in t
    await click('書類'); t=await txt(); print('docs count line:', [l for l in t.split('\n') if '件・税抜' in l])
    await click('現場'); await pg.screenshot(path=OUT+'/home.png',full_page=True)
    # settings: change categories & pay cycle
    await pg.locator('nav button',has_text='管理').click()
    await pg.fill('#adCat','新築、リフォーム、外構'); await pg.select_option('#adPm','1'); await pg.fill('#adPd','31')
    await pg.get_by_text('設定を保存',exact=True).click(); await pg.wait_for_timeout(300)
    await pg.locator('nav button',has_text='現場').first.click(); t=await txt(); assert '外構' in t, 'category setting'
    await pg.locator('nav button',has_text='入金・支払').click(); t=await txt(); assert '末締め翌月末払い' in t, 'pay rule'; print('settings ok')
    # requests
    await pg.locator('header button[title="改善リクエスト"]').click(); await pg.fill('#rqT','一覧に着工日を出して'); await pg.check('#rqU'); await click('送る'); await pg.wait_for_timeout(300)
    t=await txt(); assert '一覧に着工日を出して' in t and '急ぎ' in t
    tok=await pg.evaluate("(async()=>(await api('agentToken')).token)()")
    lst=await pg.evaluate("t=>fetch('x',{method:'POST',body:JSON.stringify({action:'agentList',token:t})}).then(r=>r.json())",tok)
    assert len(lst['requests'])==1
    bad=await pg.evaluate("()=>fetch('x',{method:'POST',body:JSON.stringify({action:'agentList',token:'wrong'})}).then(r=>r.json())"); assert 'error' in bad
    rid=lst['requests'][0]['id']
    await pg.evaluate("([t,id])=>fetch('x',{method:'POST',body:JSON.stringify({action:'agentUpdate',token:t,id,status:'対応済',reply:'着工日を表示しました'})}).then(r=>r.json())",[tok,rid])
    await click('閉じる'); await pg.evaluate("reload().then(render)"); await pg.wait_for_timeout(200)
    assert await pg.locator('header .badge').count()==1, 'reply badge'
    await pg.locator('header button[title="改善リクエスト"]').click(); t=await txt(); assert '着工日を表示しました' in t; print('requests ok')
    await click('閉じる')
    print('AI calls:',await pg.evaluate('window.__aiCalls'))
    await b.close()
asyncio.run(main())
print('ERRORS:',errs)
sys.exit(1 if errs else 0)
