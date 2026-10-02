# Filmott 최소 운영 관측

2A의 실제 Nest 메모리 endpoint와 Nginx 내부 listener를 Alloy로 수집한다. 이 폴더는 기본 배포와 분리되어 있으며, token 없이 기본 blue-green 배포를 실행할 수 있다. 실행 환경은 Linux ARM64다.

## 수집과 예산

- `nginx:9080/metrics` → active backend의 heap used/limit·RSS. `nginx:9080/release` → 현재 Nginx slot/SHA. 두 scrape는 별도 요청이므로 전환 순간의 원자적 snapshot은 아니다.
- scrape 30초/timeout8초, exporter 응답 크기·sample 수 제한. 애플리케이션 메모리는 3 gauge, release는1 gauge, scrape up과 remote-write 상태만 전송한다. label은 고정 job/instance/service/environment 및 release slot/SHA만 남긴다.
- collector CPU0.5, memory768MiB(swap추가없음), PID128, WAL tmpfs256MiB, 임시경로16MiB, 로그 최대10MiB×3. host port·Docker socket·host filesystem·privileged 권한은 없다. readonly filesystem과nonroot UID/GID473으로 실행한다.
- WAL는최대1시간보존을목표로하며15분마다truncate한다. 이것은정확한보존보장이아니다. 실제용량hard limit은tmpfs이며memory한도에도포함된다. collector재생성시WAL가사라지고,장애가길면표본이손실된다. 누락은Cloud경고/그래프공백으로표시하며0으로보정하지않는다.
- 원격endpoint: Japan `prod-ap-northeast-0`, stack `neatcloset2931`, Prometheus username3629559. 읽기query와쓰기remote-write주소는다르다. token은이폴더에저장하지않는다.

## 설치 전 조건

1. 2A이후정확한SHA가CI/배포로검증되어야한다. active-release/origin헤더와9080의release정보가일치하는지확인한다. public `/api/internal/metrics`는403이어야한다.
2. Grafana Cloud Access Policy는**이stack만, metrics:write만**허용한다. collectortoken에관리/로그/읽기권한을추가하지않는다. 만료기간을정하고만료전교체일을운영기록에남긴다. token생성은별도보안확인후수행한다.
3. 서버에는root:473,0440권한의token파일을둔다. 기본위치는 `.deploy-state/secrets/grafana-metrics-token`이다. token원문은명령인수·Git·공유출력에넣지않고사용자터미널의숨김입력으로입력한다. Compose local secret의uid/gid설정만으로host파일권한이바뀌지않는다.
4. `.env*`수정은필요없다. 다른token위치를사용할경우 `FILMOTT_GRAFANA_METRICS_TOKEN_FILE`을현재shell에주입한다. renderer와검증은자격값을요구하지않는다.

아래는**운영배포와collector기동이승인된뒤**실행할명령이다. 현재실행중인Nginx/app을재생성하지않도록`--no-deps alloy`만기동한다.

```sh
docker compose --env-file .env -f docker-compose.prod.yml \
  -f ops/monitoring/compose.yml --profile monitoring config --quiet
docker compose --env-file .env -f docker-compose.prod.yml \
  -f ops/monitoring/compose.yml --profile monitoring up -d --no-deps alloy
```

Cloud Explore에서 `up{job=~"filmott-process|filmott-release|filmott-collector"}`가각1인지확인하고,세메모리gauge와현재release를확인한다. Alloy UI의컴포넌트healthy만으로원격전송성공을판정하지않는다. `prometheus_remote_storage_queue_highest_sent_timestamp_seconds`의최신성및Cloud표본시각을확인한다. secret읽기실패/401은0건수집성공이아니다.

## 대시보드와 경고

실제Cloud Prometheus datasource UID를확인한뒤로컬artifact를생성한다.

```sh
node ops/monitoring/render.mjs --datasource 실제_DATASOURCE_UID --out /private/tmp/filmott-monitoring-render
```

- `dashboard.json`: Grafana Dashboards → New → Import에서JSON으로가져온다. 메모리,up,현재release,remote-write지연과공개API probe를표시한다. 공개probe미설정시해당panel은No data다.
- `grafana-alerts.json`: Grafana file-provisioning형식이며**Cloud에파일을놓는방식으로적용할수없다**. Cloud UI에서동일query/threshold/for/NoData/Error/label을입력하거나현재지원되는alerting API로변환해적용한다. 로컬Grafana검사는이파일을실제provisioning해해석과평가를검증한다.
- `prometheus-rules.json`: 동일정의에서만든PromQL검증용파일. Cloud alert설치를대신하지않는다.
- 기본artifact는알림을paused로만든다. 실제수집·수신contact point를확인한뒤`--enable-alerts`로생성하거나UI에서명시적으로활성화한다. 공개probe가준비되면`--with-synthetic`으로공개API규칙을추가한다.
- heap>80% 10분warning,>90% 5분critical;active scrape실패2분warning;필수메모리/release값3분누락critical. 데이터가비면heap0/정상으로표시하지않고Grafana NoData와별도누락경고로구분한다. 데이터소스오류는Alerting이다. RSS절대경고는실제기준선확보후정한다.
- 알림은초기이메일,필요시Discord채널Webhook을추가한다. contact point시험알림과실제규칙발화/복구수신은서로다른검증으로기록한다. 이레포에는수신주소/Webhook을포함하지않는다.

## 공개 API probe

Grafana Synthetic Monitoring에서HTTP검사1개를만든다. job label은 `filmott-public-api`,URL `https://filmott.kr/api/`,GET,timeout10초,주기60초,public probe1곳이다.가능하면한국사용자와가까운공개probe를선택하고실제위치를기록한다. 성공조건은HTTP200와본문 `Hello World!` 일치다. DB/TMDB/AI업무성공을의미하지않는다.

한달31일기준44,640 executions(1분이내실행),계정의Free100k한도내다. synthetics가생성하는series/log사용량도UI예상치와총사용량에서확인한다. URL에는개인정보/query/token을추가하지않는다. API실패3분경고와복구를격리대상에서시험한후운영대상을켜며,운영API를고의로장애내지않는다.

## 복구와배포순서

collector오류가앱요청경로를막지않도록애플리케이션depends_on에Alloy를넣지않았다. 문제시다음명령으로collector만중지한다.

```sh
docker compose --env-file .env -f docker-compose.prod.yml \
  -f ops/monitoring/compose.yml --profile monitoring stop alloy
```

앱·Nginx는기존검증된blue-green rollback/reload절차를따른다. 일반배포는monitoring overlay를읽지않으므로Alloy설정변경후에는명시적으로collector만재생성해야한다. 구성을readonly bind mount한상태에서Git checkout으로inode가바뀔수있어hot reload에의존하지않는다. 기본배포에서orphan경고가나더라도`--remove-orphans`로Alloy를제거하지않는다. rollback으로2A이전이미지로돌아가면계측404가나올수있으며이때수집누락경고는정상적인관측이다.

## 로컬 검증

```sh
node ops/monitoring/render.mjs --datasource filmott-prometheus --out /private/tmp/filmott-monitoring-render
node ops/monitoring/test/rules-test.mjs /private/tmp/filmott-monitoring-render
docker run --rm --network none -v /private/tmp/filmott-monitoring-render:/data:ro \
  -w /data --entrypoint /bin/promtool prom/prometheus:v3.13.3 test rules rule-tests.json
python3 ops/monitoring/test/integration.py
```

integration검사는임시Docker network/컨테이너와localhost전용port를사용하고종료시본인이만든자원만정리한다. 실제Alloy/Nginx/Prometheus/Grafana를실행하며backend/API수치는의도적fixture다. 빠른transport검사는scrape2초/timeout1초,Grafana전송검사는critical대기0초/평가10초로단축한다. 실제30초scrape와5/10분경고지속시간의완료를이실습으로주장하지않으며원래시간조건은promtool로검증한다. Cloud계정수집과사용자이메일/Discord수신은운영연결후별도확인한다.

공식근거: [Alloy remote-write](https://grafana.com/docs/alloy/latest/reference/components/prometheus/prometheus.remote_write/), [Grafana alert파일](https://grafana.com/docs/grafana/latest/alerting/set-up/provision-alerting-resources/file-provisioning/), [Grafana Free](https://grafana.com/pricing/).
