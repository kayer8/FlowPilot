import base64
import email
import html
import imaplib
import json
import os
import re
import socket
import traceback
from datetime import timezone
from email.header import decode_header
from email.utils import parseaddr, parsedate_to_datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


HOST = "127.0.0.1"
PORT = 17374
HELPER_BUILD = "mailbox-scan-2026-06-19"
DEFAULT_IMAP_HOST = "imap.2925.com"
DEFAULT_IMAP_PORT = 993
REQUEST_TIMEOUT_SECONDS = 45
FETCH_LIMIT_DEFAULT = 15
MESSAGE_LOG_LIMIT = 5
MAILBOX_SCAN_LIMIT = 20


def log_info(message):
    print(f"[Mail2925ImapHelper] {message}", flush=True)


def json_response(handler, status, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.end_headers()
    try:
        handler.wfile.write(body)
    except (BrokenPipeError, ConnectionResetError):
        pass


def read_json_payload(handler):
    length = int(handler.headers.get("Content-Length", "0") or 0)
    raw = handler.rfile.read(length) if length > 0 else b"{}"
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise RuntimeError(f"Invalid JSON payload: {exc}") from exc


def clean_string(value):
    return str(value or "").strip()


def parse_bool(value, default=False):
    if value is None or value == "":
        return bool(default)
    if isinstance(value, bool):
        return value
    normalized = clean_string(value).lower()
    if normalized in ("false", "0", "no", "off"):
        return False
    if normalized in ("true", "1", "yes", "on"):
        return True
    return bool(value)


def mask_email(email_addr):
    value = clean_string(email_addr)
    if "@" not in value:
        return value[:3] + "***" if value else ""
    local, domain = value.split("@", 1)
    if len(local) <= 2:
        return f"{local[:1]}***@{domain}"
    return f"{local[:2]}***@{domain}"


def mask_code(code):
    value = clean_string(code)
    if len(value) <= 2:
        return value
    return f"{value[:1]}***{value[-1:]}"


def compact_log_text(value, limit=160):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(text) <= limit:
        return text
    return text[:limit] + "..."


def find_code_candidates(message):
    if not message:
        return []
    text = "\n".join(
        clean_string(message.get(key))
        for key in ("subject", "bodyPreview", "text")
        if clean_string(message.get(key))
    )
    candidates = re.findall(r"(?<!\d)(\d{6})(?!\d)", text)
    return list(dict.fromkeys(candidates))


def summarize_message_for_log(message, index=0):
    candidates = find_code_candidates(message)
    candidate_label = ",".join(mask_code(code) for code in candidates[:3]) if candidates else "none"
    return (
        f"#{index} uid={message.get('uid') or message.get('id') or ''} "
        f"time={message.get('receivedDateTime') or message.get('receivedTimestamp') or 'unknown'} "
        f"from={compact_log_text(message.get('from'), 60) or 'unknown'} "
        f"to={compact_log_text(message.get('to'), 80) or '-'} "
        f"subject={compact_log_text(message.get('subject'), 100) or '(no subject)'} "
        f"codes={candidate_label} "
        f"preview={compact_log_text(message.get('bodyPreview'), 140)}"
    )


def log_poll_messages(messages):
    log_info(f"poll-code fetched messages={len(messages)}")
    if not messages:
        log_info("poll-code mailbox returned no messages")
        return
    for index, message in enumerate(messages[:MESSAGE_LOG_LIMIT], 1):
        log_info("poll-code message " + summarize_message_for_log(message, index))
    all_candidates = []
    for message in messages:
        for code in find_code_candidates(message):
            all_candidates.append(code)
    unique_candidates = list(dict.fromkeys(all_candidates))
    if unique_candidates:
        log_info(
            "poll-code candidate 6-digit codes="
            + ",".join(mask_code(code) for code in unique_candidates[:10])
        )
    else:
        log_info("poll-code candidate 6-digit codes=none")


def parse_mailbox_list_item(raw_item):
    text = raw_item.decode("utf-8", errors="replace") if isinstance(raw_item, (bytes, bytearray)) else str(raw_item or "")
    match = re.search(r'\s"?(?P<delimiter>[^"\s])"?\s(?P<name>.+)$', text)
    if not match:
        return ""
    raw_name = match.group("name").strip()
    if raw_name.startswith('"') and raw_name.endswith('"'):
        raw_name = raw_name[1:-1]
    raw_name = raw_name.replace(r'\"', '"')
    return decode_imap_utf7(raw_name)


def list_mailboxes(client):
    try:
        status, data = client.list()
    except Exception as exc:
        log_info(f"mailbox list failed: {exc}")
        return []
    if status != "OK":
        log_info(f"mailbox list returned status={status}")
        return []
    mailboxes = []
    for item in data or []:
        name = parse_mailbox_list_item(item)
        if name:
            mailboxes.append(name)
    unique = list(dict.fromkeys(mailboxes))
    if unique:
        log_info("mailboxes=" + " | ".join(unique[:MAILBOX_SCAN_LIMIT]))
    else:
        log_info("mailboxes=none")
    return unique


def normalize_mailbox_name(value):
    return clean_string(value).strip('"').lower()


def build_mailbox_scan_order(requested_mailbox, available_mailboxes):
    requested = clean_string(requested_mailbox) or "INBOX"
    candidates = [requested, "INBOX", "收件箱", "Inbox", "inbox"]
    candidates.extend(available_mailboxes or [])
    result = []
    seen = set()
    for mailbox in candidates:
        name = clean_string(mailbox)
        if not name:
            continue
        key = normalize_mailbox_name(name)
        if key in seen:
            continue
        seen.add(key)
        result.append(name)
    return result[:MAILBOX_SCAN_LIMIT]


def select_mailbox(client, mailbox):
    try_names = [mailbox]
    encoded = encode_imap_utf7(mailbox)
    if encoded and encoded != mailbox:
        try_names.append(encoded)
    last_status = None
    for name in try_names:
        try:
            status, _ = client.select(f'"{name}"', readonly=True)
        except Exception as exc:
            last_status = str(exc)
            continue
        if status == "OK":
            return True
        last_status = status
    log_info(f"select mailbox failed mailbox={mailbox} status={last_status}")
    return False


class Mail2925ImapError(RuntimeError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def decode_mime_words(value):
    if not value:
        return ""
    parts = []
    for chunk, encoding in decode_header(value):
        if isinstance(chunk, bytes):
            for codec in (encoding, "utf-8", "gb18030", "latin1"):
                if not codec:
                    continue
                try:
                    parts.append(chunk.decode(codec, errors="replace"))
                    break
                except Exception:
                    continue
            else:
                parts.append(chunk.decode("utf-8", errors="replace"))
        else:
            parts.append(str(chunk))
    return "".join(parts).strip()


def decode_bytes(raw_bytes, charset=""):
    if not raw_bytes:
        return ""
    candidates = [charset, "utf-8", "gb18030", "latin1"]
    for codec in candidates:
        if not codec:
            continue
        try:
            return raw_bytes.decode(codec, errors="replace")
        except Exception:
            continue
    return raw_bytes.decode("utf-8", errors="replace")


def decode_imap_utf7(value):
    text = value.decode("ascii", errors="replace") if isinstance(value, (bytes, bytearray)) else str(value or "")
    result = []
    index = 0
    while index < len(text):
        amp_index = text.find("&", index)
        if amp_index < 0:
            result.append(text[index:])
            break
        result.append(text[index:amp_index])
        end_index = text.find("-", amp_index)
        if end_index < 0:
            result.append(text[amp_index:])
            break
        token = text[amp_index + 1:end_index]
        if token == "":
            result.append("&")
        else:
            try:
                b64 = token.replace(",", "/")
                b64 += "=" * ((4 - len(b64) % 4) % 4)
                result.append(base64.b64decode(b64).decode("utf-16-be", errors="replace"))
            except Exception:
                result.append(text[amp_index:end_index + 1])
        index = end_index + 1
    return "".join(result)


def encode_imap_utf7(value):
    text = str(value or "")
    result = []
    buffer = []

    def flush_buffer():
        if not buffer:
            return
        raw = "".join(buffer).encode("utf-16-be")
        encoded = base64.b64encode(raw).decode("ascii").rstrip("=").replace("/", ",")
        result.append(f"&{encoded}-")
        buffer.clear()

    for char in text:
        code = ord(char)
        if 0x20 <= code <= 0x7E:
            flush_buffer()
            result.append("&-" if char == "&" else char)
        else:
            buffer.append(char)
    flush_buffer()
    return "".join(result)


def strip_html(raw_html):
    text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", str(raw_html or ""))
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def get_message_text(message):
    plain_parts = []
    html_parts = []

    def append_part(part):
        content_type = part.get_content_type()
        disposition = str(part.get("Content-Disposition") or "").lower()
        if "attachment" in disposition:
            return
        payload = part.get_payload(decode=True)
        if payload is None:
            return
        text = decode_bytes(payload, part.get_content_charset() or "")
        if content_type == "text/plain":
            plain_parts.append(text.strip())
        elif content_type == "text/html":
            html_parts.append(strip_html(text))

    if message.is_multipart():
        for part in message.walk():
            append_part(part)
    else:
        append_part(message)

    body = "\n".join(part for part in plain_parts if part).strip()
    if body:
        return body
    return "\n".join(part for part in html_parts if part).strip()


def parse_message_datetime(message):
    raw_date = clean_string(message.get("Date"))
    if not raw_date:
        return "", 0
    try:
        parsed = parsedate_to_datetime(raw_date)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        parsed_utc = parsed.astimezone(timezone.utc)
        return parsed_utc.isoformat().replace("+00:00", "Z"), int(parsed_utc.timestamp() * 1000)
    except Exception:
        return raw_date, 0


def normalize_message(uid, raw_message):
    message = email.message_from_bytes(raw_message)
    subject = decode_mime_words(message.get("Subject", ""))
    from_name, from_addr = parseaddr(decode_mime_words(message.get("From", "")))
    to_value = decode_mime_words(message.get("To", ""))
    cc_value = decode_mime_words(message.get("Cc", ""))
    body = get_message_text(message)
    received_iso, received_timestamp = parse_message_datetime(message)
    return {
        "id": clean_string(uid),
        "uid": clean_string(uid),
        "subject": subject,
        "from": from_addr or from_name,
        "sender": from_addr or from_name,
        "to": to_value,
        "cc": cc_value,
        "bodyPreview": re.sub(r"\s+", " ", body).strip()[:500],
        "text": body,
        "receivedDateTime": received_iso,
        "receivedTimestamp": received_timestamp,
    }


def get_login_usernames(email_addr):
    normalized = clean_string(email_addr).lower()
    usernames = []
    if normalized:
        usernames.append(normalized)
    if "@" in normalized:
        local = normalized.split("@", 1)[0]
        if local and local not in usernames:
            usernames.append(local)
    return usernames


def create_imap_client(host, port, secure):
    if secure:
        return imaplib.IMAP4_SSL(host, port, timeout=REQUEST_TIMEOUT_SECONDS)
    return imaplib.IMAP4(host, port, timeout=REQUEST_TIMEOUT_SECONDS)


def close_imap_client(client):
    if not client:
        return
    try:
        client.logout()
    except Exception:
        pass


def connect_imap(payload):
    email_addr = clean_string(payload.get("email")).lower()
    password = str(payload.get("password") or "")
    if not email_addr:
        raise Mail2925ImapError("MISSING_EMAIL", "Missing 2925 email")
    if not password:
        raise Mail2925ImapError("MISSING_PASSWORD", "Missing 2925 password")

    host = clean_string(payload.get("host")) or DEFAULT_IMAP_HOST
    port = int(payload.get("port") or DEFAULT_IMAP_PORT)
    secure = parse_bool(payload.get("secure"), True)
    socket.setdefaulttimeout(REQUEST_TIMEOUT_SECONDS)
    login_errors = []
    for username in get_login_usernames(email_addr):
        client = None
        try:
            log_info(
                f"connecting host={host} port={port} secure={secure} "
                f"username={mask_email(username if '@' in username else username + '@local')}"
            )
            client = create_imap_client(host, port, secure)
            client.login(username, password)
            if username != email_addr:
                log_info(f"login succeeded with local-part username={username[:2]}***")
            else:
                log_info(f"login succeeded with email username={mask_email(email_addr)}")
            return client
        except imaplib.IMAP4.error as exc:
            login_errors.append(str(exc))
            close_imap_client(client)
            continue
        except Exception:
            close_imap_client(client)
            raise

    error_text = "; ".join(login_errors) or "LOGIN failed"
    raise Mail2925ImapError(
        "IMAP_LOGIN_FAILED",
        f"2925 IMAP 登录失败：服务器拒绝当前邮箱密码或授权码。已尝试完整邮箱和邮箱前缀登录。原始错误：{error_text}"
    )


def close_selected_client(client):
    try:
        client.close()
    except Exception:
        pass
    close_imap_client(client)


def list_latest_messages(payload):
    mailbox = clean_string(payload.get("mailbox")) or "INBOX"
    limit = max(1, min(50, int(payload.get("limit") or FETCH_LIMIT_DEFAULT)))
    client = connect_imap(payload)
    try:
        mailboxes = list_mailboxes(client)
        scan_order = build_mailbox_scan_order(mailbox, mailboxes)
        log_info("mailbox scan order=" + " | ".join(scan_order))

        for scan_mailbox in scan_order:
            if not select_mailbox(client, scan_mailbox):
                continue
            log_info(f"selected mailbox={scan_mailbox} readonly=True")

            status, data = client.uid("search", None, "ALL")
            if status != "OK":
                log_info(f"uid search failed mailbox={scan_mailbox} status={status}")
                continue
            uids = data[0].split() if data and data[0] else []
            selected_uids = list(reversed(uids))[:limit]
            newest_uid = selected_uids[0].decode("ascii", errors="ignore") if selected_uids else ""
            oldest_uid = selected_uids[-1].decode("ascii", errors="ignore") if selected_uids else ""
            log_info(
                f"uid search mailbox={scan_mailbox} total={len(uids)} fetch_limit={limit} selected={len(selected_uids)} "
                f"newest_uid={newest_uid or '-'} oldest_selected_uid={oldest_uid or '-'}"
            )
            messages = []
            for uid in selected_uids:
                status, fetched = client.uid("fetch", uid, "(RFC822)")
                uid_text = uid.decode("ascii", errors="ignore")
                if status != "OK":
                    log_info(f"uid fetch skipped mailbox={scan_mailbox} uid={uid_text} status={status}")
                    continue
                raw_message = None
                for item in fetched:
                    if isinstance(item, tuple) and len(item) >= 2 and isinstance(item[1], (bytes, bytearray)):
                        raw_message = bytes(item[1])
                        break
                if not raw_message:
                    log_info(f"uid fetch empty mailbox={scan_mailbox} uid={uid_text}")
                    continue
                message = normalize_message(uid_text, raw_message)
                message["mailbox"] = scan_mailbox
                messages.append(message)
            if messages:
                log_poll_messages(messages)
                return messages
            log_info(f"mailbox {scan_mailbox} returned no fetched messages")

        log_poll_messages([])
        return []
    finally:
        close_selected_client(client)


class Handler(BaseHTTPRequestHandler):
    server_version = "Mail2925ImapHelper/1.0"

    def log_message(self, fmt, *args):
        log_info(fmt % args)

    def do_OPTIONS(self):
        json_response(self, 200, {"ok": True})

    def do_GET(self):
        if self.path.rstrip("/") == "/health":
            json_response(self, 200, {
                "ok": True,
                "service": "mail2925-imap-helper",
                "build": HELPER_BUILD,
                "script": os.path.abspath(__file__),
            })
            return
        json_response(self, 404, {"ok": False, "error": "Not found"})

    def do_POST(self):
        try:
            payload = read_json_payload(self)
            if self.path.rstrip("/") == "/2925/poll-code":
                email_addr = clean_string(payload.get("email"))
                log_info(f"poll-code email={mask_email(email_addr)} host={clean_string(payload.get('host')) or DEFAULT_IMAP_HOST}")
                messages = list_latest_messages(payload)
                json_response(self, 200, {
                    "ok": True,
                    "messages": messages,
                    "count": len(messages),
                })
                return
            json_response(self, 404, {"ok": False, "error": "Not found"})
        except Mail2925ImapError as exc:
            log_info(f"request failed: {exc}")
            json_response(self, 500, {"ok": False, "code": exc.code, "error": str(exc)})
        except Exception as exc:
            log_info(f"request failed: {exc}")
            traceback.print_exc()
            json_response(self, 500, {"ok": False, "error": str(exc)})


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    log_info(f"build={HELPER_BUILD} script={os.path.abspath(__file__)}")
    log_info(f"listening on http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log_info("stopping")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
