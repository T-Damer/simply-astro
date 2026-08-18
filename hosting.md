# Хостинг astrotrue.ru

Секреты, пароли и ключи в этом файле не хранятся.

## Где крутится сайт

Площадка та же, что у `svnl.pro`: виртуальный хостинг Masterhost, тариф **v2-start**, аккаунт `u543238`.

| | |
|---|---|
| Панель | https://cp.masterhost.ru/ |
| SSH | `ssh u543238@u543238.ssh.masterhost.ru` |
| Document root | `/home/u543238/astrotrue.ru/www` |
| Канонический адрес | `https://astrotrue.ru/` (после DNS и SSL) |
| Регистратор домена | REG.RU, NS сейчас `ns1.reg.ru` / `ns2.reg.ru` |

`svnl.pro` не трогать: его корень — `/home/u543238/svnl.pro/www`, деплой и сертификат описаны в репозитории svnl-pro.

## Два домена на v2-start — реально ли

Официально тариф даёт **1 сайт / 1 домен** на площадке. Безлимитны только поддомены и **псевдонимы (алиасы)**. Второй самостоятельный сайт — платная опция «размещение дополнительного домена сверх лимита», **60 ₽/мес**.

Разница регистраторов тут ни при чём. `svnl.pro` куплен у Masterhost, `astrotrue.ru` — у REG.RU. Для веба важно только, что домен добавлен как **отдельный сайт** на площадке `u543238`, а не как алиас `svnl.pro`.

Это уже сделано (18 августа 2026):

- на диске есть отдельное дерево `/home/u543238/astrotrue.ru/` (`www`, `cgi-bin`, `tmp`);
- логи площадки заведены на `astrotrue.ru`;
- фронтенды Masterhost отвечают на `Host: astrotrue.ru` и `Host: www.astrotrue.ru` кодом **200** (после первой выкладки 18 августа 2026);
- `svnl.pro` на тех же IP по-прежнему отдаёт свой 301 на HTTPS.

Если бы `astrotrue.ru` повесили алиасом на `svnl.pro`, оба имени открывали бы сайт svnl. Сейчас это два разных vhost. Значит второй сайт на площадке уже есть. Имеет смысл в панели проверить, не включилась ли доплата 60 ₽/мес — добавление в интерфейсе бесплатное, сверхлимитное размещение тарифицируется отдельно.

Сборка на Masterhost не используется: лимит процесса 128 МБ, как у svnl.pro. Сюда кладём уже готовую статику.

Квота диска: занято ~585 МБ из 5 ГБ. Этот сайт ~15 МБ, места хватает.

## DNS в REG.RU

Зону **не** переносить на NS Masterhost — достаточно A-записей у текущего регистратора. SSH-адрес `90.156.142.59` в DNS не писать: это backend, HTTP идёт на frontend.

Проверено запросом с заголовком `Host: astrotrue.ru` на фронтенды площадки (те же, что у `svnl.pro`, PTR `fe.shared.masterhost.ru`):

| Имя | Тип | Значение |
|---|---|---|
| `@` (astrotrue.ru) | A | `90.156.201.94` |
| `@` | A | `90.156.201.53` |
| `@` | A | `90.156.201.106` |
| `@` | A | `90.156.201.30` |
| `www` | CNAME | `astrotrue.ru.` |

Либо четыре такие же A-записи для `www` вместо CNAME. AAAA не нужны — у площадки их нет.

MX/SPF/DKIM не добавлять, пока не нужна почта на этом домене. Записи `svnl.pro` не менять.

После сохранения в REG.RU проверка:

```bash
dig astrotrue.ru A @ns1.reg.ru +short
curl -I http://astrotrue.ru/
```

После первой выкладки (18 августа 2026) фронтенд отдаёт `200` и HTML с заголовком «Простая астрология». Публичный `http://astrotrue.ru/` заработает, когда в REG.RU появятся A-записи.

## SSL

Покупать сертификат не нужно. Используется бесплатный Let's Encrypt на 90 дней для `astrotrue.ru` и `www.astrotrue.ru`, тот же `acme.sh`, что у svnl.pro. Ключ RSA-2048: панель Masterhost не принимает EC `.key`.

Первый выпуск выполнен 18 августа 2026 (до 16 ноября 2026). Установка в панель Masterhost остаётся ручной: API для своего сертификата на виртуальном хостинге нет. Встроенный Let's Encrypt Masterhost требует их NS — зона остаётся на REG.RU.

### 1. Выпустить или продлить

```bash
ssh u543238@u543238.ssh.masterhost.ru
/home/u543238/deploy/astrotrue.ru/renew-certificate.sh
```

Скрипт лежит в репозитории: `ops/renew-certificate.sh`. CI копирует его на площадку вместе с релизом. Продление трогает только `astrotrue.ru`, не svnl.pro. Файлы для загрузки:

- `/home/u543238/deploy/astrotrue.ru/certificate-upload/astrotrue.ru.crt`
- `/home/u543238/deploy/astrotrue.ru/certificate-upload/astrotrue.ru.key`

Приватный ключ с правами `600`. Не коммитить, не слать в чат.

### 2. Скопировать на компьютер

```bash
certificate_dir="$(mktemp -d)"
chmod 700 "${certificate_dir}"
scp u543238@u543238.ssh.masterhost.ru:/home/u543238/deploy/astrotrue.ru/certificate-upload/astrotrue.ru.crt "${certificate_dir}/"
scp u543238@u543238.ssh.masterhost.ru:/home/u543238/deploy/astrotrue.ru/certificate-upload/astrotrue.ru.key "${certificate_dir}/"
chmod 600 "${certificate_dir}"/*
printf '%s\n' "${certificate_dir}"
```

### 3. Загрузить в Masterhost

1. «Виртуальный хостинг → Площадка u543238 → astrotrue.ru → Поддержка SSL → Настроить».
2. «По технологии SNI» и «Загрузить свой сертификат».
3. «Загрузить .CRT» — `astrotrue.ru.crt`.
4. «Загрузить .KEY» — `astrotrue.ru.key`. Не вставлять PEM текстом.
5. «Применить».

### 4. Проверить и включить редиректы

```bash
curl --fail --head https://astrotrue.ru/
curl --fail --head https://www.astrotrue.ru/
```

Только после успешного HTTPS в панели включить `www → astrotrue.ru` и `HTTP → HTTPS`. Потом удалить локальную копию ключа:

```bash
find "${certificate_dir}" -depth -delete
```

## Деплой

Сайт статический, сборки нет. GitHub Actions пакует файлы и ставит их на Masterhost по SSH, как GitVerse CI для svnl.pro. Каталог `svnl.pro` не затрагивается. `.well-known` при обновлении сохраняется (для будущего Let's Encrypt).

| | |
|---|---|
| Workflow | `.github/workflows/deploy.yml` |
| Триггер | push в `agent/refresh-site-design` или `main`, либо ручной `workflow_dispatch` |
| Установщик | `/home/u543238/deploy/astrotrue.ru/install-release.sh` |
| Журнал | `/home/u543238/deploy/astrotrue.ru/state/deploy.log` |
| Ревизия | `/home/u543238/deploy/astrotrue.ru/state/deployed-revision` |
| Откат | `/home/u543238/deploy/astrotrue.ru/rollback` |
| Ключ CI | `github-ci-astrotrue` в `~/.ssh/authorized_keys` |

Секреты репозитория `T-Damer/simply-astro` (не коммитить):

- `MASTERHOST_SSH_KEY` — приватный ed25519 для CI;
- `MASTERHOST_KNOWN_HOSTS` — отпечатки `u543238.ssh.masterhost.ru`.

Проверка после деплоя идёт с площадки на frontend `90.156.201.94` с заголовком `Host: astrotrue.ru`, потому что публичный DNS пока может не указывать на сервер.

Ручной откат:

```bash
rsync -a --delete --exclude='.well-known/' \
  /home/u543238/deploy/astrotrue.ru/rollback/ \
  /home/u543238/astrotrue.ru/www/
```
