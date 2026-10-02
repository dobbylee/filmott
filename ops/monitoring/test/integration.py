#!/usr/bin/env python3
"""실제 Alloy/Prometheus/Grafana/Nginx 격리 검사. Cloud와 사용자 서버에 연결하지 않는다."""
import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[3]
ALLOY = 'grafana/alloy:v1.20.0@sha256:f111cce835516c5f99166342be7038496b52ced16667be5a11e19258a3e4cd30'
PROM = 'prom/prometheus:v3.13.3'
GRAFANA = 'grafana/grafana:12.2.0'
containers = []
network = None


def command(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT).strip()


def request(url, auth=False):
    headers = {'Authorization': 'Basic ' + base64.b64encode(b'fixture:fixture-admin').decode()} if auth else {}
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=5) as response:
        return json.load(response)


def wait_for(label, check, timeout=60):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        try:
            last = check()
            if last:
                print(label + ': passed', flush=True)
                return last
        except (OSError, ValueError, KeyError, IndexError) as error:
            last = type(error).__name__
        time.sleep(1)
    raise AssertionError(f'{label} timeout: {last}')


with tempfile.TemporaryDirectory(prefix='filmott-monitoring-2b-') as tmp:
    root = Path(tmp)
    root.chmod(0o755)
    name = root.name.lower()
    def start(alias, image, options=None, args=None):
        cname = name + '-' + alias
        command('docker', 'create', '--name', cname, '--network', network, '--network-alias', alias,
                *(options or []), image, *(args or []))
        containers.append(cname)
        command('docker', 'start', cname)
        return cname
    def port(container, internal):
        return command('docker','port',container,str(internal)).split(':')[-1]
    def mount(source, dest):
        return ['-v', f'{source}:{dest}:ro']
    fixture_containers = []
    def write_state(**updates):
        for container, control_port in fixture_containers:
            if command('docker','inspect','--format','{{.State.Running}}',container) != 'true':
                continue
            command('docker','exec',container,'node','-e',
                    "fetch('http://127.0.0.1:"+str(control_port)+"/control',{method:'POST',body:process.argv[1]}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))",json.dumps(updates))
    def release(slot):
        sha = ('a' if slot == 'blue' else 'b') * 40
        (root/'runtime'/'upstreams.conf').write_text(
            f'map $host $filmott_active_slot {{ default "{slot}"; }}\n'
            f'map $host $filmott_active_sha {{ default "{sha}"; }}\n'
            f'map $host $filmott_previous_frontend {{ default "frontend-{slot}:3000"; }}\n')
    try:
        network = command('docker','network','create',name)
        for d in ['fixture','runtime','certs/live/filmott.kr','generated','dashboards','provisioning/datasources','provisioning/alerting','provisioning/dashboards','provisioning/plugins']:
            (root/d).mkdir(parents=True,exist_ok=True)
        shutil.copy(ROOT/'ops/monitoring/test/fixture.cjs',root/'fixture/server.cjs')
        release('blue')
        command('openssl','req','-x509','-nodes','-newkey','rsa:2048','-days','1','-subj','/CN=filmott.kr',
                '-keyout',str(root/'certs/live/filmott.kr/privkey.pem'),'-out',str(root/'certs/live/filmott.kr/fullchain.pem'))
        command('node',str(ROOT/'ops/monitoring/render.mjs'),'--datasource','filmott-prometheus','--out',str(root/'generated'),'--enable-alerts')
        # 원래 지속시간은 promtool로 검증하고, 전송 검사는 scrape 주기/timeout만 단축한다.
        config = Path(os.environ.get('FILMOTT_ALLOY_CONFIG_UNDER_TEST', ROOT/'ops/monitoring/config.alloy')).read_text()
        (root/'config.alloy').write_text(config.replace('scrape_interval = "30s"','scrape_interval = "2s"').replace('scrape_timeout = "8s"','scrape_timeout = "1s"'))
        (root/'token').write_text('fixture-token\n')
        # 실제 운영 overlay의 자원/노출/secret 계약을 확인한다. 값은 출력하지 않는다.
        compose_root=root/'compose'
        (compose_root/'backend').mkdir(parents=True)
        (compose_root/'backend/.env.production').touch()
        shutil.copy(ROOT/'docker-compose.prod.yml',compose_root/'prod.yml')
        shutil.copy(Path(os.environ.get('FILMOTT_MONITORING_COMPOSE_UNDER_TEST', ROOT/'ops/monitoring/compose.yml')),compose_root/'monitoring.yml')
        env={**os.environ,'DB_NAME':'fixture','DB_USERNAME':'fixture','DB_PASSWORD':'fixture',
             'NEXT_PUBLIC_GA_ID':'fixture','NEXT_PUBLIC_SENTRY_DSN':'https://public@example.invalid/1',
             'REVALIDATE_SECRET':'fixture','FILMOTT_GRAFANA_METRICS_TOKEN_FILE':str(root/'token')}
        cfg=json.loads(subprocess.check_output(['docker','compose','--env-file','/dev/null','-f',str(compose_root/'prod.yml'),
            '-f',str(compose_root/'monitoring.yml'),'--profile','monitoring','config','--format','json'],env=env,text=True))
        collector=cfg['services']['alloy']
        assert collector['image']==ALLOY and collector['user']=='473:473'
        assert int(collector['mem_limit'])==768*1024*1024 and float(collector['cpus'])==0.5
        assert not collector.get('ports') and not collector.get('privileged') and collector.get('network_mode')!='host'
        assert collector['read_only'] and collector['cap_drop']==['ALL'] and collector['pids_limit']==128
        assert len(collector['volumes'])==1 and collector['volumes'][0]['target']=='/etc/alloy/config.alloy'
        assert collector['volumes'][0]['read_only']
        assert collector['memswap_limit']==collector['mem_limit']
        assert collector['security_opt']==['no-new-privileges:true']
        assert collector['tmpfs']==['/var/lib/alloy:size=256m,uid=473,gid=473,mode=0700','/tmp:size=16m,uid=473,gid=473,mode=0700']
        assert len(collector['secrets'])==1 and collector['secrets'][0]['source']=='grafana_metrics_token'
        assert collector['secrets'][0]['target'].removeprefix('/run/secrets/')=='grafana_metrics_token'
        assert collector['command']==['run','--disable-reporting','--server.http.listen-addr=127.0.0.1:12345','--storage.path=/var/lib/alloy','/etc/alloy/config.alloy']
        assert all(not cfg['services'][key].get('ports') for key in ['backend-blue','backend-green'])
        assert all(str(p['target'])!='9080' for p in cfg['services']['nginx'].get('ports',[]))
        print('운영Composeoverlay접근경계: passed',flush=True)
        (root/'prometheus.json').write_text(json.dumps({'global':{'evaluation_interval':'1s'},'scrape_configs':[]}))
        prom = start('prometheus',PROM,mount(root/'prometheus.json','/etc/prometheus/prometheus.yml')+['-p','127.0.0.1::9090'],
                     ['--config.file=/etc/prometheus/prometheus.yml','--web.enable-remote-write-receiver'])
        prom_url = 'http://127.0.0.1:'+port(prom,9090)
        def query(expr):
            data = request(prom_url+'/api/v1/query?'+urllib.parse.urlencode({'query':expr}))
            assert data['status'] == 'success'
            return data['data']['result']
        blue = start('backend-blue','node:24-alpine',mount(root/'fixture','/fixture')+['-e','FIXTURE_ROLE=blue'],['node','/fixture/server.cjs'])
        green = start('backend-green','node:24-alpine',mount(root/'fixture','/fixture')+['-e','FIXTURE_ROLE=green'],['node','/fixture/server.cjs'])
        gateway = start('gateway','node:24-alpine',mount(root/'fixture','/fixture')+['-e','FIXTURE_ROLE=gateway','-p','127.0.0.1::8080'],['node','/fixture/server.cjs'])
        fixture_containers.extend([(blue,3001),(green,3001),(gateway,8080)])
        nginx = start('nginx','nginx:alpine',mount(ROOT/'nginx/nginx.conf','/etc/nginx/conf.d/default.conf')+
                      mount(ROOT/'nginx/security-headers.conf','/etc/nginx/security-headers.conf')+mount(root/'runtime','/etc/nginx/runtime')+mount(root/'certs','/etc/letsencrypt'))
        command('docker','exec',nginx,'nginx','-t')
        alloy = start('alloy',ALLOY,
            mount(root/'config.alloy','/etc/alloy/config.alloy')+mount(root/'token','/run/secrets/grafana_metrics_token')+
            ['--user',collector['user'],'--read-only','--cap-drop','ALL','--security-opt',collector['security_opt'][0],
             '--memory',str(collector['mem_limit']),'--memory-swap',str(collector['memswap_limit']),'--cpus',str(collector['cpus']),'--pids-limit',str(collector['pids_limit']),
             '--tmpfs',collector['tmpfs'][0],'--tmpfs',collector['tmpfs'][1],
             '-e','GRAFANA_METRICS_URL=http://gateway:8080/api/v1/write','-e','GRAFANA_METRICS_USERNAME=fixture'],
            collector['command'])
        wait_for('실제Alloy→Nginx→remote-write→Prometheus',lambda: query('filmott_node_heap_used_bytes{job="filmott-process"}')[0]['value'][1]=='40')
        data = query('{service="filmott"}')
        assert all(set(s['metric']) <= {'__name__','job','instance','slot','sha','service','environment'} for s in data)
        assert 'fixture-private' not in json.dumps(data)
        assert not query('private_metric')
        wait_for('collector상태수집',lambda: query('up{job="filmott-collector"}')[0]['value'][1]=='1')
        settings = json.loads(command('docker','inspect',alloy))[0]['HostConfig']
        assert settings['Memory']==768*1024*1024 and settings['NanoCpus']==500000000
        assert 'size=256m' in settings['Tmpfs']['/var/lib/alloy']
        print('metric/label허용목록·resource hard limits: passed',flush=True)
        release('green')
        command('docker','exec',nginx,'nginx','-s','reload')
        wait_for('green전환데이터',lambda: query('filmott_node_heap_used_bytes{job="filmott-process"}')[0]['value'][1]=='60')
        wait_for('현재release만표시',lambda: len(query('filmott_active_release_info'))==1 and query('filmott_active_release_info')[0]['metric']['slot']=='green')
        command('docker','stop',blue)
        time.sleep(5)
        wait_for('inactive종료오탐없음',lambda: len(query('up{job=~"filmott-process|filmott-release"}'))==2 and all(x['value'][1]=='1' for x in query('up{job=~"filmott-process|filmott-release"}')))
        write_state(remoteFail=True)
        time.sleep(7)
        old = query('timestamp(filmott_node_heap_used_bytes)')[0]['value'][1]
        time.sleep(5)
        assert query('timestamp(filmott_node_heap_used_bytes)')[0]['value'][1]==old
        write_state(remoteFail=False)
        wait_for('remote-write실패후복구',lambda: float(query('timestamp(filmott_node_heap_used_bytes)')[0]['value'][1])>float(old))
        write_state(scrapeFail=True)
        wait_for('scrape실패up0',lambda: query('up{job="filmott-process"}')[0]['value'][1]=='0')
        write_state(scrapeFail=False)
        wait_for('scrape복구up1',lambda: query('up{job="filmott-process"}')[0]['value'][1]=='1')
        wait_for('RSS재수집',lambda: query('filmott_process_resident_memory_bytes')[0]['value'][1]=='150')
        ds = {'apiVersion':1,'datasources':[{'name':'Filmott fixture','type':'prometheus','uid':'filmott-prometheus','url':'http://prometheus:9090','access':'proxy','isDefault':True}]}
        (root/'provisioning/datasources/datasource.yaml').write_text(json.dumps(ds))
        # 알림 전송/복구 검증만 critical의 for를0초, 평가주기를10초로 단축한다.
        alert_config=json.loads((root/'generated/grafana-alerts.json').read_text())
        alert_config['groups'][0]['interval']='10s'
        for rule in alert_config['groups'][0]['rules']:
            if rule['uid']=='filmott-heap-critical': rule['for']='0s'
        alert_config['contactPoints']=[{'orgId':1,'name':'fixture','receivers':[{'uid':'fixture-receiver','type':'webhook','settings':{'url':'http://gateway:8080/notifications'},'disableResolveMessage':False}]}]
        alert_config['policies']=[{'orgId':1,'receiver':'fixture','group_by':['alertname'],'group_wait':'0s','group_interval':'1s','repeat_interval':'1h'}]
        (root/'provisioning/alerting/alerts.json').write_text(json.dumps(alert_config))
        shutil.copy(root/'generated/dashboard.json',root/'dashboards/dashboard.json')
        (root/'provisioning/dashboards/dashboard.yaml').write_text(json.dumps({'apiVersion':1,'providers':[{'name':'filmott','folder':'Filmott','type':'file','options':{'path':'/var/lib/fixture-dashboards'}}]}))
        grafana=start('grafana',GRAFANA,mount(root/'provisioning','/etc/grafana/provisioning')+mount(root/'dashboards','/var/lib/fixture-dashboards')+
                      ['-p','127.0.0.1::3000','-e','GF_SECURITY_ADMIN_USER=fixture','-e','GF_SECURITY_ADMIN_PASSWORD=fixture-admin','-e','GF_ANALYTICS_REPORTING_ENABLED=false','-e','GF_ANALYTICS_CHECK_FOR_UPDATES=false','-e','GF_PLUGINS_PREINSTALL_DISABLED=true'])
        grafana_url='http://127.0.0.1:'+port(grafana,3000)
        wait_for('Grafana실제dashboard로딩',lambda: request(grafana_url+'/api/dashboards/uid/filmott-minimal',True)['dashboard']['uid']=='filmott-minimal')
        rules=wait_for('Grafana실제alertprovisioning',lambda: request(grafana_url+'/api/v1/provisioning/alert-rules',True))
        assert len(rules)==4
        assert {r['uid'] for r in rules}=={'filmott-heap-warning','filmott-heap-critical','filmott-scrape-failed','filmott-telemetry-missing'}
        notifications_url='http://127.0.0.1:'+port(gateway,8080)+'/notifications'
        write_state(heapHigh=True)
        def notified(status):
            return any(alert.get('labels',{}).get('alertname')=='Filmott heap 90% 이상' and alert.get('status')==status
                       for item in request(notifications_url) for alert in item.get('alerts',[]))
        wait_for('Grafana경고localwebhook수신',lambda:notified('firing'),90)
        write_state(heapHigh=False)
        wait_for('Grafana복구localwebhook수신',lambda:notified('resolved'),90)
        command('docker','stop',alloy)
        assert command('docker','exec',nginx,'wget','-qO-','http://backend-green:3001/api/')=='Hello World!'
        print('collector중단후앱응답·Grafanaartifact해석: passed',flush=True)
        print(json.dumps({'status':'passed','series':len(data),'grafanaRules':len(rules),'note':'Cloud/사용자 알림수신은 미검증; local webhook 검증, transport실습scrape2s, production30s'}),flush=True)
    finally:
        for container in reversed(containers):
            if os.environ.get('FILMOTT_TEST_KEEP_LOGS'):
                try: Path(os.environ['FILMOTT_TEST_KEEP_LOGS'],container+'.log').write_text(command('docker','logs',container))
                except subprocess.CalledProcessError: pass
            subprocess.run(['docker','rm','-f',container],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=False)
        if network:
            subprocess.run(['docker','network','rm',network],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=False)
