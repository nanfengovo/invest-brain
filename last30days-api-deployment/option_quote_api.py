from urllib.parse import parse_qs

from longbridge_option_bridge import build_option_quote_payload, dumps_payload


def app(environ, start_response):
    query = parse_qs(environ.get("QUERY_STRING", ""))
    symbols = query.get("symbols", query.get("symbol", [""]))[0]
    auth = environ.get("HTTP_AUTHORIZATION", "")
    token = query.get("token", query.get("bridge_token", [""]))[0]
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()

    payload = build_option_quote_payload(symbols, token=token)
    status = "200 OK" if payload.get("success") else "400 Bad Request"
    body = dumps_payload(payload).encode("utf-8")
    start_response(status, [
        ("Content-Type", "application/json; charset=utf-8"),
        ("Access-Control-Allow-Origin", "*"),
        ("Cache-Control", "no-store"),
        ("Content-Length", str(len(body))),
    ])
    return [body]

