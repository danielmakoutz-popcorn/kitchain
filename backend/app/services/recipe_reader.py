"""Bounded, robots-aware Recipe JSON-LD reader; no model-generated recipes."""
from html import unescape
from html.parser import HTMLParser
import http.client
import ipaddress
import json
import math
import re
import socket
import ssl
import gzip
import zlib
from io import BytesIO
from urllib.parse import urljoin, urlsplit, urlunsplit, parse_qsl, urlencode
from urllib.robotparser import RobotFileParser

from backend.app.core.settings import settings

MAX_PAGE_BYTES = 2 * 1024 * 1024
USER_AGENT = "KitChainRecipeReader/1.0"


class PageReadError(ValueError):
    pass


def canonical_url(url: str) -> str:
    if not isinstance(url, str):
        raise PageReadError("Use a public HTTP or HTTPS recipe page.")
    parsed = urlsplit(url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise PageReadError("Use a public HTTP or HTTPS recipe page.")
    if len(url) > 2048 or any(c in url for c in ("\r", "\n", "\x00", "\\")):
        raise PageReadError("Invalid recipe address.")
    try:
        if parsed.port not in {None, 80, 443}:
            raise PageReadError("Recipe pages must use a standard web port.")
    except ValueError as error:
        raise PageReadError("Invalid recipe address.") from error
    host = parsed.hostname.encode("idna").decode().lower()
    host = f"[{host}]" if ":" in host else host
    port = f":{parsed.port}" if parsed.port and parsed.port != (443 if parsed.scheme == "https" else 80) else ""
    query = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True) if not k.lower().startswith("utm_") and k.lower() not in {"fbclid", "gclid"}]
    return urlunsplit((parsed.scheme, host + port, parsed.path or "/", urlencode(sorted(query)), ""))


def public_address(host: str, port: int) -> str:
    try:
        addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError as error:
        raise PageReadError("Could not reach this recipe website.") from error
    values = list(dict.fromkeys(address[4][0] for address in addresses))
    if not values or any(not ipaddress.ip_address(value).is_global for value in values):
        raise PageReadError("Recipe imports cannot access local or private network addresses.")
    return values[0]


def fetch_page(url: str, max_bytes: int = MAX_PAGE_BYTES) -> tuple[str, str, int]:
    """Pin the validated DNS result for the socket, retaining TLS hostname checks."""
    url = canonical_url(url)
    for _ in range(4):
        parts = urlsplit(url)
        port = parts.port or (443 if parts.scheme == "https" else 80)
        address = public_address(parts.hostname, port)
        connection = (http.client.HTTPSConnection(parts.hostname, port, timeout=8, context=ssl.create_default_context())
                      if parts.scheme == "https" else http.client.HTTPConnection(parts.hostname, port, timeout=8))
        connection._create_connection = lambda _addr, timeout=8, source_address=None: socket.create_connection((address, port), timeout, source_address)
        try:
            connection.request("GET", urlunsplit(("", "", parts.path or "/", parts.query, "")), headers={"User-Agent": USER_AGENT, "Accept": "text/html,text/plain", "Accept-Encoding": "gzip, deflate"})
            response = connection.getresponse()
            if response.status in {301, 302, 303, 307, 308}:
                location = response.getheader("Location")
                if not location:
                    raise PageReadError("The website returned an unreadable redirect.")
                url = canonical_url(urljoin(url, location))
                continue
            if response.status >= 400:
                return url, "", response.status
            encoding = response.getheader("Content-Encoding", "identity").lower()
            raw = response.read(max_bytes + 1)
            if len(raw) > max_bytes:
                raise PageReadError("Recipe page is too large. Open the source website instead.")
            try:
                if encoding in {"gzip", "x-gzip"}:
                    with gzip.GzipFile(fileobj=BytesIO(raw)) as stream:
                        raw = stream.read(max_bytes + 1)
                elif encoding == "deflate":
                    raw = zlib.decompressobj().decompress(raw, max_bytes + 1)
                elif encoding != "identity":
                    raise PageReadError("This website uses an unsupported page format. Open the original recipe in your browser.")
            except (OSError, EOFError, zlib.error) as error:
                raise PageReadError("The website returned unreadable compressed content. Open its original recipe.") from error
            if len(raw) > max_bytes:
                raise PageReadError("Recipe page is too large. Open the source website instead.")
            content_type = response.getheader("Content-Type", "").lower()
            if "text/" not in content_type and "json" not in content_type:
                raise PageReadError("This address does not return a readable recipe page.")
            charset = re.search(r"charset=([^;\s]+)", content_type)
            try:
                text = raw.decode(charset.group(1).strip('"') if charset else "utf-8", errors="replace")
            except LookupError:
                text = raw.decode("utf-8", errors="replace")
            return url, text, response.status
        except (OSError, http.client.HTTPException) as error:
            raise PageReadError("Could not read this website. You can still open its original recipe.") from error
        finally:
            connection.close()
    raise PageReadError("Too many website redirects.")


class RecipeHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        if tag == "script" and dict(attrs).get("type", "").lower() == "application/ld+json":
            self.current = []

    def handle_data(self, data):
        if self.current is not None:
            self.current.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self.current is not None:
            self.scripts.append("".join(self.current))
            self.current = None


def plain(value, limit=2000):
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", str(value)))).strip()[:limit]


def nodes(value):
    if isinstance(value, list):
        for item in value:
            yield from nodes(item)
    elif isinstance(value, dict):
        yield value
        # JSON-LD commonly puts the recipe in @graph or mainEntity.
        for key in ("@graph", "mainEntity", "itemListElement", "item"):
            if key in value:
                yield from nodes(value[key])


def instruction_lines(value):
    if isinstance(value, str):
        return [plain(value)] if value.strip() else []
    if isinstance(value, list):
        return [line for item in value for line in instruction_lines(item)][:150]
    if isinstance(value, dict):
        if "itemListElement" in value:
            return instruction_lines(value["itemListElement"])
        return instruction_lines(value.get("text", ""))
    return []


def duration(value):
    match = re.fullmatch(r"P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?", str(value or ""))
    if not match:
        return None
    days, hours, minutes, seconds = [float(v or 0) for v in match.groups()]
    total = days * 1440 + hours * 60 + minutes + seconds / 60
    return total if math.isfinite(total) and total > 0 else None


def reusable_license(value):
    if isinstance(value, dict):
        value = value.get("url", "")
    if not isinstance(value, str):
        return None
    value = value.strip().replace("http://creativecommons.org/", "https://creativecommons.org/")
    if re.fullmatch(r"https://creativecommons\.org/(?:licenses/(?:by|by-sa)/(?:3\.0|4\.0)|publicdomain/(?:zero|mark)/1\.0)/?", value):
        return value
    return None


def extract_recipe(html: str, url: str) -> dict:
    parser = RecipeHTML()
    parser.feed(html)
    for script in parser.scripts:
        try:
            data = json.loads(script)
        except (ValueError, RecursionError):
            continue
        for node in nodes(data):
            kind = node.get("@type", [])
            if isinstance(kind, str):
                kind = [kind]
            if "Recipe" not in kind and "https://schema.org/Recipe" not in kind:
                continue
            ingredients = node.get("recipeIngredient", [])
            if not isinstance(ingredients, list):
                continue
            ingredients = [plain(x, 500) for x in ingredients if isinstance(x, str) and x.strip()][:150]
            steps = instruction_lines(node.get("recipeInstructions", []))
            title = plain(node.get("name", ""), 200)
            if not title or not ingredients or not steps:
                continue
            authors = node.get("author", [])
            if not isinstance(authors, list):
                authors = [authors]
            author = ", ".join(plain(a.get("name", "") if isinstance(a, dict) else a, 100) for a in authors)[:200] or None
            servings = node.get("recipeYield")
            if isinstance(servings, list):
                servings = servings[0] if servings else None
            # Only an explicit serving count; '1 loaf' is not one serving.
            serving_match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*(?:servings?|people|portions?)?\s*", str(servings or ""), re.I)
            serving_count = float(serving_match.group(1)) if serving_match else None
            license_url = reusable_license(node.get("license"))
            host = urlsplit(url).hostname
            allowed = {d.strip().lower() for d in settings.RECIPE_REUSE_DOMAINS.split(",") if d.strip()}
            publisher = node.get("publisher", {})
            source_name = plain(publisher.get("name", host) if isinstance(publisher, dict) else host, 100)
            return {"title": title, "ingredients": ingredients, "steps": steps, "source_url": canonical_url(url), "source_name": source_name, "source_author": author, "license_url": license_url, "reuse_status": "licensed" if license_url or host in allowed else "link_only", "servings": serving_count if serving_count and 0 < serving_count <= 10000 else None, "total_minutes": duration(node.get("totalTime"))}
    raise PageReadError("No complete recipe could be read here. Open the original, or paste its ingredients into a new family recipe.")


def read_recipe(url: str, _origins: frozenset[str] = frozenset()) -> dict:
    url = canonical_url(url)
    parts = urlsplit(url)
    if parts.netloc in _origins or len(_origins) >= 3:
        raise PageReadError("Too many redirects between recipe websites.")
    robots_url = urlunsplit((parts.scheme, parts.netloc, "/robots.txt", "", ""))
    _, rules, status = fetch_page(robots_url, max_bytes=128 * 1024)
    if status in {401, 403} or status >= 500:
        raise PageReadError("This website does not currently permit the recipe reader. Open its original page instead.")
    if status < 400:
        robot = RobotFileParser()
        robot.parse(rules.splitlines())
        if not robot.can_fetch(USER_AGENT, url):
            raise PageReadError("This website does not permit automated recipe reading. Open its original page instead.")
    final, html, status = fetch_page(url)
    if status != 200:
        if status in {401, 403, 429}:
            raise PageReadError(f"This website blocked automatic importing (HTTP {status}). Open the original recipe in your browser, or try another publisher.")
        raise PageReadError(f"The recipe website returned HTTP {status}. Open the original page, or try another publisher.")
    # A cross-origin redirect needs that origin's robots permission as well.
    if urlsplit(final).netloc != parts.netloc:
        return read_recipe(final, _origins | {parts.netloc})
    return extract_recipe(html, final)
